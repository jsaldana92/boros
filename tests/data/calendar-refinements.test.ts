import 'fake-indexeddb/auto'
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { calendarRunService } from '../../src/db/calendar-runs.ts'
import { runActionService } from '../../src/db/run-actions.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { copyExercise, newDay } from '../../src/schemas/plan.ts'
import { addDays } from '../../src/lib/calendar-dates.ts'
import { occurrences, type Mapping, type Schedule } from '../../src/schemas/schedule.ts'
import { runLifecycle, runProgress } from '../../src/lib/run-progress.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup, sha256 } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { csvTables } from '../../src/features/backups/csv.ts'
import { recordCounts, validateBackupData } from '../../src/schemas/backup.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'

async function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-08T12:00:00Z') })
  const db = new BorosDatabase(`boros-test-calendar-refinements-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId
  await db.profiles.update(id, { timeZone: 'UTC' })
  const resolved = Intl.DateTimeFormat.prototype.resolvedOptions; t.mock.method(Intl.DateTimeFormat.prototype, 'resolvedOptions', function () { return { ...resolved.call(this), timeZone: 'UTC' } })
  const plans = planService(db), calendar = scheduleService(db), batch = calendarRunService(db), actions = runActionService(db), sessions = sessionService(db), weekly = weeklyService(db)
  const makePlan = (name: string, count = 4) => plans.save(id, { name, durationWeeks: 5, days: Array.from({ length: count }, (_, i) => ({ ...newDay(i + 1), exercises: [copyExercise({ name: 'Press', tagNames: [], sets: [{ reps: { min: 5, max: 5 } }, { reps: { min: 5, max: 5 } }], restBetweenSeconds: 30 })] })) })
  const plan = await makePlan('First'), second = await makePlan('Second')
  const stage = (p = plan, startWeek = '2026-10-05') => ({ id: crypto.randomUUID(), input: { planId: p.id, planRevision: p.revision, timeZone: 'UTC', startWeek, mapping: p.days.map((day, weekday) => ({ dayId: day.id, weekday })) } })
  const complete = async (run: Schedule, dayIndex = 0, date = addDays(run.startWeek, dayIndex)) => { const draft = (await sessions.openOccurrence(id, run.id, run.revisions[0].days[dayIndex].id, date, run.revision)).draft!, input = structuredClone(draft.input); input.exercises[0].sets.forEach((s) => Object.assign(s, { load: '0', reps: '5' })); await sessions.complete(id, draft.id, draft.revision, input, false); return draft }
  return { db, profiles, id, plans, plan, second, makePlan, calendar, batch, actions, sessions, weekly, stage, complete }
}

test('batch creation is atomic, validates every plan/mapping/revision and preserves inputs after failure', async (t) => {
  const { db, id, plan, second, batch, stage } = await setup(t), pending = [stage(), stage(second)], copy = structuredClone(pending)
  const broken = structuredClone(pending); broken[1].input.mapping[1].weekday = 0
  await assert.rejects(batch.addBatch(id, broken), /distinct weekday/); assert.equal(await db.schedules.count(), 0)
  const stale = structuredClone(pending); stale[1].input.planRevision++
  await assert.rejects(batch.addBatch(id, stale), /plan changed/); assert.equal(await db.schedules.count(), 0)
  db.schedules.hook('creating', function fail(_key, value) { if (value.planId === second.id) throw new Error('Injected second write failure') })
  await assert.rejects(batch.addBatch(id, pending), /second write failure/); assert.equal(await db.schedules.count(), 0)
  assert.deepEqual((await db.profiles.get(id))!.selectedPlanIds ?? [], [])
  assert.deepEqual(pending, copy); assert.equal((await db.plans.get([id, plan.id]))!.revision, plan.revision)
})

test('batch retries and competing tabs cannot duplicate active scheduled or unscheduled runs; history stays independent', async (t) => {
  const { db, id, plan, second, batch, weekly, actions, calendar, stage } = await setup(t), other = new BorosDatabase(db.name); t.after(async () => other.close())
  const pending = [stage(), stage(second)], saved = await batch.addBatch(id, pending)
  assert.deepEqual((await db.profiles.get(id))!.selectedPlanIds, [plan.id, second.id])
  assert.deepEqual(await batch.addBatch(id, pending), saved); assert.equal(await db.schedules.count(), 2)
  await assert.rejects(calendarRunService(other).addBatch(id, [stage()]), /active run/)
  await actions.leave(await actions.preview(id, saved[0].id, saved[0].revision))
  const outcomes = await Promise.allSettled([batch.addBatch(id, [stage()]), weeklyService(other).activate(id, plan.id)])
  assert.equal((await db.schedules.where('[profileId+planId]').equals([id, plan.id]).toArray()).filter((r) => !runLifecycle(r, []).previous).length, 1)
  assert.ok(outcomes.some((r) => r.status === 'fulfilled')); assert.ok((await calendar.get(id, saved[0].id)).closedAt)
  const third = await planService(db).save(id, { name: 'Third', durationWeeks: 5, days: plan.days })
  await weekly.activate(id, third.id); await assert.rejects(batch.addBatch(id, [stage(third)]), /active run/)
})

test('Calendar repairs a missing Train link using the existing run; link failures roll back activation', async (t) => {
  const { db, id, plan, batch, stage, weekly } = await setup(t), pending = [stage()], [run] = await batch.addBatch(id, pending)
  await db.profiles.update(id, { selectedPlanIds: [] })
  const before = await db.schedules.toArray()
  await weekly.addPlan(id, plan.id)
  assert.deepEqual(await db.schedules.toArray(), before)
  assert.equal((await weekly.activate(id, plan.id))[0].id, run.id)
  assert.deepEqual((await db.profiles.get(id))!.selectedPlanIds, [plan.id])
  const fresh = await planService(db).save(id, { name: 'Atomic link', durationWeeks: 2, days: plan.days })
  const put = db.profiles.put.bind(db.profiles)
  db.profiles.put = async () => { throw new Error('Link failure') }
  await assert.rejects(batch.addBatch(id, [stage(fresh)]), /Link failure/)
  db.profiles.put = put
  assert.deepEqual(await db.schedules.toArray(), before)
})

test('direct scheduled creation and Train activation serialize across connections, including unscheduled ownership', async (t) => {
  const { db, id, plan, calendar, weekly, stage, actions } = await setup(t), other = new BorosDatabase(db.name); t.after(async () => other.close())
  await weekly.addPlan(id, plan.id)
  await assert.rejects(scheduleService(other).create(id, stage().input), /active instance/)
  const [existing] = await weekly.activate(id, plan.id)
  await actions.leave(await actions.preview(id, existing.id, existing.revision))
  await Promise.allSettled([calendar.create(id, stage().input), weeklyService(other).addPlan(id, plan.id)])
  const all = await db.schedules.toArray()
  assert.equal(all.filter((r) => !runLifecycle(r, []).previous).length, 1)
  assert.equal(all.length, 2)
})

test('reassignment keeps prior weeks and completed/skipped/manual/draft identities; only untouched pending moves', async (t) => {
  const { db, id, makePlan, calendar, batch, sessions, weekly, stage, complete } = await setup(t), plan = await makePlan('Five', 5)
  let run = (await batch.addBatch(id, [stage(plan, '2026-09-28')]))[0]
  const oldWeek = occurrences(run, '2026-09-28', '2026-10-04'), before = occurrences(run, '2026-10-05', '2026-10-11')
  await complete(run, 0, '2026-10-05')
  run = await weekly.outcome(id, before[1].ref, run.revision, 'skipped'); run = await weekly.outcome(id, before[2].ref, run.revision, 'completed')
  const draft = (await sessions.openOccurrence(id, run.id, before[3].day.id, before[3].ref.scheduledDate)).draft!
  const mapping: Mapping = plan.days.map((d, i) => ({ dayId: d.id, weekday: [2, 3, 4, 5, 0][i] }))
  const preview = await batch.previewEdit(id, run.id, run.revision, mapping); assert.equal(preview.protectedCount, 4)
  run = await batch.edit(preview)
  assert.deepEqual(occurrences(run, '2026-09-28', '2026-10-04'), oldWeek)
  const now = await calendar.events(id, '2026-10-05', '2026-10-11')
  for (let i = 0; i < 4; i++) assert.deepEqual(now.find((e) => e.day.id === plan.days[i].id)!.ref, before[i].ref)
  assert.equal(now.filter((e) => e.ref.scheduledDate === '2026-10-05').length, 2)
  assert.equal(now.find((e) => e.day.id === plan.days[4].id)!.ref.scheduledDate, '2026-10-05')
  assert.equal(now.length, 5); assert.equal((await sessions.getDraft(id, draft.id)).revision, draft.revision)
  const next = occurrences(run, '2026-10-12', '2026-10-18'); for (const assignment of mapping) assert.equal(next.find((e) => e.day.id === assignment.dayId)!.ref.scheduledDate, addDays('2026-10-12', assignment.weekday))
  assert.deepEqual(runProgress(run, await db.sessions.toArray()), { total: 25, completed: 2, skipped: 1, resolved: 3 })
  const round = await readBackup((await generateBackup(await captureProfile(id, db), 'test')).bytes)
  assert.deepEqual(round.data.schedules[0].occurrenceExceptions, run.occurrenceExceptions)
})

test('assigning existing unscheduled run preserves past classification, start, stable keys and prescription', async (t) => {
  const { db, id, plan, weekly, batch, calendar, complete } = await setup(t)
  const [run] = await weekly.activate(id, plan.id); await complete(run)
  const logs = await db.sessions.toArray(), draft = await db.drafts.toArray()
  const next = await batch.edit(await batch.previewEdit(id, run.id, run.revision, plan.days.map((d, i) => ({ dayId: d.id, weekday: i + 2 }))))
  assert.equal(next.id, run.id); assert.equal(next.startWeek, run.startWeek); assert.equal(next.kind, undefined); assert.equal(next.endDate, run.endDate)
  assert.deepEqual(await db.sessions.toArray(), logs); assert.deepEqual(await db.drafts.toArray(), draft)
  const events = await calendar.events(id, '2026-10-05', '2026-10-11')
  assert.equal(events.length, 4); assert.equal(events.filter((e) => e.unscheduled).length, 1); assert.equal(events.find((e) => e.session)!.ref.unscheduled, true)
  assert.equal(occurrences(next, '2026-10-12', '2026-10-18').some((e) => e.ref.unscheduled), false)
  const backup = await readBackup((await generateBackup(await captureProfile(id, db), 'test')).bytes)
  assert.equal(backup.data.sessions[0].occurrence!.unscheduled, true); assert.equal(backup.data.schedules[0].kind, undefined)
})

test('new recorded input after edit preview rejects stale mapping; profile ownership cannot be bypassed', async (t) => {
  const { db, profiles, id, batch, stage, sessions } = await setup(t), [run] = await batch.addBatch(id, [stage()])
  const preview = await batch.previewEdit(id, run.id, run.revision, run.revisions[0].mapping)
  await sessions.openOccurrence(id, run.id, run.revisions[0].days[0].id, run.startWeek)
  await assert.rejects(batch.edit(preview), /results changed/); assert.deepEqual(await db.schedules.get([id, run.id]), run)
  const foreign = await profiles.create('Other'); await assert.rejects(batch.previewEdit(foreign.id, run.id, run.revision, run.revisions[0].mapping), /unavailable/)
})

test('reset removes only selected run progress, all drafts/timer/gaps, rejects stale autosave and rolls back on failure', async (t) => {
  const { db, id, batch, stage, second, sessions, weekly, actions, calendar, complete } = await setup(t)
  let [run, other] = await batch.addBatch(id, [stage(), stage(second)])
  await complete(other); await complete(run)
  run = await weekly.move(id, await weekly.previewMove(id, run.id, run.revision, '2026-10-12', 1))
  const draft = (await sessions.openOccurrence(id, run.id, run.revisions[0].days[1].id, '2026-10-06')).draft!
  await sessions.startTimer(id, draft.id, draft.revision, draft.day.exercises[0].id, 0)
  const preserved = await captureProfile(id, db), preview = await actions.preview(id, run.id, run.revision)
  const fail = () => { throw new Error('Injected reset failure') }; db.schedules.hook('updating', fail)
  await assert.rejects(actions.resetRun(preview), /reset failure/); db.schedules.hook('updating').unsubscribe(fail)
  assert.deepEqual((await captureProfile(id, db)).drafts, preserved.drafts); assert.ok(await db.restTimers.get('active'))
  const reset = await actions.resetRun(preview)
  assert.equal(reset.id, run.id); assert.equal(reset.startWeek, '2026-10-05'); assert.equal(reset.endDate, '2026-11-08'); assert.equal(reset.excludedWeeks, undefined); assert.equal(reset.weekMoves, undefined)
  assert.deepEqual(reset.revisions[0].mapping, run.revisions.at(-1)!.mapping); assert.equal(reset.closedAt, undefined); assert.equal(reset.kind, run.kind)
  assert.equal(await db.sessions.count(), 1); assert.equal(await db.drafts.count(), 1); assert.equal(await db.restTimers.count(), 0)
  assert.deepEqual(await calendar.get(id, other.id), other); assert.deepEqual((await captureProfile(id, db)).plans, preserved.plans)
  await assert.rejects(sessions.update(id, draft.id, draft.revision, draft.input), /unavailable/)
  await assert.rejects(sessions.openOccurrence(id, run.id, run.revisions[0].days[0].id, run.startWeek, run.revision), /program changed/)
  assert.equal(runProgress(reset, await db.sessions.toArray()).resolved, 0)
  await readBackup((await generateBackup(await captureProfile(id, db), 'test')).bytes)
})

test('end, hide/unhide and delete preserve other runs/profiles and templates; hidden history round trips without resumable drafts', async (t) => {
  const { db, profiles, id, batch, stage, second, sessions, actions, calendar, complete } = await setup(t), [run, other] = await batch.addBatch(id, [stage(), stage(second)])
  await complete(run); await complete(other)
  for (const date of ['2026-10-06', '2026-10-13']) await sessions.openOccurrence(id, run.id, run.revisions[0].days[1].id, date)
  await actions.leave(await actions.preview(id, run.id, run.revision))
  let ended = await calendar.get(id, run.id); assert.equal(runLifecycle(ended, await db.sessions.toArray()).end, '2026-10-08')
  assert.equal((await db.drafts.toArray()).filter((d) => !d.finalizedAt).length, 0); assert.equal(await db.sessions.count(), 2)
  await assert.rejects(sessions.openOccurrence(id, run.id, run.revisions[0].days[1].id, '2026-10-13'), /left/)
  ended = await actions.setHidden(id, run.id, ended.revision, true)
  const backup = await readBackup((await generateBackup(await captureProfile(id, db), 'test')).bytes)
  assert.equal(backup.data.backupSchemaVersion, 11); assert.equal(csvTables(backup.data).length, 32)
  const restored = await buildRestorePlan(backup, undefined, 'new', crypto.randomUUID(), 'Restored', new Date().toISOString())
  const historical = restored.result.schedules.find((s) => s.id === run.id)!
  assert.equal(historical.hiddenAt, ended.hiddenAt); assert.equal(historical.kind, undefined); assert.equal(historical.closedAt, ended.closedAt)
  assert.equal(restored.result.drafts.filter((d) => !d.finalizedAt && d.occurrence?.scheduleId === run.id).length, 0)
  const oldWire = structuredClone(backup.data); oldWire.backupSchemaVersion = 7; assert.throws(() => validateBackupData(oldWire), /Unrecognized key/)
  ended = await actions.setHidden(id, run.id, ended.revision, false); assert.equal(ended.hiddenAt, undefined); assert.equal(await db.sessions.count(), 2)
  const foreign = await profiles.create('Foreign'); await assert.rejects(actions.setHidden(foreign.id, run.id, ended.revision, true), /unavailable/)
  const preview = await actions.preview(id, run.id, ended.revision), fail = () => { throw new Error('Injected delete failure') }; db.schedules.hook('deleting', fail)
  await assert.rejects(actions.deletePrevious(preview), /delete failure/); db.schedules.hook('deleting').unsubscribe(fail); assert.equal(await db.sessions.count(), 2)
  await actions.deletePrevious(preview); assert.equal(await db.sessions.count(), 1); assert.equal(await db.plans.count(), 2); assert.deepEqual(await calendar.get(id, other.id), other)
  await assert.rejects(actions.deletePrevious(await actions.preview(id, other.id, other.revision)), /End this active/)
})

test('finite unscheduled completion permits a new run; reset uses saved zone at the Monday boundary', async (t) => {
  const { db, id, weekly, actions, plan, calendar } = await setup(t)
  const [run] = await weekly.activate(id, plan.id)
  let finished = run
  for (const event of occurrences(run, run.startWeek, run.endDate!)) finished = await weekly.outcome(id, event.ref, finished.revision, 'completed')
  assert.equal(runLifecycle(finished, []).previous, true); assert.equal(finished.kind, 'unscheduled'); assert.equal(runLifecycle(finished, []).end, '2026-10-08')
  const [newRun] = await weekly.activate(id, plan.id); assert.notEqual(newRun.id, run.id)
  t.mock.timers.setTime(Date.parse('2026-10-12T00:30:00Z'))
  await db.schedules.update([id, newRun.id], { timeZone: 'Pacific/Honolulu' })
  const current = await calendar.get(id, newRun.id), reset = await actions.resetRun(await actions.preview(id, current.id, current.revision))
  assert.equal(reset.startWeek, '2026-10-05'); assert.equal(reset.kind, 'unscheduled'); assert.deepEqual(await calendar.get(id, run.id), finished)
})

test('unbounded and postponed runs keep their committed duration and prior gaps through reassignment', async (t) => {
  const { db, id, batch, stage, weekly, calendar, actions } = await setup(t)
  let [run] = await batch.addBatch(id, [stage()])
  run = await weekly.move(id, await weekly.previewMove(id, run.id, run.revision, '2026-10-12', 1))
  const edited = await batch.edit(await batch.previewEdit(id, run.id, run.revision, run.revisions[0].mapping.map((m) => ({ ...m, weekday: m.weekday + 2 }))))
  assert.deepEqual(edited.excludedWeeks, run.excludedWeeks); assert.equal(edited.endDate, '2026-11-15'); assert.equal(runProgress(edited, []).total, 20)
  assert.equal(occurrences(edited, '2026-10-12', '2026-10-18').length, 0)
  await db.schedules.update([id, run.id], { durationWeeks: undefined, endDate: undefined })
  const legacy = await calendar.get(id, run.id), reset = await actions.resetRun(await actions.preview(id, run.id, legacy.revision))
  assert.equal(reset.durationWeeks, undefined); assert.equal(reset.endDate, undefined); assert.equal(runProgress(reset, []).total, undefined)
})

test('a corrected pending marker does not pin the old unscheduled date; stale reset cannot cross a new week', async (t) => {
  const { id, plan, weekly, batch, calendar, actions } = await setup(t)
  let [run] = await weekly.activate(id, plan.id), event = occurrences(run, '2026-10-05', '2026-10-11')[0]
  run = await weekly.outcome(id, event.ref, run.revision, 'skipped'); run = await weekly.outcome(id, event.ref, run.revision, 'pending')
  run = await batch.edit(await batch.previewEdit(id, run.id, run.revision, plan.days.map((d, i) => ({ dayId: d.id, weekday: i + 2 }))))
  const moved = (await calendar.events(id, '2026-10-05', '2026-10-11')).find((e) => e.day.id === event.day.id)!
  assert.equal(moved.ref.scheduledDate, '2026-10-07'); assert.equal(moved.unscheduled, undefined)
  run = await weekly.outcome(id, moved.ref, run.revision, 'skipped'); assert.equal(run.outcomes![0].ref.unscheduled, undefined); assert.equal(run.outcomes![0].ref.scheduledDate, '2026-10-07')
  const preview = await actions.preview(id, run.id, run.revision); t.mock.timers.setTime(Date.parse('2026-10-12T00:30:00Z'))
  await assert.rejects(actions.resetRun(preview), /restart week changed/); assert.deepEqual(await calendar.get(id, run.id), run)
})

for (const version of [7, 8, 9] as const) test(`strict v${version} archive validates original checksums and CSV before v10 promotion, without inventing run metadata`, async (t) => {
  const { db, id, batch, stage, complete } = await setup(t), [run] = await batch.addBatch(id, [stage()]); await complete(run)
  const snapshot = await captureProfile(id, db), generated = await generateBackup(snapshot, 'v7-fixture'), data = canonicalSnapshot(snapshot); data.backupSchemaVersion = version; delete (data as any).workouts; for (const record of [...data.drafts, ...data.sessions]) delete record.structure; validateBackupData(data)
  const zip = new JSZip(), tables = csvTables(data), payload = [['data.json', JSON.stringify(data)], ...tables.map((table) => [table.path, table.text])]
  assert.equal(tables.length, version === 7 ? 28 : version === 8 ? 29 : 30)
  const manifest = { ...generated.manifest, backupSchemaVersion: version, databaseSchemaVersion: 5, counts: recordCounts(data), csvRows: Object.fromEntries(tables.map((table) => [table.path, table.rows])), inventory: await Promise.all(payload.map(async ([path, text]) => ({ path, bytes: new TextEncoder().encode(text).length, sha256: await sha256(new TextEncoder().encode(text)), mediaType: path.endsWith('json') ? 'application/json' : 'text/csv; charset=utf-8' }))) }
  for (const [path, text] of payload) zip.file(path, text, { createFolders: false }); zip.file('manifest.json', JSON.stringify(manifest))
  const bytes = await zip.generateAsync({ type: 'uint8array' }), checksum = await sha256(bytes), imported = await readBackup(bytes)
  assert.equal(imported.manifest.backupSchemaVersion, version); assert.equal(imported.data.backupSchemaVersion, 11); assert.equal(await sha256(bytes), checksum)
  assert.deepEqual(imported.data.schedules, JSON.parse(JSON.stringify(snapshot.schedules))); assert.equal(imported.data.schedules[0].hiddenAt, undefined); assert.equal(imported.data.schedules[0].occurrenceExceptions, undefined)
  zip.file('data.json', JSON.stringify({ ...data, schedules: [] })); await assert.rejects(readBackup(await zip.generateAsync({ type: 'uint8array' })), /checksum/)
})

test('reset cannot use old completed results to bypass assignment uniqueness, and failure restores every erased record', async (t) => {
  const { db, id, batch, stage, calendar, actions, complete } = await setup(t)
  const [run] = await batch.addBatch(id, [stage(undefined, '2026-09-28')])
  run.durationChanges = [{ id: crypto.randomUUID(), effectiveFrom: '2026-10-26', durationWeeks: 2, endDate: '2026-10-11' }]
  await db.schedules.put(run)
  for (const week of ['2026-10-05', '2026-10-12']) for (let day = 0; day < 4; day++) await complete(run, day, addDays(week, day))
  assert.equal(runLifecycle(run, await db.sessions.toArray()).previous, false)
  const duplicate = { ...structuredClone(run), id: crypto.randomUUID() }; await db.schedules.add(duplicate)
  const before = await captureProfile(id, db)
  await assert.rejects(actions.resetRun(await actions.preview(id, run.id, run.revision)), /already has an active instance/)
  const after = await captureProfile(id, db); assert.deepEqual(after.sessions, before.sessions); assert.deepEqual(after.drafts, before.drafts); assert.deepEqual(await calendar.get(id, run.id), run)
})

test('ending the final active run removes Train selection even when independent older history exists', async (t) => {
  const { db, id, plan, calendar, weekly, actions, stage } = await setup(t)
  const old = await calendar.create(id, stage(undefined, '2025-01-06').input)
  await weekly.addPlan(id, plan.id)
  const active = (await calendar.library(id)).schedules.find((s) => s.id !== old.id)!
  assert.ok((await db.profiles.get(id))!.selectedPlanIds!.includes(plan.id))
  await actions.leave(await actions.preview(id, active.id, active.revision))
  assert.equal((await db.profiles.get(id))!.selectedPlanIds!.includes(plan.id), false); assert.deepEqual(await calendar.get(id, old.id), old)
})

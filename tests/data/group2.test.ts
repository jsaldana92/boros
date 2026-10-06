import { recordCounts } from '../../src/schemas/backup.ts'
import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { importSession } from '../../src/db/imports.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { restoreService } from '../../src/db/restores.ts'
import { dissolveGroup, duplicateDay, joinGroup, moveOccurrence, planInputSchema, planToInput, roundCount, trainingBlocks } from '../../src/schemas/plan.ts'
import { occurrences, scheduleEnd } from '../../src/schemas/schedule.ts'
import { addDays, localToday, monday, nextMonday } from '../../src/lib/calendar-dates.ts'
import { parseInterchange, toImportDraft } from '../../src/features/create/interchange.ts'
import { generateBackup, sha256 } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { buildRestorePlan, stableJSON } from '../../src/features/backups/restore-plan.ts'
import { csvTables } from '../../src/features/backups/csv.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { groupedAI, groupedPlan } from '../fixtures/group2.ts'
import { planFixture } from '../fixtures/interchange.ts'
import { representativeProfile } from '../fixtures/backup-profile.ts'

async function setup(t) {
  const db = new BorosDatabase(`boros-test-group2-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId
  const plans = planService(db), sessions = sessionService(db), schedules = scheduleService(db)
  return { db, profiles, id, plans, sessions, schedules }
}
const filled = (draft) => { const input = structuredClone(draft.input); input.exercises.forEach((exercise, e) => { exercise.notes = `Member ${e}`; exercise.sets.forEach((set, s) => Object.assign(set, { load: String(e * 10 + s), reps: String(s + 5), rir: s ? '' : '0' })) }); return input }
const family = (snapshot) => stableJSON(Object.fromEntries(['plans', 'schedules', 'drafts', 'sessions'].map((key) => [key, snapshot[key].map(({ profileId: _owner, ...item }) => item)])))

test('group membership is day-scoped, contiguous and strict; repeated library IDs keep separate occurrences and zero/absence', () => {
  const input = groupedPlan(), day = input.days[0], blocks = trainingBlocks(day)
  assert.equal(planInputSchema.safeParse(input).success, true)
  assert.equal(blocks.length, 3); assert.equal(blocks[1].members.length, 3); assert.equal(roundCount(blocks[1].members), 3)
  assert.equal(day.exercises[0].source!.id, day.exercises[1].source!.id); assert.notEqual(day.exercises[0].id, day.exercises[1].id)
  assert.equal(day.groups![0].restBetweenRoundsSeconds, 0); assert.equal(day.groups![0].restAfterGroupSeconds, undefined)
  for (const mutate of [
    (value) => { value.days[0].groups[0].number = 0 }, (value) => { value.days[0].groups[0].restBetweenRoundsSeconds = -1 },
    (value) => { value.days[0].groups[1].number = 1 }, (value) => { value.days[0].groups[1].id = value.days[0].groups[0].id },
    (value) => { value.days[0].exercises[1].groupId = crypto.randomUUID() },
    (value) => { delete value.days[0].exercises[2].groupId }, (value) => { value.days[0].exercises.splice(2, 2) },
    (value) => { value.days[0].groups[0].unknown = true },
  ]) { const value = structuredClone(input); mutate(value); assert.equal(planInputSchema.safeParse(value).success, false) }
  const next = duplicateDay(day); input.days.push(next); assert.equal(planInputSchema.safeParse(input).success, true)
  next.exercises[1].groupId = day.groups![0].id; assert.equal(planInputSchema.safeParse(input).success, false)
})

test('joining, moving, renumbering, dissolution and duplication retain occurrence prescriptions and stable group identity', () => {
  let day = groupedPlan().days[0], original = structuredClone(day), groupId = day.groups![0].id
  day.groups![0].number = 7; assert.equal(day.groups![0].id, groupId)
  day = moveOccurrence(day, day.exercises[2].id, -1)
  assert.equal(trainingBlocks(day)[1].members[0].id, original.exercises[2].id)
  day = moveOccurrence(day, day.exercises[1].id, -1); assert.equal(trainingBlocks(day)[0].group!.id, groupId)
  day = joinGroup(day, original.exercises[0].id, 7); assert.equal(trainingBlocks(day)[0].members.length, 4)
  assert.equal(planInputSchema.safeParse({ name: 'Test', days: [day] }).success, true)
  const copy = duplicateDay(day); assert.notEqual(copy.groups![0].id, groupId)
  assert.deepEqual(copy.exercises.map((item) => item.prescription), day.exercises.map((item) => item.prescription))
  assert.ok(copy.exercises.every((item) => !day.exercises.some((old) => old.id === item.id)))
  day = dissolveGroup(day, groupId)
  assert.ok(day.exercises.filter((item) => original.exercises.slice(0, 4).some((old) => old.id === item.id)).every((item) => !item.groupId))
  for (const item of day.exercises) assert.deepEqual(item.prescription, original.exercises.find((old) => old.id === item.id)!.prescription)
})

test('new plans require duration; legacy v5 records and unbounded schedules survive reopen and unrelated edits without migration', async (t) => {
  const { db, id, plans, schedules } = await setup(t), raw = groupedPlan()
  delete raw.durationWeeks; await assert.rejects(plans.save(id, raw), /duration/)
  const plan = await plans.save(id, { ...raw, durationWeeks: 2 }); delete plan.durationWeeks; await db.plans.put(plan)
  const schedule = await schedules.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: '2024-12-30', timeZone: 'America/New_York', mapping: [{ dayId: plan.days[0].id, weekday: 6 }] })
  const before = await captureProfile(id, db); db.close(); await db.open()
  assert.equal(db.verno, 6); const after = await captureProfile(id, db); before.capturedAt = after.capturedAt; assert.deepEqual(after, before)
  assert.equal(schedule.endDate, undefined); assert.equal(occurrences(schedule, '2040-01-01', '2040-01-07').length, 1)
  const saved = await plans.save(id, { ...planToInput(plan), name: 'Still unbounded' }, plan)
  assert.equal(saved.durationWeeks, undefined); assert.deepEqual(await schedules.get(id, schedule.id), schedule)
  const copy = await plans.duplicateDraft(id, plan.id); await assert.rejects(plans.save(id, copy), /duration/)
})

test('unequal grouped results, notes, timer, Clear and full/partial/idempotent Save survive reload and immutable source edits', async (t) => {
  const { db, id, plans, sessions } = await setup(t), plan = await plans.save(id, groupedPlan())
  let draft = await sessions.start(id, plan.id, plan.days[0].id), input = filled(draft)
  draft = await sessions.update(id, draft.id, draft.revision, input)
  const [g1, g2] = draft.day.groups!
  assert.equal(await sessions.startGroupTimer(id, draft.id, draft.revision, g1.id, 0, 60), undefined, 'explicit zero ignores a manual override')
  await assert.rejects(sessions.startTimer(id, draft.id, draft.revision, draft.day.exercises[1].id, 0, 30), /superset round/)
  const timer = await sessions.startGroupTimer(id, draft.id, draft.revision, g1.id, 2, 15)
  assert.equal(timer!.durationSeconds, 15); assert.match(timer!.label, /after group/)
  const second = await sessions.startGroupTimer(id, draft.id, draft.revision, g2.id, 0, 999)
  assert.equal(second!.durationSeconds, 20); assert.equal(await db.restTimers.count(), 1)
  assert.equal(await sessions.startGroupTimer(id, draft.id, draft.revision, g2.id, 1), undefined, 'final group zero means no timed rest'); assert.equal(await db.restTimers.count(), 0)
  const final = await sessions.startGroupTimer(id, draft.id, draft.revision, g2.id, 0)
  db.close(); await db.open(); assert.deepEqual((await sessions.getDraft(id, draft.id)).input, input); assert.equal((await db.restTimers.get('active'))!.token, final!.token)
  const changed = planToInput(plan); changed.days[0].groups![0].number = 9; changed.days[0].exercises[1].prescription.sets[0].reps.min = 6
  await plans.save(id, changed, plan); assert.deepEqual((await sessions.getDraft(id, draft.id)).day, draft.day)
  const completed = await sessions.complete(id, draft.id, draft.revision, input, false)
  assert.equal(completed.exercises[0].sets.length, 2); assert.equal(completed.exercises[1].sets.length, 3)
  assert.deepEqual(completed.day, draft.day); assert.notDeepEqual(completed.exercises[0], completed.exercises[1]); assert.equal(completed.partial, false)
  assert.deepEqual(await sessions.complete(id, draft.id, draft.revision, input, false), completed); assert.equal(await db.sessions.count(), 1)
  const next = await sessions.start(id, plan.id, plan.days[0].id), cleared = await sessions.clear(id, next.id, next.revision)
  assert.deepEqual(cleared.day, next.day); assert.ok(cleared.input.exercises.every((item) => item.notes === '' && item.sets.every((set) => set.load === '')))
  input = filled(cleared); input.exercises[1].sets[1].skipped = true
  await assert.rejects(sessions.complete(id, next.id, cleared.revision, input, false), /partial/)
  assert.equal((await sessions.complete(id, next.id, cleared.revision, input, true)).partial, true)
  assert.deepEqual(await db.sessions.get([id, completed.id]), completed)
})

test('group writes and results remain profile-bound, stale-safe and atomic after injected failures', async (t) => {
  const { db, id, profiles, plans, sessions } = await setup(t), plan = await plans.save(id, groupedPlan()), other = await profiles.create('Other')
  await assert.rejects(sessions.start(other.id, plan.id, plan.days[0].id), /unavailable/)
  const draft = await sessions.start(id, plan.id, plan.days[0].id), updated = await sessions.update(id, draft.id, draft.revision, filled(draft))
  await assert.rejects(sessions.update(id, draft.id, draft.revision, draft.input), /another tab/)
  await assert.rejects(sessions.startGroupTimer(other.id, draft.id, updated.revision, draft.day.groups![0].id, 0), /unavailable/)
  const failure = () => { throw new Error('Injected full disk') }; db.sessions.hook('creating', failure)
  await assert.rejects(sessions.complete(id, draft.id, updated.revision, updated.input, false), /full disk/)
  assert.deepEqual(await sessions.getDraft(id, draft.id), updated); assert.equal(await db.sessions.count(), 0)
  db.sessions.hook('creating').unsubscribe(failure)
  const newer = await plans.save(id, { ...planToInput(plan), durationWeeks: 3 }, plan)
  await assert.rejects(plans.save(id, planToInput(plan), plan), /another tab/); assert.deepEqual(await plans.get(id, plan.id), newer)
  db.plans.hook('creating', failure)
  await assert.rejects(importSession(id, db).savePlan({ ...groupedPlan(), name: 'Rollback' }), /full disk/)
  assert.equal(await db.tags.count(), 0); assert.equal(await db.plans.count(), 1)
})

test('two calendar weeks include first Monday through final Sunday across New Year and both DST boundaries', async (t) => {
  const { id, plans, schedules } = await setup(t), raw = groupedPlan(); raw.days.push(duplicateDay(raw.days[0])); raw.days[1].name = 'Sunday'
  const plan = await plans.save(id, raw)
  for (const [start, end] of [['2024-12-30', '2025-01-12'], ['2025-03-03', '2025-03-16'], ['2025-10-27', '2025-11-09']]) for (const timeZone of ['America/New_York', 'Asia/Tokyo']) {
    assert.equal(scheduleEnd(start, 2), end)
    const schedule = await schedules.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: start, timeZone, mapping: [{ dayId: plan.days[0].id, weekday: 0 }, { dayId: plan.days[1].id, weekday: 6 }] })
    const dates = occurrences(schedule, addDays(start, -1), addDays(end, 8)).map((item) => item.ref.scheduledDate)
    assert.deepEqual(dates, [start, addDays(start, 6), addDays(start, 7), end]); assert.equal(occurrences(schedule, addDays(end, 1), addDays(end, 7)).length, 0)
  }
  assert.throws(() => scheduleEnd('9999-12-27', 2), /range/)
  assert.throws(() => scheduleEnd('2025-01-06', Number.MAX_SAFE_INTEGER), /range/)
})

test('duration edits require explicit preview; keep missed dates, started/completed snapshots and stale preview protection', async (t) => {
  const { db, id, plans, schedules, sessions } = await setup(t), start = monday(localToday('UTC')), effectiveFrom = nextMonday(start)
  let plan = await plans.save(id, { ...groupedPlan(), durationWeeks: 4 })
  const schedule = await schedules.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: start, timeZone: 'UTC', mapping: [{ dayId: plan.days[0].id, weekday: 0 }] })
  const opened = (await sessions.openOccurrence(id, schedule.id, plan.days[0].id, addDays(start, 14))).draft!
  const completed = await sessions.complete(id, opened.id, opened.revision, filled(opened), false)
  const future = (await sessions.openOccurrence(id, schedule.id, plan.days[0].id, addDays(start, 21))).draft!
  plan = await plans.save(id, { ...planToInput(plan), durationWeeks: 1 }, plan)
  assert.equal((await schedules.get(id, schedule.id)).endDate, addDays(start, 27))
  const change = { scheduleId: schedule.id, revision: schedule.revision, effectiveFrom, kind: 'duration' as const, mapping: [] }
  const preview = await schedules.preview(id, change); assert.equal(preview.endDate, addDays(start, 6)); assert.equal(preview.conflicts.length, 1)
  await assert.rejects(schedules.commit(id, preview, false), /keeping/)
  const changed = await schedules.commit(id, preview, true)
  assert.equal(occurrences(changed, start, addDays(start, 28)).length, 1)
  const events = await schedules.events(id, start, addDays(start, 28), 'UTC')
  assert.equal(events.length, 3); assert.equal(events.filter((item) => item.retained).length, 2); assert.equal(events[0].session, undefined)
  assert.deepEqual(await db.sessions.get([id, completed.id]), completed); assert.deepEqual(await sessions.getDraft(id, future.id), future)
  const stale = await schedules.preview(id, { ...change, revision: changed.revision })
  await plans.save(id, { ...planToInput(plan), durationWeeks: 3 }, plan)
  await assert.rejects(schedules.commit(id, stale, true), /changed after preview/)
})

test('AI v2 validates repeated/groups/duration with precise paths; v1 needs explicit preview duration and atomic import', async (t) => {
  const { db, id } = await setup(t), value = groupedAI(), parsed = parseInterchange(JSON.stringify(value))
  assert.deepEqual(parsed.issues, []); const draft = toImportDraft(parsed.value!); assert.equal(draft.kind, 'plan'); if (draft.kind !== 'plan') return
  const imported = await importSession(id, db).savePlan(draft.input); assert.equal(imported.durationWeeks, 2); assert.equal(imported.days[0].groups!.length, 2)
  assert.equal(new Set(imported.days[0].exercises.map((item) => item.id)).size, 6)
  for (const [mutate, path] of [
    [(p) => { p.plan.durationWeeks = 0 }, 'plan.durationWeeks'], [(p) => { p.plan.days[0].supersets[0].number = -1 }, 'plan.days[0].supersets[0].number'],
    [(p) => { p.plan.days[0].exercises[1].superset = 88 }, 'plan.days[0].exercises[1].superset'],
    [(p) => { p.plan.days[0].supersets[0].id = 'foreign' }, 'plan.days[0].supersets[0].id'],
    [(p) => { p.plan.days[0].exercises[2].superset = null }, 'plan.days[0].supersets[0]'],
  ] as const) { const copy = structuredClone(value); mutate(copy); assert.ok(parseInterchange(JSON.stringify(copy)).issues.some((issue) => issue.path === path), path) }
  const legacy = toImportDraft(parseInterchange(JSON.stringify(planFixture())).value!); if (legacy.kind !== 'plan') return
  assert.equal(legacy.input.durationWeeks, undefined); const session = importSession(id, db)
  await assert.rejects(session.savePlan(legacy.input), /duration/); legacy.input.durationWeeks = 2
  assert.equal((await session.savePlan(legacy.input)).durationWeeks, 2)
  assert.equal(await db.plans.count(), 2)
})

test('populated v5 reopen leaves every store and original photo bytes unchanged', async (t) => {
  const { db } = await setup(t); await representativeProfile(db)
  const read = async () => Promise.all(db.tables.map(async (table) => [table.name, await Promise.all((await table.toArray()).map(async (item) => item.blob ? { ...item, blob: Array.from(new Uint8Array(await item.blob.arrayBuffer())) } : item))]))
  const before = await read(); db.close(); await db.open(); assert.equal(db.verno, 6); assert.deepEqual(await read(), before)
})

test('current backup round trip retains Group 2 groups/repeated results/duration and both whole-family merge priorities', async (t) => {
  const { db, id, plans, schedules, sessions } = await setup(t), plan = await plans.save(id, groupedPlan())
  const schedule = await schedules.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: '2025-01-06', timeZone: 'UTC', mapping: [{ dayId: plan.days[0].id, weekday: 0 }] })
  await plans.save(id, { ...planToInput(plan), durationWeeks: 3 }, plan)
  await schedules.commit(id, await schedules.preview(id, { scheduleId: schedule.id, revision: schedule.revision, kind: 'duration', effectiveFrom: nextMonday(localToday('UTC')), mapping: [] }), true)
  const draft = await sessions.start(id, plan.id, plan.days[0].id); await sessions.complete(id, draft.id, draft.revision, filled(draft), false)
  await sessions.start(id, plan.id, plan.days[0].id)
  const original = await captureProfile(id, db), output = await generateBackup(original, 'test'), backup = await readBackup(output.bytes)
  assert.equal(backup.manifest.backupSchemaVersion, 11); assert.ok(backup.manifest.csvRows['csv/supersets.csv'] > 0)
  const restore = restoreService(db), preview = await restore.preview(backup, 'new', 'Roundtrip'), owner = await restore.commit(preview, true)
  const round = await captureProfile(owner, db); assert.equal(family(round), family(original))
  assert.deepEqual((await readBackup((await generateBackup(round, 'test')).bytes)).data.plans[0].days, plan.days)
  const local = structuredClone(original); local.plans[0].durationWeeks = 8; local.plans[0].days[0].groups![0].number = 9; local.drafts.find((item) => !item.finalizedAt)!.input.exercises[1].notes = 'Device note'
  for (const choice of ['device', 'import'] as const) {
    const result = await buildRestorePlan(backup, local, choice, crypto.randomUUID(), original.profile.name, new Date().toISOString())
    assert.equal(family(result.result), family(choice === 'device' ? local : original))
    validateBackupData(canonicalSnapshot(result.result))
  }
  // A normalized-name match remaps the imported root, with repeated occurrence
  // and group IDs still scoped inside their winning plan/day snapshots.
  const remapped = structuredClone(backup), foreignPlanId = crypto.randomUUID()
  remapped.data.plans[0].id = foreignPlanId
  remapped.data.schedules.forEach((item) => { item.planId = foreignPlanId })
  for (const item of [...remapped.data.drafts, ...remapped.data.sessions]) item.sourcePlanId = foreignPlanId
  remapped.data.drafts.forEach((item) => { if (item.activeSourceKey && !item.occurrenceKey) item.activeSourceKey = `${foreignPlanId}:${item.sourceDayId}` })
  const merged = await buildRestorePlan(remapped, local, 'import', crypto.randomUUID(), original.profile.name, new Date().toISOString())
  assert.equal(family(merged.result), family(original))
  assert.equal(merged.result.schedules[0].durationChanges![0].durationWeeks, 3)
  assert.deepEqual(merged.result.sessions[0].day.groups, original.sessions[0].day.groups)
})

test('validated v1 archives transform only after checksums; unbounded meaning and original bytes survive', async (t) => {
  const { db, id, plans, schedules } = await setup(t), raw = groupedPlan(); raw.days[0] = dissolveGroup(dissolveGroup(raw.days[0], raw.days[0].groups![0].id), raw.days[0].groups![1].id)
  delete raw.days[0].groups
  const plan = await plans.save(id, raw); delete plan.durationWeeks; await db.plans.put(plan)
  await schedules.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: '2025-01-06', timeZone: 'UTC', mapping: [{ dayId: plan.days[0].id, weekday: 0 }] })
  const snapshot = await captureProfile(id, db), generated = await generateBackup(snapshot, 'legacy-fixture'), data = canonicalSnapshot(snapshot); data.backupSchemaVersion = 1; delete (data as any).workouts; delete data.profile.timeZone; delete data.profile.selectedPlanIds; validateBackupData(data)
  const zip = new JSZip(), payload = [['data.json', JSON.stringify(data)], ...csvTables(data).map((table) => [table.path, table.text])]
  const manifest = { ...generated.manifest, backupSchemaVersion: 1, databaseSchemaVersion: 5, counts: recordCounts(data), csvRows: Object.fromEntries(csvTables(data).map((table) => [table.path, table.rows])), inventory: await Promise.all(payload.map(async ([path, text]) => ({ path, bytes: new TextEncoder().encode(text).length, sha256: await sha256(new TextEncoder().encode(text)), mediaType: path.endsWith('json') ? 'application/json' : 'text/csv; charset=utf-8' }))) }
  for (const [path, text] of payload) zip.file(path, text, { createFolders: false }); zip.file('manifest.json', JSON.stringify(manifest))
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), checksum = await sha256(bytes), restored = await readBackup(bytes)
  assert.equal(restored.manifest.backupSchemaVersion, 1); assert.equal(restored.data.backupSchemaVersion, 11)
  assert.equal(restored.data.plans[0].durationWeeks, undefined); assert.equal(restored.data.schedules[0].endDate, undefined)
  assert.deepEqual(restored.data.plans[0].days, JSON.parse(JSON.stringify(plan.days))); assert.equal(await sha256(bytes), checksum)
  zip.file('data.json', JSON.stringify({ ...data, profile: { ...data.profile, name: 'Tampered' } }))
  await assert.rejects(readBackup(await zip.generateAsync({ type: 'uint8array' })), /checksum/)
  const corrupt = structuredClone(data); corrupt.plans[0].durationWeeks = 2; assert.throws(() => validateBackupData(corrupt), /durationWeeks/)
})

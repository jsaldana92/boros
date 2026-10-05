import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { runActionService } from '../../src/db/run-actions.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { progressService } from '../../src/db/progress.ts'
import { repairClosedRunDrafts } from '../../src/db/closed-run-repair.ts'
import { DraftController } from '../../src/features/train/draft-controller.ts'
import { hasSessionInput } from '../../src/schemas/session.ts'
import { copyExercise, newDay } from '../../src/schemas/plan.ts'
import { occurrences } from '../../src/schemas/schedule.ts'
import { addDays, localToday, monday, weekday } from '../../src/lib/calendar-dates.ts'
import { dayStatus } from '../../src/lib/weekly-status.ts'
import { previousResults } from '../../src/lib/previous-results.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-train-refine-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId, plans = planService(db), weekly = weeklyService(db), sessions = sessionService(db), actions = runActionService(db)
  const make = (name: string) => plans.save(id, { name, durationWeeks: 6, days: [newDay(1), newDay(2)].map((day) => ({ ...day, exercises: [0, 1].map(() => copyExercise({ name: 'Repeated press', tagNames: [], sets: [{ reps: { min: 5, max: 8 } }, { reps: { min: 5, max: 8 } }], restBetweenSeconds: 10 })) })) })
  const plan = await make('Refinements'); await weekly.addPlan(id, plan.id)
  const [run] = await weekly.activate(id, plan.id)
  const event = (week: number, day = 0) => occurrences(run, addDays(run.startWeek, week * 7), addDays(run.startWeek, week * 7 + 6))[day]
  const open = async (week: number, day = 0) => { const e = event(week, day); return (await sessions.openOccurrence(id, run.id, e.ref.dayId, e.ref.scheduledDate)).draft! }
  const record = async (week: number, day = 0) => { const draft = await open(week, day), input = structuredClone(draft.input); Object.assign(input.exercises[0].sets[0], { load: '120', unit: 'lb', reps: '5', rir: '0' }); return sessions.complete(id, draft.id, draft.revision, input, true) }
  return { db, profiles, id, plans, plan, make, weekly, run, event, open, record, sessions, actions }
}

test('empty/timer-only drafts are not recovery data; zero/notes are; deliberate discard defeats queued writes and keeps other data', async (t) => {
  const { db, id, open, sessions } = await setup(t), draft = await open(0), other = await open(1)
  assert.equal(hasSessionInput(draft.input), false)
  await sessions.startTimer(id, draft.id, draft.revision, draft.day.exercises[0].id, 0)
  assert.equal(hasSessionInput((await sessions.getDraft(id, draft.id)).input), false)
  const controller = new DraftController(draft, sessions), input = structuredClone(draft.input)
  input.exercises[0].sets[0].load = '0'; assert.equal(hasSessionInput(input), true); controller.change(input)
  await controller.discard(); await controller.flush()
  assert.equal(await db.drafts.get([id, draft.id]), undefined); assert.equal(await db.restTimers.count(), 0)
  assert.deepEqual(await db.drafts.get([id, other.id]), other)
  await sessions.discard(id, draft.id, draft.revision)
  await assert.rejects(sessions.update(id, draft.id, draft.revision, input), /unavailable/)
  const notes = structuredClone(other.input); notes.notes = 'Recovery note'; assert.equal(hasSessionInput(notes), true)
  const saved = await sessions.update(id, other.id, other.revision, notes), interrupted = new DraftController(saved, sessions)
  interrupted.dispose(); assert.deepEqual((await sessions.getDraft(id, other.id)).input, notes)
})

test('discard waits for running autosave; failed deletion retains recoverable input and stale deletion cannot destroy newer input', async (t) => {
  const { db, id, open, sessions } = await setup(t), draft = await open(0)
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve }), update = sessions.update
  sessions.update = async (...args) => { await gate; return update(...args) }
  const controller = new DraftController(draft, sessions), input = structuredClone(draft.input); input.notes = 'Keep on failure'
  controller.change(input); const writing = controller.flush(); await Promise.resolve()
  const remove = db.drafts.delete.bind(db.drafts); db.drafts.delete = async () => { throw new Error('Test delete denied') }
  const canceling = controller.discard(); release(); await writing; await assert.rejects(canceling, /delete denied/)
  assert.equal(controller.input.notes, 'Keep on failure'); assert.equal((await db.drafts.get([id, draft.id]))!.input.notes, 'Keep on failure')
  db.drafts.delete = remove
  await assert.rejects(sessions.discard(id, draft.id, draft.revision), /changed/)
  await controller.discard(); assert.equal(await db.drafts.count(), 0)
})

test('Reset deletes only one occurrence and restores statuses/statistics; stale tabs cannot resurrect its draft', async (t) => {
  const { db, id, run, event, record, open, sessions, actions, weekly } = await setup(t)
  const completed = await record(0), kept = await record(1), otherDraft = await open(2)
  const preview = await actions.preview(id, run.id, run.revision, event(0).ref)
  await actions.reset(preview)
  assert.equal(await db.sessions.get([id, completed.id]), undefined); assert.deepEqual(await db.sessions.get([id, kept.id]), kept)
  assert.deepEqual(await db.drafts.get([id, otherDraft.id]), otherDraft)
  await assert.rejects(sessions.update(id, completed.id, 1, otherDraft.input), /unavailable/)
  await assert.rejects(sessions.openOccurrence(id, run.id, event(0).ref.dayId, event(0).ref.scheduledDate, run.revision), /changed/)
  const calendar = scheduleService(db), events = await calendar.events(id, run.startWeek, addDays(run.startWeek, 6))
  assert.equal(dayStatus(events[0]), 'Pending'); assert.equal((await progressService(db).read(id)).plans[0].daysCompleted, 0) // The retained fixture log is partial.
  let current = (await db.schedules.get([id, run.id]))!
  current = await weekly.outcome(id, event(0).ref, current.revision, 'skipped')
  await actions.reset(await actions.preview(id, run.id, current.revision, event(0).ref))
  assert.equal((await progressService(db).read(id)).plans[0].daysSkipped, 0)
  const next = (await db.schedules.get([id, run.id]))!
  assert.deepEqual(next.revisions, run.revisions); assert.equal(next.endDate, run.endDate)
})

test('Reset rechecks pending writes and rolls back all results/timer deletion on failure', async (t) => {
  const { db, id, run, event, open, actions, sessions } = await setup(t), draft = await open(0)
  const preview = await actions.preview(id, run.id, run.revision, event(0).ref), input = structuredClone(draft.input); input.notes = 'Newer'
  const changed = await sessions.update(id, draft.id, draft.revision, input)
  await assert.rejects(actions.reset(preview), /changed after preview/)
  const fresh = await actions.preview(id, run.id, run.revision, event(0).ref)
  await sessions.startTimer(id, changed.id, changed.revision, changed.day.exercises[0].id, 0)
  const put = db.schedules.put.bind(db.schedules); db.schedules.put = async () => { throw new Error('Test reset rollback') }
  await assert.rejects(actions.reset(fresh), /reset rollback/); db.schedules.put = put
  assert.deepEqual(await db.drafts.get([id, changed.id]), changed); assert.equal(await db.restTimers.count(), 1)
  await actions.reset(fresh); assert.equal(await db.restTimers.count(), 0)
})

test('scheduled Reset restores zone-based due states; Leave stops future generation and retains historical results', async (t) => {
  const { db, id, plan, sessions, actions } = await setup(t), calendar = scheduleService(db)
  const today = localToday('America/New_York'), previous = addDays(today, -7)
  let run = await calendar.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: monday(previous), timeZone: 'America/New_York', mapping: plan.days.map((day, index) => ({ dayId: day.id, weekday: (weekday(today) + index) % 7 })) })
  const complete = async (date: string) => {
    const draft = (await sessions.openOccurrence(id, run.id, plan.days[0].id, date)).draft!, input = structuredClone(draft.input)
    Object.assign(input.exercises[0].sets[0], { load: '0', reps: '5' })
    return sessions.complete(id, draft.id, draft.revision, input, true)
  }
  const measurement = { id: crypto.randomUUID(), profileId: id, weightKg: 75, measuredAt: new Date().toISOString(), loggedAt: new Date().toISOString() }
  await db.measurements.add(measurement)
  for (const [offset, status] of [[-7, 'Past Due'], [0, 'Due Today'], [7, 'Pending']] as const) {
    const date = addDays(today, offset), log = await complete(date)
    await actions.reset(await actions.preview(id, run.id, run.revision, log.occurrence))
    run = (await db.schedules.get([id, run.id]))!
    const event = (await calendar.events(id, date, date)).find((event) => event.ref.scheduleId === run.id && event.ref.dayId === plan.days[0].id)!
    assert.equal(dayStatus(event), status)
  }
  const historical = await complete(previous), preview = await actions.preview(id, run.id, run.revision)
  assert.equal(preview.stopsCalendar, true); await actions.leave(preview)
  assert.equal((await calendar.events(id, addDays(today, 7), addDays(today, 20))).filter((event) => event.ref.scheduleId === run.id).length, 0)
  assert.ok((await calendar.events(id, previous, previous)).some((event) => event.session?.id === historical.id))
  assert.deepEqual(await db.measurements.get([id, measurement.id]), measurement)
})

test('Leave closes one run, deletes ALL unfinished weeks atomically, preserves completed history and creates fresh independent re-add', async (t) => {
  const { db, id, profiles, run, event, open, record, sessions, actions, weekly, plan, make } = await setup(t)
  const completed = await record(0), a = await open(1), b = await open(3, 1)
  let marked = await weekly.outcome(id, event(2).ref, run.revision, 'completed')
  const otherPlan = await make('Other'), other = await sessions.start(id, otherPlan.id, otherPlan.days[0].id)
  const second = await profiles.create('Second'), secondPlan = await planService(db).save(second.id, { name: 'Same name', durationWeeks: 2, days: structuredClone(plan.days) }), otherProfile = await sessions.start(second.id, secondPlan.id, secondPlan.days[0].id)
  await sessions.startTimer(id, b.id, b.revision, b.day.exercises[0].id, 0)
  const preview = await actions.preview(id, run.id, marked.revision); assert.equal(preview.draftCount, 2)
  const put = db.profiles.put.bind(db.profiles); db.profiles.put = async () => { throw new Error('Test leave rollback') }
  await assert.rejects(actions.leave(preview), /leave rollback/); db.profiles.put = put
  assert.deepEqual(await db.schedules.get([id, run.id]), marked); assert.ok(await db.drafts.get([id, a.id])); assert.equal(await db.restTimers.count(), 1)
  await actions.leave(preview); await actions.leave(preview)
  assert.equal(await db.drafts.get([id, a.id]), undefined); assert.equal(await db.drafts.get([id, b.id]), undefined); assert.equal(await db.restTimers.count(), 0)
  assert.deepEqual(await db.sessions.get([id, completed.id]), completed); assert.deepEqual(await db.drafts.get([id, other.id]), other); assert.deepEqual(await db.drafts.get([second.id, otherProfile.id]), otherProfile)
  marked = (await db.schedules.get([id, run.id]))!; assert.ok(marked.closedAt); assert.equal(marked.outcomes?.[0].status, 'completed')
  await assert.rejects(sessions.update(id, a.id, a.revision, a.input), /unavailable/)
  await assert.rejects(sessions.openOccurrence(id, run.id, event(1).ref.dayId, event(1).ref.scheduledDate), /left/)
  await assert.rejects(weekly.outcome(id, event(2).ref, marked.revision, 'pending'), /left/)
  await weekly.addPlan(id, plan.id); const [fresh] = await weekly.activate(id, plan.id)
  assert.notEqual(fresh.id, run.id); assert.equal(fresh.outcomes, undefined); assert.equal(fresh.closedAt, undefined)
  const e = occurrences(fresh, fresh.startWeek, addDays(fresh.startWeek, 6))[0], newDraft = (await sessions.openOccurrence(id, fresh.id, e.ref.dayId, e.ref.scheduledDate)).draft!
  assert.equal(hasSessionInput(newDraft.input), false); assert.deepEqual(previousResults(newDraft, [completed], 'lb')[newDraft.day.exercises[0].id], [undefined, undefined])
})

test('another run of the same template survives Leave; stale preview is rejected; cleanup is conclusive and idempotent', async (t) => {
  const { db, id, run, plan, open, sessions, actions, profiles } = await setup(t)
  const calendar = scheduleService(db), otherRun = await calendar.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: run.startWeek, timeZone: run.timeZone, mapping: plan.days.map((day, weekday) => ({ dayId: day.id, weekday })) })
  const e = occurrences(otherRun, otherRun.startWeek, addDays(otherRun.startWeek, 6))[0], independent = (await sessions.openOccurrence(id, otherRun.id, e.ref.dayId, e.ref.scheduledDate)).draft!
  const abandoned = await open(0), preview = await actions.preview(id, run.id, run.revision), input = structuredClone(abandoned.input); input.notes = 'new write'
  const changed = await sessions.update(id, abandoned.id, abandoned.revision, input); await assert.rejects(actions.leave(preview), /changed after preview/)
  await actions.leave(await actions.preview(id, run.id, run.revision)); assert.deepEqual(await db.drafts.get([id, independent.id]), independent)
  assert.ok((await profiles.getProfile(id)).selectedPlanIds?.includes(plan.id))
  await db.drafts.add(changed) // Simulated pre-fix remnant with explicit closed run identity.
  await assert.rejects(sessions.update(id, changed.id, changed.revision, changed.input), /left/)
  await db.restTimers.put({ id: 'active', profileId: id, draftId: changed.id, token: crypto.randomUUID(), label: 'remnant', durationSeconds: 10, endAt: new Date(Date.now() + 10000).toISOString() })
  await db.schedules.update([id, otherRun.id], { stoppedFrom: run.startWeek })
  const repair = () => db.transaction('rw', db.tables, () => repairClosedRunDrafts(db, id))
  assert.equal(await repair(), 1); assert.equal(await repair(), 0); assert.equal(await db.restTimers.count(), 0)
  assert.deepEqual(await db.drafts.get([id, independent.id]), independent) // Stop alone is ambiguous, never Leave.
  await db.drafts.add(changed); await profiles.initialize(); assert.equal(await db.drafts.get([id, changed.id]), undefined)
})

test('v6 closed state and completed history round-trip; reviewed restore removes only conclusively closed unfinished drafts', async (t) => {
  const { db, id, run, record, open, actions } = await setup(t), completed = await record(0), abandoned = await open(1)
  await actions.leave(await actions.preview(id, run.id, run.revision)); await db.drafts.add(abandoned)
  const snapshot = await captureProfile(id, db), zip = await generateBackup(snapshot, 'train-refinement'), backup = await readBackup(zip.bytes)
  assert.equal(backup.data.backupSchemaVersion, 8)
  for (const choice of ['new', 'replace', 'device', 'import'] as const) {
    const restored = await buildRestorePlan(backup, choice === 'new' ? undefined : snapshot, choice, crypto.randomUUID(), snapshot.profile.name, new Date().toISOString())
    assert.ok(restored.result.schedules[0].closedAt); assert.equal(restored.result.sessions[0].id, completed.id)
    assert.equal(restored.result.drafts.filter((draft) => !draft.finalizedAt).length, 0); assert.match(restored.warnings.join(' '), /Closed-run compatibility cleanup/)
    assert.equal(restored.counts.drafts.added, choice === 'device' ? 0 : 1)
    assert.equal(restored.counts.drafts.removed, choice === 'device' ? 1 : choice === 'new' ? 0 : 2)
    if (choice === 'new') assert.doesNotMatch(restored.warnings.join(' '), /Removed plan families/)
    validateBackupData(canonicalSnapshot(restored.result))
  }
})

test('hints use one prior actual corresponding set, stable run/day/occurrence identities, units, zero and deterministic ties', async (t) => {
  const { open, record } = await setup(t), older = await record(0), latest = structuredClone(older), target = await open(2)
  latest.id = 'ffffffff-ffff-4fff-afff-ffffffffffff'; latest.occurrence!.scheduledWeek = addDays(older.occurrence!.scheduledWeek, 7)
  latest.completedAt = older.completedAt; latest.loggedAt = older.loggedAt; target.startedAt = latest.completedAt
  latest.exercises[0].sets[0] = { skipped: false, weightKg: 0, load: 0, unit: 'kg', reps: 0 }
  latest.exercises[0].sets[1] = { skipped: true }; older.exercises[0].sets[1] = { skipped: false, weightKg: 54.4310844, load: 120, unit: 'lb', reps: 8, rir: 2 }
  latest.exercises[1].sets[0] = { skipped: false, weightKg: 10, load: 10, unit: 'kg', reps: 9, rir: 0 }
  const id = target.day.exercises[0].id, repeat = target.day.exercises[1].id, hints = previousResults(target, [older, latest], 'lb')
  assert.deepEqual(hints[id], [{ load: '0', reps: '0' }, { load: '120', reps: '8', rir: '2' }]); assert.equal(hints[repeat][0]?.reps, '9'); assert.equal(hints[repeat][0]?.rir, '0')
  // Grouping does not merge repeated occurrences or use another member's set.
  const groupId = crypto.randomUUID()
  for (const item of [target, older, latest]) {
    item.day.groups = [{ id: groupId, number: 1 }]
    item.day.exercises.forEach((exercise) => { exercise.groupId = groupId })
  }
  assert.deepEqual(previousResults(target, [older, latest], 'lb'), hints)
  const changed = structuredClone(target); changed.day.exercises[0].prescription.sets.reverse(); changed.day.exercises[0].prescription.sets[0].reps.min = 1
  assert.deepEqual(previousResults(changed, [latest, older], 'kg')[id], [undefined, undefined])
  for (const mutate of [(s: typeof latest) => { s.occurrence!.scheduleId = crypto.randomUUID() }, (s: typeof latest) => { s.sourceDayId = crypto.randomUUID() }, (s: typeof latest) => { s.profileId = crypto.randomUUID() }]) { const wrong = structuredClone(latest); mutate(wrong); assert.deepEqual(previousResults(target, [wrong], 'kg')[id], [undefined, undefined]) }
  assert.equal(hasSessionInput(target.input), false)
})

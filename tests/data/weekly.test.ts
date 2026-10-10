import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { copyExercise, newDay, planToInput } from '../../src/schemas/plan.ts'
import { occurrences, programWeek } from '../../src/schemas/schedule.ts'
import { addDays } from '../../src/lib/calendar-dates.ts'
import { dayStatus, weekLabel } from '../../src/lib/weekly-status.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { progressService } from '../../src/db/progress.ts'

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-weekly-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId, plans = planService(db)
  const make = (name: string) => plans.save(id, { name, notes: 'A saved program note', durationWeeks: 4, days: [ { ...newDay(1), exercises: [copyExercise({ name: 'Squat', tagNames: [], sets: [{ reps: { min: 5, max: 5 } }] })] } ] })
  const plan = await make('Weekly'), weekly = weeklyService(db), calendar = scheduleService(db), sessions = sessionService(db)
  return { db, profiles, id, plan, make, weekly, calendar, sessions }
}
test('immediate append is atomic, duplicate-safe, profile-isolated and removal retains programs', async (t) => {
  const { db, profiles, id, plan, make, weekly } = await setup(t), other = await make('Other')
  await Promise.all([weekly.addPlan(id, plan.id), weekly.addPlan(id, other.id), weekly.addPlan(id, plan.id)])
  assert.deepEqual((await profiles.getProfile(id)).selectedPlanIds, [plan.id, other.id])
  assert.equal(await db.schedules.count(), 2)
  const second = await profiles.create('Second'); await assert.rejects(weekly.addPlan(second.id, plan.id), /active plan/)
  assert.equal((await profiles.getProfile(second.id)).selectedPlanIds, undefined)
  await weekly.removePlan(id, plan.id); assert.equal(await db.schedules.count(), 2); assert.equal(await db.plans.count(), 2)
  await weekly.addPlan(id, plan.id); assert.equal(await db.schedules.count(), 2)
})
test('weekly outcomes are explicit, idempotent, stale-protected and do not fabricate sessions', async (t) => {
  const { db, id, plan, weekly, calendar, sessions } = await setup(t)
  let [run] = await weekly.activate(id, plan.id)
  const first = occurrences(run, run.startWeek, addDays(run.startWeek, 6))[0]
  assert.equal(dayStatus({ ...first, unscheduled: true }, new Date('2099-01-01')), 'Pending')
  const skipped = await weekly.outcome(id, first.ref, run.revision, 'skipped')
  assert.deepEqual(await weekly.outcome(id, first.ref, run.revision, 'skipped'), skipped)
  await assert.rejects(weekly.outcome(id, first.ref, run.revision, 'completed'), /changed/)
  await assert.rejects(sessions.openOccurrence(id, run.id, first.ref.dayId, first.ref.scheduledDate), /explicit outcome/)
  run = await weekly.outcome(id, first.ref, skipped.revision, 'completed')
  assert.equal((await calendar.events(id, run.startWeek, addDays(run.startWeek, 6)))[0].outcome?.status, 'completed')
  const sunday = addDays(run.startWeek, 6)
  const dayView = await calendar.events(id, sunday, sunday)
  assert.equal(dayView.length, 1)
  assert.equal(dayView[0].ref.key, first.ref.key)
  assert.equal(dayView[0].outcome?.status, 'completed')
  assert.equal(dayView[0].unscheduled, true)
  assert.equal(await db.sessions.count(), 0); assert.equal(await db.drafts.count(), 0)
  const next = (await calendar.events(id, addDays(run.startWeek, 7), addDays(run.startWeek, 13)))[0]
  assert.equal(dayStatus(next), 'Pending'); assert.notEqual(first.ref.key, next.ref.key)
  run = await weekly.outcome(id, first.ref, run.revision, 'pending')
  const draft = (await sessions.openOccurrence(id, run.id, first.ref.dayId, first.ref.scheduledDate)).draft!
  assert.equal((await sessions.openOccurrence(id, run.id, first.ref.dayId, first.ref.scheduledDate)).draft!.id, draft.id)
  await assert.rejects(weekly.outcome(id, first.ref, run.revision, 'skipped'), /draft/)
  await assert.rejects(sessions.complete(id, draft.id, draft.revision, draft.input, false), /at least one/)
  const input = structuredClone(draft.input); Object.assign(input.exercises[0].sets[0], { load: '0', reps: '5' })
  await sessions.complete(id, draft.id, draft.revision, input, false)
  assert.equal((await calendar.events(id, sunday, sunday))[0].session?.id, draft.id)
  await assert.rejects(weekly.outcome(id, first.ref, run.revision, 'completed'), /saved session/)
  validateBackupData(canonicalSnapshot(await captureProfile(id, db)))
})
test('forward gap and reversal preserve program identity, finite endings and independent schedules', async (t) => {
  const { db, id, plan, weekly, calendar } = await setup(t)
  const run = await calendar.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: '2026-12-21', timeZone: 'America/New_York', mapping: [{ dayId: plan.days[0].id, weekday: 0 }] })
  const otherPlan = await planService(db).save(id, { ...planToInput(plan), name: 'Independent plan' })
  const independent = await calendar.create(id, { planId: otherPlan.id, planRevision: plan.revision, startWeek: '2026-12-21', timeZone: 'Asia/Tokyo', mapping: [{ dayId: plan.days[0].id, weekday: 1 }] })
  const preview = await weekly.previewMove(id, run.id, run.revision, '2026-12-28', 1)
  assert.equal(preview.next.endDate, '2027-01-24')
  const moved = await weekly.move(id, preview)
  assert.equal(occurrences(moved, '2026-12-28', '2027-01-03').length, 0)
  assert.equal(programWeek(moved, '2027-01-04'), 2)
  assert.equal(occurrences(moved, '2027-01-25', '2027-01-31').length, 0)
  assert.deepEqual(await db.schedules.get([id, independent.id]), independent)
  const reversed = await weekly.move(id, await weekly.previewMove(id, moved.id, moved.revision, '2027-01-04', -1))
  assert.deepEqual(reversed.excludedWeeks, []); assert.equal(reversed.endDate, run.endDate)
  await assert.rejects(weekly.move(id, preview), /changed/)
  validateBackupData(canonicalSnapshot(await captureProfile(id, db)))
})
test('moves recheck newly started drafts and block outcome/session weeks; explicit discard is stale safe', async (t) => {
  const { id, plan, weekly, sessions } = await setup(t)
  let [run] = await weekly.activate(id, plan.id)
  const week = addDays(run.startWeek, 7), event = occurrences(run, week, addDays(week, 6))[0], preview = await weekly.previewMove(id, run.id, run.revision, week, 1)
  const draft = (await sessions.openOccurrence(id, run.id, event.ref.dayId, event.ref.scheduledDate)).draft!
  await assert.rejects(weekly.move(id, preview), /drafts/)
  const changed = await sessions.update(id, draft.id, draft.revision, { ...draft.input, notes: 'Keep this' })
  await assert.rejects(weekly.discardDraft(id, draft.id, draft.revision), /changed/)
  await weekly.discardDraft(id, draft.id, changed.revision)
  await assert.rejects(sessions.update(id, draft.id, changed.revision, draft.input), /unavailable/)
  run = await weekly.outcome(id, event.ref, run.revision, 'skipped')
  await assert.rejects(weekly.previewMove(id, run.id, run.revision, week, 1), /markers/)
})
test('week labels and civil program dates cross DST/year without changing due zone', async (t) => {
  assert.equal(weekLabel('2026-10-05'), '05 Oct - 11 Oct, 2026')
  assert.equal(weekLabel('2026-12-28'), '28 Dec, 2026 - 03 Jan, 2027')
  const { id, plan, weekly, calendar } = await setup(t)
  const run = await calendar.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: '2026-10-26', timeZone: 'America/New_York', mapping: [{ dayId: plan.days[0].id, weekday: 6 }] })
  const event = occurrences(run, '2026-10-26', '2026-11-01')[0]
  assert.equal(dayStatus(event, new Date('2026-11-02T02:00:00Z')), 'Due Today')
  assert.equal(dayStatus(event, new Date('2026-11-02T06:00:00Z')), 'Past Due')
  const moved = await weekly.move(id, await weekly.previewMove(id, run.id, run.revision, run.startWeek, 1))
  assert.equal(occurrences(moved, '2026-11-02', '2026-11-08')[0].ref.scheduledDate, '2026-11-08')
  assert.equal(programWeek(moved, '2026-11-02'), 1)
})
test('weekly gaps, outcomes, saved results, notes and statistics survive ZIP and every restore choice', async (t) => {
  const { db, id, plan, weekly, calendar } = await setup(t)
  let [run] = await weekly.activate(id, plan.id)
  const event = occurrences(run, run.startWeek, addDays(run.startWeek, 6))[0]
  run = await weekly.outcome(id, event.ref, run.revision, 'completed')
  const secondWeek = addDays(run.startWeek, 7), second = occurrences(run, secondWeek, addDays(secondWeek, 6))[0]
  run = await weekly.outcome(id, second.ref, run.revision, 'skipped')
  run = await weekly.move(id, await weekly.previewMove(id, run.id, run.revision, addDays(run.startWeek, 14), 1))
  const stats = (await progressService(db).read(id)).plans[0]
  assert.equal(stats.daysCompleted, 1); assert.equal(stats.daysSkipped, 1); assert.equal(stats.exercisesCompleted, 0)
  assert.equal(dayStatus((await calendar.events(id, secondWeek, addDays(secondWeek, 6)))[0]), 'Skipped')
  const snapshot = await captureProfile(id, db), backup = await readBackup((await generateBackup(snapshot, 'weekly-test')).bytes)
  assert.equal(backup.data.backupSchemaVersion, 18); assert.deepEqual(backup.data.schedules, snapshot.schedules)
  for (const choice of ['new', 'replace', 'device', 'import'] as const) {
    const restored = await buildRestorePlan(backup, choice === 'new' ? undefined : snapshot, choice, crypto.randomUUID(), snapshot.profile.name, new Date().toISOString())
    assert.deepEqual(restored.result.schedules.map(({ profileId: _id, ...row }) => row), snapshot.schedules.map(({ profileId: _id, ...row }) => row))
    assert.equal(restored.result.plans[0].notes, plan.notes); validateBackupData(canonicalSnapshot(restored.result))
  }
  const invalid = structuredClone(backup.data); invalid.schedules[0].outcomes![0].ref.dayId = crypto.randomUUID()
  assert.throws(() => validateBackupData(invalid), /outcome/)
})
test('timer completion has one atomic claimant across connections and reset renews eligibility', async (t) => {
  const { db, id, plan, sessions } = await setup(t)
  const draft = await sessions.start(id, plan.id, plan.days[0].id)
  const timer = { id: 'active' as const, profileId: id, draftId: draft.id, token: crypto.randomUUID(), label: 'Test', durationSeconds: 1, endAt: new Date(Date.now() - 1000).toISOString() }
  await db.restTimers.put(timer)
  const other = new BorosDatabase(db.name); t.after(async () => { other.close() })
  const claims = await Promise.all([sessions.claimTimer(id, draft.id, timer.token), sessionService(other).claimTimer(id, draft.id, timer.token)])
  assert.equal(claims.filter(Boolean).length, 1)
  await sessions.changeTimer(id, draft.id, timer.token, 'reset'); const reset = (await db.restTimers.get('active'))!
  assert.notEqual(reset.token, timer.token); assert.equal(reset.alertedAt, undefined)
  assert.equal(await sessions.claimTimer(id, draft.id, reset.token), false)
  assert.equal(await sessions.claimTimer(id, draft.id, timer.token), false)
})
test('competing outcomes cannot replace one another; failed moves roll back and legacy runs stay unbounded', async (t) => {
  const { db, id, plan, weekly } = await setup(t)
  delete plan.durationWeeks; await db.plans.put(plan)
  let [run] = await weekly.activate(id, plan.id)
  assert.equal(run.endDate, undefined)
  const event = occurrences(run, run.startWeek, addDays(run.startWeek, 6))[0]
  const other = new BorosDatabase(db.name); t.after(async () => { other.close() })
  const results = await Promise.allSettled([weekly.outcome(id, event.ref, run.revision, 'skipped'), weeklyService(other).outcome(id, event.ref, run.revision, 'completed')])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  run = (await db.schedules.get([id, run.id]))!
  const nextWeek = addDays(run.startWeek, 7), proposed = await weekly.previewMove(id, run.id, run.revision, nextWeek, 1), before = structuredClone(run)
  const put = db.schedules.put.bind(db.schedules)
  db.schedules.put = async () => { throw new Error('Simulated program storage failure') }
  await assert.rejects(weekly.move(id, proposed), /storage failure/)
  db.schedules.put = put
  assert.deepEqual(await db.schedules.get([id, run.id]), before)
  run = await weekly.move(id, proposed); assert.equal(run.endDate, undefined)
  assert.equal(occurrences(run, '2099-01-05', '2099-01-11').length, 1)
})

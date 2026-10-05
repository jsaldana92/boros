import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { runActionService } from '../../src/db/run-actions.ts'
import { copyExercise, newDay, planToInput } from '../../src/schemas/plan.ts'
import { occurrences, appendRevision, type Schedule } from '../../src/schemas/schedule.ts'
import { addDays, localToday, nextMonday } from '../../src/lib/calendar-dates.ts'
import { calendarAssignments, displayRunDate, prescribedDays, runLifecycle, runProgress } from '../../src/lib/run-progress.ts'
import { deriveProgress } from '../../src/lib/progress-analytics.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'

async function setup(t: { after: (f: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-calendar-redesign-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId, plans = planService(db), calendar = scheduleService(db), weekly = weeklyService(db), actions = runActionService(db), sessions = sessionService(db)
  const plan = await plans.save(id, { name: 'Twenty days', durationWeeks: 5, days: Array.from({ length: 4 }, (_, i) => ({ ...newDay(i + 1), exercises: [copyExercise({ name: 'Press', tagNames: [], sets: [{ reps: { min: 5, max: 5 } }, { reps: { min: 5, max: 5 } }] })] })) })
  const input = { planId: plan.id, planRevision: plan.revision, startWeek: nextMonday(localToday('UTC')), timeZone: 'UTC', mapping: plan.days.map((d, weekday) => ({ dayId: d.id, weekday })) }
  return { db, profiles, id, plans, plan, calendar, weekly, actions, sessions, input }
}

test('same-template assignment is transaction safe across connections; retry, rename, new ID and profile isolation', async (t) => {
  const { db, id, plans, plan, profiles, calendar, input } = await setup(t)
  const otherConnection = new BorosDatabase(db.name); t.after(async () => otherConnection.close())
  const outcomes = await Promise.allSettled([calendar.create(id, input), scheduleService(otherConnection).create(id, input)])
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1)
  assert.match(String(outcomes.find((r) => r.status === 'rejected')!.reason), /already has an active instance/)
  const saved = (await db.schedules.toArray())[0]
  assert.deepEqual(await calendar.create(id, input, saved.id), saved)
  const renamed = await plans.save(id, { ...planToInput(plan), name: 'Renamed' }, plan)
  await assert.rejects(calendar.create(id, { ...input, planRevision: renamed.revision }), /already has an active instance/)
  const different = await plans.save(id, { ...planToInput(renamed), name: 'Different identity' })
  await calendar.create(id, { ...input, planId: different.id, planRevision: different.revision, mapping: different.days.map((d, weekday) => ({ dayId: d.id, weekday })) })
  assert.equal(await db.schedules.count(), 2)
  const other = await profiles.create('Other')
  await assert.rejects(calendar.create(other.id, input), /active plan/)
  assert.deepEqual((await calendar.library(other.id)).schedules, [])
})

test('left/ended runs keep history and permit new runs; stop in the future still reserves assignment', async (t) => {
  const { db, id, calendar, input, actions } = await setup(t)
  const old = await calendar.create(id, { ...input, startWeek: '2024-01-01' }), current = await calendar.create(id, input)
  const stopped = await calendar.commit(id, await calendar.preview(id, { scheduleId: current.id, revision: current.revision, kind: 'stop', effectiveFrom: addDays(input.startWeek, 7), mapping: [] }), true)
  await assert.rejects(calendar.create(id, input), /already has an active instance/)
  await actions.leave(await actions.preview(id, stopped.id, stopped.revision))
  const again = await calendar.create(id, input)
  assert.notEqual(again.id, current.id); assert.deepEqual(await calendar.get(id, old.id), old)
  assert.equal(await db.schedules.count(), 3)
  assert.equal(runLifecycle(await calendar.get(id, current.id), []).end, localToday('UTC'))
})

test('20 days / eight completed / two skipped: partial, pending, drafts, reset and profile/run isolation', async (t) => {
  const { db, id, plan, calendar, input, sessions, weekly, actions } = await setup(t)
  let run = await calendar.create(id, input)
  const events = occurrences(run, run.startWeek, run.endDate!)
  for (const event of events.slice(0, 6)) {
    const draft = (await sessions.openOccurrence(id, run.id, event.ref.dayId, event.ref.scheduledDate)).draft!, actual = structuredClone(draft.input)
    actual.exercises[0].sets.forEach((set) => Object.assign(set, { load: '0', reps: '5' }))
    await sessions.complete(id, draft.id, draft.revision, actual, false)
  }
  for (const event of events.slice(6, 8)) run = await weekly.outcome(id, event.ref, run.revision, 'completed')
  for (const event of events.slice(8, 10)) run = await weekly.outcome(id, event.ref, run.revision, 'skipped')
  const draft = (await sessions.openOccurrence(id, run.id, events[10].ref.dayId, events[10].ref.scheduledDate)).draft!, partial = structuredClone(draft.input)
  Object.assign(partial.exercises[0].sets[0], { load: '1', reps: '5' }); await sessions.complete(id, draft.id, draft.revision, partial, true)
  await sessions.openOccurrence(id, run.id, events[11].ref.dayId, events[11].ref.scheduledDate)
  const logs = await db.sessions.toArray(), progress = runProgress(run, logs)
  assert.deepEqual(progress, { total: 20, completed: 8, skipped: 2, resolved: 10 })
  assert.deepEqual([progress.resolved, progress.completed, progress.skipped].map((n) => n / progress.total! * 100), [50, 40, 10])
  assert.equal(deriveProgress(id, [plan], [], logs, [run]).plans[0].daysCompleted, 8)
  assert.deepEqual(runProgress(run, [...logs, ...logs, { ...logs[0], profileId: 'foreign', occurrence: { ...events[12].ref } }]), progress)
  assert.equal(runProgress({ ...run, id: 'other-run', outcomes: [] }, logs).completed, 0)
  await actions.reset(await actions.preview(id, run.id, run.revision, events[6].ref)); run = await calendar.get(id, run.id)
  assert.equal(runProgress(run, logs).completed, 7)
  await actions.reset(await actions.preview(id, run.id, run.revision, events[8].ref)); run = await calendar.get(id, run.id)
  assert.equal(runProgress(run, logs).skipped, 1)
  await actions.leave(await actions.preview(id, run.id, run.revision)); run = await calendar.get(id, run.id)
  assert.equal(runProgress(run, await db.sessions.toArray()).total, 20)
  assert.equal(runProgress(run, await db.sessions.toArray()).completed, 7)
})

test('gaps, reversal, committed duration/revisions and template edits preserve the prescribed denominator', async (t) => {
  const { id, plans, plan, calendar, input, weekly } = await setup(t)
  let run = await calendar.create(id, input)
  run = await weekly.move(id, await weekly.previewMove(id, run.id, run.revision, addDays(run.startWeek, 7), 1)); assert.equal(prescribedDays(run), 20)
  run = await weekly.move(id, await weekly.previewMove(id, run.id, run.revision, addDays(run.startWeek, 14), -1)); assert.equal(prescribedDays(run), 20)
  await plans.save(id, { ...planToInput(plan), durationWeeks: 6, days: plan.days.slice(0, 2) }, plan)
  run = await calendar.get(id, run.id); assert.equal(prescribedDays(run), 20) // repair retains prior prescribed workload
  run = await calendar.commit(id, await calendar.preview(id, { scheduleId: run.id, revision: run.revision, kind: 'duration', effectiveFrom: addDays(run.startWeek, 7), mapping: [] }), true)
  assert.equal(prescribedDays(run), 24)
  run = await calendar.commit(id, await calendar.preview(id, { scheduleId: run.id, revision: run.revision, kind: 'remap', effectiveFrom: addDays(run.startWeek, 14), mapping: plan.days.slice(0, 2).map((d, weekday) => ({ dayId: d.id, weekday })) }), true)
  assert.equal(prescribedDays(run), 16) // two old weeks of 4, four revised weeks of 2
})

test('legacy duplicate assignments survive backup/read/restore and block new writes until guarded resolution', async (t) => {
  const { db, id, calendar, input, actions } = await setup(t)
  const first = await calendar.create(id, input), legacy = { ...structuredClone(first), id: crypto.randomUUID() }
  await db.schedules.add(legacy) // Pre-rule/imported data, not a new service assignment.
  assert.equal(calendarAssignments((await calendar.library(id)).schedules, []).length, 2)
  await assert.rejects(calendar.create(id, input), /already has an active instance/)
  const snapshot = await captureProfile(id, db), backup = await readBackup((await generateBackup(snapshot, 'calendar-redesign')).bytes)
  const restored = await buildRestorePlan(backup, undefined, 'new', crypto.randomUUID(), 'Restored', new Date().toISOString())
  assert.equal(restored.result.schedules.length, 2)
  assert.equal(calendarAssignments(restored.result.schedules, []).length, 2)
  await actions.leave(await actions.preview(id, legacy.id, legacy.revision))
  assert.deepEqual(await calendar.get(id, first.id), first)
  await assert.rejects(calendar.create(id, input), /already has an active instance/)
  await actions.leave(await actions.preview(id, first.id, first.revision)); await calendar.create(id, input)
  assert.equal(await db.schedules.count(), 3)
})

test('unbounded, missing dates, civil year/zone boundaries and independent historical runs', async (t) => {
  const { id, calendar, input } = await setup(t), run = await calendar.create(id, input)
  const legacy = { ...run, durationWeeks: undefined, endDate: undefined }
  assert.equal(runProgress(legacy, []).total, undefined)
  assert.equal(runLifecycle(legacy, [], new Date('2040-01-01T00:00:00Z')).previous, false)
  assert.equal(displayRunDate(undefined), 'Date unavailable'); assert.equal(displayRunDate('2025-01-01'), '01/01/2025')
  assert.equal(prescribedDays({ ...run, startWeek: undefined } as unknown as Schedule), undefined)
  assert.equal(runLifecycle({ ...run, timeZone: 'Pacific/Honolulu', closedAt: '2025-01-01T00:30:00Z' }, []).end, '2024-12-31')
  assert.equal(runLifecycle({ ...run, timeZone: 'Pacific/Kiritimati', closedAt: '2025-01-01T00:30:00Z' }, []).end, '2025-01-01')
  assert.equal(runLifecycle({ ...run, closedAt: 'unknown' }, []).end, undefined)
  assert.equal(runLifecycle({ ...run, startWeek: '2024-12-30', endDate: '2025-01-05' }, [], new Date('2025-01-06T12:00:00Z')).previous, true)
  // Full finite coverage is resolved even before its nominal last Sunday.
  const all = occurrences(run, run.startWeek, run.endDate!).map((e) => ({ id: crypto.randomUUID(), ...e, status: 'completed' as const, revision: 1, recordedAt: run.createdAt, updatedAt: run.createdAt }))
  assert.equal(runLifecycle({ ...run, outcomes: all }, []).previous, true)
  const revision = { ...run.revisions[0], id: crypto.randomUUID(), effectiveFrom: addDays(run.startWeek, 14) }
  assert.equal(prescribedDays({ ...run, revisions: appendRevision(run, revision) }), 20)
})

test('future shortening cannot end a currently active segment early; revival and moves cannot bypass assignment guard', async (t) => {
  const { id, plan, plans, calendar, input, weekly } = await setup(t)
  const run = await calendar.create(id, input), cutoff = addDays(run.startWeek, 21), last = addDays(cutoff, -1)
  const revised = { ...run, durationChanges: [{ id: crypto.randomUUID(), effectiveFrom: cutoff, durationWeeks: 1, endDate: addDays(run.startWeek, 6) }] }
  assert.equal(prescribedDays(revised), 12)
  assert.equal(runLifecycle(revised, [], new Date(`${addDays(run.startWeek, 8)}T12:00:00Z`)).previous, false)
  assert.equal(runLifecycle(revised, [], new Date(`${cutoff}T12:00:00Z`)).end, last)
  const historical = await calendar.create(id, { ...input, startWeek: '2024-01-01' })
  await plans.save(id, { ...planToInput(plan), durationWeeks: 1000 }, plan)
  const preview = await calendar.preview(id, { scheduleId: historical.id, revision: historical.revision, kind: 'duration', effectiveFrom: input.startWeek, mapping: [] })
  await assert.rejects(calendar.commit(id, preview, true), /already has an active instance/)
  assert.deepEqual(await calendar.get(id, historical.id), historical)
  // Moving this active assignment retains its ID and cannot produce another run.
  const moved = await weekly.move(id, await weekly.previewMove(id, run.id, run.revision, addDays(run.startWeek, 7), 1))
  assert.equal(moved.id, run.id); assert.equal((await calendar.library(id)).schedules.length, 2)
})

test('retained original occurrences after remap/shortening stay in the workload and cannot falsely complete a run', async (t) => {
  const { db, id, calendar, input } = await setup(t), run = await calendar.create(id, input)
  const original = occurrences(run, run.startWeek, run.endDate!)
  const outcomes = original.map((event) => ({ ...event, id: crypto.randomUUID(), status: 'completed' as const, revision: 1, recordedAt: run.createdAt, updatedAt: run.createdAt }))
  const remapped = { ...run, outcomes, revisions: appendRevision(run, { ...run.revisions[0], id: crypto.randomUUID(), effectiveFrom: run.startWeek, mapping: run.revisions[0].mapping.map((m) => ({ ...m, weekday: m.weekday + 1 })) }) }
  assert.deepEqual(runProgress(remapped, []), { total: 40, completed: 20, skipped: 0, resolved: 20 })
  assert.equal(runLifecycle(remapped, []).previous, false)
  await db.schedules.put(remapped)
  await assert.rejects(calendar.create(id, input), /already has an active instance/)
  assert.equal(runProgress({ ...remapped, closedAt: new Date().toISOString(), stoppedFrom: localToday('UTC') }, []).total, 40)
  // Weekly identity still resolves once when only its date changes within the week.
  const weekly = { ...run, identity: 'program-week' as const }
  const events = occurrences(weekly, weekly.startWeek, weekly.endDate!)
  const marked = events.map((event) => ({ ...event, id: crypto.randomUUID(), status: 'completed' as const, revision: 1, recordedAt: run.createdAt, updatedAt: run.createdAt }))
  assert.equal(runProgress({ ...weekly, outcomes: marked, revisions: remapped.revisions }, []).total, 20)
})

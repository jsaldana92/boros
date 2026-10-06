import 'fake-indexeddb/auto'
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { runActionService } from '../../src/db/run-actions.ts'
import { progressService } from '../../src/db/progress.ts'
import { copyExercise, newDay } from '../../src/schemas/plan.ts'
import { occurrences } from '../../src/schemas/schedule.ts'
import { addDays } from '../../src/lib/calendar-dates.ts'
import { deriveProgress, exerciseCounts, selectPerformances, performanceStats } from '../../src/lib/progress-analytics.ts'
import { filterMeasurements, measurementDateLabel } from '../../src/lib/measurement-dates.ts'
import { chartScale } from '../../src/lib/chart-scale.ts'

async function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-05T12:00:00Z') })
  const db = new BorosDatabase(`boros-test-progress-redesign-${crypto.randomUUID()}`); t.after(() => db.delete())
  const id = (await profileService(db).initialize()).activeProfileId
  const prescription = { name: 'Press', tagNames: ['Strength'], sets: [{ reps: { min: 5, max: 5 } }, { reps: { min: 5, max: 5 } }] }
  const exercise = await exerciseService(db).save(id, prescription), groupId = crypto.randomUUID()
  const day = { ...newDay(1), groups: [{ id: groupId, number: 1 }], exercises: [0, 1, 2].map((index) => ({ ...copyExercise(prescription, { kind: 'exercise' as const, id: exercise.id }), ...(index ? { groupId } : {}) })) }
  const plan = await planService(db).save(id, { name: 'Counts', durationWeeks: 2, days: [day] }), weekly = weeklyService(db), sessions = sessionService(db), actions = runActionService(db)
  const [run] = await weekly.activate(id, plan.id), events = occurrences(run, run.startWeek, addDays(run.startWeek, 13))
  const progress = progressService(db)
  return { db, id, exercise, plan, weekly, sessions, actions, run, events, progress }
}
test('instance counts keep repeated and superset occurrences distinct, partial sets valid, manual days not invented exercises, explicit skips once', async (t) => {
  const { db, id, exercise, weekly, sessions, run, events, progress } = await setup(t), draft = (await sessions.openOccurrence(id, run.id, events[0].day.id, events[0].ref.scheduledDate)).draft!, input = structuredClone(draft.input)
  input.exercises[0].sets.forEach((s) => Object.assign(s, { load: '0', reps: '5' }))
  Object.assign(input.exercises[1].sets[0], { load: '100', unit: 'lb', reps: '12' })
  input.exercises[2].sets.forEach((s) => { s.skipped = true })
  await sessions.complete(id, draft.id, draft.revision, input, true)
  let data = await progress.read(id), summary = data.plans[0], key = `library:${exercise.id}`
  assert.equal(summary.items.length, 3); assert.equal(summary.exercisesCompleted, 1); assert.equal(summary.daysCompleted, 1)
  assert.deepEqual(exerciseCounts(data, key), { completed: 1, skipped: 1 })
  assert.equal(performanceStats(selectPerformances(data, key)).maximum!.result.reps, 12)
  assert.equal(performanceStats(selectPerformances(data, key)).minimum!.result.weightKg, 0)
  let changed = await weekly.outcome(id, events[1].ref, run.revision, 'skipped')
  data = await progress.read(id); assert.deepEqual(exerciseCounts(data, key), { completed: 1, skipped: 4 }); assert.equal(data.plans[0].daysSkipped, 1)
  const legacyDuplicate = { ...changed, outcomes: [...changed.outcomes!, { ...changed.outcomes![0], id: crypto.randomUUID(), ref: events[0].ref }] }
  const deduplicated = deriveProgress(id, [], await db.exercises.toArray(), await db.sessions.toArray(), [legacyDuplicate], await db.drafts.toArray())
  assert.deepEqual(exerciseCounts(deduplicated, key), { completed: 1, skipped: 4 })
  changed = await weekly.outcome(id, events[1].ref, changed.revision, 'completed')
  data = await progress.read(id); assert.equal(data.plans[0].exercisesCompleted, 1); assert.equal(data.plans[0].daysCompleted, 2); assert.equal(data.plans[0].timesCompleted, 1)
  assert.deepEqual(exerciseCounts(data, key), { completed: 1, skipped: 1 })
  // Legacy blank-to-skip serialization without retained explicit input remains unknown.
  await db.drafts.delete([id, draft.id]); data = await progress.read(id); assert.deepEqual(exerciseCounts(data, key), { completed: 1, skipped: 0 })
})
test('elapsed/early-ended instances are not completed; resolved programs are; hiding preserves and deleting/resetting removes only owned analytics', async (t) => {
  const { db, id, plan, run, events, weekly, actions, progress } = await setup(t)
  const expired = { ...run, startWeek: '2025-01-06', endDate: '2025-01-19' }
  assert.equal(deriveProgress(id, [], [], [], [expired]).plans[0].timesCompleted, 0)
  let changed = await weekly.outcome(id, events[0].ref, run.revision, 'completed')
  await actions.leave(await actions.preview(id, run.id, changed.revision))
  assert.equal((await progress.read(id)).plans.find((p) => p.id === run.id)!.timesCompleted, 0)
  const [next] = await weekly.activate(id, plan.id), nextEvents = occurrences(next, next.startWeek, addDays(next.startWeek, 13))
  changed = await weekly.outcome(id, nextEvents[0].ref, next.revision, 'completed'); changed = await weekly.outcome(id, nextEvents[1].ref, changed.revision, 'skipped')
  const before = await progress.read(id), summary = before.plans.find((p) => p.id === next.id)!
  assert.equal(summary.timesCompleted, 1); assert.equal(summary.daysCompleted, 1); assert.equal(summary.daysSkipped, 1); assert.equal(summary.exercisesCompleted, 0)
  await actions.setHidden(id, next.id, changed.revision, true)
  assert.deepEqual((await progress.read(id)).outcomes, before.outcomes)
  const hidden = (await db.schedules.get([id, next.id]))!
  await actions.deletePrevious(await actions.preview(id, hidden.id, hidden.revision))
  const after = await progress.read(id); assert.equal(after.plans.length, 1); assert.equal(after.plans[0].id, run.id)
  assert.equal(after.outcomes.length, 0)
})
test('reset removes actual extrema/counts without reading photo blobs or losing library identity', async (t) => {
  const { db, id, exercise, run, events, sessions, actions, progress } = await setup(t)
  await db.photos.add({ id: crypto.randomUUID(), profileId: id, blob: new Blob(['photo'], { type: 'image/png' }), width: 1, height: 1, createdAt: new Date().toISOString() })
  db.photos.hook('reading', () => { throw new Error('Analytics must not read photos') })
  const draft = (await sessions.openOccurrence(id, run.id, events[0].day.id, events[0].ref.scheduledDate)).draft!, input = structuredClone(draft.input)
  input.exercises[0].sets.forEach((s) => Object.assign(s, { load: '25', reps: '5' }))
  await sessions.complete(id, draft.id, draft.revision, input, true)
  const key = `library:${exercise.id}`
  assert.equal(performanceStats(selectPerformances(await progress.read(id), key)).maximum!.result.weightKg, 25)
  await actions.reset(await actions.preview(id, run.id, run.revision, events[0].ref))
  const data = await progress.read(id)
  assert.equal(performanceStats(selectPerformances(data, key)).maximum, undefined)
  assert.equal(data.plans[0].exercisesCompleted, 0); assert.ok(data.items.some((i) => i.key === key)); assert.equal(await db.photos.count(), 1)
})
test('measurement filters use inclusive displayed dates, preserve original rows, support one-sided/empty ranges; chart scale handles equal values', () => {
  const rows = [{ id: 'a', profileId: 'p', weightKg: 70, measuredAt: '2026-10-06T02:00:00Z', measuredLocal: '2026-10-05T22:00:00.000', timeZone: 'America/New_York', loggedAt: '' }, { id: 'b', profileId: 'p', weightKg: 70, measuredAt: '2026-10-06T04:00:00Z', loggedAt: '' }], before = structuredClone(rows)
  assert.deepEqual(filterMeasurements(rows, { start: '', end: '2026-10-05' }).map((e) => e.id), ['a'])
  assert.deepEqual(filterMeasurements(rows, { start: '2026-10-06', end: '' }).map((e) => e.id), ['b'])
  assert.equal(filterMeasurements(rows, { start: '2026-10-05', end: '2026-10-06' }).length, 2)
  assert.equal(filterMeasurements(rows, { start: '2026-10-07', end: '' }).length, 0)
  assert.throws(() => filterMeasurements(rows, { start: '2026-10-07', end: '2026-10-01' }), /End date/)
  assert.equal(measurementDateLabel(rows[0]), '2026-10-05 · 22:00'); assert.deepEqual(rows, before)
  const scale = chartScale([70, 70]); assert.ok(Number.isFinite(scale.y(70))); assert.equal(new Set(scale.ticks.map((t) => t.value)).size, 5)
})

import 'fake-indexeddb/auto'
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { calendarRunService } from '../../src/db/calendar-runs.ts'
import { calendarActivityService } from '../../src/db/calendar-activity.ts'
import { newDay, copyExercise } from '../../src/schemas/plan.ts'
import { occurrences, programEnd } from '../../src/schemas/schedule.ts'
import { currentProgramLabel, programSummary, trainingWeekRows } from '../../src/lib/program-display.ts'
import { calendarColors } from '../../src/lib/calendar-colors.ts'
import { dateRange, viewRange, weekday } from '../../src/lib/calendar-dates.ts'

async function setup(t: TestContext, zone = 'UTC') {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-08T12:00:00Z') })
  const db = new BorosDatabase(`boros-test-display-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId
  await db.profiles.update(id, { timeZone: zone })
  const plans = planService(db), weekly = weeklyService(db), sessions = sessionService(db), calendar = scheduleService(db), activity = calendarActivityService(db)
  const plan = await plans.save(id, { name: 'Display', durationWeeks: 3, days: Array.from({ length: 4 }, (_, i) => ({ ...newDay(i + 1), exercises: [copyExercise({ name: 'Press', tagNames: [], sets: [{ reps: { min: 5, max: 5 } }, { reps: { min: 5, max: 5 } }] })] })) })
  const [run] = await weekly.activate(id, plan.id)
  const events = occurrences(run, run.startWeek, '2026-10-11')
  const save = async (day = 0, partial = false) => {
    const ref = events[day].ref, draft = (await sessions.openOccurrence(id, run.id, ref.dayId, ref.scheduledDate)).draft!, input = structuredClone(draft.input)
    input.exercises[0].sets.forEach((s, i) => { if (!partial || i === 0) Object.assign(s, { load: '0', reps: '5' }) })
    return sessions.complete(id, draft.id, draft.revision, input, partial)
  }
  return { db, id, profiles, plans, plan, run, events, weekly, sessions, calendar, activity, save }
}

test('unscheduled Calendar contains actual completions only, keeps partials and never duplicates saved outcomes', async (t) => {
  const { db, id, run, events, weekly, sessions, activity, save, profiles } = await setup(t)
  assert.deepEqual(await activity.events(id, '2026-10-01', '2026-11-30'), [])
  let next = await weekly.outcome(id, events[2].ref, run.revision, 'skipped')
  await sessions.openOccurrence(id, run.id, events[3].ref.dayId, events[3].ref.scheduledDate)
  assert.deepEqual(await activity.events(id, '2026-10-01', '2026-11-30'), [])
  const full = await save(), partial = await save(1, true)
  const entries = await activity.events(id, '2026-10-08', '2026-10-08')
  assert.equal(entries.length, 2); assert.deepEqual(entries.map((e) => e.session!.id).sort(), [full.id, partial.id].sort())
  assert.equal(entries.filter((e) => e.session?.partial).length, 1)
  assert.deepEqual(await activity.events(id, '2026-10-05', '2026-10-06'), [])
  // Defensive de-duplication of an older completion marker paired with a log.
  next.outcomes!.push({ ...next.outcomes![0], id: crypto.randomUUID(), ref: events[0].ref, day: events[0].day, status: 'completed' })
  await db.schedules.put(next); assert.equal((await activity.events(id, '2026-10-08', '2026-10-08')).length, 2)
  const foreign = await profiles.create('Other'); assert.deepEqual(await activity.events(foreign.id, '2026-10-01', '2026-11-30'), [])
})

test('manual completion uses last action time and frozen zone across midnight and DST, not program Monday', async (t) => {
  const { id, run, events, weekly, activity } = await setup(t, 'America/New_York')
  let next = await weekly.outcome(id, events[0].ref, run.revision, 'skipped')
  next = await weekly.outcome(id, events[0].ref, next.revision, 'pending')
  t.mock.timers.setTime(Date.parse('2026-11-01T03:30:00Z'))
  await weekly.outcome(id, events[0].ref, next.revision, 'completed')
  const rows = await activity.events(id, '2026-10-31', '2026-10-31')
  assert.equal(rows.length, 1); assert.equal(rows[0].event!.ref.scheduledDate, '2026-10-05')
  assert.equal(rows[0].event!.outcome!.recordedAt, '2026-10-08T12:00:00.000Z')
  assert.equal(rows[0].event!.outcome!.updatedAt, '2026-11-01T03:30:00.000Z')
  assert.deepEqual(await activity.events(id, '2026-11-01', '2026-11-01'), [])
})

test('unscheduled completions retain their actual date after assignment and legacy session-only logs remain visible', async (t) => {
  const { db, id, run, plan, activity, save } = await setup(t), session = await save()
  const service = calendarRunService(db)
  const scheduled = await service.edit(await service.previewEdit(id, run.id, run.revision, plan.days.map((day, i) => ({ dayId: day.id, weekday: i + 2 }))))
  assert.equal(scheduled.kind, undefined)
  assert.equal((await activity.events(id, '2026-10-08', '2026-10-08')).filter((row) => row.session?.id === session.id).length, 1)
  assert.equal((await activity.events(id, '2026-10-05', '2026-10-05')).length, 0)
  const legacy = { ...session, id: crypto.randomUUID(), draftId: crypto.randomUUID(), occurrence: undefined, occurrenceKey: undefined }
  await db.sessions.add(legacy)
  assert.equal((await activity.events(id, '2026-10-08', '2026-10-08')).filter((row) => row.session).length, 2)
})

test('direct editor baseline rejects concurrent draft writes and preserves every input/record', async (t) => {
  const { db, id, run, events, sessions } = await setup(t), editor = calendarRunService(db)
  const baseline = await editor.beginEdit(id, run.id, run.revision)
  const draft = (await sessions.openOccurrence(id, run.id, events[0].day.id, events[0].ref.scheduledDate)).draft!
  const changed = { ...baseline, mapping: baseline.mapping.map((m) => ({ ...m, weekday: m.weekday + 1 })) }, input = structuredClone(changed)
  await assert.rejects(editor.edit(changed), /results changed while editing/)
  assert.deepEqual(changed, input); assert.deepEqual(await db.schedules.get([id, run.id]), run); assert.deepEqual(await sessions.getDraft(id, draft.id), draft)
})

test('editor baseline opens a mapping that needs repair, while direct commit still validates the replacement', async (t) => {
  const { db, id, run } = await setup(t), editor = calendarRunService(db)
  const damaged = { ...run, kind: undefined, revisions: [{ ...run.revisions[0], needsRepair: true, mapping: [] }] }
  await db.schedules.put(damaged)
  const baseline = await editor.beginEdit(id, run.id, run.revision)
  await assert.rejects(editor.edit(baseline)); assert.deepEqual(await db.schedules.get([id, run.id]), damaged)
  const repaired = await editor.edit({ ...baseline, mapping: run.revisions[0].mapping })
  assert.equal(repaired.id, run.id); assert.equal(repaired.revisions.at(-1)!.needsRepair, false)
  assert.equal(occurrences(repaired, run.startWeek, '2026-10-11').length, 4)
})

test('current instance week and summary honor committed duration, time zone, gaps and boundaries', async (t) => {
  const { run } = await setup(t)
  const now = new Date('2026-10-12T00:30:00Z'), zoned = { ...run, timeZone: 'America/New_York' }
  assert.equal(currentProgramLabel(zoned, [], now), 'Week 1'); assert.equal(currentProgramLabel(run, [], now), 'Week 2')
  const delayed = { ...run, excludedWeeks: ['2026-10-12'], endDate: programEnd(run.startWeek, 3, ['2026-10-12']) }
  assert.equal(currentProgramLabel(delayed, [], now), 'Paused')
  assert.equal(currentProgramLabel(delayed, [], new Date('2026-10-19T12:00Z')), 'Week 2')
  assert.equal(currentProgramLabel(delayed, [], new Date('2026-10-26T12:00Z')), 'Week 3')
  assert.equal(currentProgramLabel(delayed, [], new Date('2026-11-02T12:00Z')), 'Ended')
  assert.equal(currentProgramLabel(run, [], new Date('2026-10-04T12:00Z')), 'Upcoming')
  assert.equal(currentProgramLabel({ ...run, closedAt: '2026-10-08T12:00Z' }, [], now), 'Ended')
  assert.deepEqual(programSummary(run, '2026-10-08'), { name: 'Display', days: run.revisions[0].days, durationWeeks: 3 })
  assert.equal(programSummary({ ...run, durationChanges: [{ id: crypto.randomUUID(), effectiveFrom: '2026-10-12' }] }, '2026-10-12').durationWeeks, undefined)
})

test('full Train week keeps collision exceptions, chronological mappings and unscheduled visual-only order', async (t) => {
  const { run, events } = await setup(t), snapshot = structuredClone(run)
  const rows = trainingWeekRows(run, run.startWeek, events)
  assert.equal(rows.length, 7); assert.deepEqual(rows.map((r) => r.events.length), [1, 1, 1, 1, 0, 0, 0]); assert.deepEqual(run, snapshot)
  const scheduled = { ...run, kind: undefined }, collision = events.map((e, i) => ({ ...e, ref: { ...e.ref, scheduledDate: i < 2 ? '2026-10-09' : '2026-10-05', unscheduled: undefined } }))
  const arranged = trainingWeekRows(scheduled, run.startWeek, collision)
  assert.equal(arranged[0].events.length, 2); assert.equal(arranged[4].events.length, 2); assert.equal(arranged.flatMap((r) => r.events).length, 4)
  assert.deepEqual(trainingWeekRows({ ...run, excludedWeeks: [run.startWeek] }, run.startWeek, []), [])
  assert.deepEqual(trainingWeekRows(run, '2026-11-02', []), [])
})

test('month rows are complete Monday–Sunday weeks at year, leap and 4/5/6-row boundaries', () => {
  for (const [date, count] of [['2021-02-12', 4], ['2026-10-08', 5], ['2026-03-12', 6], ['2027-01-01', 5], ['2024-02-29', 5]] as const) {
    const range = viewRange(date, 'month'), dates = dateRange(range.start, range.end)
    assert.equal(dates.length, count * 7)
    dates.forEach((day, index) => assert.equal(weekday(day), index % 7))
    assert.ok(dates.includes(date))
  }
})

test('ten cosmetic plan colors prefer free colors and survive order, additions, removals and damaged storage', () => {
  const map = new Map<string, string>(), storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) } }, profile = crypto.randomUUID()
  const ids = Array.from({ length: 12 }, () => crypto.randomUUID()), first = calendarColors(profile, ids.slice(0, 10), storage)
  assert.equal(new Set(ids.slice(0, 10).map((id) => first[id])).size, 10)
  const all = calendarColors(profile, [...ids].reverse(), storage)
  for (const id of ids.slice(0, 10)) assert.equal(all[id], first[id])
  assert.deepEqual(calendarColors(profile, ids.slice(4), storage), all)
  const broken = { getItem: () => '{bad', setItem: () => { throw new Error('Denied') } }
  assert.deepEqual(calendarColors(profile, ids, broken), all)
  const another = crypto.randomUUID(); assert.equal(Object.keys(calendarColors(another, [ids[0]], storage)).length, 1)
})

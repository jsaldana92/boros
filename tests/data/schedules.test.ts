import { classifyStrengthRecords } from '../../src/db/training-migration.ts'
import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { copyExercise, newDay, planToInput } from '../../src/schemas/plan.ts'
import { occurrences, scheduleInputSchema } from '../../src/schemas/schedule.ts'
import { addDays, localToday, monday, monthStart, nextMonday, viewRange } from '../../src/lib/calendar-dates.ts'

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-calendar-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId, plans = planService(db), sessions = sessionService(db), service = scheduleService(db)
  const plan = await plans.save(id, { name: 'Four days / 8 weeks', durationWeeks: 2, days: Array.from({ length: 4 }, (_, index) => ({ ...newDay(index + 1), exercises: [copyExercise({ name: 'Squat', tagNames: [], sets: [{ reps: { min: 5, max: 8 } }, { reps: { min: 8, max: 8 } }] })] })) })
  // This suite retains historical unbounded schedules; Group 2 tests finite ones.
  delete plan.durationWeeks; await db.plans.put(plan)
  const input = { planId: plan.id, planRevision: plan.revision, startWeek: '2024-12-23', timeZone: 'America/New_York', mapping: plan.days.map((day, index) => ({ dayId: day.id, weekday: index })) }
  const schedule = await service.create(id, input)
  return { db, profiles, id, plans, plan, sessions, service, schedule, input }
}

test('civil arithmetic: Sunday/Monday, leap days, month/year, DST and differing zone Today', () => {
  assert.equal(monday('2025-01-05'), '2024-12-30'); assert.equal(monday('2025-01-06'), '2025-01-06')
  assert.equal(addDays('2024-02-28', 1), '2024-02-29'); assert.equal(addDays('2024-02-29', 1), '2024-03-01')
  assert.equal(addDays('2025-12-31', 1), '2026-01-01'); assert.equal(monthStart('2024-12-31', 1), '2025-01-01')
  for (const date of ['2025-03-09', '2025-11-02']) assert.equal(addDays(monday(date), 6), date)
  assert.deepEqual(viewRange('2024-02-29', 'month'), { start: '2024-01-29', end: '2024-03-03' })
  assert.equal(viewRange('0001-01-01', 'month').start, '0001-01-01')
  assert.equal(viewRange('9999-12-31', 'month').end, '9999-12-31')
  assert.equal(viewRange('9999-12-31', 'week').end, '9999-12-31')
  const instant = new Date('2025-01-06T01:00:00Z')
  assert.equal(localToday('America/New_York', instant), '2025-01-05'); assert.equal(localToday('Asia/Tokyo', instant), '2025-01-06')
  for (const instant of ['2025-03-09T06:59:59Z', '2025-03-09T07:00:00Z', '2025-11-02T05:59:59Z', '2025-11-02T06:00:00Z']) assert.equal(localToday('America/New_York', new Date(instant)), instant.slice(0, 10))
})

test('validation, stable IDs, overlapping schedules, range-only generation and profile isolation', async (t) => {
  const { db, profiles, id, plans, plan, service, schedule, input, sessions } = await setup(t)
  for (const invalid of [{ ...input, startWeek: '2025-01-07' }, { ...input, startWeek: '2025-02-30' }, { ...input, timeZone: 'Invalid/Zone' }]) assert.equal(scheduleInputSchema.safeParse(invalid).success, false)
  await assert.rejects(service.create(id, { ...input, mapping: input.mapping.map((item) => ({ ...item, weekday: 0 })) }), /distinct weekday/)
  await assert.rejects(service.create(id, { ...input, mapping: input.mapping.slice(1) }), /every current/)
  await assert.rejects(service.create(id, input), /already has an active instance/)
  const different = await plans.save(id, { ...planToInput(plan), name: 'Different template', durationWeeks: 104 })
  const another = await service.create(id, { ...input, planId: different.id, planRevision: different.revision }); assert.notEqual(another.id, schedule.id)
  const events = await service.events(id, '2024-12-30', '2025-01-05', input.timeZone)
  assert.equal(events.length, 8); assert.equal(new Set(events.map((event) => event.ref.key)).size, 8)
  assert.deepEqual(events, await service.events(id, '2024-12-30', '2025-01-05', input.timeZone))
  assert.equal(occurrences(schedule, '2040-01-02', '2040-01-08').length, 4); assert.equal(await db.drafts.count(), 0)
  const other = await profiles.create('Other'); assert.deepEqual(await service.events(other.id, '2024-12-30', '2025-01-05', input.timeZone), [])
  await assert.rejects(service.get(other.id, schedule.id), /unavailable/); await assert.rejects(service.create(other.id, input), /active plan/)
  await assert.rejects(sessions.openOccurrence(other.id, schedule.id, plan.days[0].id, '2024-12-30'), /unavailable/)
})

test('partial/late completion affects only one occurrence, keeps missed history, and excludes unscheduled logs', async (t) => {
  const { id, plan, sessions, service, schedule, input } = await setup(t)
  const unscheduled = await sessions.start(id, plan.id, plan.days[0].id), actual = structuredClone(unscheduled.input)
  Object.assign(actual.exercises[0].sets[0], { load: '0', reps: '5' })
  await sessions.complete(id, unscheduled.id, 1, actual, true)
  let events = await service.events(id, '2024-12-30', '2025-01-05', input.timeZone)
  assert.ok(events.every((event) => !event.session)); assert.equal(events.length, 4)
  const draft = (await sessions.openOccurrence(id, schedule.id, plan.days[0].id, '2024-12-30')).draft!
  assert.notEqual(draft.id, unscheduled.id)
  const completed = await sessions.complete(id, draft.id, 1, actual, true)
  assert.equal(completed.occurrence!.scheduledDate, '2024-12-30'); assert.equal(completed.occurrence!.scheduledWeek, '2024-12-30'); assert.ok(completed.completedAt > '2025-01-01')
  events = await service.events(id, '2024-12-30', '2025-01-05', input.timeZone)
  assert.equal(events.filter((event) => event.session).length, 1); assert.ok(events[0].session!.partial)
  assert.ok((await service.events(id, '2025-01-06', '2025-01-12', input.timeZone)).every((event) => !event.session))
  assert.equal((await sessions.openOccurrence(id, schedule.id, plan.days[0].id, '2024-12-30')).session!.id, completed.id)
})

test('competing starts/completions are idempotent; Clear preserves identity and transaction failures leave input recoverable', async (t) => {
  const { db, id, plan, sessions, schedule } = await setup(t), connection = new BorosDatabase(db.name), other = sessionService(connection)
  t.after(async () => connection.close())
  const args = [id, schedule.id, plan.days[0].id, '2024-12-30'] as const
  const opened = await Promise.all([sessions.openOccurrence(...args), other.openOccurrence(...args)])
  const draft = opened[0].draft!; assert.equal(draft.id, opened[1].draft!.id)
  const input = structuredClone(draft.input); Object.assign(input.exercises[0].sets[0], { load: '40', reps: '5' })
  const fresh = await sessions.update(id, draft.id, 1, input)
  const fail = () => { throw new Error('disk failure') }; db.sessions.hook('creating', fail)
  await assert.rejects(sessions.complete(id, draft.id, fresh.revision, input, true), /disk failure/)
  assert.equal(await db.sessions.count(), 0); assert.equal((await sessions.getDraft(id, draft.id)).finalizedAt, undefined)
  db.sessions.hook('creating').unsubscribe(fail)
  const cleared = await sessions.clear(id, draft.id, fresh.revision); assert.deepEqual(cleared.occurrence, draft.occurrence)
  assert.equal(cleared.input.exercises[0].sets[0].load, '')
  const logs = await Promise.all([sessions.complete(id, draft.id, cleared.revision, input, true), other.complete(id, draft.id, cleared.revision, input, true)])
  assert.deepEqual(logs[0], logs[1]); assert.equal(await db.sessions.count(), 1)
})

test('remap retains historical/missed dates and started snapshots; changed preview and missing conflict approval reject atomically', async (t) => {
  const { db, id, plan, sessions, service, schedule, input, plans } = await setup(t)
  const cutoff = nextMonday(localToday(schedule.timeZone)), future = (await sessions.openOccurrence(id, schedule.id, plan.days[0].id, cutoff)).draft!
  const oldEvents = occurrences(schedule, '2024-12-30', '2025-01-05')
  const change = { scheduleId: schedule.id, revision: schedule.revision, kind: 'remap' as const, effectiveFrom: cutoff, mapping: input.mapping.map((item) => ({ ...item, weekday: item.weekday + 1 })) }
  const preview = await service.preview(id, change); assert.equal(preview.conflicts.length, 1)
  await assert.rejects(service.commit(id, preview, false), /Confirm keeping/)
  await sessions.update(id, future.id, future.revision, { ...future.input, notes: 'Keep me' })
  await assert.rejects(service.commit(id, preview, true), /after preview/)
  const updated = await service.commit(id, await service.preview(id, change), true)
  assert.deepEqual(occurrences(updated, '2024-12-30', '2025-01-05'), oldEvents)
  assert.equal(occurrences(updated, cutoff, addDays(cutoff, 6))[0].ref.scheduledDate, addDays(cutoff, 1))
  const kept = (await service.events(id, cutoff, addDays(cutoff, 6), schedule.timeZone)).find((event) => event.draft)
  assert.ok(kept!.retained); assert.equal(kept!.draft!.input.notes, 'Keep me')
  await assert.rejects(service.commit(id, preview, true), /schedule changed/)
  const next = await service.preview(id, { ...change, revision: updated.revision })
  await plans.save(id, { ...planToInput(plan), name: 'Changed plan' }, plan)
  await assert.rejects(service.commit(id, next, true), /schedule changed/)
  assert.equal((await db.schedules.get([id, schedule.id]))!.revision, updated.revision + 1)
})

test('structural plan edits require future repair, ordinary edits reach pending content, stop retains history and future drafts', async (t) => {
  const { id, plan, plans, sessions, service, schedule, input } = await setup(t)
  const cutoff = nextMonday(localToday(schedule.timeZone)), future = (await sessions.openOccurrence(id, schedule.id, plan.days[0].id, cutoff)).draft!
  const edited = planToInput(plan); edited.days[0].exercises[0].prescription.name = 'Changed'
  const ordinary = await plans.save(id, edited, plan)
  assert.equal(occurrences(await service.get(id, schedule.id), cutoff, cutoff)[0].day.exercises[0].prescription.name, 'Changed')
  const reduced = { ...planToInput(ordinary), days: ordinary.days.slice(1) }; await plans.save(id, reduced, ordinary)
  const blocked = await service.get(id, schedule.id)
  assert.equal(occurrences(blocked, cutoff, addDays(cutoff, 6)).length, 0)
  assert.equal(occurrences(blocked, '2024-12-30', '2025-01-05').length, 4)
  assert.equal((await service.events(id, cutoff, addDays(cutoff, 6), input.timeZone)).length, 1)
  const repaired = await service.commit(id, await service.preview(id, { scheduleId: schedule.id, revision: blocked.revision, kind: 'remap', effectiveFrom: cutoff, mapping: input.mapping.slice(1) }), true)
  assert.equal(occurrences(repaired, cutoff, addDays(cutoff, 6)).length, 3)
  const stop = await service.preview(id, { scheduleId: schedule.id, revision: repaired.revision, kind: 'stop', effectiveFrom: cutoff, mapping: [] })
  await assert.rejects(service.commit(id, stop, false), /Confirm keeping/)
  const stopped = await service.commit(id, stop, true)
  assert.equal(occurrences(stopped, cutoff, addDays(cutoff, 6)).length, 0)
  assert.equal(occurrences(stopped, '2024-12-30', '2025-01-05').length, 4)
  assert.deepEqual(await sessions.getDraft(id, future.id), future)
  assert.equal((await sessions.openOccurrence(id, schedule.id, plan.days[0].id, cutoff)).draft!.id, future.id)
})

test('v4 migration preserves all ten populated stores including session/draft/timer and photo bytes; schedule zone stays stored', async (t) => {
  const { db, id, plan, sessions, schedule } = await setup(t)
  const draft = await sessions.start(id, plan.id, plan.days[0].id), input = structuredClone(draft.input)
  Object.assign(input.exercises[0].sets[0], { load: '40', reps: '5' }); await sessions.complete(id, draft.id, 1, input, true)
  const unfinished = await sessions.start(id, plan.id, plan.days[1].id); await sessions.startTimer(id, unfinished.id, 1, unfinished.day.exercises[0].id, 0, 60)
  await db.photos.add({ id: crypto.randomUUID(), profileId: id, blob: new Blob(['photo'], { type: 'image/png' }), width: 1, height: 1, createdAt: draft.startedAt, role: 'avatar' })
  await db.measurements.add({ id: crypto.randomUUID(), profileId: id, weightKg: 70, measuredAt: draft.startedAt, loggedAt: draft.startedAt })
  await db.tags.add({ id: crypto.randomUUID(), profileId: id, name: 'Tag', nameKey: 'tag', createdAt: draft.startedAt, updatedAt: draft.startedAt })
  await db.exercises.add({ id: crypto.randomUUID(), profileId: id, ...draft.day.exercises[0].prescription, nameKey: 'squat', activeNameKey: 'squat', tagIds: [], revision: 1, createdAt: draft.startedAt, updatedAt: draft.startedAt })
  const name = `boros-test-v5-${crypto.randomUUID()}`, old = new Dexie(name)
  old.version(4).stores({ profiles: 'id, &nameKey', settings: 'id', photos: '[profileId+id], profileId', measurements: '[profileId+id], [profileId+measuredAt], profileId', exercises: '[profileId+id], profileId, &[profileId+activeNameKey]', tags: '[profileId+id], profileId, &[profileId+nameKey]', plans: '[profileId+id], profileId, &[profileId+activeNameKey]', drafts: '[profileId+id], profileId, &[profileId+activeSourceKey]', sessions: '[profileId+id], profileId, &[profileId+draftId]', restTimers: 'id, profileId' })
  const records = new Map<string, unknown[]>()
  for (const table of old.tables) { const values = await db.table(table.name).toArray(); assert.ok(values.length); records.set(table.name, values); await table.bulkAdd(values) }
  old.close(); const upgraded = new BorosDatabase(name); t.after(() => upgraded.delete()); await upgraded.open(); assert.equal(upgraded.verno, 12)
  for (const [table, values] of records) assert.deepEqual(await upgraded.table(table).toArray(), (classifyStrengthRecords(values), values))
  assert.equal(await (await upgraded.photos.toArray())[0].blob.text(), 'photo'); assert.equal(await upgraded.schedules.count(), 0)
  await upgraded.schedules.add(schedule); upgraded.close(); await upgraded.open()
  assert.equal((await scheduleService(upgraded).get(id, schedule.id)).timeZone, 'America/New_York')
  assert.equal((await scheduleService(upgraded).events(id, '2024-12-30', '2025-01-05', 'Asia/Tokyo')).length, 0)
})

test('schedule writes are owner/revision bound, create retries are idempotent, and failed structural plan updates roll back both records', async (t) => {
  const { db, id, profiles, plan, plans, service, input, schedule } = await setup(t)
  const other = await profiles.create('Other'), cutoff = nextMonday(localToday(schedule.timeZone))
  const change = { scheduleId: schedule.id, revision: schedule.revision, kind: 'stop' as const, effectiveFrom: cutoff, mapping: [] }
  await assert.rejects(service.preview(other.id, change), /unavailable/)
  const preview = await service.preview(id, change)
  await assert.rejects(service.commit(other.id, preview, true), /unavailable/)
  const creation = schedule.id, created = await service.create(id, input, creation)
  assert.equal((await service.create(id, input, creation)).id, created.id); assert.equal(await db.schedules.count(), 1)
  const fail = () => { throw new Error('schedule storage failed') }; db.schedules.hook('updating', fail)
  await assert.rejects(service.commit(id, preview, true), /schedule storage failed/)
  assert.deepEqual(await service.get(id, schedule.id), schedule)
  await assert.rejects(plans.save(id, { ...planToInput(plan), days: plan.days.slice(1) }, plan), /schedule storage failed/)
  assert.deepEqual(await plans.get(id, plan.id), plan); assert.deepEqual(await service.get(id, schedule.id), schedule)
  db.schedules.hook('updating').unsubscribe(fail)
  const stale = { ...input, planRevision: plan.revision + 1 }; await assert.rejects(service.create(id, stale), /after your preview/)
  const stopped = await service.commit(id, preview, true); assert.equal(stopped.stoppedFrom, cutoff)
  await assert.rejects(service.commit(id, preview, true), /schedule changed/)
})

test('weekly identity remains civil across both DST transitions and completion on a second schedule stays separate', async (t) => {
  const { db, id, plan, sessions, service, input, schedule } = await setup(t)
  const other = { ...structuredClone(schedule), id: crypto.randomUUID() }
  await db.schedules.add(other) // Legacy duplicate history remains readable.
  for (const [first, second] of [['2025-03-03', '2025-03-10'], ['2025-10-27', '2025-11-03']]) {
    const before = occurrences(schedule, first, addDays(first, 6)), after = occurrences(schedule, second, addDays(second, 6))
    assert.equal(before.length, 4); assert.equal(after.length, 4)
    before.forEach((event, index) => { assert.equal(addDays(event.ref.scheduledDate, 7), after[index].ref.scheduledDate); assert.notEqual(event.ref.key, after[index].ref.key) })
  }
  const draft = (await sessions.openOccurrence(id, other.id, plan.days[0].id, '2025-03-03')).draft!, inputValues = structuredClone(draft.input)
  Object.assign(inputValues.exercises[0].sets[0], { load: '0', reps: '0' }); await sessions.complete(id, draft.id, 1, inputValues, true)
  const events = await service.events(id, '2025-03-03', '2025-03-09', input.timeZone)
  assert.equal(events.filter((event) => event.session).length, 1)
  assert.ok(events.filter((event) => event.ref.scheduleId === schedule.id).every((event) => !event.session))
})

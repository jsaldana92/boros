import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { copyExercise, newDay, planToInput } from '../../src/schemas/plan.ts'
import { assessSession, displayedLoad, timerRemaining, type SessionDraft } from '../../src/schemas/session.ts'
import { DraftController } from '../../src/features/train/draft-controller.ts'

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-sessions-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId, plans = planService(db), service = sessionService(db)
  const exercise = { name: 'Squat', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 0, max: 0 } }, { reps: { min: 10, max: 10 } }], restBetweenSeconds: 60, restAfterSeconds: 120, instructions: '<b>plain\ntext</b>', tutorialUrl: 'https://youtu.be/abcdefghijk', tagNames: ['Legs'], notes: 'Prescription note' }
  const plan = await plans.save(id, { name: 'Strength', days: [{ ...newDay(1), exercises: [copyExercise(exercise), copyExercise({ ...exercise, name: 'Row', restBetweenSeconds: 0 })] }] })
  const draft = await service.start(id, plan.id, plan.days[0].id)
  return { db, profiles, id, plans, plan, service, draft }
}
function filled(draft: SessionDraft) { const input = structuredClone(draft.input); for (const exercise of input.exercises) for (const set of exercise.sets) Object.assign(set, { load: '0', reps: '5', rir: '0' }); return input }

test('start is idempotent per profile/day and complete snapshots survive source edits/archive', async (t) => {
  const { service, id, plans, plan, draft, db } = await setup(t)
  const concurrent = await Promise.all([service.start(id, plan.id, plan.days[0].id), service.start(id, plan.id, plan.days[0].id)])
  assert.ok(concurrent.every((item) => item.id === draft.id)); assert.equal(await db.drafts.count(), 1)
  const changed = planToInput(plan); changed.days[0].exercises[0].prescription.name = 'Changed'
  const edited = await plans.save(id, changed, plan); await plans.setArchived(id, edited.id, edited.revision, true)
  assert.deepEqual((await service.getDraft(id, draft.id)).day, plan.days[0])
  assert.equal((await service.start(id, plan.id, plan.days[0].id)).id, draft.id)
  const saved = await service.complete(id, draft.id, draft.revision, filled(draft), false)
  assert.deepEqual(saved.day, plan.days[0]); assert.equal(saved.revision, 1)
  assert.ok(saved.startedAt <= saved.completedAt && saved.completedAt <= saved.loggedAt)
  assert.equal((await service.library(id)).drafts.length, 0)
  await assert.rejects(service.start(id, plan.id, plan.days[0].id), /unavailable/)
})

test('draft/session/timer operations are profile isolated; only owner can stop/reset the global timer', async (t) => {
  const { service, id, draft, profiles } = await setup(t), other = await profiles.create('Other')
  const timer = await service.startTimer(id, draft.id, draft.revision, draft.day.exercises[0].id, 0)
  await assert.rejects(service.getDraft(other.id, draft.id), /unavailable/)
  await assert.rejects(service.update(other.id, draft.id, draft.revision, filled(draft)), /unavailable/)
  await assert.rejects(service.complete(other.id, draft.id, draft.revision, filled(draft), false), /unavailable/)
  await assert.rejects(service.clear(other.id, draft.id, draft.revision), /unavailable/)
  await assert.rejects(service.changeTimer(other.id, draft.id, timer!.token, 'stop'), /unavailable/)
  assert.deepEqual((await service.library(other.id)).drafts, []); assert.equal((await service.library(other.id)).timer, undefined)
  assert.equal((await service.library(id)).timer!.token, timer!.token)
})

test('zero/blank, invalid and incompatible partial sets require correction or explicit skip; units retain measurements', async (t) => {
  const { service, id, draft } = await setup(t), input = filled(draft)
  await assert.rejects(service.complete(id, draft.id, draft.revision, draft.input, true), /at least one/)
  input.exercises[0].sets[0] = { load: '100', unit: 'lb', reps: '0', rir: '', skipped: false }
  assert.equal(displayedLoad(input.exercises[0].sets[0], 'kg'), '45.359237')
  assert.equal(input.exercises[0].sets[0].load, '100')
  for (const invalid of ['-1', 'NaN', 'Infinity', '1e999', 'abc']) { const bad = structuredClone(input); bad.exercises[0].sets[0].load = invalid; assert.ok(Object.keys(assessSession(bad).errors).length) }
  input.exercises[1].sets[1] = { load: '', reps: '', rir: '', unit: 'kg', skipped: false }
  assert.equal(assessSession(input).skipped, 1)
  input.exercises[1].sets[0].reps = ''
  await assert.rejects(service.complete(id, draft.id, draft.revision, input, true), /Correct/)
  input.exercises[1].sets[0].skipped = true
  await assert.rejects(service.complete(id, draft.id, draft.revision, input, false), /partial/)
  const result = await service.complete(id, draft.id, draft.revision, input, true)
  assert.equal(result.partial, true); assert.deepEqual(result.exercises[0].sets[0], { skipped: false, weightKg: 45.359237, load: 100, unit: 'lb', reps: 0 })
  assert.deepEqual(result.exercises[1].sets, [{ skipped: true }, { skipped: true }])
})

test('stale autosaves/Clear fail, competing completion is idempotent, and finalized drafts cannot resurrect', async (t) => {
  const { db, service, id, draft, plan } = await setup(t), connection = new BorosDatabase(db.name), second = sessionService(connection)
  t.after(async () => { connection.close() })
  const fresh = await service.update(id, draft.id, draft.revision, filled(draft))
  await assert.rejects(second.update(id, draft.id, draft.revision, draft.input), /another tab/)
  await assert.rejects(second.clear(id, draft.id, draft.revision), /another tab/)
  const logs = await Promise.all([service.complete(id, draft.id, fresh.revision, fresh.input, false), second.complete(id, draft.id, fresh.revision, fresh.input, false)])
  assert.deepEqual(logs[0], logs[1]); assert.equal(await db.sessions.count(), 1)
  await assert.rejects(service.update(id, draft.id, fresh.revision, fresh.input), /completed/)
  await assert.rejects(service.clear(id, draft.id, fresh.revision), /completed/)
  const next = await service.start(id, plan.id, plan.days[0].id); assert.notEqual(next.id, draft.id)
})

test('failed completion rolls back both log and finalization/timer; retry produces one log', async (t) => {
  const { db, service, id, draft } = await setup(t)
  await service.startTimer(id, draft.id, draft.revision, draft.day.exercises[0].id, 0)
  const fail = () => { throw new Error('Disk full') }; db.drafts.hook('updating', fail)
  await assert.rejects(service.complete(id, draft.id, draft.revision, filled(draft), false), /Disk full/)
  db.drafts.hook('updating').unsubscribe(fail)
  assert.equal(await db.sessions.count(), 0); assert.equal((await service.getDraft(id, draft.id)).finalizedAt, undefined); assert.ok((await service.library(id)).timer)
  const result = await service.complete(id, draft.id, draft.revision, filled(draft), false)
  assert.equal((await service.complete(id, draft.id, draft.revision, draft.input, true)).id, result.id)
  assert.equal((await service.library(id)).timer, undefined)
})

test('timer timestamps recover elapsed time; replacement, reset, zero and Clear obey ownership/revision', async (t) => {
  const { service, id, draft, db } = await setup(t), first = draft.day.exercises[0].id
  const timer = (await service.startTimer(id, draft.id, draft.revision, first, 0))!
  assert.equal(timer.durationSeconds, 60); assert.equal(timerRemaining(timer, Date.parse(timer.endAt) - 20500), 21); assert.equal(timerRemaining(timer, Date.parse(timer.endAt) + 900000), 0)
  const after = (await service.startTimer(id, draft.id, draft.revision, first, 1))!; assert.equal(after.durationSeconds, 120); assert.equal(await db.restTimers.count(), 1)
  await assert.rejects(service.changeTimer(id, draft.id, timer.token, 'stop'), /changed/)
  await service.changeTimer(id, draft.id, after.token, 'reset'); assert.notEqual((await service.library(id)).timer!.token, after.token)
  await service.startTimer(id, draft.id, draft.revision, draft.day.exercises[1].id, 0); assert.equal((await service.library(id)).timer, undefined)
  await service.startTimer(id, draft.id, draft.revision, first, 0)
  const input = filled(draft); input.notes = 'Note'; input.exercises[0].notes = 'Exercise note'
  const changed = await service.update(id, draft.id, draft.revision, input), cleared = await service.clear(id, draft.id, changed.revision)
  assert.deepEqual(cleared.input, draft.input); assert.deepEqual(cleared.day, draft.day); assert.equal((await service.library(id)).timer, undefined)
  await assert.rejects(service.startTimer(id, draft.id, changed.revision, first, 0), /another tab/)
})

test('controller serializes pending autosaves with Clear/Save and keeps failed input for retry', async (t) => {
  const { db, service, draft, id } = await setup(t), controller = new DraftController(draft, service)
  t.after(async () => { controller.dispose() })
  const fail = () => { throw new Error('Autosave failed') }; db.drafts.hook('updating', fail)
  controller.change(filled(draft)); await assert.rejects(controller.flush(), /Autosave failed/)
  assert.equal(controller.status, 'failed'); assert.equal(controller.input.exercises[0].sets[0].load, '0')
  db.drafts.hook('updating').unsubscribe(fail); await controller.flush(); assert.equal(controller.status, 'saved')
  controller.change({ ...filled(draft), notes: 'queued' })
  const pending = controller.flush(), clear = controller.clear(); await pending; await clear
  assert.deepEqual((await service.getDraft(id, draft.id)).input, draft.input)
  controller.change(filled(draft)); const savePending = controller.flush(), completion = controller.complete(false)
  await savePending; const log = await completion
  assert.equal(log.exercises[0].sets[0].skipped, false); assert.equal(await db.sessions.count(), 1)
  await controller.flush(); assert.ok((await service.getDraft(id, draft.id)).finalizedAt)
})

test('disposed delayed work never moves into another profile or draft; unpersisted input has no recovery promise', async (t) => {
  const { db, profiles, draft, service, id } = await setup(t), controller = new DraftController(draft, service)
  controller.change(filled(draft)); const other = await profiles.create('Other'); await profiles.select(other.id); controller.dispose(); await controller.flush()
  assert.deepEqual((await service.getDraft(id, draft.id)).input, draft.input); assert.equal((await service.library(other.id)).drafts.length, 0)
  assert.equal(await db.sessions.count(), 0)
})

test('an already-running write finishes only for its bound owner; Clear preserves other drafts and failed Clear is atomic', async (t) => {
  const { db, profiles, draft, service, id, plans, plan } = await setup(t)
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve }), started = new Promise<void>((resolve) => { entered = resolve })
  const delayed = { ...service, update: async (...args: Parameters<typeof service.update>) => { entered(); await gate; return service.update(...args) } }
  const controller = new DraftController(draft, delayed)
  controller.change(filled(draft)); const pending = controller.flush(); await started
  const other = await profiles.create('Other'); await profiles.select(other.id); controller.dispose(); release(); await pending
  assert.equal((await service.getDraft(id, draft.id)).input.exercises[0].sets[0].load, '0')
  assert.equal((await service.library(other.id)).drafts.length, 0)
  const anotherPlan = await plans.save(id, { ...planToInput(plan), name: 'Second' }), another = await service.start(id, anotherPlan.id, anotherPlan.days[0].id)
  const current = await service.getDraft(id, draft.id)
  await service.startTimer(id, current.id, current.revision, current.day.exercises[0].id, 0)
  const fail = () => { throw new Error('Clear failed') }; db.drafts.hook('updating', fail)
  await assert.rejects(service.clear(id, current.id, current.revision), /Clear failed/); db.drafts.hook('updating').unsubscribe(fail)
  assert.deepEqual(await service.getDraft(id, current.id), current); assert.ok((await service.library(id)).timer)
  await service.clear(id, current.id, current.revision); assert.deepEqual(await service.getDraft(id, another.id), another)
})

test('v3-to-v4 preserves every populated store and photo bytes; orphaned sessions block replacement initialization', async (t) => {
  const { db, id, draft, service } = await setup(t)
  await db.photos.add({ id: crypto.randomUUID(), profileId: id, blob: new Blob(['bytes'], { type: 'image/png' }), width: 1, height: 1, createdAt: draft.startedAt, role: 'avatar' })
  await db.measurements.add({ id: crypto.randomUUID(), profileId: id, weightKg: 70, measuredAt: draft.startedAt, loggedAt: draft.startedAt })
  await db.tags.add({ id: crypto.randomUUID(), profileId: id, name: 'Legs', nameKey: 'legs', createdAt: draft.startedAt, updatedAt: draft.startedAt })
  await db.exercises.add({ id: crypto.randomUUID(), profileId: id, ...draft.day.exercises[0].prescription, nameKey: 'squat', activeNameKey: 'squat', tagIds: [], revision: 1, createdAt: draft.startedAt, updatedAt: draft.startedAt })
  const name = `boros-test-v4-${crypto.randomUUID()}`, old = new Dexie(name)
  old.version(3).stores({ profiles: 'id, &nameKey', settings: 'id', photos: '[profileId+id], profileId', measurements: '[profileId+id], [profileId+measuredAt], profileId', exercises: '[profileId+id], profileId, &[profileId+activeNameKey]', tags: '[profileId+id], profileId, &[profileId+nameKey]', plans: '[profileId+id], profileId, &[profileId+activeNameKey]' })
  const records = new Map<string, unknown[]>()
  for (const table of old.tables) { const values = await db.table(table.name).toArray(); records.set(table.name, values); await table.bulkAdd(values) }
  old.close(); const upgraded = new BorosDatabase(name); t.after(() => upgraded.delete()); await upgraded.open()
  assert.equal(upgraded.verno, 4)
  for (const [table, values] of records) assert.deepEqual(await upgraded.table(table).toArray(), values)
  assert.equal(await (await upgraded.photos.toArray())[0].blob.text(), 'bytes'); assert.equal(await upgraded.drafts.count(), 0)
  await service.complete(id, draft.id, draft.revision, filled(draft), false)
  for (const table of db.tables.filter((table) => table.name !== 'sessions')) await table.clear()
  await assert.rejects(profileService(db).initialize(), /No data was replaced/); assert.equal(await db.sessions.count(), 1)
})

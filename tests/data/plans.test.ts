import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { planService } from '../../src/db/plans.ts'
import { copyExercise, newDay, planInputSchema, planToInput, type PlanInput } from '../../src/schemas/plan.ts'
import { filterExercises } from '../../src/features/create/library.ts'

const prescription = () => ({ name: 'Squat', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 0, max: 0 } }, { reps: { min: 10, max: 10 } }], restBetweenSeconds: 0, instructions: '<b>Plain text</b>', notes: 'Local note', tutorialUrl: 'https://youtu.be/abcdefghijk', tagNames: ['Legs'] })
const input = (name = 'Strength', count = 4): PlanInput => ({ name, days: Array.from({ length: count }, (_, index) => ({ ...newDay(index + 1), exercises: [copyExercise(prescription())] })) })
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-plans-${crypto.randomUUID()}`)
  t.after(() => db.delete())
  const profiles = profileService(db)
  const { activeProfileId: id } = await profiles.initialize()
  return { db, profiles, id, service: planService(db), exercises: exerciseService(db) }
}

test('plan validation requires 1-7 named nonempty days, unique IDs and valid full prescriptions', () => {
  assert.equal(planInputSchema.safeParse(input()).success, true)
  for (const count of [0, 8]) assert.equal(planInputSchema.safeParse(input('Valid', count)).success, false)
  const value = input()
  value.name = ' '
  value.days[0].name = ''
  value.days[1].exercises = []
  value.days[2].exercises[0].prescription.sets[0].reps = { min: 8, max: 2 }
  const result = planInputSchema.safeParse(value)
  assert.equal(result.success, false)
  if (!result.success) for (const path of ['name', 'days.0.name', 'days.1.exercises', 'days.2.exercises.0.prescription.sets.0.reps.max']) assert.ok(result.error.issues.some((issue) => issue.path.join('.') === path), path)
  const repeated = input()
  repeated.days[1].exercises[0].id = repeated.days[0].exercises[0].id
  assert.equal(planInputSchema.safeParse(repeated).success, false)
})

test('atomic save and reordering/moving retain plan/day/occurrence IDs and optional zero values', async (t) => {
  const { service, id } = await setup(t)
  const first = await service.save(id, input())
  const draft = planToInput(first)
  draft.days.reverse()
  const moved = draft.days[0].exercises[0]
  draft.days[0].exercises.push(copyExercise(prescription()))
  draft.days[1].exercises.unshift(draft.days[0].exercises.shift()!)
  draft.days[1].exercises.reverse()
  const saved = await service.save(id, draft, first)
  assert.equal(saved.id, first.id)
  assert.equal(saved.createdAt, first.createdAt)
  assert.equal(saved.revision, 2)
  assert.deepEqual(saved.days, draft.days)
  assert.equal(saved.days[1].exercises[1].id, moved.id)
  const snapshot = saved.days[1].exercises[1].prescription
  assert.equal(snapshot.restBetweenSeconds, 0)
  assert.equal(snapshot.restAfterSeconds, undefined)
  assert.deepEqual(snapshot.sets[0].rir, { min: 0, max: 0 })
  assert.equal(snapshot.sets[1].rir, undefined)
  assert.deepEqual((await service.get(id, saved.id)).days, saved.days)
})

test('plan reads, edits, archive, duplicate and exercise sources are profile isolated', async (t) => {
  const { service, profiles, exercises, id } = await setup(t)
  const other = await profiles.create('Other')
  await exercises.save(id, prescription())
  const plan = await service.save(id, input())
  const library = await service.library(other.id)
  assert.deepEqual(library.plans, []); assert.deepEqual(library.choices, []); assert.deepEqual(library.tags, [])
  await assert.rejects(service.get(other.id, plan.id), /unavailable/)
  await assert.rejects(service.save(other.id, input(), plan), /unavailable/)
  await assert.rejects(service.setArchived(other.id, plan.id, plan.revision, true), /unavailable/)
  await assert.rejects(service.duplicateDraft(other.id, plan.id), /unavailable/)
  await service.save(other.id, input())
  assert.equal((await service.get(id, plan.id)).revision, 1)
})

test('normalized active plan names reject conflicts and concurrent creates; archived names can be restored after renaming', async (t) => {
  const { service, id } = await setup(t)
  const first = await service.save(id, input('My Plan'))
  await assert.rejects(service.save(id, input('  \uff2dY   PLAN ')), /already exists/)
  const archived = await service.setArchived(id, first.id, first.revision, true)
  await service.save(id, input('My Plan'))
  await assert.rejects(service.setArchived(id, archived.id, archived.revision, false), /rename an archived plan/)
  assert.ok((await service.get(id, archived.id)).archivedAt)
  const renamed = await service.save(id, { ...planToInput(archived), name: 'Old Plan' }, archived)
  const restored = await service.setArchived(id, renamed.id, renamed.revision, false)
  assert.equal(restored.archivedAt, undefined)
  assert.deepEqual(restored.days, first.days)
  const concurrent = await Promise.allSettled([service.save(id, input('New')), service.save(id, input('NEW'))])
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1)
})

test('copies include full snapshots; source edits/archive and destination edits cannot change another plan', async (t) => {
  const { service, exercises, id } = await setup(t)
  const source = await exercises.save(id, prescription())
  const choice = (await service.library(id)).choices[0]
  const first = await service.save(id, { name: 'One', days: [{ ...newDay(1), exercises: [copyExercise(choice.prescription, choice.source), copyExercise(choice.prescription, choice.source)] }] })
  const planChoice = (await service.library(id)).choices.find((item) => item.source.kind === 'plan')!
  const second = await service.save(id, { name: 'Two', days: [{ ...newDay(1), exercises: [copyExercise(planChoice.prescription, planChoice.source)] }] })
  const changed = planToInput(first); changed.days[0].exercises[0].prescription.sets[0].reps.min = 6
  const edited = await service.save(id, changed, first)
  assert.equal((await exercises.get(id, source.id)).sets[0].reps.min, 5)
  assert.deepEqual((await service.get(id, second.id)).days[0].exercises[0].prescription, choice.prescription)
  const newSource = await exercises.save(id, { ...prescription(), name: 'Changed', tagNames: ['Other'] }, source)
  await exercises.setArchived(id, newSource.id, newSource.revision, true)
  await service.setArchived(id, edited.id, edited.revision, true)
  assert.deepEqual((await service.get(id, second.id)).days[0].exercises[0].prescription, choice.prescription)
  assert.ok((await service.library(id)).choices.every((item) => item.source.kind === 'plan' && item.source.id === second.id))
})

test('duplicate plans receive independent plan/day/occurrence IDs and editable distinct names', async (t) => {
  const { service, id } = await setup(t)
  const first = await service.save(id, input())
  const copy = await service.save(id, await service.duplicateDraft(id, first.id))
  assert.notEqual(copy.id, first.id)
  assert.equal(copy.name, 'Strength (copy)')
  const oldIds = new Set(first.days.flatMap((day) => [day.id, ...day.exercises.map((exercise) => exercise.id)]))
  for (const day of copy.days) {
    assert.equal(oldIds.has(day.id), false)
    for (const exercise of day.exercises) { assert.equal(oldIds.has(exercise.id), false); assert.deepEqual(exercise.prescription, prescription()) }
  }
  assert.equal((await service.duplicateDraft(id, first.id)).name, 'Strength (copy 2)')
})

test('stale saves and archive fail across connections; failed complete-plan writes keep prior data atomically', async (t) => {
  const { db, service, id } = await setup(t)
  const first = await service.save(id, input())
  const connection = new BorosDatabase(db.name)
  const other = planService(connection)
  const current = await service.save(id, { ...planToInput(first), name: 'Latest' }, first)
  await assert.rejects(other.save(id, input('Stale'), first), /another tab/)
  await assert.rejects(other.setArchived(id, first.id, first.revision, true), /another tab/)
  connection.close()
  const fail = () => { throw new Error('Simulated disk failure') }
  db.plans.hook('updating', fail)
  await assert.rejects(service.save(id, input('Failed'), current), /disk failure/)
  db.plans.hook('updating').unsubscribe(fail)
  assert.deepEqual(await service.get(id, first.id), current)
  db.plans.hook('creating', fail)
  await assert.rejects(service.save(id, input('New failure')), /disk failure/)
  db.plans.hook('creating').unsubscribe(fail)
  assert.equal(await db.plans.count(), 1)
})

test('picker source labels distinguish repeat occurrences; shared name/date/ANY filters compose', async (t) => {
  const { service, exercises, id } = await setup(t)
  await exercises.save(id, prescription())
  await service.save(id, input())
  const { choices } = await service.library(id)
  assert.equal(choices.length, 5)
  assert.equal(new Set(choices.map((choice) => choice.label)).size, 5)
  assert.equal(filterExercises(choices, 'SQUAT', 'az', ['legs', 'other'], false).length, 5)
  assert.equal(filterExercises(choices, 'squat', 'za', ['missing'], false).length, 0)
  choices.forEach((choice, i) => { choice.createdAt = `2026-01-0${i + 1}` })
  assert.equal(filterExercises(choices, '', 'newest', [], false)[0].id, choices[4].id)
  assert.equal(filterExercises(choices, '', 'oldest', [], false)[0].id, choices[0].id)
})

test('v2-to-v3 migration retains all populated stores including photo bytes and exercises/tags', async (t) => {
  const name = `boros-test-v3-${crypto.randomUUID()}`
  const old = new Dexie(name)
  old.version(2).stores({ profiles: 'id, &nameKey', settings: 'id', photos: '[profileId+id], profileId', measurements: '[profileId+id], [profileId+measuredAt], profileId', exercises: '[profileId+id], profileId, &[profileId+activeNameKey]', tags: '[profileId+id], profileId, &[profileId+nameKey]' })
  const id = crypto.randomUUID(), now = '2026-01-01T00:00:00.000Z'
  const records = {
    profiles: { id, name: 'Guest', nameKey: 'guest', kind: 'guest', weightUnit: 'kg', heightUnit: 'cm', revision: 1, createdAt: now, updatedAt: now },
    settings: { id: 'workspace', activeProfileId: id, theme: 'light', noticeAccepted: true },
    photos: { id: 'photo', profileId: id, blob: new Blob(['photo bytes'], { type: 'image/png' }), width: 1, height: 1, createdAt: now, role: 'avatar' },
    measurements: { id: 'weight', profileId: id, weightKg: 70, measuredAt: now, loggedAt: now },
    exercises: { ...prescription(), id: 'exercise', profileId: id, tagIds: ['tag'], nameKey: 'squat', activeNameKey: 'squat', revision: 2, createdAt: now, updatedAt: now },
    tags: { id: 'tag', profileId: id, name: 'Legs', nameKey: 'legs', createdAt: now, updatedAt: now },
  }
  for (const [table, record] of Object.entries(records)) await old.table(table).add(record)
  old.close()
  const upgraded = new BorosDatabase(name)
  t.after(() => upgraded.delete())
  await upgraded.open()
  assert.equal(upgraded.verno, 4)
  for (const [table, record] of Object.entries(records)) {
    const retained = (await upgraded.table(table).toArray())[0]
    assert.deepEqual(retained, record)
    if (table === 'photos') assert.equal(await retained.blob.text(), 'photo bytes')
  }
  assert.equal(await upgraded.plans.count(), 0)
  assert.deepEqual(await profileService(upgraded).initialize(), records.settings)
})

test('orphaned plans prevent initialization from silently creating a replacement workspace', async (t) => {
  const { db, service, id, profiles } = await setup(t)
  const plan = await service.save(id, input())
  await db.settings.clear(); await db.profiles.clear()
  await assert.rejects(profiles.initialize(), /No data was replaced/)
  assert.equal((await db.plans.get([id, plan.id]))!.id, plan.id)
  assert.equal(await db.profiles.count(), 0)
})

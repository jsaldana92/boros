import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { exerciseInputSchema, isYouTubeUrl, type ExerciseInput } from '../../src/schemas/exercise.ts'
import { parseForm, toForm } from '../../src/features/create/form.ts'
import { filterExercises } from '../../src/features/create/library.ts'

const prescription = (name = 'Squat'): ExerciseInput => ({ name, sets: [{ reps: { min: 5, max: 8 } }, { reps: { min: 8, max: 8 }, rir: { min: 0, max: 0 } }, { reps: { min: 10, max: 12 }, rir: { min: 1, max: 2 } }], restBetweenSeconds: 0, tagNames: ['Legs'] })
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-exercises-${crypto.randomUUID()}`)
  t.after(() => db.delete())
  const profiles = profileService(db)
  const { activeProfileId: id } = await profiles.initialize()
  return { db, profiles, id, service: exerciseService(db) }
}

test('prescription round trip retains different sets, blank optionals, and explicit zero', () => {
  const value = prescription()
  const parsed = parseForm(toForm(value))
  assert.deepEqual(parsed.errors, {})
  assert.deepEqual(parsed.value?.sets, value.sets)
  assert.equal(parsed.value?.restBetweenSeconds, 0)
  assert.equal(parsed.value?.restAfterSeconds, undefined)
  assert.equal(parsed.value?.sets[0].rir, undefined)
  assert.deepEqual(parsed.value?.sets[1].rir, { min: 0, max: 0 })
})

test('specific field errors for missing, fractional, negative and reversed targets', () => {
  const form = toForm(prescription())
  form.sets[0] = { repMin: '0', repMax: '', rirMin: '', rirMax: '2' }
  form.sets[1] = { repMin: '8', repMax: '5', rirMin: '2', rirMax: '1' }
  form.sets[2].repMin = '2.5'
  form.restAfterSeconds = { minutes: '', seconds: '-1' }
  const errors = parseForm(form).errors
  for (const path of ['sets.0.repMin', 'sets.0.rirMin', 'sets.1.repMax', 'sets.1.rirMax', 'sets.2.repMin', 'restAfterSeconds.seconds']) assert.ok(errors[path], path)
  assert.equal(exerciseInputSchema.safeParse({ ...prescription(), sets: [] }).success, false)
  assert.equal(exerciseInputSchema.safeParse({ ...prescription(), sets: [{ reps: { min: 8, max: 3 } }] }).success, false)
  assert.equal(parseForm(toForm()).value, undefined)
})

test('only supported HTTPS YouTube video URLs are accepted', () => {
  for (const url of ['https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk&t=30', 'https://youtube.com/shorts/abcdefghijk', 'https://m.youtube.com/live/abcdefghijk', 'https://youtube.com/embed/abcdefghijk']) assert.equal(isYouTubeUrl(url), true, url)
  for (const url of ['javascript:alert(1)', 'http://youtube.com/watch?v=abcdefghijk', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://youtube.com@evil.test/watch?v=abcdefghijk', 'https://youtube.com/playlist?list=123', 'https://youtu.be/short', 'https://youtube.com/watch?v=abcdefghijk&v=other']) assert.equal(isYouTubeUrl(url), false, url)
})

test('lifecycle preserves IDs on edit/archive/restore and duplicates independently', async (t) => {
  const { db, service, id } = await setup(t)
  const first = await service.save(id, prescription())
  const edited = await service.save(id, { ...prescription('High Bar Squat'), instructions: '<script>inert</script>' }, first)
  assert.equal(edited.id, first.id)
  assert.equal(edited.createdAt, first.createdAt)
  assert.equal(edited.revision, 2)
  const draft = await service.duplicateDraft(id, edited.id)
  assert.equal(draft.name, 'High Bar Squat (copy)')
  const copy = await service.save(id, draft)
  assert.notEqual(copy.id, edited.id)
  assert.deepEqual(copy.sets, edited.sets)
  const archived = await service.setArchived(id, edited.id, edited.revision, true)
  assert.ok(archived.archivedAt)
  assert.equal(await db.exercises.count(), 2)
  const restored = await service.setArchived(id, archived.id, archived.revision, false)
  assert.equal(restored.archivedAt, undefined)
  assert.equal(restored.id, first.id)
  assert.equal(restored.instructions, '<script>inert</script>')
})

test('profile isolation covers exercises, duplicate drafts, archive and tags', async (t) => {
  const { profiles, service, id } = await setup(t)
  const second = await profiles.create('Other')
  const a = await service.save(id, prescription())
  assert.deepEqual(await service.library(second.id), { exercises: [], tags: [] })
  await assert.rejects(service.get(second.id, a.id), /unavailable/)
  await assert.rejects(service.save(second.id, prescription(), a), /unavailable/)
  await assert.rejects(service.setArchived(second.id, a.id, a.revision, true), /unavailable/)
  await assert.rejects(service.duplicateDraft(second.id, a.id), /unavailable/)
  const b = await service.save(second.id, prescription())
  assert.notEqual(a.tagIds[0], b.tagIds[0])
  assert.equal((await service.get(id, a.id)).revision, 1)
})

test('normalized names are unique among active exercises; restore conflicts retain archives', async (t) => {
  const { db, service, id } = await setup(t)
  const a = await service.save(id, prescription('High Bar Squat'))
  await assert.rejects(service.save(id, prescription('  ＨIGH   BAR squat ')), /already exists/)
  const archived = await service.setArchived(id, a.id, a.revision, true)
  await service.save(id, prescription('High Bar Squat'))
  await assert.rejects(service.setArchived(id, archived.id, archived.revision, false), /already exists/)
  assert.ok((await service.get(id, a.id)).archivedAt)
  const renamed = await service.save(id, prescription('Old Squat'), archived)
  await service.setArchived(id, renamed.id, renamed.revision, false)
  const result = await Promise.allSettled([service.save(id, prescription('Row')), service.save(id, prescription('ROW'))])
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(await db.exercises.count(), 3)
})

test('tags normalize and reuse IDs; failed exercise write rolls back inline tags', async (t) => {
  const { db, service, id } = await setup(t)
  const a = await service.save(id, { ...prescription(), tagNames: ['  Lower  Body ', 'LOWER BODY'] })
  assert.equal(a.tagIds.length, 1)
  const b = await service.save(id, { ...prescription('Lunge'), tagNames: ['lower body'] })
  assert.deepEqual(a.tagIds, b.tagIds)
  const fail = () => { throw new Error('Simulated storage failure') }
  db.exercises.hook('creating', fail)
  await assert.rejects(service.save(id, { ...prescription('Failed'), tagNames: ['Unsaved tag'] }), /storage failure/)
  db.exercises.hook('creating').unsubscribe(fail)
  assert.equal(await db.tags.count(), 1)
  assert.equal(await db.exercises.count(), 2)
})

test('stale edits and stale archive operations fail atomically across connections', async (t) => {
  const { db, service, id } = await setup(t)
  const connection = new BorosDatabase(db.name)
  const other = exerciseService(connection)
  const first = await service.save(id, prescription())
  await service.save(id, prescription('New name'), first)
  await assert.rejects(other.save(id, { ...prescription('Stale'), tagNames: ['Stale tag'] }, first), /another tab/)
  await assert.rejects(other.setArchived(id, first.id, first.revision, true), /another tab/)
  assert.equal(await db.tags.count(), 1)
  assert.equal((await service.get(id, first.id)).name, 'New name')
  connection.close()
})

test('search, all sorts and ANY tag filters compose and exclude archives', async (t) => {
  const { service, id } = await setup(t)
  await service.save(id, prescription('Zeta squat'))
  await service.save(id, { ...prescription('Alpha squat'), tagNames: ['Arms'] })
  await service.save(id, { ...prescription('Row'), tagNames: ['Back'] })
  const { exercises, tags } = await service.library(id)
  exercises.forEach((record, index) => { record.createdAt = `2026-01-0${index + 1}T00:00:00.000Z` })
  const selected = tags.filter((tag) => ['Legs', 'Arms'].includes(tag.name)).map((tag) => tag.id)
  assert.deepEqual(filterExercises(exercises, 'SQUAT', 'az', selected, false).map((e) => e.name), ['Alpha squat', 'Zeta squat'])
  assert.deepEqual(filterExercises(exercises, 'squat', 'za', selected, false).map((e) => e.name), ['Zeta squat', 'Alpha squat'])
  const ordered = [...exercises].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  assert.deepEqual(filterExercises(exercises, '', 'oldest', [], false).map((e) => e.id), ordered.map((e) => e.id))
  assert.deepEqual(filterExercises(exercises, '', 'newest', [], false).map((e) => e.id), ordered.reverse().map((e) => e.id))
  exercises[0].archivedAt = '2026-02-01T00:00:00.000Z'
  assert.equal(filterExercises(exercises, '', 'az', [], true).length, 1)
})

test('v1 to current migration preserves every existing store and profile selection', async (t) => {
  const dbName = `boros-test-migration-${crypto.randomUUID()}`
  const old = new Dexie(dbName)
  old.version(1).stores({ profiles: 'id, &nameKey', settings: 'id', photos: '[profileId+id], profileId', measurements: '[profileId+id], [profileId+measuredAt], profileId' })
  const id = crypto.randomUUID()
  const profile = { id, name: 'Preserved', nameKey: 'preserved', kind: 'named', weightUnit: 'lb', heightUnit: 'cm', revision: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', photoId: 'photo' }
  const settings = { id: 'workspace', activeProfileId: id, theme: 'light', noticeAccepted: true }
  const photo = { profileId: id, id: 'photo', blob: new Blob(['fixture'], { type: 'image/png' }), width: 1, height: 1, role: 'avatar', createdAt: profile.createdAt }
  const measurement = { profileId: id, id: 'weight', weightKg: 70, measuredAt: profile.createdAt, loggedAt: profile.createdAt }
  await old.table('profiles').add(profile); await old.table('settings').add(settings); await old.table('photos').add(photo); await old.table('measurements').add(measurement)
  old.close()
  const upgraded = new BorosDatabase(dbName)
  t.after(() => upgraded.delete())
  await upgraded.open()
  assert.equal(upgraded.verno, 6)
  assert.deepEqual(await upgraded.profiles.get(id), profile)
  assert.deepEqual(await upgraded.settings.get('workspace'), settings)
  assert.deepEqual(await upgraded.measurements.get([id, 'weight']), measurement)
  const retained = await upgraded.photos.get([id, 'photo'])
  assert.equal(await retained!.blob.text(), 'fixture')
  assert.equal(retained!.blob.type, 'image/png')
  assert.equal(retained!.width, photo.width)
  assert.deepEqual(await profileService(upgraded).initialize(), settings)
  assert.equal(await upgraded.exercises.count(), 0)
  assert.equal(await upgraded.tags.count(), 0)
})

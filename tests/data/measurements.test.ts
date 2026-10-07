import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { measurementService, measurementRevision } from '../../src/db/measurements.ts'
import { fromKg, toKg } from '../../src/schemas/profile.ts'
import { localDateTime, measurementTime, validateTimeContext } from '../../src/lib/measurement-dates.ts'

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-progress-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId, service = measurementService(db)
  const add = (weightKg: number, measuredAt = '2025-01-01T12:00:00.000Z', entryId = crypto.randomUUID(), photo?: ReturnType<typeof image>) => service.save(id, entryId, undefined, { weightKg, measuredAt }, photo, crypto.randomUUID())
  return { db, profiles, id, service, add }
}
const image = (text = 'photo') => ({ blob: new Blob([text], { type: 'image/png' }), width: 1, height: 1 })
const profileInput = { name: '', weightUnit: 'kg' as const, heightUnit: 'cm' as const }

test('chronological current weight uses measured time then greatest ID, never arrival or edit time', async (t) => {
  const { service, add, id, profiles } = await setup(t)
  const recent = await add(80, '2025-03-01T00:00:00.000Z')
  const oldest = await add(90, '2024-01-01T00:00:00.000Z')
  const tied1 = await add(75, recent.measuredAt, '00000000-0000-4000-8000-000000000001')
  const tied2 = await add(77, recent.measuredAt, 'ffffffff-ffff-4fff-8fff-ffffffffffff')
  assert.equal((await profiles.latestWeight(id))!.id, tied2.id)
  assert.equal((await service.list(id))[0].id, oldest.id)
  const changed = await service.save(id, tied2.id, 1, { weightKg: 76, measuredAt: tied2.measuredAt }, undefined, crypto.randomUUID())
  assert.equal(changed.id, tied2.id); assert.equal(changed.loggedAt, tied2.loggedAt); assert.equal(changed.measuredAt, tied2.measuredAt)
  assert.equal((await profiles.snapshot(id)).measurement!.weightKg, 76)
  await service.remove(id, changed.id, changed.revision!)
  assert.equal((await profiles.latestWeight(id))!.id, [recent.id, tied1.id].sort().at(-1))
  await service.remove(id, recent.id, 1); await service.remove(id, tied1.id, 1)
  assert.equal((await profiles.latestWeight(id))!.weightKg, 90)
  await service.remove(id, oldest.id, 1); assert.equal(await profiles.latestWeight(id), undefined)
  assert.deepEqual(await service.list(id), [])
})

test('profile save shares the measurement service, blank/unit-only preserves canonical values; Progress invalidates stale Settings', async (t) => {
  const { db, profiles, service, id, add } = await setup(t)
  await profiles.save(id, 1, { ...profileInput, weightKg: 70 })
  const first = (await profiles.snapshot(id)).measurement!, profile = await profiles.getProfile(id)
  await profiles.save(id, profile.revision, { ...profileInput, weightUnit: 'lb' })
  assert.equal(await db.measurements.count(), 1); assert.equal((await service.get(id, first.id)).weightKg, 70)
  assert.ok(Math.abs(toKg(fromKg(70, 'lb'), 'lb') - 70) < 1e-12)
  const stale = await profiles.getProfile(id)
  const added = await add(65, new Date(Date.parse(first.measuredAt) + 10000).toISOString())
  await assert.rejects(profiles.save(id, stale.revision, { ...profileInput, name: 'Unrelated edit', weightKg: 99 }), /changed in another tab/)
  await assert.rejects(profiles.save(id, stale.revision, { ...profileInput, name: 'Unrelated edit' }), /changed in another tab/)
  assert.equal((await profiles.snapshot(id)).measurement!.weightKg, 65)
  const fresh = await profiles.getProfile(id); await profiles.save(id, fresh.revision, { ...profileInput, weightKg: 68 })
  assert.equal(await db.measurements.count(), 3); assert.ok((await profiles.latestWeight(id))!.measuredAt > added.measuredAt)
})

test('concurrent edits and retries are revision checked and idempotent, including legacy records', async (t) => {
  const { db, id, add, service } = await setup(t), otherDB = new BorosDatabase(db.name), other = measurementService(otherDB)
  t.after(async () => otherDB.close())
  const entryId = crypto.randomUUID(), mutation = crypto.randomUUID(), input = { weightKg: 70, measuredAt: '2025-01-01T00:00:00.000Z' }
  const results = await Promise.all([service.save(id, entryId, undefined, input, image(), mutation), other.save(id, entryId, undefined, input, image(), mutation)])
  assert.deepEqual(results[0], results[1]); assert.equal(await db.photos.count(), 1); assert.equal(await db.measurements.count(), 1)
  const changeId = crypto.randomUUID(), edited = await service.save(id, entryId, 1, { ...input, weightKg: 71 }, undefined, changeId)
  assert.deepEqual(await other.save(id, entryId, 1, { ...input, weightKg: 71 }, undefined, changeId), edited)
  await assert.rejects(other.save(id, entryId, 1, input, undefined, crypto.randomUUID()), /changed in another tab/)
  await assert.rejects(other.remove(id, entryId, 1), /changed in another tab/)
  const legacy = await add(66); await db.measurements.update([id, legacy.id], { revision: undefined, updatedAt: undefined })
  assert.equal(measurementRevision(await service.get(id, legacy.id)), 1)
  assert.equal((await service.save(id, legacy.id, 1, { weightKg: 67, measuredAt: legacy.measuredAt }, undefined, crypto.randomUUID())).revision, 2)
  assert.equal(db.verno, 7)
})

test('measurements and photos stay owner scoped across reads, updates, deletes, and profile selection', async (t) => {
  const { id, add, service, profiles, db } = await setup(t), entry = await add(80, undefined, undefined, image()), other = await profiles.create('Other')
  await assert.rejects(service.get(other.id, entry.id), /unavailable/); await assert.rejects(service.photo(other.id, entry.id), /unavailable/)
  await assert.rejects(service.save(other.id, entry.id, 1, entry, undefined, crypto.randomUUID()), /deleted/)
  await service.remove(other.id, entry.id, 1); assert.ok(await service.photo(id, entry.id))
  assert.deepEqual(await service.list(other.id), [])
  await profiles.select(other.id)
  await service.save(id, entry.id, 1, { ...entry, weightKg: 81 }, undefined, crypto.randomUUID())
  assert.equal((await service.latest(id))!.weightKg, 81); assert.equal(await service.latest(other.id), undefined); assert.equal(await db.photos.count(), 1)
})

test('photo replacement/removal/delete are atomic, preserve shared/avatar references, and never switch avatar', async (t) => {
  const { id, db, profiles, service, add } = await setup(t)
  const entry = await add(70, undefined, undefined, image('first')), shared = await add(71)
  assert.equal((await profiles.getProfile(id)).photoId, undefined)
  await db.measurements.update([id, shared.id], { photoId: entry.photoId })
  await db.profiles.update(id, { photoId: entry.photoId })
  const replaced = await service.save(id, entry.id, 1, entry, image('second'), crypto.randomUUID())
  assert.equal(await db.photos.count(), 2); assert.equal((await profiles.getProfile(id)).photoId, entry.photoId)
  const removed = await service.save(id, entry.id, 2, replaced, null, crypto.randomUUID())
  assert.equal(removed.photoId, undefined); assert.equal(removed.measuredAt, entry.measuredAt); assert.equal(await db.photos.count(), 1)
  await service.remove(id, shared.id, 1); assert.equal(await db.photos.count(), 1)
  const profile = await profiles.getProfile(id); await profiles.save(id, profile.revision, profileInput, null)
  assert.equal(await db.photos.count(), 0)
  const kept = await add(75, undefined, undefined, image('shared-avatar'))
  await db.profiles.update(id, { photoId: kept.photoId })
  await profiles.save(id, (await profiles.getProfile(id)).revision, profileInput, image('new-avatar'))
  assert.equal(await db.photos.count(), 2); assert.equal(await (await service.photo(id, kept.id))!.blob.text(), 'shared-avatar')
  await service.remove(id, kept.id, 1); assert.equal(await db.photos.count(), 1)
})

test('invalid photo/input and write failures preserve saved entries/assets and rollback profile revision', async (t) => {
  const { id, db, service, add, profiles } = await setup(t), entry = await add(70, undefined, undefined, image())
  const baseline = await profiles.getProfile(id)
  for (const invalid of [0, -1, Infinity, NaN, 1001]) await assert.rejects(service.save(id, entry.id, 1, { ...entry, weightKg: invalid }, undefined, crypto.randomUUID()))
  for (const photo of [{ ...image(), width: 4097 }, { ...image(), blob: new Blob(['svg'], { type: 'image/svg+xml' }) }, { ...image(), blob: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }) }]) await assert.rejects(service.save(id, entry.id, 1, entry, photo, crypto.randomUUID()))
  const fail = () => { throw new Error('photo cleanup failure') }; db.photos.hook('deleting', fail)
  await assert.rejects(service.save(id, entry.id, 1, { ...entry, weightKg: 60 }, image('new'), crypto.randomUUID()), /cleanup failure/)
  await assert.rejects(service.remove(id, entry.id, 1), /cleanup failure/)
  db.photos.hook('deleting').unsubscribe(fail)
  assert.deepEqual(await service.get(id, entry.id), entry); assert.equal(await db.photos.count(), 1); assert.deepEqual(await profiles.getProfile(id), baseline)
  const failProfile = () => { throw new Error('profile write failure') }; db.profiles.hook('updating', failProfile)
  await assert.rejects(add(55, undefined, undefined, image('new')), /profile write failure/)
  db.profiles.hook('updating').unsubscribe(failProfile)
  assert.equal(await db.photos.count(), 1); assert.equal(await db.measurements.count(), 1)
})

test('measurement local date context preserves the typed date and rejects invalid/context-mismatched times', () => {
  const context = measurementTime('2024-02-29T23:45')
  assert.ok(context.measuredLocal.startsWith('2024-02-29T23:45')); validateTimeContext(context)
  assert.equal(localDateTime(new Date(context.measuredAt)), context.measuredLocal)
  assert.throws(() => measurementTime('2025-02-29T12:00'), /valid/)
  assert.throws(() => measurementTime('2025-01-01T25:00'), /invalid/)
  assert.throws(() => validateTimeContext({ ...context, offsetMinutes: context.offsetMinutes + 60 }), /does not match/)
})

test('DST gaps reject, folds select the earlier instant, and saved zone context validates after a device-zone change', () => {
  const original = process.env.TZ
  try {
    process.env.TZ = 'America/New_York'
    assert.throws(() => measurementTime('2025-03-09T02:30'), /skipped/)
    const fold = measurementTime('2025-11-02T01:30'); assert.equal(fold.measuredAt, '2025-11-02T05:30:00.000Z')
    const late = measurementTime('2025-01-01T23:30'); assert.equal(late.measuredAt, '2025-01-02T04:30:00.000Z')
    process.env.TZ = 'Asia/Tokyo'; validateTimeContext(fold); validateTimeContext(late)
    assert.throws(() => measurementTime('2025-01-01T23:30', 'America/New_York'), /zone changed/)
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original }
})

test('explicit measured-time corrections reorder history without changing creation timestamps; unrelated weight/photo edits retain time', async (t) => {
  const { add, id, service, profiles } = await setup(t)
  const earlier = await add(72, '2025-01-01T12:00:00.000Z'), latest = await add(70, '2025-01-03T12:00:00.000Z')
  const changed = await service.save(id, latest.id, 1, { weightKg: 69, measuredAt: '2024-12-31T12:00:00.000Z' }, image(), crypto.randomUUID())
  assert.equal(changed.id, latest.id); assert.equal(changed.loggedAt, latest.loggedAt)
  assert.equal((await profiles.latestWeight(id))!.id, earlier.id)
  assert.deepEqual((await service.list(id)).map((entry) => entry.id), [latest.id, earlier.id])
  const kept = await service.save(id, changed.id, 2, { ...changed, weightKg: 68 }, null, crypto.randomUUID())
  assert.equal(kept.measuredAt, changed.measuredAt); assert.equal(kept.loggedAt, latest.loggedAt)
})

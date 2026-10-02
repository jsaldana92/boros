import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService, ConflictError } from '../../src/db/profiles.ts'
import { fromKg, nameKey, toKg } from '../../src/schemas/profile.ts'

const input = (name = '') => ({ name, weightUnit: 'kg' as const, heightUnit: 'cm' as const })
async function workspace(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-${crypto.randomUUID()}`)
  t.after(() => db.delete())
  const service = profileService(db)
  const settings = await service.initialize()
  return { db, service, guestId: settings.activeProfileId }
}

test('concurrent initialization creates exactly one persistent Guest', async (t) => {
  const db = new BorosDatabase(`boros-test-${crypto.randomUUID()}`)
  const service = profileService(db)
  const reopened = new BorosDatabase(db.name)
  const other = profileService(reopened)
  t.after(async () => { reopened.close(); await db.delete() })
  const [a, b] = await Promise.all([service.initialize(), other.initialize()])
  const guestId = a.activeProfileId
  assert.equal(b.activeProfileId, guestId)
  assert.equal((await service.initialize()).activeProfileId, guestId)
  assert.equal(await db.profiles.count(), 1)
  assert.equal((await service.getProfile(guestId)).age, undefined)
})

test('Guest conversion retains ID, measurements, and local photo', async (t) => {
  const { service, guestId } = await workspace(t)
  const first = await service.save(guestId, 1, { ...input(), weightKg: 70 }, { blob: new Blob(['fixture'], { type: 'image/png' }), width: 1, height: 1 })
  assert.equal(first.kind, 'guest')
  const named = await service.save(guestId, first.revision, input('  Ada  '))
  const snapshot = await service.snapshot(guestId)
  assert.equal(named.id, guestId)
  assert.equal(named.kind, 'named')
  assert.equal(named.name, 'Ada')
  assert.equal(snapshot.measurement?.weightKg, 70)
  assert.equal(snapshot.photo?.id, first.photoId)
})

test('normalized duplicate names are rejected, including concurrent creates', async (t) => {
  const { db, service } = await workspace(t)
  assert.equal(nameKey('  Ａda   LOVELACE '), 'ada lovelace')
  await service.create('Ada Lovelace')
  await assert.rejects(service.create('  Ａda   LOVELACE '), /already exists/)
  const results = await Promise.allSettled([service.create('Grace'), service.create('GRACE')])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(await db.profiles.count(), 3)
  await assert.rejects(service.create('  '), /Enter a profile name/)
})

test('profile reads, photos, and measurements are isolated; selection never retargets a save', async (t) => {
  const { service, guestId } = await workspace(t)
  const other = await service.create('Other')
  await service.save(guestId, 1, { ...input(), weightKg: 60, age: 22 })
  const first = await service.snapshot(guestId), second = await service.snapshot(other.id)
  assert.equal(first.profile.age, 22)
  assert.equal(first.measurement?.weightKg, 60)
  assert.equal(second.profile.age, undefined)
  assert.equal(second.measurement, undefined)
  assert.equal(second.photo, undefined)
  assert.equal((await service.settings())?.activeProfileId, other.id)
})

test('units preserve canonical measurements; latest dated weight is authoritative', async (t) => {
  const { db, service, guestId } = await workspace(t)
  const first = await service.save(guestId, 1, { ...input(), weightKg: toKg(154.3235835294143, 'lb'), heightCm: 177.8 })
  await service.save(guestId, first.revision, { ...input(), weightUnit: 'lb', heightUnit: 'ft', heightCm: 177.8 })
  assert.equal(await db.measurements.count(), 1)
  const current = await service.snapshot(guestId)
  assert.ok(Math.abs(current.measurement!.weightKg - 70) < 0.000001)
  assert.ok(Math.abs(fromKg(current.measurement!.weightKg, 'lb') - 154.3235835294143) < 0.000001)
  assert.equal(current.profile.heightCm, 177.8)
  await service.save(guestId, current.profile.revision, { ...input(), weightKg: 72 })
  assert.equal(await db.measurements.count(), 2)
  assert.equal((await service.latestWeight(guestId))?.weightKg, 72)
})

test('two database connections reject stale writes without partial measurement/photo changes', async (t) => {
  const { db, service, guestId } = await workspace(t)
  const connection = new BorosDatabase(db.name)
  t.after(async () => connection.close())
  const other = profileService(connection)
  await service.save(guestId, 1, { ...input('Saved'), age: 30 })
  await assert.rejects(other.save(guestId, 1, { ...input('Stale'), weightKg: 99 }), ConflictError)
  assert.equal((await service.getProfile(guestId)).name, 'Saved')
  assert.equal(await db.measurements.count(), 0)
})

test('invalid demographics and photos reject without writes', async (t) => {
  const { db, service, guestId } = await workspace(t)
  for (const invalid of [{ age: -1 }, { age: 1.5 }, { heightCm: 0 }, { weightKg: -20 }, { weightKg: NaN }]) {
    await assert.rejects(service.save(guestId, 1, { ...input(), ...invalid }))
  }
  await assert.rejects(service.save(guestId, 1, input(), { blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }), width: 1, height: 1 }))
  assert.equal((await service.getProfile(guestId)).revision, 1)
  assert.equal(await db.measurements.count(), 0)
})

test('transaction failure rolls back profile, photo, and measurement writes', async (t) => {
  const { db, service, guestId } = await workspace(t)
  const fail = () => { throw new Error('Simulated storage full') }
  db.profiles.hook('updating', fail)
  await assert.rejects(service.save(guestId, 1, { ...input('Failed'), weightKg: 70 }, { blob: new Blob(['fixture'], { type: 'image/png' }), width: 1, height: 1 }), /storage full/)
  db.profiles.hook('updating').unsubscribe(fail)
  assert.equal((await service.getProfile(guestId)).name, 'Guest')
  assert.equal(await db.photos.count(), 0)
  assert.equal(await db.measurements.count(), 0)
})

test('inconsistent existing workspace is reported without creating an empty replacement', async (t) => {
  const { db, service, guestId } = await workspace(t)
  await db.settings.delete('workspace')
  await assert.rejects(service.initialize(), /records exist/)
  assert.equal(await db.profiles.count(), 1)
  assert.equal((await db.profiles.get(guestId))?.kind, 'guest')
})

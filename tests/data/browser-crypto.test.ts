import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BrowserCompatibilityError, createId } from '../../src/lib/browser-crypto.ts'
import { sha256 } from '../../src/features/backups/integrity.ts'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { importSession } from '../../src/db/imports.ts'
import { copyExercise, newDay } from '../../src/schemas/plan.ts'
import { measurementDateLabel, measurementInstant } from '../../src/lib/measurement-dates.ts'
import { displayDateTime } from '../../src/lib/display-dates.ts'

const native = globalThis.crypto
const fallback = { getRandomValues: native.getRandomValues.bind(native), subtle: native.subtle } as Crypto
async function withCrypto(value: Crypto | undefined, work: () => Promise<void>) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')!
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value })
  try { await work() } finally { Object.defineProperty(globalThis, 'crypto', descriptor) }
}
const input = { name: '', heightUnit: 'cm' as const, weightUnit: 'kg' as const }

test('native UUID path is preferred; fallback sets RFC v4/variant bits with secure bytes only', () => {
  const id = native.randomUUID()
  assert.equal(createId({ randomUUID: () => id, getRandomValues: () => { throw new Error('Should not be used') } } as unknown as Crypto), id)
  assert.equal(createId({ getRandomValues: (bytes: Uint8Array) => bytes.fill(255) } as unknown as Crypto), 'ffffffff-ffff-4fff-bfff-ffffffffffff')
  const values = Array.from({ length: 1000 }, () => createId(fallback))
  assert.equal(new Set(values).size, values.length)
  for (const value of values) assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('missing and throwing secure random sources report compatibility, never weak IDs', async () => {
  for (const source of [undefined, {} as Crypto, { getRandomValues: () => { throw new Error('Unsupported') } } as unknown as Crypto]) {
    await withCrypto(source, async () => { assert.throws(() => createId(), BrowserCompatibilityError) })
  }
  assert.match(createId({ ...fallback, randomUUID: () => { throw new Error('Unavailable') } } as Crypto), /^[0-9a-f-]{36}$/)
})

test('fallback Guest conversion, imports, photo/weight IDs and independent profiles survive reopening unchanged', async (t) => {
  const db = new BorosDatabase(`boros-test-compat-${native.randomUUID()}`)
  t.after(() => db.delete())
  await withCrypto(fallback, async () => {
    const service = profileService(db), { activeProfileId: id } = await service.initialize()
    const saved = await service.save(id, 1, { ...input, name: 'Ada', weightKg: 70 }, { blob: new Blob(['fixture'], { type: 'image/png' }), width: 1, height: 1 })
    assert.equal(saved.id, id)
    const day = newDay(1); day.exercises.push(copyExercise({ name: 'Squat', sets: [{ reps: { min: 5, max: 5 } }], tagNames: ['Legs'] }))
    const plan = await importSession(id, db).savePlan({ name: 'Imported', days: [day] })
    const before = await service.snapshot(id)
    const other = await service.create('Bea'); assert.equal((await service.snapshot(other.id)).measurement, undefined)
    await service.select(id); db.close(); await db.open()
    assert.equal((await service.initialize()).activeProfileId, id)
    assert.deepEqual(await service.snapshot(id), before)
    assert.equal((await db.plans.get([id, plan.id]))!.days[0].exercises[0].id, day.exercises[0].id)
    assert.equal((await db.plans.where('profileId').equals(other.id).count()), 0)
  })
})

test('unsupported initialization leaves empty stores empty and existing records unchanged', async (t) => {
  const db = new BorosDatabase(`boros-test-unsupported-${native.randomUUID()}`)
  t.after(() => db.delete()); await db.open()
  const service = profileService(db)
  await withCrypto(undefined, async () => { await assert.rejects(service.initialize(), BrowserCompatibilityError) })
  assert.deepEqual(await Promise.all(db.tables.map(table => table.count())), db.tables.map(() => 0))
  const settings = await service.initialize(), before = await service.snapshot(settings.activeProfileId)
  await withCrypto({} as Crypto, async () => { await assert.rejects(service.initialize(), BrowserCompatibilityError) })
  assert.deepEqual(await service.snapshot(settings.activeProfileId), before)
  assert.deepEqual(await service.settings(), settings)
})

test('secure random failure after an inline tag write rolls the whole exercise transaction back', async (t) => {
  const db = new BorosDatabase(`boros-test-random-rollback-${native.randomUUID()}`)
  t.after(() => db.delete()); const { activeProfileId: id } = await profileService(db).initialize()
  let calls = 0
  await withCrypto({ getRandomValues: (bytes: Uint8Array) => { if (++calls > 1) throw new Error('Source failed'); return native.getRandomValues(bytes) } } as unknown as Crypto, async () => {
    await assert.rejects(exerciseService(db).save(id, { name: 'Squat', sets: [{ reps: { min: 5, max: 5 } }], tagNames: ['Legs'] }), BrowserCompatibilityError)
  })
  assert.equal(await db.tags.count(), 0); assert.equal(await db.exercises.count(), 0); assert.equal(await db.profiles.count(), 1)
})

test('hashing retains SHA-256 verification and fails explicitly without subtle', async () => {
  assert.equal(await sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  await withCrypto({ getRandomValues: fallback.getRandomValues } as Crypto, async () => {
    assert.match(createId(), /^[0-9a-f-]{36}$/)
    await assert.rejects(sha256(new Uint8Array([1])), /checksum verification requires Web Crypto.*HTTPS.*Checksums cannot be skipped/)
  })
})

test('display dates omit seconds without mutating precise instants or recorded zone context', () => {
  const instant = measurementInstant(new Date('2025-11-02T06:30:17.456Z')), before = structuredClone(instant)
  const label = measurementDateLabel({ ...instant, id: native.randomUUID(), profileId: native.randomUUID(), weightKg: 70, loggedAt: instant.measuredAt })
  assert.ok(!label.includes(':17')); assert.ok(!label.includes('.456'))
  assert.ok(!displayDateTime(instant.measuredAt, 'UTC').includes(':17'))
  assert.deepEqual(instant, before); assert.equal(instant.measuredAt, '2025-11-02T06:30:17.456Z')
})

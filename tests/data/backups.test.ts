import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import Papa from 'papaparse'
import { BorosDatabase } from '../../src/db/database.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { profileService } from '../../src/db/profiles.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { DraftController } from '../../src/features/train/draft-controller.ts'
import { generateBackup, validateGeneratedArchive, backupFilename } from '../../src/features/backups/archive.ts'
import { backupDataSchema, manifestSchema, SNAPSHOT_POLICY } from '../../src/schemas/backup.ts'
import { spreadsheetCell } from '../../src/features/backups/csv.ts'
import { representativeProfile, photoBytes, strangeText } from '../fixtures/backup-profile.ts'

const version = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version
const json = (value: unknown) => JSON.parse(JSON.stringify(value))
async function database(t: { after: (fn: () => Promise<void>) => void }) { const db = new BorosDatabase(`boros-test-backup-${crypto.randomUUID()}`); t.after(() => db.delete()); return db }
async function source(db: BorosDatabase) { return Promise.all(db.tables.map(async (table) => [table.name, await Promise.all((await table.toArray()).map(async (record) => record.blob ? { ...record, blob: Array.from(new Uint8Array(await record.blob.arrayBuffer())) } : record))])) }

test('complete archive independently reopens with exact records, photo bytes, identities, inventory, counts and SHA-256', async (t) => {
  const db = await database(t), fixture = await representativeProfile(db), before = await source(db), snapshot = await captureProfile(fixture.id, db)
  const { bytes, filename } = await generateBackup(snapshot, version), zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')), data = JSON.parse(await zip.file('data.json')!.async('string'))
  manifestSchema.parse(manifest); backupDataSchema.parse(data)
  assert.equal(manifest.app.version, version); assert.equal(manifest.databaseSchemaVersion, 5); assert.equal(manifest.backupSchemaVersion, 1)
  assert.equal(manifest.profile.id, fixture.id); assert.equal(manifest.snapshotAt, snapshot.capturedAt); assert.equal(manifest.snapshotPolicy, SNAPSHOT_POLICY)
  assert.deepEqual(manifest.counts, { profiles: 1, tags: 2, exercises: 2, plans: 1, schedules: 1, drafts: 3, sessions: 2, measurements: 3, assets: 2 })
  const { databaseVersion, capturedAt, photos, ...canonical } = snapshot; assert.equal(databaseVersion, 5); assert.ok(capturedAt)
  for (const [key, value] of Object.entries(canonical)) assert.deepEqual(data[key], json(value), key)
  assert.equal(data.sessions[0].day.exercises[0].prescription.instructions, strangeText)
  assert.ok(data.sessions.some((s) => s.partial) && data.sessions.some((s) => !s.partial)); assert.equal(data.schedules[0].revisions.length, 2)
  assert.equal(data.measurements.filter((m) => m.photoId === fixture.entry.photoId).length, 2)
  assert.deepEqual(Object.keys(zip.files).sort(), ['manifest.json', ...manifest.inventory.map((item) => item.path)].sort())
  for (const item of manifest.inventory) {
    assert.match(item.path, /^(data\.json|csv\/[a-z_]+\.csv|photos\/[0-9a-f-]+\.png)$/)
    const content = await zip.file(item.path)!.async('uint8array')
    assert.equal(content.byteLength, item.bytes); assert.equal(createHash('sha256').update(content).digest('hex'), item.sha256)
    if (item.path.startsWith('csv/')) { const parsed = Papa.parse(await zip.file(item.path)!.async('string'), { header: true }); assert.deepEqual(parsed.errors, []); assert.equal(parsed.data.length, manifest.csvRows[item.path]) }
  }
  assert.equal(manifest.inventory.some((item) => item.path === 'manifest.json'), false)
  for (const asset of data.assets) { const original = photos.find((p) => p.id === asset.id)!; assert.deepEqual(await zip.file(asset.path)!.async('uint8array'), new Uint8Array(await original.blob.arrayBuffer())); assert.deepEqual(await zip.file(asset.path)!.async('uint8array'), photoBytes) }
  const text = await zip.file('data.json')!.async('string'); assert.ok(!text.includes(fixture.otherId)); assert.ok(!text.includes('Never leak this')); assert.ok(!text.includes('activeProfileId')); assert.ok(!text.includes('restTimers'))
  assert.match(filename, /^Boros-Ada-雪-\d{4}-.*\.zip$/); assert.ok(!/[\\/:*?"<>|]/.test(filename)); assert.deepEqual(await source(db), before)
  const other = await generateBackup(await captureProfile(fixture.otherId, db), version), otherZIP = await JSZip.loadAsync(other.bytes)
  const otherData = JSON.parse(await otherZIP.file('data.json')!.async('string')); assert.equal(otherData.profile.id, fixture.otherId); assert.equal(otherData.plans.length, 0); assert.ok(!JSON.stringify(otherData).includes(fixture.id))
})

test('CSV links/orders/ranges/units/notes and missing versus zero survive; presentation escaping never changes JSON', async (t) => {
  const db = await database(t), { id, exercise, entry, plan } = await representativeProfile(db), output = await generateBackup(await captureProfile(id, db), version), zip = await JSZip.loadAsync(output.bytes)
  const rows = async (name: string) => Papa.parse(await zip.file(`csv/${name}.csv`)!.async('string'), { header: true, skipEmptyLines: true }).data
  const library = (await rows('library_exercises')).find((r) => r.id === exercise.id)
  assert.equal(library.instructions, `'${strangeText}`); assert.equal(library.name, "'=Range 雪"); assert.equal(library.restBetweenSeconds, '0'); assert.equal(library.restAfterSeconds, '')
  const sets = (await rows('library_sets')).filter((r) => r.libraryExerciseId === exercise.id)
  assert.deepEqual(sets.map((r) => [r.setOrder, r.repsMin, r.repsMax, r.rirMin, r.rirMax]), [['1','5','8','0','0'], ['2','10','12','1','3'], ['3','6','6','','']])
  const days = (await rows('days')).filter((r) => r.ownerKind === 'plan'); assert.deepEqual(days.map((r) => r.dayOrder), ['1','2','3','4']); assert.ok(days.every((r) => r.ownerId === plan.id))
  const prescriptions = await rows('prescriptions'); assert.ok(prescriptions.some((r) => r.ownerKind === 'session' && r.instructions === `'${strangeText}`)); assert.ok(prescriptions.some((r) => r.sourceKind === 'exercise' && r.sourceId === exercise.id && r.exerciseOccurrenceId !== exercise.id))
  const results = await rows('session_results'); assert.ok(results.some((r) => r.load === '0' && r.rir === '0' && r.weightKg === '0')); assert.ok(results.some((r) => r.load === '100' && r.unit === 'lb' && Number(r.weightKg) === 100 * .45359237)); assert.ok(results.some((r) => r.skipped === 'true' && r.weightKg === ''))
  assert.ok((await rows('draft_results')).some((r) => r.loadText === '12.' && r.repsText === '' && r.rirText === '0' && r.unit === 'lb'))
  assert.ok((await rows('notes')).some((r) => r.noteKind === 'session' && r.text === `'${strangeText}`))
  assert.equal((await rows('asset_references')).filter((r) => r.photoId === entry.photoId).length, 2)
  const revisions = await rows('schedule_revisions'), mapping = await rows('schedule_assignments'); assert.deepEqual(revisions.map((r) => r.revisionOrder), ['1', '2']); assert.equal(mapping.length, 8); assert.ok(mapping.every((r) => revisions.some((v) => v.id === r.scheduleRevisionId)))
  assert.equal((await rows('profiles'))[0].age, '0')
  assert.equal(JSON.parse(await zip.file('data.json')!.async('string')).exercises.find((e) => e.id === exercise.id).instructions, strangeText)
  for (const value of ['=1', ' +1', '\t-1', '\r@cmd', '\n=1', ' \u00a0＝1']) assert.equal(spreadsheetCell(value), `'${value}`)
  assert.equal(spreadsheetCell(-2), -2); assert.equal(spreadsheetCell(0), 0); assert.equal(spreadsheetCell(null), null)
})

test('minimal Guest exports header-only tables, preserves null/zero and safe filenames without fabricated records', async (t) => {
  const db = await database(t), id = (await profileService(db).initialize()).activeProfileId
  const output = await generateBackup(await captureProfile(id, db), version), zip = await JSZip.loadAsync(output.bytes), data = JSON.parse(await zip.file('data.json')!.async('string'))
  assert.equal(data.profile.name, 'Guest'); assert.equal(data.measurements.length, 0); assert.equal(data.assets.length, 0)
  const csv = await zip.file('csv/progress.csv')!.async('string'); assert.ok(csv.includes('weightKg')); assert.equal(csv.split('\r\n').length, 1)
  await db.profiles.update(id, { age: null } as never)
  const nullable = await generateBackup(await captureProfile(id, db), version), nullZIP = await JSZip.loadAsync(nullable.bytes)
  assert.equal(JSON.parse(await nullZIP.file('data.json')!.async('string')).profile.age, null)
  assert.equal(Papa.parse(await nullZIP.file('csv/profiles.csv')!.async('string'), { header: true }).data[0].age, '')
  assert.match(backupFilename('../CON\\:*?<>|', '2026-01-01T00:00:00.000Z'), /^Boros-CON-/)
})

test('missing assets/required relations, invalid schemas and read/compression/hash failures never mutate source data', async (t) => {
  const db = await database(t), { id } = await representativeProfile(db), before = await source(db), base = await captureProfile(id, db)
  for (const mutate of [(s) => { s.photos = [] }, (s) => { s.tags = [] }, (s) => { s.plans = [] }, (s) => { s.schedules = [] }, (s) => { s.drafts = [] }, (s) => { s.photos[0].profileId = crypto.randomUUID() }, (s) => { s.plans[0].days[0].exercises[0].prescription.sets[0].reps.max = 0 }, (s) => { s.databaseVersion = 6 }]) { const broken = structuredClone(base); mutate(broken); await assert.rejects(generateBackup(broken, version)) }
  const failed = structuredClone(base); failed.photos[0].blob.arrayBuffer = async () => { throw new Error('Simulated photo read failure') }; await assert.rejects(generateBackup(failed, version), /photo read failure/)
  const original = JSZip.prototype.generateAsync
  try { JSZip.prototype.generateAsync = async () => { throw new Error('Compression failed') }; await assert.rejects(generateBackup(base, version), /Compression failed/) } finally { JSZip.prototype.generateAsync = original }
  const digest = crypto.subtle.digest
  try { crypto.subtle.digest = async () => { throw new Error('Hash failed') }; await assert.rejects(generateBackup(base, version), /Hash failed/) } finally { crypto.subtle.digest = digest }
  await assert.rejects(captureProfile(crypto.randomUUID(), db), /no longer exists/); assert.deepEqual(await source(db), before)
})

test('snapshot stays profile-bound and internally consistent across a competing multi-store transaction', async (t) => {
  const db = await database(t), { id, otherId } = await representativeProfile(db), second = new BorosDatabase(db.name); t.after(async () => second.close()); await second.open()
  let update: Promise<unknown> | undefined
  const hook = (profile) => { if (profile.id === id && !update) update = second.transaction('rw', second.profiles, second.plans, async () => { await second.profiles.update(id, { name: 'Changed concurrently' }); await second.plans.where('profileId').equals(id).modify({ name: 'Changed concurrently' }) }); return profile }
  db.profiles.hook('reading', hook)
  const snapshot = await captureProfile(id, db); db.profiles.hook('reading').unsubscribe(hook); await update
  assert.notEqual(snapshot.profile.name, 'Changed concurrently'); assert.notEqual(snapshot.plans[0].name, 'Changed concurrently')
  await profileService(db).select(otherId)
  const result = await generateBackup(snapshot, version), zip = await JSZip.loadAsync(result.bytes), data = JSON.parse(await zip.file('data.json')!.async('string'))
  assert.equal(data.profile.id, id); assert.equal(data.plans[0].name, snapshot.plans[0].name)
  const later = await captureProfile(id, db); assert.equal(later.profile.name, later.plans[0].name)
})

test('pending/failed autosaves are explicitly excluded until committed; saved draft input then appears exactly', async (t) => {
  const db = await database(t), { id, savedDraft } = await representativeProfile(db), controller = new DraftController(savedDraft, sessionService(db)); t.after(async () => controller.dispose())
  const input = structuredClone(savedDraft.input); input.notes = 'Pending only'; controller.change(input)
  const snapshot = await captureProfile(id, db); assert.equal(snapshot.drafts.find((d) => d.id === savedDraft.id)!.input.notes, 'Saved draft\nnotes')
  const fail = () => { throw new Error('Autosave failed') }; db.drafts.hook('updating', fail); await assert.rejects(controller.flush(), /Autosave failed/)
  const result = await generateBackup(await captureProfile(id, db), version); assert.equal(result.manifest.snapshotPolicy, SNAPSHOT_POLICY); assert.equal(controller.input.notes, 'Pending only')
  db.drafts.hook('updating').unsubscribe(fail); await controller.flush()
  assert.equal((await captureProfile(id, db)).drafts.find((d) => d.id === savedDraft.id)!.input.notes, 'Pending only')
})

test('post-generation validation rejects altered inventory, checksum and canonical payload', async (t) => {
  const db = await database(t), id = (await profileService(db).initialize()).activeProfileId, result = await generateBackup(await captureProfile(id, db), version), zip = await JSZip.loadAsync(result.bytes), original = await zip.file('data.json')!.async('string')
  zip.file('data.json', original.replace('Guest', 'Changed')); await assert.rejects(validateGeneratedArchive(await zip.generateAsync({ type: 'uint8array' }), result.manifest, original), /checksum/)
  zip.file('data.json', original); zip.file('unexpected.txt', 'extra'); await assert.rejects(validateGeneratedArchive(await zip.generateAsync({ type: 'uint8array' }), result.manifest, original), /inventory/)
})

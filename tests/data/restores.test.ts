import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { BorosDatabase } from '../../src/db/database.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { restoreService, StaleRestoreError } from '../../src/db/restores.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService, exerciseToInput } from '../../src/db/exercises.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { measurementService, latestMeasurement } from '../../src/db/measurements.ts'
import { generateBackup, sha256 } from '../../src/features/backups/archive.ts'
import { readBackup, inspectZip, RESTORE_LIMITS } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan, ownedStores, stableJSON } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { DraftController } from '../../src/features/train/draft-controller.ts'
import { nameKey } from '../../src/schemas/profile.ts'
import { representativeProfile, photoBytes } from '../fixtures/backup-profile.ts'
import type { ProfileSnapshot } from '../../src/schemas/backup.ts'

// Node has no image decoder; actual decoding is covered in isolated Edge tests.
const decode = async (photo) => { assert.deepEqual(new Uint8Array(await photo.blob.arrayBuffer()), photoBytes); assert.equal(photo.width, 1); assert.equal(photo.height, 1) }
const output = async (snapshot: ProfileSnapshot) => generateBackup(snapshot, 'test')
const read = async (bytes: Uint8Array) => readBackup(bytes, () => {}, decode)
const semantic = (snapshot: ProfileSnapshot) => { const value = canonicalSnapshot(snapshot); for (const key of ownedStores) if (key !== 'photos') value[key].sort((a, b) => a.id.localeCompare(b.id)); value.assets.sort((a, b) => a.id.localeCompare(b.id)); return value }
async function all(db: BorosDatabase) { return Promise.all(db.tables.map(async (table) => [table.name, await Promise.all((await table.toArray()).map(async (r) => r.blob ? { ...r, blob: [...new Uint8Array(await r.blob.arrayBuffer())] } : r))])) }
async function setup(t) { const db = new BorosDatabase(`boros-test-restore-${crypto.randomUUID()}`); t.after(() => db.delete()); const fixture = await representativeProfile(db), original = await captureProfile(fixture.id, db), bytes = (await output(original)).bytes; return { db, fixture, original, bytes, backup: await read(bytes), service: restoreService(db, decode) } }
function extraLog(snapshot: ProfileSnapshot, label: string) {
  const draft = structuredClone(snapshot.drafts.find((d) => d.finalizedAt)!), session = structuredClone(snapshot.sessions.find((s) => s.id === draft.id)!), id = crypto.randomUUID()
  for (const r of [draft, session]) { r.id = id; delete r.occurrence; delete r.occurrenceKey }
  draft.input.notes = label; session.notes = label; session.draftId = id; snapshot.drafts.push(draft); snapshot.sessions.push(session); return id
}
async function overlap(t) {
  const state = await setup(t), imported = structuredClone(state.original), local = structuredClone(state.original)
  imported.profile.age = null as never; imported.profile.heightCm = null as never; imported.profile.photoId = null as never
  imported.plans[0].days[0].exercises[0].prescription.instructions = 'Imported prescription'; local.plans[0].days[0].exercises[0].prescription.instructions = 'Device prescription'
  imported.plans[0].days[0].exercises[0].prescription.sets[0].reps = { min: 6, max: 9 }; local.plans[0].days[0].exercises[0].prescription.sets[0].reps = { min: 2, max: 4 }
  imported.schedules[0].revisions.at(-1)!.mapping.forEach((assignment) => { assignment.weekday = (assignment.weekday + 1) % 7 })
  imported.drafts.find((d) => !d.finalizedAt)!.input.notes = 'Imported unfinished notes'; local.drafts.find((d) => !d.finalizedAt)!.input.notes = 'Device unfinished notes'
  const importedLog = extraLog(imported, 'Imported unique log'), localLog = extraLog(local, 'Device unique log')
  imported.measurements[0].weightKg = 61; local.measurements[0].weightKg = 81
  const extra = { ...structuredClone(imported.plans[0]), id: crypto.randomUUID(), name: 'File-only plan', nameKey: nameKey('File-only plan') }; imported.plans.push(extra)
  const localExtra = { ...structuredClone(local.plans[0]), id: crypto.randomUUID(), name: 'Device-only plan', nameKey: nameKey('Device-only plan') }; local.plans.push(localExtra)
  const fileMeasurement = { ...imported.measurements[0], id: crypto.randomUUID(), measuredAt: '2030-01-01T00:00:00.000Z', weightKg: 62 }; delete fileMeasurement.lastMutationId; delete fileMeasurement.measuredLocal; delete fileMeasurement.timeZone; delete fileMeasurement.offsetMinutes; imported.measurements.push(fileMeasurement)
  const fileExercise = { ...imported.exercises[0], id: crypto.randomUUID(), name: 'File-only exercise', nameKey: 'file-only exercise', activeNameKey: imported.exercises[0].archivedAt ? undefined : 'file-only exercise' }; imported.exercises.push(fileExercise)
  await state.db.transaction('rw', state.db.tables, async () => { for (const key of ownedStores) if (key !== 'photos') await state.db.table(key).bulkPut(local[key]) })
  return { ...state, imported, local, importedLog, localLog, fileMeasurement, backup: await read((await output(imported)).bytes), unrelated: semantic(await captureProfile(state.fixture.otherId, state.db)) }
}

test('new-name restore uses a fresh owner, preserves canonical records and photos through export → import → export', async (t) => {
  const { db, fixture, original, backup, service } = await setup(t), before = await all(db)
  const plan = await service.preview(backup, 'new', 'Restored copy')
  assert.deepEqual(await all(db), before); assert.notEqual(plan.id, backup.data.profile.id)
  await assert.rejects(service.commit(plan, false), /Confirm/); assert.deepEqual(await all(db), before)
  const [id, repeated] = await Promise.all([service.commit(plan, true), service.commit(plan, true)])
  assert.equal(id, repeated); assert.equal(await service.commit(plan, true), id)
  const restored = await captureProfile(id, db), roundTrip = await read((await output(restored)).bytes)
  const expected = canonicalSnapshot(original); expected.profile = { ...expected.profile, id, name: 'Restored copy', nameKey: 'restored copy', kind: 'named' }
  for (const key of ['tags', 'exercises', 'workouts', 'plans', 'schedules', 'drafts', 'sessions', 'measurements', 'assets'] as const) { for (const r of expected[key]) r.profileId = id; expected[key].sort((a,b) => a.id.localeCompare(b.id)); roundTrip.data[key].sort((a,b) => a.id.localeCompare(b.id)) }
  assert.deepEqual(JSON.parse(JSON.stringify(roundTrip.data)), JSON.parse(JSON.stringify(expected)))
  for (const p of restored.photos) assert.deepEqual(new Uint8Array(await p.blob.arrayBuffer()), photoBytes)
  assert.deepEqual(semantic(await captureProfile(fixture.id, db)), semantic(original)); assert.equal((await db.settings.get('workspace'))!.activeProfileId, id)
  const beforeOther = before.find(([key]) => key === 'profiles')![1].find((p) => p.id === fixture.otherId); assert.deepEqual(await db.profiles.get(fixture.otherId), beforeOther)
  assert.equal((await db.restTimers.get('active'))!.profileId, fixture.id, 'another profile timer is untouched')
})

for (const choice of ['device', 'import'] as const) test(`${choice} precedence selects whole families, unique logs, snapshots and independent records; repeat is idempotent`, async (t) => {
  const { db, fixture, backup, service, original, imported, local, importedLog, localLog, fileMeasurement, unrelated } = await overlap(t)
  const preview = await service.preview(backup, choice)
  assert.equal(preview.counts.plans.conflicts, 1)
  assert.equal(preview.counts.sessions[choice === 'device' ? 'skipped' : 'removed'], 3)
  assert.equal(preview.counts.drafts[choice === 'device' ? 'skipped' : 'removed'], 4)
  assert.equal(preview.counts.schedules[choice === 'device' ? 'skipped' : 'removed'], 1)
  const id = await service.commit(preview, true), after = await captureProfile(id, db), winner = choice === 'device' ? local : imported
  const family = (s: ProfileSnapshot) => Object.fromEntries(['plans', 'schedules', 'drafts', 'sessions'].map((key) => [key, s[key].filter((r) => key === 'plans' ? r.id === original.plans[0].id : (r.planId ?? r.sourcePlanId) === original.plans[0].id).map(({ profileId: _profileId, ...r }) => r).sort((a,b) => a.id.localeCompare(b.id))]))
  assert.deepEqual(JSON.parse(JSON.stringify(family(after))), JSON.parse(JSON.stringify(family(winner))))
  assert.equal(after.sessions.some((s) => s.id === localLog), choice === 'device'); assert.equal(after.sessions.some((s) => s.id === importedLog), choice === 'import')
  assert.equal(after.plans.length, 3); assert.ok(after.exercises.some((e) => e.name === 'File-only exercise')); assert.ok(after.exercises.some((e) => e.archivedAt))
  assert.equal(after.profile.age, choice === 'device' ? 0 : null); assert.equal(after.profile.heightCm, choice === 'device' ? 177.8 : null)
  assert.equal(after.measurements.find((m) => m.id === original.measurements[0].id)!.weightKg, choice === 'device' ? 81 : 61)
  assert.equal((await latestMeasurement(db, id))!.id, fileMeasurement.id)
  assert.equal(after.photos.length, choice === 'device' ? 2 : 1, 'unreferenced avatar pruned, shared progress photo kept')
  assert.equal(await db.restTimers.get('active'), undefined); assert.equal(await db.profiles.get(fixture.id), undefined)
  assert.deepEqual(semantic(await captureProfile(fixture.otherId, db)), unrelated)
  const repeat = await service.preview(backup, choice), againId = await service.commit(repeat, true), again = await captureProfile(againId, db)
  const normalizeOwner = (snapshot) => JSON.parse(JSON.stringify(semantic(snapshot)).replaceAll(snapshot.profile.id, 'OWNER'))
  assert.deepEqual(normalizeOwner(again), normalizeOwner(after)); assert.deepEqual(semantic(await captureProfile(fixture.otherId, db)), unrelated)
})

test('replacement only targets normalized names, retires old identity, preserves preferences and ignores source ID targeting', async (t) => {
  const { db, fixture, backup, service, unrelated } = await overlap(t), originalId = fixture.id
  backup.data.profile.name = `  ${backup.data.profile.name.toUpperCase()}  `; backup.data.profile.nameKey = nameKey(backup.data.profile.name)
  assert.equal((await service.matchingProfile(backup))!.id, originalId)
  await db.settings.update('workspace', { theme: 'light' })
  const plan = await service.preview(backup, 'replace'), before = await all(db)
  assert.equal(plan.counts.sessions.removed, 3); await assert.rejects(service.commit(plan, false)); assert.deepEqual(await all(db), before)
  const id = await service.commit(plan, true); assert.equal(await db.profiles.get(originalId), undefined); assert.notEqual(id, originalId)
  assert.equal((await db.settings.get('workspace'))!.theme, 'light'); assert.deepEqual(semantic(await captureProfile(fixture.otherId, db)), unrelated)
  backup.data.profile.name = 'Different name'; backup.data.profile.nameKey = 'different name'
  const newPlan = await service.preview(backup, 'new'); assert.equal(newPlan.targetId, undefined); await service.commit(newPlan, true)
  assert.ok(await db.profiles.get(id)); assert.deepEqual(semantic(await captureProfile(fixture.otherId, db)), unrelated)
})

test('ID/name ambiguities and reused mutation identities are explicit; same-date distinct measurements are retained', async (t) => {
  const { db, backup, service, original } = await setup(t)
  const duplicate = { ...original.plans[0], id: crypto.randomUUID(), name: 'Other plan', nameKey: 'other plan' }; await db.plans.add(duplicate)
  backup.data.plans[0].name = duplicate.name; backup.data.plans[0].nameKey = duplicate.nameKey
  await assert.rejects(service.preview(backup, 'device'), /Ambiguous plan/)
  backup.data.plans[0].name = original.plans[0].name; backup.data.plans[0].nameKey = original.plans[0].nameKey
  const copied = { ...backup.data.measurements.find((m) => m.lastMutationId)!, id: crypto.randomUUID() }; backup.data.measurements.push(copied)
  await assert.rejects(service.preview(backup, 'import'), /Ambiguous measurement/)
  delete copied.lastMutationId
  const plan = await service.preview(backup, 'import'); assert.equal(plan.result.measurements.length, original.measurements.length + 1)
  await assert.rejects(service.preview(backup, 'new', `  ${original.profile.name.toUpperCase()} `), /normalized name/)
})

test('exercise ID/name ambiguity rejects instead of choosing another reusable library record', async (t) => {
  const { db, fixture, backup, service, original } = await setup(t), source = backup.data.exercises.find((e) => e.id === fixture.exercise.id)!
  const another = { ...original.exercises.find((e) => e.id === fixture.exercise.id)!, id: crypto.randomUUID(), name: 'Another movement', nameKey: 'another movement' }
  await db.exercises.add(another); source.name = another.name; source.nameKey = another.nameKey
  const before = await all(db); await assert.rejects(service.preview(backup, 'import'), /Ambiguous exercise/); assert.deepEqual(await all(db), before)
})

test('name matches remap plans/tags while distinct archived exercise IDs and their references stay independent', async (t) => {
  const { original, backup } = await setup(t), file = structuredClone(backup), oldPlan = file.data.plans[0].id, oldExercise = file.data.plans[0].days[0].exercises[0].source!.id, oldTag = file.data.tags[0].id
  const newPlan = crypto.randomUUID(), newExercise = crypto.randomUUID(), newTag = crypto.randomUUID()
  file.data = JSON.parse(JSON.stringify(file.data).replaceAll(oldPlan, newPlan).replaceAll(oldExercise, newExercise).replaceAll(oldTag, newTag))
  const p = await buildRestorePlan(file, original, 'import', crypto.randomUUID(), '', '2026-10-02T00:00:00.000Z')
  assert.equal(p.result.plans[0].id, oldPlan); assert.ok(p.result.exercises.some((e) => e.id === oldExercise)); assert.ok(p.result.tags.some((tag) => tag.id === oldTag))
  assert.equal(p.result.schedules[0].planId, oldPlan); assert.ok(p.result.sessions.every((s) => s.sourcePlanId === oldPlan)); assert.equal(p.result.plans[0].days[0].id, original.plans[0].days[0].id)
  assert.ok(p.result.plans[0].days[0].exercises.some((e) => e.source?.id === newExercise)); assert.ok(p.result.exercises.some(e => e.id === newExercise))
})

test('cross-family schedule/draft collisions remap consistently and repeated merges add no copies', async (t) => {
  const { db, fixture, backup, service, original } = await setup(t), unrelated = structuredClone(original), p = unrelated.plans[0]
  p.id = crypto.randomUUID(); p.name = 'Unrelated family'; p.nameKey = 'unrelated family'
  // Move existing families to an unrelated parent, retaining colliding IDs.
  await db.plans.delete([fixture.id, original.plans[0].id]); await db.plans.add(p)
  await db.schedules.where('profileId').equals(fixture.id).modify({ planId: p.id }); await db.drafts.where('profileId').equals(fixture.id).modify({ sourcePlanId: p.id }); await db.sessions.where('profileId').equals(fixture.id).modify({ sourcePlanId: p.id })
  const first = await service.preview(backup, 'import'), id = await service.commit(first, true), restored = await captureProfile(id, db)
  const importedSchedule = restored.schedules.find((s) => s.planId === original.plans[0].id)!
  assert.notEqual(importedSchedule.id, original.schedules[0].id)
  const importedDrafts = restored.drafts.filter((d) => d.sourcePlanId === original.plans[0].id)
  assert.ok(importedDrafts.every((d) => d.occurrence?.scheduleId === importedSchedule.id && d.occurrenceKey?.startsWith(importedSchedule.id)))
  const second = await service.preview(backup, 'import'); assert.equal(second.result.schedules.length, 2); assert.equal(second.result.sessions.length, original.sessions.length * 2)
  assert.deepEqual(second.result.drafts.map((d) => d.id).sort(), restored.drafts.map((d) => d.id).sort())
})

test('a stale preview and failed transaction cannot partially replace any record, asset or selection', async (t) => {
  const { db, backup, service, fixture } = await setup(t), peer = new BorosDatabase(db.name); t.after(() => peer.close()); await peer.open()
  const stale = await service.preview(backup, 'replace')
  await peer.drafts.update([fixture.id, fixture.savedDraft.id], { revision: fixture.savedDraft.revision + 1 })
  const changed = await all(db); await assert.rejects(service.commit(stale, true), StaleRestoreError); assert.deepEqual(await all(db), changed)
  const preview = await service.preview(backup, 'replace'), fail = () => { throw new Error('Simulated quota failure') }
  db.photos.hook('creating', fail)
  await assert.rejects(service.commit(preview, true), /quota failure/); assert.deepEqual(await all(db), changed)
  db.photos.hook('creating').unsubscribe(fail)
  const id = await service.commit(preview, true); assert.equal(await service.commit(preview, true), id)
})

test('same-size photo byte changes after preview invalidate the transaction even when metadata is unchanged', async (t) => {
  const { db, service, backup, original } = await setup(t), plan = await service.preview(backup, 'replace'), photo = original.photos[0], bytes = new Uint8Array(await photo.blob.arrayBuffer())
  bytes[bytes.length - 1] ^= 1
  await db.photos.update([photo.profileId, photo.id], { blob: new Blob([bytes], { type: photo.blob.type }) })
  const before = await all(db); await assert.rejects(service.commit(plan, true), StaleRestoreError); assert.deepEqual(await all(db), before)
})

test('retired owners block competing tabs, delayed autosaves and stale/new forms even with identical imported revisions', async (t) => {
  const { db, backup, service, fixture, original } = await setup(t), peer = new BorosDatabase(db.name); t.after(() => peer.close()); await peer.open()
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve }), sessions = sessionService(peer), controller = new DraftController(fixture.savedDraft, { ...sessions, update: async (...args) => { await gate; return sessions.update(...args) } }); t.after(() => controller.dispose())
  const input = structuredClone(controller.input); input.notes = 'Recover this unsaved text'; controller.change(input); const pending = controller.flush(); pending.catch(() => {})
  const plan = await service.preview(backup, 'replace'), id = await service.commit(plan, true), before = await all(db); release()
  await assert.rejects(pending, /profile is unavailable/); assert.equal(controller.input.notes, input.notes); assert.equal(controller.status, 'failed')
  await assert.rejects(exerciseService(peer).save(fixture.id, exerciseToInput(original.exercises[0], original.tags)), /profile is unavailable/)
  await assert.rejects(profileService(peer).save(fixture.id, original.profile.revision, { name: 'Stale', weightUnit: 'kg', heightUnit: 'cm' }), /profile is missing/)
  await assert.rejects(measurementService(peer).save(fixture.id, crypto.randomUUID(), undefined, { weightKg: 40, measuredAt: '2026-01-01T00:00:00.000Z' }, undefined, crypto.randomUUID()), /profile is unavailable/)
  await assert.rejects(planService(peer).save(fixture.id, { name: 'Stale new', days: original.plans[0].days }), /profile is unavailable/)
  assert.equal((await db.drafts.get([id, fixture.savedDraft.id]))!.revision, fixture.savedDraft.revision); assert.deepEqual(await all(db), before)
})

test('Clear Data cancel is inert; atomic confirm leaves an empty usable named workspace and preserves every other profile', async (t) => {
  const { db, fixture, service, original } = await setup(t), other = semantic(await captureProfile(fixture.otherId, db)), before = await all(db)
  const plan = await service.preview(undefined, 'clear', undefined, fixture.id); assert.deepEqual(await all(db), before)
  await assert.rejects(service.commit(plan, false)); assert.deepEqual(await all(db), before)
  const fail = () => { throw new Error('Clear interrupted') }; db.profiles.hook('creating', fail); await assert.rejects(service.commit(plan, true), /interrupted/); assert.deepEqual(await all(db), before); db.profiles.hook('creating').unsubscribe(fail)
  const id = await service.commit(plan, true), empty = await captureProfile(id, db)
  for (const key of ownedStores) assert.equal(empty[key].length, 0, key)
  assert.equal(empty.profile.name, original.profile.name); assert.equal(empty.profile.age, undefined); assert.equal(empty.profile.weightUnit, 'lb'); assert.equal(await latestMeasurement(db, id), undefined)
  assert.deepEqual(semantic(await captureProfile(fixture.otherId, db)), other); assert.equal((await profileService(db).initialize()).activeProfileId, id)
  await exerciseService(db).save(id, { name: 'Usable', sets: [{ reps: { min: 1, max: 1 } }], tagNames: [] })
  await assert.rejects(sessionService(db).update(fixture.id, fixture.savedDraft.id, fixture.savedDraft.revision, fixture.savedDraft.input), /profile is unavailable/)
})

async function altered(bytes: Uint8Array, edit: (zip: JSZip, manifest, data) => void | Promise<void>) {
  const zip = await JSZip.loadAsync(bytes), manifest = JSON.parse(await zip.file('manifest.json')!.async('string')), data = JSON.parse(await zip.file('data.json')!.async('string'))
  await edit(zip, manifest, data); zip.file('data.json', JSON.stringify(data)); const entry = manifest.inventory.find((e) => e.path === 'data.json'), payload = new TextEncoder().encode(JSON.stringify(data)); entry.bytes = payload.length; entry.sha256 = await sha256(payload)
  zip.file('manifest.json', JSON.stringify(manifest)); return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
test('upload rejects future versions, wrong ownership/references, missing/checksum/bad assets and manifest/count inconsistencies without writes', async (t) => {
  const { db, bytes } = await setup(t), before = await all(db)
  for (const [edit, pattern] of [
    [(_z, m) => { m.backupSchemaVersion = 99 }, /Update Boros/], [(_z, m) => { m.databaseSchemaVersion = 99 }, /Update Boros/],
    [(_z, _m, d) => { d.drafts[0].sourcePlanId = crypto.randomUUID() }, /missing plan/],
    [(_z, _m, d) => { d.tags[0].profileId = crypto.randomUUID() }, /wrong profile/],
    [(z, _m, d) => { z.remove(d.assets[0].path) }, /inventory|Missing/],
    [(z) => { z.file('csv/profiles.csv', 'tampered', { createFolders: false }) }, /checksum/],
    [async (z, m) => { const text = await z.file('csv/tags.csv')!.async('string'), content = new TextEncoder().encode(text + '\r\n' + text.split('\r\n').at(-1)); z.file('csv/tags.csv', content, { createFolders: false }); const item = m.inventory.find((i) => i.path === 'csv/tags.csv'); item.bytes = content.length; item.sha256 = await sha256(content) }, /CSV structure or row count/],
    [(_z, m) => { m.counts.plans++ }, /counts/],
    [(_z, _m, d) => { d.profile.nameKey = 'fake' }, /normalized/],
    [(_z, _m, d) => { d.exercises[0].tagIds = [crypto.randomUUID()] }, /missing tag/],
    [(_z, _m, d) => { d.drafts[0].activeSourceKey = 'wrong' }, /active identity/],
    [(_z, m) => { m.inventory.push(m.inventory[0]) }, /ambiguous/],
  ] as const) await assert.rejects(read(await altered(bytes, edit)), pattern)
  await assert.rejects(readBackup(bytes, () => {}, async () => { throw new Error('Photo could not decode') }), /decode/)
  assert.deepEqual(await all(db), before)
})

test('raw ZIP guard rejects traversal, duplicate/normalized paths, hidden entries, malformed and oversized directories', async (t) => {
  const { bytes } = await setup(t)
  for (const path of ['../data.json', '/data.json', 'csv/../data.json', 'photos\\a.png', 'DATA.JSON']) { const zip = await JSZip.loadAsync(bytes); zip.file(path, 'bad', { createFolders: false }); await assert.rejects(read(await zip.generateAsync({ type: 'uint8array' })), /Unsafe|ambiguous/) }
  const zip = new JSZip(); zip.file('data.json', '{}'); zip.file('dAta.json', '{}'); await assert.rejects(read(await zip.generateAsync({ type: 'uint8array' })), /ambiguous/)
  const raw = new JSZip(); raw.file('data.json', '{}'); raw.file('dxta.json', '{}'); const duplicate = await raw.generateAsync({ type: 'uint8array' }), text = new TextDecoder('latin1').decode(duplicate)
  for (let at = text.indexOf('dxta.json'); at !== -1; at = text.indexOf('dxta.json', at + 1)) duplicate.set(new TextEncoder().encode('data.json'), at)
  assert.throws(() => inspectZip(duplicate), /Duplicate/)
  assert.throws(() => inspectZip(new Uint8Array(10)), /Invalid ZIP/); assert.throws(() => inspectZip(new Uint8Array(RESTORE_LIMITS.compressed + 1)), /64 MiB/)
  const many = bytes.slice(), view = new DataView(many.buffer); view.setUint16(many.length - 22 + 8, 4097, true); view.setUint16(many.length - 22 + 10, 4097, true); assert.throws(() => inspectZip(many), /entry limit/)
  const large = new JSZip(); large.file('manifest.json', 'x'.repeat(RESTORE_LIMITS.manifest + 1)); const bomb = await large.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  assert.throws(() => inspectZip(bomb), /size limit/)
  // Lie about the inflated size in BOTH directories: actual streaming limit still wins.
  const v = new DataView(bomb.buffer); v.setUint32(22, 1, true); for (let i = 0; i < bomb.length - 46; i++) if (v.getUint32(i, true) === 0x02014b50) v.setUint32(i + 24, 1, true)
  await assert.rejects(read(bomb), /Actual decompressed size limit/)
})

test('planning is deterministic and side-effect free including ID collisions', async (t) => {
  const { backup, original } = await setup(t), id = crypto.randomUUID(), before = stableJSON(canonicalSnapshot(original)), data = stableJSON(backup.data)
  const one = await buildRestorePlan(backup, original, 'device', id, '', '2026-10-02T00:00:00.000Z'), two = await buildRestorePlan(backup, original, 'device', id, '', '2026-10-02T00:00:00.000Z')
  assert.equal(stableJSON(one), stableJSON(two)); assert.equal(stableJSON(canonicalSnapshot(original)), before); assert.equal(stableJSON(backup.data), data)
})

test('different photo bytes sharing an ID preserve both required assets, remap references and remain idempotent', async (t) => {
  const { db, original, fixture } = await setup(t), incoming = structuredClone(original), avatarId = original.profile.photoId!
  const changed = incoming.photos.find((p) => p.id === avatarId)!
  changed.blob = new Blob([photoBytes, new Uint8Array([0])], { type: 'image/png' })
  // A distinct local measurement retains the device's original avatar asset.
  const retained = { ...original.measurements[0], id: crypto.randomUUID(), photoId: avatarId }; delete retained.lastMutationId
  await db.measurements.add(retained)
  const backup = await readBackup((await output(incoming)).bytes, () => {}, async () => {})
  const service = restoreService(db, async () => {}), plan = await service.preview(backup, 'import')
  assert.notEqual(plan.result.profile.photoId, avatarId); assert.equal(plan.result.measurements.find((m) => m.id === retained.id)!.photoId, avatarId)
  const id = await service.commit(plan, true), first = await captureProfile(id, db)
  assert.deepEqual(new Uint8Array(await first.photos.find((p) => p.id === avatarId)!.blob.arrayBuffer()), photoBytes)
  assert.equal(first.photos.find((p) => p.id === first.profile.photoId)!.blob.size, photoBytes.length + 1)
  const again = await service.preview(backup, 'import'); assert.equal(again.result.profile.photoId, first.profile.photoId); assert.equal(again.result.photos.length, first.photos.length)
  assert.ok(await db.profiles.get(fixture.otherId))
})

test('archive limits reject oversized images/expanded totals and Unicode path collisions before extraction', async (t) => {
  const { bytes } = await setup(t), zip = await JSZip.loadAsync(bytes)
  zip.file('ｄａｔａ.json', '{}', { createFolders: false })
  await assert.rejects(read(await zip.generateAsync({ type: 'uint8array' })), /ambiguous/)
  const huge = new JSZip(); huge.file(`photos/${crypto.randomUUID()}.png`, new Uint8Array(RESTORE_LIMITS.asset + 1), { createFolders: false })
  assert.throws(() => inspectZip(oversizedDirectory()), /size limit/)
  function oversizedDirectory() {
    // Update lengths in a small structurally valid ZIP, avoiding a capacity benchmark.
    const copy = bytes.slice(), view = new DataView(copy.buffer)
    for (let i = 0; i < copy.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) {
      const path = new TextDecoder().decode(copy.subarray(i + 46, i + 46 + view.getUint16(i + 28, true)))
      if (path.startsWith('csv/')) { view.setUint32(i + 24, RESTORE_LIMITS.entry, true); view.setUint32(view.getUint32(i + 42, true) + 22, RESTORE_LIMITS.entry, true) }
    }
    return copy
  }
  await assert.rejects(read(await huge.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })), /size limit/)
})

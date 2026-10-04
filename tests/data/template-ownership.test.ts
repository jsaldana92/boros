import { recordCounts } from '../../src/schemas/backup.ts'
import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { exerciseService, exerciseToInput } from '../../src/db/exercises.ts'
import { importSession } from '../../src/db/imports.ts'
import { repairProfileTemplates } from '../../src/db/template-repair.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { restoreService } from '../../src/db/restores.ts'
import { copyExercise, newDay, planToInput } from '../../src/schemas/plan.ts'
import { templateReference } from '../../src/lib/template-ownership.ts'
import { exerciseIdentity } from '../../src/lib/progress-analytics.ts'
import { generateBackup, sha256 } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { csvTables } from '../../src/features/backups/csv.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'

const prescription = (name = 'A', count = 3, reps = 20) => ({ name, sets: Array.from({ length: count }, () => ({ reps: { min: reps, max: reps }, rir: { min: 0, max: 0 } })), tagNames: ['Strength'], notes: 'Library note', restAfterSeconds: 0 })
const input = (name = 'Plan') => ({ name, durationWeeks: 2, days: [{ ...newDay(1), exercises: [copyExercise(prescription()), copyExercise(prescription(' a ', 4, 10)), copyExercise(prescription('B', 1, 8))] }] })
async function setup(t) {
  const db = new BorosDatabase(`boros-test-ownership-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId
  return { db, profiles, id, plans: planService(db), exercises: exerciseService(db), sessions: sessionService(db) }
}
const records = (db) => Promise.all(db.tables.map(async (table) => [table.name, await table.toArray()]))

test('import atomically links repeated prescriptions to first defaults; normalized reuse preserves defaults and valid identities win', async (t) => {
  const { db, id, exercises } = await setup(t), raw = input(), session = importSession(id, db)
  const [saved, retry] = await Promise.all([session.savePlan(raw), session.savePlan(raw)])
  assert.equal(saved.id, retry.id); assert.equal(await db.plans.count(), 1)
  const library = await exercises.library(id), a = library.exercises.find((e) => e.name === 'A')!
  assert.equal(library.exercises.length, 2); assert.equal(await db.tags.count(), 1)
  assert.deepEqual(JSON.parse(JSON.stringify(exerciseToInput(a, library.tags))), prescription())
  assert.deepEqual(saved.days[0].exercises.map((e) => e.prescription), raw.days[0].exercises.map((e) => ({ ...e.prescription, name: e.prescription.name.trim() })))
  assert.equal(templateReference(saved.days[0].exercises[1]), a.id)
  assert.equal(new Set(saved.days[0].exercises.map((e) => e.id)).size, 3)
  const second = input('Other'); second.days[0].exercises[0].prescription = prescription('A', 6, 7)
  second.days[0].exercises[2].source = { kind: 'exercise', id: a.id } // valid identity wins even for a renamed snapshot
  const imported = await importSession(id, db).savePlan(second)
  assert.deepEqual(await exercises.get(id, a.id), a)
  assert.equal(imported.days[0].exercises[0].prescription.sets.length, 6)
  assert.equal(templateReference(imported.days[0].exercises[2]), a.id)
})

test('discarded previews and failure after template creation leave all stores unchanged; retries are safe across connections', async (t) => {
  const { db, id } = await setup(t), before = await records(db), session = importSession(id, db)
  input(); importSession(id, db); assert.deepEqual(await records(db), before)
  const fail = () => { throw Error('disk full after templates') }
  db.plans.hook('updating', fail)
  await assert.rejects(session.savePlan(input()), /disk full/)
  db.plans.hook('updating').unsubscribe(fail)
  assert.deepEqual(await records(db), before)
  const connection = new BorosDatabase(db.name); t.after(() => connection.close())
  await Promise.all([session.savePlan(input()), importSession(id, connection).savePlan(input('Other tab'))])
  assert.equal(await db.exercises.count(), 2); assert.equal(await db.plans.count(), 2)
  assert.equal(await db.tags.count(), 1)
})

test('plan edits, standalone saves, future additions and historical sessions own independent snapshots', async (t) => {
  const { db, id, plans, exercises, sessions } = await setup(t)
  const one = await importSession(id, db).savePlan(input('One')), two = await importSession(id, db).savePlan(input('Two'))
  const draft = await sessions.start(id, one.id, one.days[0].id)
  Object.assign(draft.input.exercises[0].sets[0], { load: '0', reps: '20', rir: '0' })
  const log = await sessions.complete(id, draft.id, draft.revision, draft.input, true)
  const beforeDrafts = await db.drafts.toArray(), template = await exercises.get(id, templateReference(one.days[0].exercises[0])!)
  const edited = planToInput(one); edited.days[0].exercises[0].prescription = prescription('A', 4, 10)
  await plans.save(id, edited, one)
  assert.equal((await exercises.get(id, template.id)).sets.length, 3)
  assert.deepEqual(await plans.get(id, two.id), two)
  const newer = await exercises.save(id, { ...prescription('A', 2, 5), notes: 'Direct library save' }, template)
  assert.equal((await plans.get(id, one.id)).days[0].exercises[0].prescription.sets.length, 4)
  assert.deepEqual(await plans.get(id, two.id), two)
  const choice = (await plans.library(id)).choices.find((item) => item.source.id === newer.id)!
  const copies = [copyExercise(choice.prescription, choice.source), copyExercise(choice.prescription, choice.source)]
  assert.equal(copies[0].prescription.sets.length, 2); assert.notEqual(copies[0].id, copies[1].id)
  assert.deepEqual(await db.sessions.toArray(), [log]); assert.deepEqual(await db.drafts.toArray(), beforeDrafts)
})

test('repair on initialization is idempotent, concurrent and profile-scoped; historical provenance, groups, results and timestamps stay exact', async (t) => {
  const { db, id, profiles, plans, sessions } = await setup(t), raw = input(), groupId = crypto.randomUUID()
  raw.days[0].groups = [{ id: groupId, number: 1, restBetweenRoundsSeconds: 0 }]
  raw.days[0].exercises[0].groupId = raw.days[0].exercises[1].groupId = groupId
  const original = await plans.save(id, raw), draft = await sessions.start(id, original.id, original.days[0].id)
  Object.assign(draft.input.exercises[0].sets[0], { load: '0', reps: '20', rir: '0' })
  await sessions.complete(id, draft.id, draft.revision, draft.input, true)
  const other = await profiles.create('Private'); await plans.save(other.id, input('Private plan'))
  // create selects the new profile; select the original to run its repair.
  const historical = [await db.drafts.toArray(), await db.sessions.toArray()]
  const connection = new BorosDatabase(db.name); t.after(() => connection.close())
  await Promise.all([profiles.select(id), repairProfileTemplates(connection, id)])
  const repaired = await plans.get(id, original.id)
  assert.equal(repaired.revision, original.revision + 1)
  assert.equal(repaired.createdAt, original.createdAt); assert.equal(repaired.updatedAt, original.updatedAt)
  assert.deepEqual(repaired.days, original.days.map((day) => ({ ...day, exercises: day.exercises.map((e) => ({ ...e, templateId: e.prescription.name === 'B' ? raw.days[0].exercises[2].id : raw.days[0].exercises[0].id })) })))
  for (let i = 0; i < 3; i++) assert.equal(exerciseIdentity(original.id, original.days[0].id, original.days[0].exercises[i]), exerciseIdentity(repaired.id, repaired.days[0].id, repaired.days[0].exercises[i]))
  assert.deepEqual([await db.drafts.toArray(), await db.sessions.toArray()], historical)
  assert.equal((await db.exercises.where('profileId').equals(other.id).toArray()).length, 0)
  const before = await records(db); await profiles.initialize(); await profiles.initialize(); assert.deepEqual(await records(db), before)
  await assert.rejects(plans.save(id, planToInput(original), original), /another tab/)
  await profiles.select(other.id); assert.equal((await db.exercises.where('profileId').equals(other.id).toArray()).length, 2)
})

test('repair failures and ambiguous dangling identities roll back; archived plans do not resurrect templates', async (t) => {
  const { db, id, profiles, plans, exercises } = await setup(t), original = await plans.save(id, input())
  const before = await records(db), fail = () => { throw Error('repair disk full') }
  db.plans.hook('updating', fail); await assert.rejects(profiles.initialize(), /disk full/); db.plans.hook('updating').unsubscribe(fail)
  assert.deepEqual(await records(db), before)
  const template = await exercises.save(id, prescription())
  const conflicting = planToInput(original); conflicting.days[0].exercises[0].source = { kind: 'exercise', id: crypto.randomUUID() }
  const current = await plans.save(id, conflicting, original), conflictBefore = await records(db)
  await assert.rejects(profiles.initialize(), /Ambiguous template reference/); assert.deepEqual(await records(db), conflictBefore)
  conflicting.days[0].exercises[0].source = { kind: 'exercise', id: template.id }
  const fixed = await plans.save(id, conflicting, current); await plans.setArchived(id, fixed.id, fixed.revision, true)
  await repairProfileTemplates(db, id)
  const b = (await exercises.library(id)).exercises.find((e) => e.name === 'B')!
  assert.ok(b.archivedAt); assert.deepEqual(await exercises.get(id, template.id), template)
})

test('strict schema 1–3 backups repair only through validated restore; v4 links round trip and repeated merge stays idempotent', async (t) => {
  const { db, id, plans } = await setup(t), original = await plans.save(id, input())
  const snapshot = await captureProfile(id, db), generated = await generateBackup(snapshot, 'ownership-test')
  for (const version of [1, 2, 3, 4] as const) {
    const zip = await JSZip.loadAsync(generated.bytes), data = JSON.parse(await zip.file('data.json')!.async('string'))
    data.backupSchemaVersion = version
    if (version < 3) { delete data.profile.timeZone; delete data.profile.selectedPlanIds }
    if (version === 1) delete data.plans[0].durationWeeks
    validateBackupData(data)
    const payload = new Map([['data.json', JSON.stringify(data)], ...csvTables(data).map((f) => [f.path, f.text] as [string, string])])
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')); manifest.backupSchemaVersion = version; manifest.counts = recordCounts(data)
    manifest.inventory = await Promise.all([...payload].map(async ([path, text]) => ({ path, bytes: new TextEncoder().encode(text).length, sha256: await sha256(new TextEncoder().encode(text)), mediaType: path === 'data.json' ? 'application/json' : 'text/csv; charset=utf-8' })))
    manifest.csvRows = Object.fromEntries(csvTables(data).map((f) => [f.path, f.rows]))
    const oldZip = new JSZip(); for (const [path, text] of payload) oldZip.file(path, text, { createFolders: false }); oldZip.file('manifest.json', JSON.stringify(manifest))
    const backup = await readBackup(await oldZip.generateAsync({ type: 'uint8array' })), service = restoreService(db)
    const before = await records(db), preview = await service.preview(backup, 'new', 'Version ' + version)
    assert.deepEqual(await records(db), before); assert.equal(preview.result.exercises.length, 2)
    assert.match(preview.warnings.join(' '), /original AI defaults/i)
    const owner = await service.commit(preview, true), restored = await captureProfile(owner, db)
    assert.equal(templateReference(restored.plans[0].days[0].exercises[0]), original.days[0].exercises[0].id)
    assert.equal(restored.plans[0].createdAt, original.createdAt); assert.equal(restored.plans[0].updatedAt, original.updatedAt)
    const round = await readBackup((await generateBackup(restored, 'test')).bytes)
    assert.equal(round.manifest.backupSchemaVersion, 5); assert.deepEqual(round.data.plans, JSON.parse(JSON.stringify(restored.plans)))
    // Merge the original old backup again into its matching original profile.
    let target = id
    for (let repeat = 0; repeat < 2; repeat++) { const merge = await service.preview(backup, 'import'); target = await service.commit(merge, true); assert.equal((await captureProfile(target, db)).exercises.length, 2) }
    // Old contracts must not silently accept the v4 reference field.
    data.plans[0].days[0].exercises[0].templateId = original.days[0].exercises[0].id
    assert.throws(() => validateBackupData(data), version < 4 ? /Unrecognized key/ : /missing template/)
  }
})

import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { progressService } from '../../src/db/progress.ts'
import { deriveProgress, exerciseIdentity, legacyPlanKey, exerciseCounts, performanceStats, selectPerformances } from '../../src/lib/progress-analytics.ts'
import { progressFixture } from '../fixtures/progress.ts'
import { toKg } from '../../src/schemas/profile.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan, stableJSON } from '../../src/features/backups/restore-plan.ts'

async function setup(t: { after: (f: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-group4-${crypto.randomUUID()}`); t.after(() => db.delete())
  return { db, ...(await progressFixture(db)), service: progressService(db) }
}
test('Overall uses only library IDs while legacy plan snapshots retain separate repeated and superset occurrences', async (t) => {
  const { service, id, press, unrelated, alpha, beta } = await setup(t), data = await service.read(id)
  assert.equal(data.plans.length, 2); assert.ok(data.plans.every((p) => p.legacy))
  assert.equal(data.items.find((i) => i.key === 'library:' + press.id)!.name, 'Renamed press')
  assert.equal(data.items.find((i) => i.key === 'library:' + unrelated.id)!.name, 'Press')
  assert.equal(data.items.length, 4); assert.equal(data.plans.find((p) => p.id === legacyPlanKey(alpha.id))!.items.length, 6)
  assert.equal(data.plans.find((p) => p.id === legacyPlanKey(beta.id))!.items.length, 5)
  assert.equal(selectPerformances(data, 'library:' + press.id).length, 6)
  assert.equal(selectPerformances(data, 'library:' + unrelated.id).length, 1)
})
test('actual dates, paired extrema, mixed units and zero; complete exercises are not partial performances', async (t) => {
  const { service, id, press, alpha, first, latest } = await setup(t), data = await service.read(id), key = 'library:' + press.id
  const all = performanceStats(selectPerformances(data, key)), plan = data.plans.find((p) => p.id === legacyPlanKey(alpha.id))!
  assert.equal(all.sets.length, 14); assert.equal(all.starting.length, 2); assert.equal(all.latest.length, 2)
  assert.deepEqual(all.starting.flatMap((p) => p.sets.map((s) => [s.result.weightKg, s.result.reps])), [[0,5],[10,6],[toKg(100,'lb'),7],[20,6]])
  assert.equal(all.starting[0].session.id, first.id); assert.equal(all.latest[0].session.id, latest.id)
  assert.equal(all.maximum!.result.weightKg, 61); assert.equal(all.maximum!.result.reps, 7)
  assert.equal(all.minimum!.result.weightKg, 0); assert.equal(all.minimum!.result.reps, 5)
  assert.equal(all.repsMaximum!.result.reps, 7); assert.equal(all.repsMaximum!.result.weightKg, toKg(100, 'lb'))
  assert.equal(plan.daysCompleted, 2); assert.equal(plan.exercisesCompleted, 6)
  assert.deepEqual(exerciseCounts(data, key), { completed: 5, skipped: 0 })
  const firstItem = plan.items.find((i) => i.key.includes(first.day.exercises[0].id))!
  assert.equal(selectPerformances(data, firstItem.key, plan.id).length, 2)
})
test('profile scope excludes foreign results, updates/deletes recompute, ties use time then stable session/occurrence/set order', async (t) => {
  const { db, service, id, otherId, press, first } = await setup(t)
  assert.equal((await service.read(otherId)).performances[0].sets[0].result.weightKg, 999)
  const data = deriveProgress(id, await db.plans.toArray(), await db.exercises.toArray(), await db.sessions.toArray())
  assert.equal(data.sessions.length, 3); assert.equal(data.items.some((i) => i.name.includes('Private')), false)
  const corrected = structuredClone(first); corrected.exercises[0].sets[0] = { skipped: false, weightKg: 4, load: 4, unit: 'kg', reps: 2 }
  await db.sessions.put(corrected); assert.equal(performanceStats(selectPerformances(await service.read(id), 'library:' + press.id)).minimum!.result.weightKg, 4)
  await db.sessions.delete([id, first.id]); assert.equal((await service.read(id)).sessions.length, 2)
  const one = { ...first, id: '00000000-0000-4000-8000-000000000001' }, two = { ...first, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }
  const tied = deriveProgress(id, [], [], [two, one]), stats = performanceStats(selectPerformances(tied, 'library:' + press.id))
  assert.equal(stats.maximum!.performance.session.id, one.id); assert.equal(stats.starting[0].session.id, one.id); assert.equal(stats.latest[0].session.id, two.id)
  await db.profiles.delete(id); await assert.rejects(service.read(id), /unavailable/)
})
test('explicit plan-copy identity works without consulting mutable sources or guessing by name', () => {
  const occurrence = { id: 'a', prescription: { name: 'Same', sets: [{ reps: { min: 1, max: 1 } }], tagNames: [] } }
  const copied = { ...occurrence, id: 'b', source: { kind: 'plan' as const, id: 'original', dayId: 'day', occurrenceId: 'a' } }
  assert.equal(exerciseIdentity('original', 'day', occurrence), exerciseIdentity('copy', 'other', copied))
  assert.notEqual(exerciseIdentity('other', 'day', occurrence), exerciseIdentity('original', 'day', occurrence))
  assert.equal(exerciseIdentity('copy', 'other', { ...copied, source: { ...copied.source, libraryId: 'known' } }), 'library:known')
})

test('export, new/replace/both-merge restoration preserve underlying results, measurements and derived statistics', async (t) => {
  const { db, id, service } = await setup(t), snapshot = await captureProfile(id, db)
  const backup = await readBackup((await generateBackup(snapshot, 'test')).bytes), baseline = await service.read(id)
  const summary = (data: typeof baseline) => ({ plans: data.plans.map((p) => [p.name, p.daysCompleted, p.exercisesCompleted]), work: data.items.map((i) => [i.name, performanceStats(selectPerformances(data, i.key)).sets.map((s) => [s.result.weightKg, s.result.reps, s.performance.session.completedAt])]) })
  for (const choice of ['new', 'replace', 'device', 'import'] as const) {
    const { result } = await buildRestorePlan(backup, choice === 'new' ? undefined : snapshot, choice, crypto.randomUUID(), 'Restored', new Date().toISOString())
    const data = deriveProgress(result.profile.id, result.plans, result.exercises, result.sessions)
    assert.deepEqual(summary(data), summary(baseline))
    assert.equal(stableJSON(result.measurements.map(({ profileId: _owner, ...entry }) => entry)), stableJSON(snapshot.measurements.map(({ profileId: _owner, ...entry }) => entry)))
    assert.equal(stableJSON(result.sessions.map(({ profileId: _owner, ...entry }) => entry)), stableJSON(snapshot.sessions.map(({ profileId: _owner, ...entry }) => entry)))
  }
  assert.equal(db.verno, 12); assert.equal(backup.manifest.backupSchemaVersion, 18)
})

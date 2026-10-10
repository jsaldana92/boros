import { newCircuit as oldCircuit } from '../../src/schemas/circuit-legacy.ts'
import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService, exerciseToInput } from '../../src/db/exercises.ts'
import { planService } from '../../src/db/plans.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { repairProfileTemplates } from '../../src/db/template-repair.ts'
import { libraryDeleteService } from '../../src/db/library-delete.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { exerciseInputSchema } from '../../src/schemas/exercise.ts'
import { copyExercise, duplicateDay, planInputSchema, planToInput } from '../../src/schemas/plan.ts'
import { copyWorkout } from '../../src/schemas/workout.ts'
import { newCircuit } from '../../src/schemas/circuit.ts'
import { startInterval, initialInterval, advanceInterval, intervalCommand, intervalStateSchema } from '../../src/schemas/interval-session.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { importSession } from '../../src/db/imports.ts'
import { parseInterchange, toImportDraft, formattingInstructions } from '../../src/features/create/interchange.ts'
import { filterExercises } from '../../src/features/create/library.ts'
import { deriveProgress } from '../../src/lib/progress-analytics.ts'
import { photoBytes } from '../fixtures/backup-profile.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { occurrences } from '../../src/schemas/schedule.ts'
import { addDays } from '../../src/lib/calendar-dates.ts'
import JSZip from 'jszip'
import { sha256 } from '../../src/features/backups/integrity.ts'
import { csvTables } from '../../src/features/backups/csv.ts'
import { recordCounts } from '../../src/schemas/backup.ts'
import { stripTrainingFields } from '../fixtures/training-compatibility.ts'
const uid = () => crypto.randomUUID()
const target = (name = 'Sprint', activeSeconds = 20, recoverySeconds = 10) => ({ trainingType: 'interval' as const, name, sets: [], tagNames: [], activeSeconds, recoverySeconds })
const strength = (name = 'Lift') => ({ name, sets: [{ reps: { min: 5, max: 5 } }], tagNames: [] })
const day = (names = ['Sprint'], active = 20, recovery = 10) => { const exercises = names.map(n => copyExercise(target(n, active, recovery))); return { trainingType: 'interval' as const, id: uid(), name: 'Intervals', exercises, circuits: [{ ...newCircuit(1), exerciseIds: exercises.map(e => e.id) }] } }
async function fixture(t) { const db = new BorosDatabase('boros-test-interval-' + uid()); t.after(() => db.delete()); const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId; return { db, id, profiles, exercises: exerciseService(db), plans: planService(db), workouts: workoutService(db), sessions: sessionService(db) } }

const begin = (value, at) => advanceInterval(startInterval(initialInterval(value), value, value.circuits.length > 1 ? 'continuous' : 'circuit', value.circuits.length === 1 ? value.circuits[0].id : undefined, uid(), uid(), false, at - 10000), at)
async function beginDraft(f, draft, notes?) {
  const now = Date.now, at = now(); let next
  try { Date.now = () => at - 10000; next = await f.sessions.startInterval(f.id, draft.id, draft.revision, 'circuit', draft.day.circuits[0].id, false, notes) } finally { Date.now = now }
  return f.sessions.intervalAction(f.id, next.id, next.revision, 'tick')
}

test('typed prescriptions reject missing/zero activity, missing recovery, mixed workouts/plans and invalid counts', () => {
  for (const patch of [{ activeSeconds: 0 }, { activeSeconds: undefined }, { recoverySeconds: undefined }, { recoverySeconds: -1 }, { activeSeconds: 1.5 }, { sets: [{ reps: { min: 5, max: 5 } }] }]) assert.equal(exerciseInputSchema.safeParse({ ...target(), ...patch }).success, false)
  assert.equal(exerciseInputSchema.parse(target('Zero rest', 1, 0)).recoverySeconds, 0)
  const value = day(); assert.equal(planInputSchema.safeParse({ name: 'Mixed', days: [value] }).success, false)
  assert.equal(planInputSchema.safeParse({ trainingType: 'interval', name: 'Correct', days: [value] }).success, true)
  value.circuits[0].roundsPerSet = 0; assert.equal(planInputSchema.safeParse({ trainingType: 'interval', name: 'Bad', days: [value] }).success, false)
})
test('three activities take 45 seconds; additive circuit rest starts next activity at exactly 75 seconds', () => {
  const value = day(['Jumping Jacks', 'Push-ups', 'Sprint'], 10, 5), next = duplicateDay(day(['Next'], 10, 0)); value.circuits[0].restAfterCircuitSeconds = 30
  value.exercises.push(...next.exercises); value.circuits.push(...next.circuits!)
  const start = Date.parse('2026-10-07T12:00:00Z'), running = begin(value, start)
  const rest = advanceInterval(running, start + 45000); assert.equal(rest.phases.find(p => p.id === rest.phaseId)?.kind, 'circuit-rest'); assert.equal(rest.results.length, 6)
  const final = advanceInterval(running, start + 75000); assert.equal(final.phases.find(p => p.id === final.phaseId)?.exerciseName, 'Next'); assert.equal(final.elapsedMs, 0)
  intervalStateSchema.parse(final)
})
test('Sprint 5 rounds x 3 sets yields 15 activities, 300 active and 150 recovery; explicit final circuit rest and preparation', () => {
  const value = day(); value.circuits[0] = {...oldCircuit(1), id:value.circuits[0].id, exerciseIds:value.circuits[0].exerciseIds}; Object.assign(value.circuits[0], { roundsPerSet: 5, sets: 3, restBetweenSetsSeconds: 7, restAfterCircuitSeconds: 100 })
  const phases = initialInterval(value).phases
  assert.equal(phases.filter(p => p.kind === 'active').length, 15)
  assert.equal(phases.filter(p => p.kind === 'active').reduce((n, p) => n + p.durationSeconds, 0), 300)
  assert.equal(phases.filter(p => p.kind === 'recovery').reduce((n, p) => n + p.durationSeconds, 0), 150)
  assert.equal(phases.reduce((n, p) => n + p.durationSeconds, 0), 574)
})
test('pause/resume, immediate zero rest, live elapsed reconciliation and reload checkpoint do not invent closed time', () => {
  const value = day(['A', 'A'], 10, 0), start = Date.now(), running = begin(value, start)
  const paused = intervalCommand(running, 'pause', start + 4000); assert.equal(paused.elapsedMs, 4000)
  const resumed = intervalCommand(paused, 'resume', start + 100000), next = advanceInterval(resumed, start + 106000)
  assert.equal(next.results.length, 1); assert.equal(next.elapsedMs, 0)
  const checkpoint = advanceInterval(resumed, start + 103000), recovered = intervalCommand(checkpoint, 'recover', start + 9999999)
  assert.equal(recovered.elapsedMs, 7000); assert.equal(recovered.results.length, 0); assert.equal(recovered.status, 'paused')
  assert.equal(advanceInterval(resumed, start + 9999999).status, 'finished')
})
test('core filters are structured, legacy Interval tag remains ordinary metadata; saves/merge enforce type and profile ownership', async t => {
  const f = await fixture(t), a = await f.exercises.save(f.id, { ...strength(), tagNames: [' Interval '] }), b = await f.exercises.save(f.id, target())
  assert.equal(a.trainingType, 'strength'); assert.equal((await f.db.tags.toArray())[0].name, 'Interval')
  assert.deepEqual(filterExercises([a, b], '', 'az', ['core:interval'], false).map(e => e.id), [b.id])
  await assert.rejects(f.exercises.save(f.id, { ...target(), name: a.name }, a), /mixed|converted/)
  await assert.rejects(f.exercises.merge(f.id, { ...a, input: exerciseToInput(a, await f.db.tags.toArray()) }, b, a.id, uid()), /mixed|converted/)
  const other = await f.profiles.create('Other')
  const foreign = day(); foreign.exercises[0].source = { kind: 'exercise', id: b.id }
  await assert.rejects(f.workouts.save(other.id, foreign), /source.*profile/i)
})
test('publication is atomic, independent, names suffixed; unchanged source reused, later saves idempotent and deleted sources never resurrected', async t => {
  const f = await fixture(t), w = await f.workouts.save(f.id, day()), copied = copyWorkout(w)
  const p = await f.plans.save(f.id, { trainingType: 'interval', name: 'Cycle', durationWeeks: 2, days: [copied, copyWorkout(w)] })
  assert.equal((await f.workouts.library(f.id)).length, 1); assert.equal(p.days[0].publishedWorkoutId, w.id)
  const changed = planToInput(p); changed.days[0].exercises[0].prescription = target('Sprint', 30, 5)
  const saved = await f.plans.save(f.id, changed, p); assert.equal((await f.workouts.library(f.id)).length, 1); assert.equal((await f.workouts.get(f.id, w.id)).exercises[0].prescription.activeSeconds, 20)
  const fresh = copyWorkout(w); fresh.exercises[0].prescription = target('Sprint', 40, 0)
  const variant = await f.plans.save(f.id, { trainingType: 'interval', name: 'Variant', durationWeeks: 2, days: [fresh] }); assert.equal((await f.workouts.get(f.id, variant.days[0].publishedWorkoutId!)).name, 'Intervals (1)'); assert.equal(variant.days[0].name, 'Intervals')
  const deletion = libraryDeleteService(f.db); await deletion.remove(await deletion.preview(f.id, 'workout', w.id, w.revision)); await repairProfileTemplates(f.db, f.id); await repairProfileTemplates(f.db, f.id)
  assert.equal(await f.db.workouts.get([f.id, w.id]), undefined); assert.equal((await f.workouts.library(f.id)).length, 1)
  await f.plans.save(f.id, planToInput(saved), await f.plans.get(f.id, saved.id)); assert.equal((await f.workouts.library(f.id)).length, 1)
  const before = await f.db.workouts.count(), originalPut = f.db.plans.put.bind(f.db.plans); f.db.plans.put = async () => { throw new Error('Injected failure') }
  await assert.rejects(f.plans.save(f.id, { trainingType: 'interval', name: 'Rollback', durationWeeks: 2, days: [day()] }), /Injected/); f.db.plans.put = originalPut; assert.equal(await f.db.workouts.count(), before)
})
test('Interval custom session saves partial actuals/template atomically and idempotently, with stale edits rejected and Strength analytics excluded', async t => {
  const f = await fixture(t), e = await f.exercises.save(f.id, target()), draft = await f.sessions.startStandalone(f.id, undefined, 'interval')
  const value = day(); value.id = draft.day.id; value.exercises[0].source = { kind: 'exercise', id: e.id }
  let saved = await f.sessions.amendInterval(f.id, draft.id, draft.revision, value)
  saved = await beginDraft(f, saved)
  const now = Date.now; Date.now = () => now() + 3000
  try { saved = await f.sessions.intervalAction(f.id, saved.id, saved.revision, 'pause') } finally { Date.now = now }
  await assert.rejects(f.sessions.intervalAction(f.id, saved.id, saved.revision - 1, 'resume'), /another tab/)
  assert.equal(await f.db.sessions.count(), 0); await assert.rejects(f.sessions.complete(f.id, saved.id, saved.revision, saved.input, false), /partial/)
  const session = await f.sessions.complete(f.id, saved.id, saved.revision, saved.input, true, new Date().toISOString(), { name: 'Timed custom' })
  assert.equal(session.partial, true); assert.equal(session.exercises.length, 0); assert.equal(session.interval!.results[0].status, 'partial'); assert.ok(session.interval!.results[0].elapsedMs < 20000)
  assert.equal((await f.sessions.complete(f.id, saved.id, saved.revision, saved.input, true)).id, session.id); assert.equal(await f.db.sessions.count(), 1)
  assert.equal((await f.workouts.library(f.id)).length, 1)
  const analytics = deriveProgress(f.id, [], [e], [session]); assert.equal(analytics.performances.length, 0); assert.equal(analytics.items.length, 0)
  const snapshot = await captureProfile(f.id, f.db); validateBackupData(canonicalSnapshot(snapshot))
  const archive = await readBackup((await generateBackup(snapshot, 'test')).bytes, () => {}, async () => {})
  assert.equal(archive.data.backupSchemaVersion, 18); assert.equal(archive.manifest.databaseSchemaVersion, 12); assert.ok(archive.manifest.inventory.some(i => i.path === 'csv/interval_results.csv'))
  for (const choice of ['new', 'replace', 'device', 'import'] as const) { const result = await buildRestorePlan(archive, choice === 'new' ? undefined : snapshot, choice, uid(), 'Restored', new Date().toISOString()); validateBackupData(canonicalSnapshot(result.result)); assert.deepEqual(JSON.parse(JSON.stringify(result.result.sessions[0].interval)), JSON.parse(JSON.stringify(session.interval))) }
})
test('v6 AI Interval imports use manual circuit schema and publish both libraries; older Strength meanings stay intact', async t => {
  const f = await fixture(t)
  for (const kind of ['exercise', 'workout', 'plan'] as const) {
    const instructions = formattingInstructions(kind, 'interval'), json = instructions.slice(instructions.indexOf('\n{') + 1), parsed = parseInterchange(json)
    assert.deepEqual(parsed.issues, []); const draft = toImportDraft(parsed.value!)
    assert.equal(draft.input.trainingType, 'interval')
    if (draft.kind === 'plan') { const importing = importSession(f.id, f.db); const plan = await importing.savePlan(draft.input); assert.equal((await importing.savePlan(draft.input)).id, plan.id); assert.equal(await f.db.workouts.count(), 1); assert.equal(await f.db.exercises.count(), 1); validateBackupData(canonicalSnapshot(await captureProfile(f.id, f.db))) }
  }
  assert.ok(parseInterchange(JSON.stringify({ schemaVersion: 6, trainingType: 'interval', kind: 'exercise', exercise: { name: 'Missing', activeSeconds: 10 } })).issues.some(i => i.path.includes('recoverySeconds')))
})
test('v7 to v8 upgrade keeps IDs, active selection, legacy tag metadata, measurements/photo bytes and records without inventing durations', async t => {
  const f = await fixture(t), profile = await f.db.profiles.get(f.id); await f.profiles.save(f.id, profile!.revision, { name: 'Owner', weightUnit: 'kg', heightUnit: 'cm', weightKg: 70 }, { blob: new Blob([photoBytes], { type: 'image/png' }), width: 1, height: 1 })
  const e = await f.exercises.save(f.id, { ...strength(), tagNames: ['Interval'] }), stores = await Promise.all(f.db.tables.map(async table => [table.name, await table.toArray()] as const))
  const legacyName = 'boros-test-legacy-interval-' + uid(), legacy = new Dexie(legacyName); legacy.version(7).stores(Object.fromEntries(f.db.tables.map(table => [table.name, [table.schema.primKey.src, ...table.schema.indexes.map(i => i.src)].join(',')]))); await legacy.open()
  for (const [name, rows] of stores) await legacy.table(name).bulkPut(rows.map(r => { const value = { ...r }; delete value.trainingType; return value }))
  legacy.close(); const upgraded = new BorosDatabase(legacyName); t.after(() => upgraded.delete()); await upgraded.open()
  assert.equal((await upgraded.exercises.get([f.id, e.id]))?.trainingType, 'strength'); assert.equal((await upgraded.settings.get('workspace'))?.activeProfileId, f.id)
  assert.deepEqual(await upgraded.tags.toArray(), await f.db.tags.toArray()); assert.deepEqual(await upgraded.measurements.toArray(), await f.db.measurements.toArray())
  assert.deepEqual(new Uint8Array(await (await upgraded.photos.toArray())[0].blob.arrayBuffer()), photoBytes)
})

test('pending amendments retain actuals and source identity, never add exercises retroactively, and reject incompatible services', async t => {
  const f = await fixture(t), a = await f.exercises.save(f.id, target('A', 10, 0)), b = await f.exercises.save(f.id, target('B', 7, 0)), lift = await f.exercises.save(f.id, strength())
  const workout = day(['A'], 10, 0); workout.circuits[0].repeat = 2; workout.exercises[0].source = { kind: 'exercise', id: a.id }
  const w = await f.workouts.save(f.id, workout)
  let draft = await f.sessions.startStandalone(f.id, w.id)
  const time = Date.now(), original = Date.now; Date.now = () => time
  try {
    draft = await beginDraft(f, draft)
    Date.now = () => time + 10000
    draft = await f.sessions.intervalAction(f.id, draft.id, draft.revision, 'pause')
    // A retained stopped checkpoint from the previous contract remains editable.
    draft.interval = { ...draft.interval!, status: 'stopped', phaseId: undefined, execution: undefined, elapsedMs: 0, anchorAt: undefined }; await f.db.drafts.put(draft)
    assert.equal(draft.interval!.results.length, 1)
    const changed = structuredClone(draft.day), added = copyExercise(target('B', 7, 0), { kind: 'exercise', id: b.id })
    changed.exercises.push(added); changed.circuits![0].exerciseIds.push(added.id)
    const next = await f.sessions.amendInterval(f.id, draft.id, draft.revision, changed)
    assert.deepEqual(next.interval!.results, draft.interval!.results)
    assert.equal(next.interval!.phases.filter(p => p.exerciseName === 'B' && p.kind === 'active').length, 2)
    assert.equal(next.interval!.results[0].phase.templateId, a.id)
    await assert.rejects(f.sessions.replaceExercise(f.id, next.id, next.revision, next.day.exercises[0].id, lift.id, lift.revision), /mixed/)
    await assert.rejects(f.sessions.update(f.id, next.id, next.revision, next.input, { day: next.day, structure: next.structure! }), /Interval/)
    const replacement = structuredClone(next.day); replacement.exercises[0] = { ...copyExercise(target('B', 7, 0), { kind: 'exercise', id: b.id }), id: replacement.exercises[0].id }
    const amended = await f.sessions.amendInterval(f.id, next.id, next.revision, replacement)
    assert.equal(amended.interval!.results[0].phase.exerciseName, 'A')
    assert.equal(amended.interval!.phases[2].exerciseName, 'B')
    const saved = await f.sessions.complete(f.id, amended.id, amended.revision, amended.input, true)
    const deletion = libraryDeleteService(f.db); await deletion.remove(await deletion.preview(f.id, 'exercise', a.id, a.revision))
    const after = await f.db.sessions.get([f.id, saved.id])
    assert.ok(after); assert.equal(after.interval!.phases.some(p => p.templateId === a.id), false)
    assert.ok(after.interval!.phases.some(p => p.templateId === b.id))
    validateBackupData(canonicalSnapshot(await captureProfile(f.id, f.db)))
  } finally { Date.now = original }
})

test('unique-week runs freeze started snapshots, apply future edits, preserve generic completion and reset/discard scope', async t => {
  const f = await fixture(t), first = day(['One'], 1, 0), second = day(['Two'], 2, 0)
  const plan = await f.plans.save(f.id, { trainingType: 'interval', name: 'Alternating', durationWeeks: 4, days: [first, second], weeks: [{ id: uid(), dayIds: [first.id] }, { id: uid(), dayIds: [second.id] }] })
  const weekly = weeklyService(f.db), [run] = await weekly.activate(f.id, plan.id)
  const events = occurrences(run, run.startWeek, addDays(run.startWeek, 27)); assert.deepEqual(events.map(e => e.day.name), ['Intervals', 'Intervals', 'Intervals', 'Intervals'])
  assert.deepEqual(events.map(e => e.day.exercises[0].prescription.activeSeconds), [1, 2, 1, 2])
  const opened = await f.sessions.openOccurrence(f.id, run.id, first.id, events[0].ref.scheduledDate)
  const raw = planToInput(plan); raw.days[0].exercises[0].prescription = target('One', 3, 0)
  await f.plans.save(f.id, raw, plan)
  assert.equal((await f.sessions.getDraft(f.id, opened.draft!.id)).day.exercises[0].prescription.activeSeconds, 1)
  assert.equal(occurrences((await f.db.schedules.get([f.id, run.id]))!, addDays(run.startWeek, 14), addDays(run.startWeek, 20))[0].day.exercises[0].prescription.activeSeconds, 3)
  const original = Date.now, at = Date.now(); Date.now = () => at
  try {
    let draft = await beginDraft(f, opened.draft!)
    Date.now = () => at + 1000; draft = await f.sessions.intervalAction(f.id, draft.id, draft.revision, 'tick')
    assert.equal(draft.interval!.status, 'finished'); assert.equal(await f.db.sessions.count(), 0)
    const saved = await f.sessions.complete(f.id, draft.id, draft.revision, draft.input, false)
    assert.equal(saved.partial, false); assert.equal(saved.interval!.results.length, 1)
    const secondDraft = (await f.sessions.openOccurrence(f.id, run.id, second.id, events[1].ref.scheduledDate)).draft!
    const cleared = await f.sessions.clear(f.id, secondDraft.id, secondDraft.revision)
    assert.equal(cleared.interval!.results.length, 0); assert.equal(cleared.interval!.status, 'ready')
    await f.sessions.discard(f.id, cleared.id, cleared.revision); assert.equal(await f.db.sessions.count(), 1)
    validateBackupData(canonicalSnapshot(await captureProfile(f.id, f.db)))
  } finally { Date.now = original }
})

test('failed timer checkpoints and atomic custom save keep recoverable draft; foreign profile cannot modify it', async t => {
  const f = await fixture(t), w = await f.workouts.save(f.id, day()), draft = await f.sessions.startStandalone(f.id, w.id), other = await f.profiles.create('Other')
  await assert.rejects(f.sessions.intervalAction(other.id, draft.id, draft.revision, 'resume'), /unavailable/)
  const fail = () => { throw Error('Quota exceeded') }
  f.db.drafts.hook('updating', fail)
  await assert.rejects(beginDraft(f, draft, 'Keep this note'), /Quota/)
  f.db.drafts.hook('updating').unsubscribe(fail)
  assert.deepEqual(await f.sessions.getDraft(f.id, draft.id), draft)
  await f.sessions.discard(f.id, draft.id, draft.revision)
  let custom = await f.sessions.startStandalone(f.id, undefined, 'interval'), input = day(); input.id = custom.day.id
  // Custom additions must refer to this profile's exercise library.
  const e = await f.exercises.save(f.id, target()); input.exercises[0].source = { kind: 'exercise', id: e.id }
  custom = await f.sessions.amendInterval(f.id, custom.id, custom.revision, input)
  const original = Date.now, now = Date.now(); Date.now = () => now
  try {
    custom = await beginDraft(f, custom); Date.now = () => now + 500
    custom = await f.sessions.intervalAction(f.id, custom.id, custom.revision, 'pause', 'Kept note')
    f.db.sessions.hook('creating', fail)
    await assert.rejects(f.sessions.complete(f.id, custom.id, custom.revision, custom.input, true, new Date().toISOString(), { name: 'Failed template' }), /Quota/)
    f.db.sessions.hook('creating').unsubscribe(fail)
    assert.equal(await f.db.sessions.count(), 0); assert.equal(await f.db.workouts.count(), 1); assert.deepEqual(await f.sessions.getDraft(f.id, custom.id), custom)
  } finally { Date.now = original }
})

test('AI v6 preserves Strength workout text in plans and rejects old-version fields or incompatible Interval content with paths', () => {
  const prompt = formattingInstructions('plan', 'strength'), value = JSON.parse(prompt.slice(prompt.indexOf('\n{') + 1))
  value.plan.days[0].instructions = 'Workout instructions'; value.plan.days[0].notes = 'Workout note'
  const parsed = parseInterchange(JSON.stringify(value)); assert.deepEqual(parsed.issues, [])
  const draft = toImportDraft(parsed.value!); assert.equal(draft.kind, 'plan'); if (draft.kind !== 'plan') return
  assert.equal(draft.input.days[0].instructions, 'Workout instructions'); assert.equal(draft.input.days[0].notes, 'Workout note')
  const old = { ...value, schemaVersion: 5 }; delete old.trainingType
  assert.ok(parseInterchange(JSON.stringify(old)).issues.some(i => i.path.includes('instructions')))
  const interval = JSON.parse(formattingInstructions('workout', 'interval').split('\n').filter((_, i, all) => i >= all.findIndex(line => line === '{')).join('\n'))
  interval.workout.circuits[0].exercises[0].sets = [{ reps: { min: 5, max: 5 } }]
  assert.ok(parseInterchange(JSON.stringify(interval)).issues.some(i => i.path.includes('sets')))
})

test('original v13 checksums, CSV and schema validate before Strength promotion; mixed references and corrupt bytes fail', async t => {
  const f = await fixture(t); await f.exercises.save(f.id, strength()); await f.plans.save(f.id, { name: 'Old plan', durationWeeks: 2, days: [{ id: uid(), name: 'Lift day', exercises: [copyExercise(strength())] }] })
  const snapshot = await captureProfile(f.id, f.db), exported = await generateBackup(snapshot, 'legacy-fixture')
  const zip = await JSZip.loadAsync(exported.bytes), manifest = JSON.parse(await zip.file('manifest.json')!.async('string')), data = canonicalSnapshot(snapshot)
  stripTrainingFields(data); data.backupSchemaVersion = 13; validateBackupData(data)
  const old = new JSZip(), encoder = new TextEncoder(), files = [{ path: 'data.json', text: JSON.stringify(data), mediaType: 'application/json' }, ...csvTables(data).map(t => ({ ...t, mediaType: 'text/csv' }))]
  manifest.backupSchemaVersion = 13; manifest.databaseSchemaVersion = 7; manifest.counts = recordCounts(data); manifest.csvRows = Object.fromEntries(csvTables(data).map(t => [t.path, t.rows])); manifest.inventory = []
  for (const file of files) { const bytes = encoder.encode(file.text); old.file(file.path, bytes, { createFolders: false }); manifest.inventory.push({ path: file.path, bytes: bytes.length, sha256: await sha256(bytes), mediaType: file.mediaType }) }
  old.file('manifest.json', JSON.stringify(manifest))
  const restored = await readBackup(await old.generateAsync({ type: 'uint8array' }), () => {}, async () => {})
  assert.equal(restored.data.backupSchemaVersion, 18); assert.equal(restored.data.exercises[0].trainingType, 'strength'); assert.equal(restored.data.exercises[0].id, data.exercises[0].id)
  assert.equal(restored.manifest.backupSchemaVersion, 13)
  const malformed = structuredClone(data); malformed.exercises[0].activeSeconds = 10
  assert.throws(() => validateBackupData(malformed), /Unrecognized|activeSeconds/)
  old.file('data.json', JSON.stringify(malformed)); await assert.rejects(readBackup(await old.generateAsync({ type: 'uint8array' }), () => {}, async () => {}), /checksum|size/i)
  const timed = await f.exercises.save(f.id, target()), current = canonicalSnapshot(await captureProfile(f.id, f.db)); current.workouts[0].exercises[0].source = { kind: 'exercise', id: timed.id }
  assert.throws(() => validateBackupData(current), /mixed/)
})

test('a malformed legacy prescription aborts v8 upgrade without replacing records or creating Guest', async t => {
  const name = 'boros-test-bad-upgrade-' + uid(), source = new BorosDatabase(name), id = (await profileService(source).initialize()).activeProfileId
  const definitions = Object.fromEntries(source.tables.map(table => [table.name, [table.schema.primKey.src, ...table.schema.indexes.map(i => i.src)].join(',')]))
  const rows = await Promise.all(source.tables.map(async table => [table.name, await table.toArray()] as const)); await source.delete()
  const legacy = new Dexie(name); legacy.version(7).stores(definitions); await legacy.open(); for (const [store, records] of rows) await legacy.table(store).bulkPut(records)
  await legacy.table('exercises').put({ id: uid(), profileId: id, name: 'Broken saved record', sets: [], tagIds: [] }); const before = await legacy.table('profiles').toArray(); legacy.close()
  const upgrade = new BorosDatabase(name); await assert.rejects(upgrade.open()); upgrade.close()
  const inspect = new Dexie(name); await inspect.open(); t.after(() => inspect.delete())
  assert.equal(inspect.verno, 7); assert.deepEqual(await inspect.table('profiles').toArray(), before); assert.equal(await inspect.table('exercises').count(), 1)
})

test('scoped exercise deletion retains the surviving circuit rest without changing the independent library copy', async t => {
  const f = await fixture(t), a = await f.exercises.save(f.id, target('A', 10, 5)), b = await f.exercises.save(f.id, target('B', 10, 5)), input = day(['A', 'B'], 10, 5)
  input.exercises[0].source = { kind: 'exercise', id: a.id }; input.exercises[1].source = { kind: 'exercise', id: b.id }
  input.circuits[0].exerciseIds = [input.exercises[0].id]; input.circuits[0].restAfterCircuitSeconds = 30
  input.circuits.push({ ...newCircuit(2), exerciseIds: [input.exercises[1].id] })
  const workout = await f.workouts.save(f.id, input), draft = await f.sessions.startStandalone(f.id, workout.id), deletion = libraryDeleteService(f.db)
  assert.ok(draft.interval!.phases.some(p => p.kind === 'circuit-rest'))
  await deletion.remove(await deletion.preview(f.id, 'exercise', b.id, b.revision))
  const pruned = await f.sessions.getDraft(f.id, draft.id)
  assert.equal(pruned.interval!.phases.length, 3); assert.equal(pruned.interval!.phases.some(p => p.kind === 'circuit-rest' && p.durationSeconds === 30), true)
  assert.deepEqual(await f.workouts.get(f.id, workout.id), workout)
  validateBackupData(canonicalSnapshot(await captureProfile(f.id, f.db)))
})

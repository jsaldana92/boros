import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID as uid } from 'node:crypto'
import Dexie from 'dexie'
import JSZip from 'jszip'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { copyExercise } from '../../src/schemas/plan.ts'
import { newCircuit } from '../../src/schemas/circuit.ts'
import { copyWorkout } from '../../src/schemas/workout.ts'
import { initialInterval, startInterval, advanceInterval, intervalCommand, intervalDisplay, intervalStateSchema, meaningfulInterval, formatIntervalTime } from '../../src/schemas/interval-session.ts'
import * as v3 from '../../src/schemas/interval-session-v3.ts'
import { blankSession, hasDraftProgress, hasResumableDraft } from '../../src/schemas/session.ts'
import { ordinal } from '../../src/lib/ordinal.ts'
import { IntervalFeedback } from '../../src/features/train/interval-feedback.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { validateBackupData, recordCounts } from '../../src/schemas/backup.ts'
import { csvTables } from '../../src/features/backups/csv.ts'
import { sha256 } from '../../src/features/backups/integrity.ts'
import { photoBytes } from '../fixtures/backup-profile.ts'

function workout() {
  const exercises = [copyExercise({ trainingType: 'interval', name: 'Rest', activeSeconds: 20, recoverySeconds: 10, sets: [], tagNames: [] })]
  return { id: uid(), trainingType: 'interval' as const, name: 'Intervals', instructions: '<b>Snapshot instructions</b>\nNext line', exercises, circuits: [{ ...newCircuit(1), exerciseIds: exercises.map(e => e.id), repeat: 2, restAfterCircuitSeconds: 10 }], postWorkoutRestSeconds: 60 }
}
async function fixture(t) { const db = new BorosDatabase('boros-test-rest-' + uid()); t.after(() => db.delete()); const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId; return { db, id, profiles, workouts: workoutService(db), plans: planService(db), sessions: sessionService(db) } }
const begin = (day, mode: 'circuit' | 'continuous' | 'rest', input = initialInterval(day), now = 0) => startInterval(input, day, mode, mode === 'circuit' ? day.circuits[0].id : undefined, uid(), uid(), false, now)

test('independent rest starts immediately with rest, preserves every result, never becomes exercise activity; Stop/recovery remain scoped', () => {
  const day = workout(), circuit = advanceInterval(begin(day, 'circuit'), 130000), before = structuredClone(circuit.results)
  let rest = begin(day, 'rest', circuit, 200000)
  assert.deepEqual(rest.execution!.phaseIds.map(id => rest.phases.find(p => p.id === id)!.kind), ['workout-rest'])
  assert.equal(intervalDisplay(rest).scopeTotal, 60); assert.equal(rest.mode, 'circuit')
  rest = advanceInterval(rest, 210000); intervalStateSchema.parse(rest); assert.equal(intervalDisplay(rest).title, 'Post-Workout Rest'); assert.deepEqual(rest.results, before)
  const paused = intervalCommand(rest, 'pause', 210000), recovered = intervalCommand(paused, 'recover', 9999999)
  assert.equal(recovered.elapsedMs, 10000); assert.equal(recovered.status, 'paused')
  assert.equal(intervalCommand(recovered, 'resume', 9999999).elapsedMs, 10000)
  assert.deepEqual(intervalCommand(rest, 'stop', 211000).results, before)
  const done = advanceInterval(rest, 265000); assert.equal(done.status, 'finished'); assert.deepEqual(done.results, before)
  assert.deepEqual(done.execution!.cues.map(c => c.kind), ['rest', 'complete'])
  const restDraft = { day, input: blankSession(day, 'kg'), interval: begin(day, 'rest') }; assert.equal(hasResumableDraft(restDraft), true); assert.equal(hasDraftProgress(restDraft), false)
  const only = advanceInterval(begin(day, 'rest'), 60000)
  assert.equal(meaningfulInterval(only), false); assert.equal(hasDraftProgress({ day, input: blankSession(day, 'kg'), interval: only }), false)
  assert.equal(only.results.length, 0); intervalStateSchema.parse(only)
  const invalid = structuredClone(only); invalid.execution!.phaseIds.push(only.phases.find(p => p.kind === 'active')!.id)
  assert.equal(intervalStateSchema.safeParse(invalid).success, false)
  assert.throws(() => begin({ ...day, postWorkoutRestSeconds: 0 }, 'rest'), /No post-workout rest/)
})

test('continuous completion can be followed by independent rest without changing its recorded rest or circuit results', () => {
  const day = workout(); day.circuits.push({ ...newCircuit(2), exerciseIds: [day.exercises[0].id], repeat: 0, restAfterCircuitSeconds: 0 })
  const run = begin(day, 'continuous'), done = advanceInterval(run, intervalDisplay(run).total * 1000)
  const independent = begin(day, 'rest', done, 1000000); intervalStateSchema.parse(advanceInterval(independent, 1006000))
  assert.deepEqual(advanceInterval(independent, 1065000).results, done.results)
  assert.deepEqual(intervalCommand(independent, 'stop').results, done.results)
  assert.equal(done.results.filter(r => r.phase.kind === 'workout-rest').length, 1)
})

test('sticky totals exclude preparation and retain repeats/rests; large block denominator, ordinals and long times remain distinct', () => {
  const e = (name, a, r) => copyExercise({ trainingType: 'interval', name, activeSeconds: a, recoverySeconds: r, sets: [], tagNames: [] })
  const day = workout(); day.exercises = [e('A', 20, 10), e('B', 20, 10), e('C', 10, 20), e('D', 50, 10), e('E', 50, 10), e('F', 20, 10)]
  day.circuits = [{ ...newCircuit(1), repeat: 1, restAfterCircuitSeconds: 30, exerciseIds: day.exercises.slice(0, 3).map(e => e.id) }, { ...newCircuit(2), repeat: 0, restAfterCircuitSeconds: 30, exerciseIds: day.exercises.slice(3).map(e => e.id) }]
  const full = begin(day, 'continuous'), one = begin(day, 'circuit')
  assert.equal(intervalDisplay(full).scopeTotal, 480); assert.equal(intervalDisplay(one).scopeTotal, 240); assert.equal(intervalDisplay(begin(day, 'rest')).scopeTotal, 60)
  for (const [at, denominator] of [[10000, 90], [100000, 30], [250000, 150], [430000, 60]]) assert.equal(intervalDisplay(advanceInterval(full, at)).duration, denominator)
  assert.deepEqual(Array.from({ length: 11 }, (_, i) => ordinal(i + 1)), ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th'])
  assert.deepEqual([0, 60, 7201, -2].map(formatIntervalTime), ['00:00', '01:00', '120:01', '00:00'])
})

test('shared service serializes rapid starts, paused ownership, other profiles/tabs, deletion and stale callbacks without overwriting notes/results', async t => {
  const f = await fixture(t), w = await f.workouts.save(f.id, workout()), d = await f.sessions.startStandalone(f.id, w.id)
  const starts = await Promise.allSettled([1, 2].map(() => f.sessions.startInterval(f.id, d.id, d.revision, 'rest', undefined, false, 'Kept note')))
  assert.equal(starts.filter(r => r.status === 'fulfilled').length, 1)
  let saved = await f.sessions.getDraft(f.id, d.id); const generation = saved.interval!.execution!.id
  await assert.rejects(f.sessions.startInterval(f.id, saved.id, saved.revision, 'circuit', saved.day.circuits![0].id), /Stop/)
  saved = await f.sessions.intervalAction(f.id, saved.id, saved.revision, 'pause')
  await assert.rejects(f.sessions.startStandalone(f.id, w.id), /active workout/)
  const foreign = await f.profiles.create('Other')
  await assert.rejects(f.sessions.intervalAction(foreign.id, saved.id, saved.revision, 'stop'), /unavailable/)
  const outsider = structuredClone(saved); outsider.interval!.execution!.owner = uid(); await f.db.drafts.put(outsider)
  await assert.rejects(f.sessions.intervalAction(f.id, saved.id, saved.revision, 'tick'), /another tab/)
  saved = await f.sessions.intervalAction(f.id, saved.id, saved.revision, 'recover', undefined, true)
  const stale = saved; saved = await f.sessions.intervalAction(f.id, saved.id, saved.revision, 'stop')
  assert.equal(saved.input.notes, 'Kept note'); assert.equal(saved.interval!.execution, undefined)
  await assert.rejects(f.sessions.intervalAction(f.id, stale.id, stale.revision, 'tick'), /changed/)
  saved = await f.sessions.startInterval(f.id, saved.id, saved.revision, 'rest'); assert.notEqual(saved.interval!.execution!.id, generation)
  await assert.rejects(f.sessions.complete(f.id, saved.id, saved.revision, saved.input, true), /active/)
  await f.sessions.discard(f.id, saved.id, saved.revision)
  await assert.rejects(f.sessions.intervalAction(f.id, saved.id, saved.revision, 'tick'), /unavailable/)
  assert.equal(await f.db.drafts.get([f.id, saved.id]), undefined); assert.equal(await f.db.sessions.count(), 0)
})

test('note-only writes preserve timer state and instruction snapshots; planned, standalone and custom notes remain separate', async t => {
  const f = await fixture(t)
  for (const type of ['strength', 'interval'] as const) {
    const raw = type === 'interval' ? workout() : { id: uid(), name: 'Strength', trainingType: type, instructions: 'Workout instructions', exercises: [copyExercise({ name: 'Lift', sets: [{ reps: { min: 5, max: 5 } }], tagNames: [] })] }
    const w = await f.workouts.save(f.id, raw), p = await f.plans.save(f.id, { name: type + ' plan', trainingType: type, instructions: 'Parent plan instructions', days: [copyWorkout(w)], durationWeeks: 2 })
    const start = [() => f.sessions.start(f.id, p.id, p.days[0].id), () => f.sessions.startStandalone(f.id, w.id), () => f.sessions.startStandalone(f.id, undefined, type)]
    for (const [index, create] of start.entries()) {
      let d = await create()
      if (type === 'interval' && index === 1) d = await f.sessions.startInterval(f.id, d.id, d.revision, 'rest')
      const before = structuredClone(d.interval), saved = await f.sessions.update(f.id, d.id, d.revision, { ...d.input, notes: 'Session ' + index })
      assert.deepEqual(saved.interval, before); assert.equal(saved.input.notes, 'Session ' + index)
      assert.equal(saved.day.instructions, index === 2 ? undefined : raw.instructions)
      assert.equal(saved.planInstructions, index === 0 ? 'Parent plan instructions' : undefined)
      await f.sessions.discard(f.id, saved.id, saved.revision)
    }
    assert.equal((await f.db.plans.get([f.id, p.id]))!.instructions, 'Parent plan instructions')
  }
})

test('rest speech uses phase identities, including consecutive rests and repeats; no rest beeps, resume replay or zero-rest announcement', async () => {
  const day = workout(), played: string[] = [], spoken: string[] = []
  const audio = (name) => ({ muted: false, volume: 1, currentTime: 0, onended: null, onerror: null, pause() {}, play() { if (!this.muted) played.push(name); return Promise.resolve() } })
  const media = { start: audio('start'), warning: audio('warning'), end: audio('end'), complete: audio('complete') }
  const speech = { getVoices: () => [{ localService: true }], cancel() {}, speak: u => spoken.push(u.text) }
  const feedback = new IntervalFeedback(media, speech as unknown as SpeechSynthesis), original = Date.now, utterance = globalThis.SpeechSynthesisUtterance
  let clock = 0; Date.now = () => clock; globalThis.SpeechSynthesisUtterance = class { text: string; constructor(text: string) { this.text = text } } as unknown as typeof SpeechSynthesisUtterance
  const run = begin(day, 'circuit')
  try {
    feedback.update(run, true, 0)
    for (clock = 1000; clock <= 130000; clock += 1000) {
      const state = advanceInterval(run, clock); feedback.update(state, true, clock); feedback.update(state, true, clock)
      Object.values(media).forEach(a => a.onended?.({})); await Promise.resolve()
      if (clock === 28000) { feedback.update(intervalCommand(state, 'pause', clock), true, clock); feedback.update(intervalCommand(intervalCommand(state, 'pause', clock), 'resume', clock), true, clock) }
    }
    // The exercise itself is called Rest: its three starts remain active cues;
    // each recovery and each consecutive circuit rest adds its own speech only.
    assert.deepEqual(spoken, Array(9).fill('Rest')); assert.equal(played.filter(p => p === 'start').length, 3); assert.equal(played.filter(p => p === 'end').length, 3); assert.equal(played.includes('complete'), false)
    feedback.reset(); clock = 200000; feedback.update(initialInterval(day), true, clock); const rest = begin(day, 'rest', initialInterval(day), clock); feedback.update(rest, true, clock)
    for (clock += 1000; clock <= 265000; clock += 1000) { feedback.update(advanceInterval(rest, clock), true, clock); Object.values(media).forEach(a => a.onended?.({})); await Promise.resolve() }
    media.complete.onended?.({}); media.complete.onended?.({}); assert.equal(spoken.filter(v => v === 'Post-Workout Rest').length, 1); assert.equal(played.filter(v => v === 'complete').length, 3)
    const zero = workout(); zero.exercises[0].prescription.recoverySeconds = 0; zero.circuits[0].restAfterCircuitSeconds = 0; zero.postWorkoutRestSeconds = 0
    assert.equal(advanceInterval(begin(zero, 'circuit'), 60000).execution!.cues.filter(c => c.kind === 'rest').length, 0)
  } finally { feedback.cancel(); Date.now = original; globalThis.SpeechSynthesisUtterance = utterance }
})

test('Sound Off, hidden/stale boundaries and later observers consume rest cues without replay', () => {
  const day = workout(), spoken: string[] = [], original = Date.now, utterance = globalThis.SpeechSynthesisUtterance
  let clock = 0; Date.now = () => clock; globalThis.SpeechSynthesisUtterance = class { text: string; constructor(text: string) { this.text = text } } as unknown as typeof SpeechSynthesisUtterance
  const audio = () => ({ muted: false, volume: 1, currentTime: 0, onended: null, onerror: null, pause() {}, play() { return Promise.resolve() } })
  const f = new IntervalFeedback({ start: audio(), warning: audio(), end: audio(), complete: audio() }, { getVoices: () => [{ localService: true }], cancel() {}, speak: u => spoken.push(u.text) } as unknown as SpeechSynthesis)
  try {
    for (const mode of ['off', 'hidden', 'gap', 'observer']) {
      f.reset(); clock = 0; const run = begin(day, 'rest')
      if (mode !== 'observer') { f.update(run, true, clock); for (clock = 1000; clock <= 4000; clock += 1000) f.update(advanceInterval(run, clock), true, clock) }
      clock = mode === 'gap' ? 20000 : 5000
      const state = advanceInterval(run, clock); f.update(state, mode !== 'off', clock, mode !== 'hidden'); f.update(state, true, clock)
    }
    assert.deepEqual(spoken, [])
  } finally { f.cancel(); Date.now = original; globalThis.SpeechSynthesisUtterance = utterance }
})

test('short positive consecutive rests announce at entry while the real-duration end cue is still playing, never from a stale media callback', () => {
  const day = workout(); day.circuits[0].repeat = 0; day.exercises[0].prescription.recoverySeconds = 1; day.circuits[0].restAfterCircuitSeconds = 1
  const spoken: string[] = [], played: string[] = [], original = Date.now, utterance = globalThis.SpeechSynthesisUtterance
  let clock = 0; Date.now = () => clock; globalThis.SpeechSynthesisUtterance = class { text: string; constructor(text: string) { this.text = text } } as unknown as typeof SpeechSynthesisUtterance
  const audio = (name) => ({ muted: false, volume: 1, currentTime: 0, onended: null, onerror: null, pause() {}, play() { played.push(name); return Promise.resolve() } })
  const media = { start: audio('start'), warning: audio('warning'), end: audio('end'), complete: audio('complete') }, f = new IntervalFeedback(media, { getVoices: () => [{ localService: true }], cancel() {}, speak: u => spoken.push(u.text) } as unknown as SpeechSynthesis)
  try {
    const run = begin(day, 'circuit'); f.update(run, true, clock)
    for (clock = 1000; clock <= 30000; clock += 1000) f.update(advanceInterval(run, clock), true, clock)
    assert.deepEqual(spoken, ['Rest']); assert.equal(media.end.volume, 0.35); assert.equal(played.filter(p => p === 'end').length, 1)
    const delayedEnd = media.end.onended
    clock = 31000; f.update(advanceInterval(run, clock), true, clock); assert.deepEqual(spoken, ['Rest', 'Rest'])
    clock = 32000; f.update(advanceInterval(run, clock), true, clock); delayedEnd?.({}); assert.deepEqual(spoken, ['Rest', 'Rest'])
    assert.deepEqual(played, ['start', 'warning', 'end'])
  } finally { f.cancel(); Date.now = original; globalThis.SpeechSynthesisUtterance = utterance }
})

test('v10 to v11 is record/Blob preserving; v17 archive/restore keeps independent checkpoint inert; frozen v16 rejects new scopes/cues', async t => {
  const f = await fixture(t), profile = (await f.profiles.snapshot(f.id)).profile
  await f.profiles.save(f.id, profile.revision, { name: 'Owner', weightUnit: 'kg', heightUnit: 'cm', weightKg: 70 }, { blob: new Blob([photoBytes], { type: 'image/png' }), width: 1, height: 1 })
  const w = await f.workouts.save(f.id, workout()), d = await f.sessions.startStandalone(f.id, w.id)
  const old = v3.startInterval(v3.initialInterval(d.day), d.day, 'circuit', d.day.circuits![0].id, uid(), uid(), false, Date.now())
  await f.db.drafts.put({ ...d, interval: old, input: { ...d.input, notes: 'Retain' } })
  const rows = await Promise.all(f.db.tables.filter(t => t.name !== 'activeWorkouts').map(async table => [table.name, await table.toArray()] as const)), name = 'boros-test-v10-rest-' + uid(), prior = new Dexie(name)
  prior.version(10).stores(Object.fromEntries(f.db.tables.filter(t => t.name !== 'activeWorkouts').map(table => [table.name, [table.schema.primKey.src, ...table.schema.indexes.map(i => i.src)].join(',')]))); await prior.open()
  for (const [store, values] of rows) await prior.table(store).bulkPut(values)
  prior.close(); const next = new BorosDatabase(name); t.after(() => next.delete()); await next.open(); assert.equal(next.verno, 12)
  for (const [store, values] of rows) assert.deepEqual(await next.table(store).toArray(), values)
  assert.deepEqual(new Uint8Array(await (await next.photos.toArray())[0].blob.arrayBuffer()), photoBytes)
  const original = canonicalSnapshot(await captureProfile(f.id, next)); original.backupSchemaVersion = 16; validateBackupData(original)
  // Build genuine old-contract bytes and CSVs, then verify before promotion.
  const bundle = await generateBackup(await captureProfile(f.id, next), 'old-contract'), archive = await JSZip.loadAsync(bundle.bytes)
  const files = [{ path: 'data.json', bytes: new TextEncoder().encode(JSON.stringify(original)), mediaType: 'application/json' }, ...csvTables(original).map(t => ({ path: t.path, bytes: new TextEncoder().encode(t.text), mediaType: 'text/csv' })), ...await Promise.all(original.assets.map(async a => ({ path: a.path, bytes: await archive.file(a.path)!.async('uint8array'), mediaType: a.mediaType })))]
  const zip = new JSZip(), manifest = { ...bundle.manifest, backupSchemaVersion: 16, databaseSchemaVersion: 10, counts: recordCounts(original), csvRows: Object.fromEntries(csvTables(original).map(t => [t.path, t.rows])), inventory: await Promise.all(files.map(async file => ({ path: file.path, bytes: file.bytes.length, mediaType: file.mediaType, sha256: await sha256(file.bytes) }))) }
  files.forEach(file => zip.file(file.path, file.bytes, { createFolders: false })); zip.file('manifest.json', JSON.stringify(manifest))
  const oldRead = await readBackup(await zip.generateAsync({ type: 'uint8array' }), () => {}, async () => {})
  assert.equal(oldRead.manifest.backupSchemaVersion, 16); assert.equal(oldRead.data.backupSchemaVersion, 18); assert.deepEqual(oldRead.data.drafts[0].interval, JSON.parse(JSON.stringify(old)))
  const rest = advanceInterval(begin(d.day, 'rest', initialInterval(d.day), Date.now() - 7000))
  await next.drafts.put({ ...d, interval: rest, input: { ...d.input, notes: 'Rest note' } })
  const backup = await generateBackup(await captureProfile(f.id, next), 'rest-test'), read = await readBackup(backup.bytes, () => {}, async () => {})
  assert.equal(read.manifest.backupSchemaVersion, 18); assert.equal(read.manifest.databaseSchemaVersion, 12)
  assert.ok(backup.manifest.csvRows['csv/interval_cues.csv'] > 0)
  const restore = await buildRestorePlan(read, undefined, 'new', uid(), 'Copy', new Date().toISOString()), restored = restore.result.drafts[0]
  assert.equal(restored.interval!.status, 'paused'); assert.equal(restored.interval!.anchorAt, undefined); assert.equal(restored.interval!.execution!.owner, undefined); assert.equal(restored.interval!.execution!.mode, 'rest'); assert.equal(restored.interval!.elapsedMs, rest.elapsedMs); assert.equal(restored.input.notes, 'Rest note')
  validateBackupData(canonicalSnapshot(restore.result))
  const falselyOld = structuredClone(read.data); falselyOld.backupSchemaVersion = 16; assert.throws(() => validateBackupData(falselyOld))
})

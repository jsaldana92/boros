import { classifyStrengthRecords } from '../../src/db/training-migration.ts'
import 'fake-indexeddb/auto'
import { weeklyService } from '../../src/db/weekly.ts'
import { restoreService } from '../../src/db/restores.ts'
import { runActionService } from '../../src/db/run-actions.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { planService } from '../../src/db/plans.ts'
import { copyExercise } from '../../src/schemas/plan.ts'
import { copyWorkout, workoutToInput, workoutInputSchema } from '../../src/schemas/workout.ts'
import { appendSessionExercises, appendSessionSets } from '../../src/schemas/session-structure.ts'
import { importSession } from '../../src/db/imports.ts'
import { interchangeExample } from '../../src/schemas/interchange.ts'
import { parseInterchange, toImportDraft } from '../../src/features/create/interchange.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { calendarActivityService } from '../../src/db/calendar-activity.ts'
import { deriveProgress, exerciseCounts } from '../../src/lib/progress-analytics.ts'
import { representativeProfile } from '../fixtures/backup-profile.ts'
const uid = () => crypto.randomUUID()
async function setup(t) {
 const db = new BorosDatabase('boros-test-workouts-' + uid()); t.after(() => db.delete())
 const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId
 const exercise = await exerciseService(db).save(id, { name: 'Press', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 0, max: 0 } }, { reps: { min: 3, max: 3 } }], tagNames: [], restBetweenSeconds: 0 })
 const prescription = { name: exercise.name, sets: exercise.sets, tagNames: [], restBetweenSeconds: 0 }
 const choice = { prescription, source: { kind: 'exercise' as const, id: exercise.id } }
 const group = { id: uid(), number: 1, restBetweenRoundsSeconds: 0 }
 const raw = { id: uid(), name: 'Upper', instructions: '<b>plain</b>', notes: 'Template note', groups: [group], exercises: [1,2].map(() => ({ ...copyExercise(prescription, choice.source), groupId: group.id })) }
 const service = workoutService(db), workout = await service.save(id, raw), sessions = sessionService(db)
 return { db, profiles, id, exercise, choice, raw, workout, service, sessions }
}
const filled = (draft) => { const input = structuredClone(draft.input); for (const e of input.exercises) for (const s of e.sets) Object.assign(s, { load: '0', reps: '5' }); return input }

test('workout validation, normalization, isolation, stale edits, independent copies, archive/restore', async t => {
 const { db, id, profiles, workout, service, raw } = await setup(t), other = await profiles.create('Other')
 assert.equal(workoutInputSchema.safeParse({ ...raw, exercises: [] }).success, false)
 await assert.rejects(service.save(id, { ...raw, id: uid(), name: '  UPPER ' }), /already exists/)
 await service.save(other.id, { ...raw, exercises: raw.exercises.map(e => ({ ...e, source: undefined, templateId: undefined })) })
 assert.equal((await service.library(other.id)).length, 1)
 await assert.rejects(service.get(other.id, uid()), /unavailable/)
 const first = copyWorkout(workout), second = copyWorkout(workout)
 const ids = d => [d.id, ...d.exercises.map(e => e.id), ...d.groups.map(g => g.id)]
 assert.ok(ids(first).every(id => !ids(second).includes(id))); assert.equal(first.sourceWorkoutId, workout.id)
 const plan = await planService(db).save(id, { name: 'Independent', durationWeeks: 2, days: [first, second] })
 const edited = await service.save(id, { ...workoutToInput(workout), name: 'Changed' }, workout)
 await assert.rejects(service.save(id, raw, workout), /another tab/)
 assert.deepEqual((await db.plans.get([id, plan.id]))!.days, [first, second].map(d => ({ ...d, publishedWorkoutId: workout.id })))
 const archived = await service.setArchived(id, edited.id, edited.revision, true)
 assert.equal(archived.activeNameKey, undefined)
 await service.setArchived(id, archived.id, archived.revision, false)
 const duplicate = await service.duplicateDraft(id, workout.id); assert.notEqual(duplicate.id, workout.id); assert.match(duplicate.name, /copy/)
})

test('standalone repeats keep independent snapshots and actual results; calendar and Overall never invent plan identities', async t => {
 const { db, id, workout, sessions, exercise, service } = await setup(t)
 const a = await sessions.startStandalone(id, workout.id)
 assert.equal(a.sourcePlanId, undefined)
 await service.save(id, { ...workoutToInput(workout), name: 'Renamed' }, workout)
 const partial = filled(a); partial.exercises[0].sets[1] = { load: '', reps: '', rir: '', unit: 'kg', skipped: false }
 await assert.rejects(sessions.complete(id, a.id, a.revision, partial, false), /Confirm/)
 const saved = await sessions.complete(id, a.id, a.revision, partial, true)
 const b = await sessions.startStandalone(id, workout.id)
 assert.notEqual(a.id,b.id); assert.equal(a.day.id,b.day.id) // Stable definition identity; independent snapshot objects.
 await sessions.complete(id, b.id, b.revision, filled(b), false)
 assert.equal(saved.day.name, 'Upper'); assert.equal(saved.partial, true)
 const events = await calendarActivityService(db).events(id, '2000-01-01', '2099-12-31')
 assert.equal(events.length, 2); assert.ok(events.every(e => e.planName === 'Workout' && !e.planId))
 const data = deriveProgress(id, [], [exercise], await db.sessions.toArray(), [], await db.drafts.toArray())
 assert.equal(data.plans.length, 0); assert.deepEqual(exerciseCounts(data, 'library:' + exercise.id), { completed: 3, skipped: 0 })
 assert.equal(await db.workouts.count(), 1)
})

test('custom Save Yes is atomic, collision-safe, idempotent and excludes actual/private notes; Save No creates no library record', async t => {
 const { db, id, sessions, choice, profiles } = await setup(t)
 async function custom() {
  const draft = await sessions.startStandalone(id), next = appendSessionExercises(draft, draft.input, [choice, choice], 'kg')
  const added = appendSessionSets(next, next.input, next.day.exercises[0].id, 'kg')
  const saved = await sessions.update(id, draft.id, draft.revision, added.input, added)
  const input = filled(saved); input.notes = 'Private session'; input.exercises[0].notes = 'Private exercise'
  return { saved, input }
 }
 const { saved, input } = await custom()
 await assert.rejects(sessions.complete(id, saved.id, saved.revision, input, false, undefined, { name: ' UPPER ' }), /already exists/)
 assert.equal(await db.sessions.count(), 0); assert.equal((await sessions.getDraft(id, saved.id)).finalizedAt, undefined)
 const other = await profiles.create('Other'); await assert.rejects(sessions.complete(other.id, saved.id, saved.revision, input, false), /unavailable/)
 const pair = await Promise.all([sessions.complete(id, saved.id, saved.revision, input, false, undefined, { name: '' }), sessions.complete(id, saved.id, saved.revision, input, false, undefined, { name: '' })])
 assert.equal(pair[0].id, pair[1].id); assert.equal(await db.sessions.count(), 1); assert.equal(await db.workouts.count(), 2)
 assert.equal(pair[0].day.name, 'Custom Workout (1)')
 const template = (await db.workouts.get([id, pair[0].source!.workoutId!]))!
 assert.equal(template.exercises[0].prescription.sets.length, 3); assert.equal(template.notes, undefined); assert.ok(template.exercises.every(e => e.prescription.notes !== 'Private exercise'))
 await assert.rejects(sessions.update(id, saved.id, saved.revision, input), /completed/)
 const next = await custom(); const no = await sessions.complete(id, next.saved.id, next.saved.revision, next.input, false)
 assert.equal(no.day.name, 'Custom Workout'); assert.deepEqual(no.source, { kind: 'custom' }); assert.equal(await db.workouts.count(), 2)
 const third = await custom(); assert.equal((await sessions.complete(id, third.saved.id, third.saved.revision, third.input, false, undefined, { name: '' })).day.name, 'Custom Workout (2)')
})

test('AI v5 separates all kinds, legacy workout remains one exercise, invalid hybrids fail, imports resolve defaults atomically', async t => {
 const { db, id, exercise } = await setup(t)
 for (const kind of ['plan', 'workout', 'exercise'] as const) { const value = interchangeExample(kind); assert.equal(value.schemaVersion, 5); assert.equal(toImportDraft(parseInterchange(JSON.stringify(value)).value!).kind, kind) }
 const publicExercise = { name: 'Press', sets: [{ reps: { min: 20, max: 20 } }], restBetweenSetsSeconds: 0 }
 for (const schemaVersion of [1,2,3,4]) assert.equal(toImportDraft(parseInterchange(JSON.stringify({ schemaVersion, kind: 'workout', workout: publicExercise })).value!).kind, 'exercise')
 assert.equal(parseInterchange(JSON.stringify({ schemaVersion: 5, kind: 'workout', workout: publicExercise })).value, undefined)
 const payload = { schemaVersion: 5, kind: 'workout', workout: { name: 'Imported', exercises: [publicExercise, { ...publicExercise, name: 'New' }, { ...publicExercise, name: 'New', sets: [{ reps: { min: 8, max: 8 } }] }] } }
 const draft = toImportDraft(parseInterchange(JSON.stringify(payload)).value!); assert.equal(draft.kind, 'workout'); if (draft.kind !== 'workout') throw Error('wrong draft')
 const importer = importSession(id, db), saved = await importer.saveLibraryWorkout(draft.input)
 assert.equal((await importer.saveLibraryWorkout(draft.input)).id, saved.id)
 assert.deepEqual(await db.exercises.get([id, exercise.id]), exercise)
 assert.equal(saved.exercises[1].templateId, saved.exercises[2].templateId); assert.equal(saved.exercises[2].prescription.sets[0].reps.min, 8)
 assert.equal(await db.exercises.count(), 2)
})

test('v11 ZIP, all restore choices and repeated merges preserve independent workout/session identities; empty custom draft exports', async t => {
 const { db, id, workout, sessions } = await setup(t)
 for (let i=0;i<2;i++) { const d=await sessions.startStandalone(id,workout.id); await sessions.complete(id,d.id,d.revision,filled(d),false) }
 await sessions.startStandalone(id)
 const snapshot = await captureProfile(id,db), zip=await generateBackup(snapshot,'workouts'), backup=await readBackup(zip.bytes)
 assert.equal(backup.data.backupSchemaVersion,18); assert.equal(zip.manifest.csvRows['csv/workouts.csv'],1)
 for (const choice of ['new','replace','device','import'] as const) {
  const plan=await buildRestorePlan(backup,choice==='new'?undefined:snapshot,choice,uid(),choice==='new'?'Copy':'Guest',new Date().toISOString())
  assert.equal(plan.result.workouts.length,1); assert.equal(plan.result.sessions.length,2); assert.equal(plan.result.drafts.length,3)
  validateBackupData(canonicalSnapshot(plan.result))
  if (choice==='device'||choice==='import') { const repeat=await buildRestorePlan(backup,plan.result,choice,uid(),'Guest',new Date().toISOString()); assert.equal(repeat.result.sessions.length,2) }
 }
 const cleared=await buildRestorePlan(undefined,snapshot,'clear',uid(),'Guest',new Date().toISOString()); assert.equal(cleared.result.workouts.length,0); assert.equal(cleared.counts.workouts.removed,1)
 const bad=structuredClone(backup.data); bad.sessions[0].sourcePlanId=uid(); assert.throws(()=>validateBackupData(bad),/plan metadata/)
})

test('additive v5 to v6 preserves all stores, assets and active selection; no workout extraction or silent reset', async t => {
 const { db }=await setup(t); await representativeProfile(db)
 const rows=Object.fromEntries(await Promise.all(db.tables.filter(table=>table.name!=='workouts'&&table.name!=='activeWorkouts').map(async table=>[table.name,await table.toArray()])))
 const name='boros-test-workout-upgrade-'+uid(), old=new Dexie(name)
 const definitions=Object.fromEntries(db.tables.filter(table=>table.name!=='workouts'&&table.name!=='activeWorkouts').map(table=>[table.name,[table.schema.primKey.src,...table.schema.indexes.map(index=>index.src)].join(',')]))
 old.version(5).stores(definitions); await old.open(); for(const [table,values] of Object.entries(rows)) await old.table(table).bulkAdd(values); old.close()
 const upgraded=new BorosDatabase(name);t.after(()=>upgraded.delete());await upgraded.open()
 assert.equal(upgraded.verno,12);assert.equal(await upgraded.workouts.count(),0)
 for(const [table,values] of Object.entries(rows)) assert.deepEqual(await upgraded.table(table).toArray(),(classifyStrengthRecords(values), values))
 const active=(await upgraded.settings.get('workspace'))!.activeProfileId;await profileService(upgraded).initialize();assert.equal((await upgraded.settings.get('workspace'))!.activeProfileId,active)
})

test('custom transaction rollback/retry and plan lifecycle/merge preserve standalone work', async t => {
 const {db,id,workout,sessions,choice}=await setup(t), draft=await sessions.startStandalone(id), next=appendSessionExercises(draft,draft.input,[choice],'kg')
 const saved=await sessions.update(id,draft.id,draft.revision,next.input,next), input=filled(saved)
 const fail=()=>{throw Error('simulated session write failure')};db.sessions.hook('creating',fail)
 await assert.rejects(sessions.complete(id,saved.id,saved.revision,input,false,undefined,{name:'Atomic'}),/simulated/)
 assert.equal(await db.workouts.count(),1);assert.equal((await sessions.getDraft(id,saved.id)).finalizedAt,undefined)
 db.sessions.hook('creating').unsubscribe(fail)
 const complete=await sessions.complete(id,saved.id,saved.revision,input,false,undefined,{name:'Atomic'})
 const pending=await sessions.startStandalone(id,workout.id), template=await planService(db).save(id,{name:'Plan family',durationWeeks:2,days:[copyWorkout(workout)]})
 let [run]=await weeklyService(db).activate(id,template.id);const actions=runActionService(db)
 await actions.resetRun(await actions.preview(id,run.id,run.revision));run=(await db.schedules.get([id,run.id]))!
 await actions.leave(await actions.preview(id,run.id,run.revision));run=(await db.schedules.get([id,run.id]))!
 await actions.deletePrevious(await actions.preview(id,run.id,run.revision))
 assert.deepEqual(await db.sessions.get([id,complete.id]),complete);assert.deepEqual(await sessions.getDraft(id,pending.id),pending);assert.equal(await db.workouts.count(),2)
 const original=await captureProfile(id,db), backup=await readBackup((await generateBackup(original,'test')).bytes)
 for(const choice of ['device','import'] as const){const merged=await buildRestorePlan(backup,original,choice,uid(),'Guest',new Date().toISOString());assert.equal(merged.result.workouts.length,2);assert.equal(merged.result.sessions.length,1);assert.equal(merged.result.drafts.length,2);const exported=await readBackup((await generateBackup(merged.result,'test')).bytes);assert.equal(exported.data.sessions[0].id,complete.id)}
})

test('committed restore/export and profile Clear cover workouts, standalone drafts/results and preserve the original owner', async t => {
 const {db,id,workout,sessions}=await setup(t), d=await sessions.startStandalone(id,workout.id)
 await sessions.complete(id,d.id,d.revision,filled(d),false);await sessions.startStandalone(id)
 const original=await captureProfile(id,db), backup=await readBackup((await generateBackup(original,'test')).bytes), restores=restoreService(db)
 const preview=await restores.preview(backup,'new','Workout restore'), owner=await restores.commit(preview,true), copy=await captureProfile(owner,db)
 assert.notEqual(owner,id);assert.equal(copy.workouts[0].id,workout.id);assert.equal(copy.sessions[0].id,d.id)
 const exported=await readBackup((await generateBackup(copy,'test')).bytes)
 assert.deepEqual(exported.data.workouts,JSON.parse(JSON.stringify(copy.workouts)));assert.deepEqual(exported.data.sessions,JSON.parse(JSON.stringify(copy.sessions)))
 await restores.commit(await restores.preview(undefined,'clear',undefined,owner),true)
 assert.equal(await db.workouts.where('profileId').equals(owner).count(),0)
 const after=await captureProfile(id,db);assert.deepEqual(after.workouts,original.workouts);assert.deepEqual(after.sessions,original.sessions);assert.deepEqual(after.drafts,original.drafts)
})

test('standalone captured time zone determines completion date; workout remapping never merges distinct performances by name', async t => {
 const {db,id,workout,sessions}=await setup(t), draft=await sessions.startStandalone(id,workout.id)
 await db.drafts.update([id,draft.id],{timeZone:'America/Los_Angeles'})
 const saved=await sessions.complete(id,draft.id,draft.revision,filled(draft),false,'2030-01-01T02:00:00.000Z')
 assert.equal((await calendarActivityService(db).events(id,'2029-12-31','2029-12-31'))[0].session!.id,saved.id)
 assert.equal((await calendarActivityService(db).events(id,'2030-01-01','2030-01-01')).length,0)
 const local=await captureProfile(id,db), backup=await readBackup((await generateBackup(local,'test')).bytes), incoming=structuredClone(backup)
 const workoutId=uid(),sessionId=uid();incoming.data.workouts[0].id=workoutId
 for(const row of [...incoming.data.drafts,...incoming.data.sessions]){row.id=sessionId;row.source!.workoutId=workoutId;row.day.sourceWorkoutId=workoutId;if('draftId' in row)row.draftId=sessionId}
 for(const choice of ['device','import'] as const){const merged=await buildRestorePlan(incoming,local,choice,uid(),'Guest',new Date().toISOString());assert.equal(merged.result.workouts.length,1);assert.equal(merged.result.sessions.length,2);assert.ok(merged.result.sessions.every(s=>s.source!.workoutId===workout.id&&s.day.sourceWorkoutId===workout.id));assert.deepEqual(new Set(merged.result.sessions.map(s=>s.id)),new Set([saved.id,sessionId]))}
})

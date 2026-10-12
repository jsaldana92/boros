import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import { randomUUID as uid } from 'node:crypto'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService, exerciseToInput } from '../../src/db/exercises.ts'
import { similarityToken, similarWorkouts } from '../../src/lib/workout-comparison.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { importSession } from '../../src/db/imports.ts'
import { copyExercise, planToInput } from '../../src/schemas/plan.ts'
import { copyWorkout, workoutToInput } from '../../src/schemas/workout.ts'
import { hasDraftProgress, blankSession } from '../../src/schemas/session.ts'
import { appendSessionExercises } from '../../src/schemas/session-structure.ts'
import { initialInterval, startInterval, advanceInterval, intervalCommand, phaseActivity, intervalStateSchema, partialInterval } from '../../src/schemas/interval-session.ts'
import { newCircuit } from '../../src/schemas/circuit.ts'
import { occurrences } from '../../src/schemas/schedule.ts'
import { addDays } from '../../src/lib/calendar-dates.ts'
import { captureAnalysis } from '../../src/db/analysis.ts'
import { analysisRows, analysisCsv, ANALYSIS_COLUMNS } from '../../src/features/backups/analysis.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { noteSignature } from '../../src/lib/note-inheritance.ts'
import JSZip from 'jszip'
import { csvTables } from '../../src/features/backups/csv.ts'
import { recordCounts } from '../../src/schemas/backup.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { sha256 } from '../../src/features/backups/integrity.ts'
import { stripAnalysisFields } from '../fixtures/training-compatibility.ts'

const strength = (name='Bench') => ({ name, trainingType:'strength' as const, sets:Array.from({length:4},()=>({reps:{min:5,max:8},rir:{min:0,max:0}})),tagNames:[],notes:'Default',instructions:'Original instructions' })
async function fixture(t) {
  const db=new BorosDatabase('boros-test-analysis-'+uid()); t.after(()=>db.delete())
  const profiles=profileService(db), id=(await profiles.initialize()).activeProfileId
  return {db,id,profiles,exercises:exerciseService(db),workouts:workoutService(db),plans:planService(db),sessions:sessionService(db)}
}
async function saved(f,draft,notes?:string,workoutNote?:string) {
  const input=structuredClone(draft.input)
  input.exercises.forEach(e=>e.sets.forEach((s,i)=>{s.load=String(i*10);s.reps=String(5+i);s.rir=i===0?'0':''}))
  if(notes!==undefined){input.exercises[0].notes=notes;input.exercises[0].noteEdited=true}
  if(workoutNote!==undefined){input.notes=workoutNote;input.noteEdited=true}
  return f.sessions.complete(f.id,draft.id,draft.revision,input,false)
}
async function planFixture(f) {
  const e=await f.exercises.save(f.id,strength()), prescription=exerciseToInput(e,[])
  const days=['I','II'].map(name=>({id:uid(),name,exercises:[copyExercise(prescription,{kind:'exercise' as const,id:e.id})]}))
  const plan=await f.plans.save(f.id,{name:'Plan A',durationWeeks:3,notes:'Plan note',instructions:'Plan instructions',days})
  return {e,plan}
}

test('copied defaults and branch edits stay independent; exact saved plan notes carry across workouts without draft progress',async t=>{
  const f=await fixture(t),{e,plan}=await planFixture(f)
  let a=await f.sessions.start(f.id,plan.id,plan.days[0].id)
  assert.equal(a.input.exercises[0].notes,'Default');assert.equal(hasDraftProgress(a),false)
  await saved(f,a,'Go heavy','Workout I note')
  const b=await f.sessions.start(f.id,plan.id,plan.days[1].id)
  assert.equal(b.input.exercises[0].notes,'Go heavy');assert.equal(b.input.notes,'');assert.equal(hasDraftProgress(b),false)
  assert.equal((await f.db.exercises.get([f.id,e.id])).notes,'Default')
  await f.sessions.discard(f.id,b.id,b.revision)
  const changed=planToInput(await f.plans.get(f.id,plan.id));changed.days[1].exercises[0].prescription.notes='Branch override';changed.days[1].exercises[0].prescription.noteOverride=true
  const next=await f.plans.save(f.id,changed,plan)
  const own=await f.sessions.start(f.id,next.id,next.days[1].id);assert.equal(own.input.exercises[0].notes,'Branch override')
  await saved(f,own,'')
  a=await f.sessions.start(f.id,next.id,next.days[1].id);assert.equal(a.input.exercises[0].notes,'');assert.equal(hasDraftProgress(a),false)
  await saved(f,a)
  const again=await f.sessions.start(f.id,next.id,next.days[1].id);assert.equal(again.input.exercises[0].notes,'','inherited explicit clear survives another saved performance')
})

test('whole ordered Strength prescription, missing versus zero RIR, profiles and standalone repeated occurrences do not mix',async t=>{
  const f=await fixture(t),{e,plan}=await planFixture(f)
  await saved(f,await f.sessions.start(f.id,plan.id,plan.days[0].id),'Plan only')
  for(const mutate of [p=>p.sets.pop(),p=>p.sets[3].reps.max++,p=>delete p.sets[0].rir]) {
    const original=await f.plans.get(f.id,plan.id),input=planToInput(original);mutate(input.days[1].exercises[0].prescription)
    const updated=await f.plans.save(f.id,input,original),d=await f.sessions.start(f.id,updated.id,updated.days[1].id)
    assert.equal(d.input.exercises[0].notes,'Default');await f.sessions.discard(f.id,d.id,d.revision)
    await f.plans.save(f.id,planToInput(plan),updated)
  }
  const w=await f.workouts.save(f.id,{id:uid(),name:'Standalone',notes:'Workout default',exercises:[copyExercise(exerciseToInput(e,[]),{kind:'exercise',id:e.id}),copyExercise(exerciseToInput(e,[]),{kind:'exercise',id:e.id})]})
  let d=await f.sessions.startStandalone(f.id,w.id);assert.deepEqual(d.input.exercises.map(e=>e.notes),['Default','Default'])
  d.input.exercises[1].notes='Second';d.input.exercises[1].noteEdited=true
  await saved(f,d,'First','Own workout')
  d=await f.sessions.startStandalone(f.id,w.id);assert.deepEqual(d.input.exercises.map(e=>e.notes),['First','Second']);assert.equal(d.input.notes,'Own workout')
  d=await f.sessions.update(f.id,d.id,d.revision,{...d.input,notes:'Uncommitted to history'});await f.sessions.discard(f.id,d.id,d.revision)
  d=await f.sessions.startStandalone(f.id,w.id);assert.equal(d.input.notes,'Own workout')
  const other=await f.profiles.create('Other');await assert.rejects(f.sessions.startStandalone(other.id,w.id),/unavailable/)
  assert.equal((await captureAnalysis(other.id,f.db)).sessions.length,0)
})

test('workout-to-plan copied notes, one-time publication and authoritative instructions preserve started/history snapshots and deleted fallback',async t=>{
  const f=await fixture(t),e=await f.exercises.save(f.id,strength()),w=await f.workouts.save(f.id,{id:uid(),name:'Library',instructions:'Workout old',notes:'Workout default',exercises:[copyExercise(exerciseToInput(e,[]),{kind:'exercise',id:e.id})]})
  const copy=copyWorkout(w);copy.notes='Plan workout';copy.noteOverride=true;copy.exercises[0].prescription.notes='Plan exercise';copy.exercises[0].prescription.noteOverride=true
  const p=await f.plans.save(f.id,{name:'Plan',durationWeeks:2,days:[copy]})
  assert.equal(await f.db.workouts.count(),2);assert.equal((await f.workouts.get(f.id,w.id)).notes,'Workout default')
  const variant=await f.workouts.get(f.id,p.days[0].publishedWorkoutId!)
  const d=await f.sessions.start(f.id,p.id,p.days[0].id)
  await f.exercises.save(f.id,{...exerciseToInput(e,[]),instructions:'Exercise new',notes:'New default'},e)
  const changed={...workoutToInput(variant),instructions:'Workout new'}
  await f.workouts.save(f.id,changed,variant,false,similarityToken(similarWorkouts(f.id,changed,await f.db.workouts.toArray(),await f.db.exercises.toArray(),variant.id)))
  const current=await f.plans.get(f.id,p.id)
  assert.equal(current.days[0].instructions,'Workout new');assert.equal(current.days[0].exercises[0].prescription.instructions,'Exercise new');assert.equal(current.days[0].exercises[0].prescription.notes,'Plan exercise')
  assert.equal((await f.sessions.getDraft(f.id,d.id)).day.instructions,'Workout old')
  const history=await saved(f,d);assert.equal(history.day.exercises[0].prescription.instructions,'Original instructions')
  const next=await f.sessions.start(f.id,p.id,p.days[0].id);assert.equal(next.day.instructions,'Workout new');await f.sessions.discard(f.id,next.id,next.revision)
  const updated=await f.plans.save(f.id,planToInput(current),p);assert.equal(await f.db.workouts.count(),2)
  await f.db.exercises.delete([f.id,e.id]);await f.db.workouts.bulkDelete([[f.id,w.id],[f.id,variant.id]])
  assert.equal((await f.plans.get(f.id,updated.id)).days[0].exercises[0].prescription.instructions,'Exercise new')
  assert.equal(await f.db.workouts.count(),0)
})

function intervalDay(repeat=0) {
  const exercises=['One','Two','Three'].map(name=>copyExercise({trainingType:'interval',name,sets:[],tagNames:[],activeSeconds:20,recoverySeconds:10}))
  return {id:uid(),name:'Intervals',trainingType:'interval' as const,exercises,circuits:[{...newCircuit(1),exerciseIds:exercises.map(e=>e.id),repeat,restAfterCircuitSeconds:30}],postWorkoutRestSeconds:60}
}
const start=(day, input=initialInterval(day),now=0)=>startInterval(input,day,'circuit',day.circuits[0].id,uid(),uid(),true,now)

test('phase ledger retains active/recovery separately across pause, Stop, restart, repeated checkpoints and recovery',()=>{
  const day=intervalDay(),run=start(day)
  let state=intervalCommand(run,'pause',47525) // warmup 10 + one 20/10 + two 7.525
  const active=state.phases.filter(p=>p.kind==='active'),recovery=state.phases.filter(p=>p.kind==='recovery')
  assert.deepEqual(active.map(p=>phaseActivity(state,p).elapsedMs),[20000,7525,0]);assert.deepEqual(recovery.map(p=>phaseActivity(state,p).elapsedMs),[10000,0,0])
  state=intervalCommand(state,'resume',100000);state=intervalCommand(state,'stop',101000)
  assert.equal(phaseActivity(state,active[1]).elapsedMs,8525)
  assert.equal(hasDraftProgress({input:{notes:'',exercises:[]},interval:state}),true)
  state=start(day,state,200000);state=advanceInterval(state,225000);state=advanceInterval(state,225000)
  assert.equal(phaseActivity(state,active[0]).elapsedMs,35000,'new attempt aggregates once, above target')
  state=intervalCommand(state,'recover',900000);assert.equal(phaseActivity(state,active[0]).elapsedMs,35000)
  state=intervalCommand(state,'finish',999999);intervalStateSchema.parse(state)
  assert.equal(partialInterval(state),true);assert.equal(state.activity.attempts.length,2)
  assert.equal(state.activity.attempts.flatMap(a=>a.results).some(r=>!['active','recovery'].includes(r.phase.kind)),false)
  assert.equal(initialInterval(day).activity.attempts.length,0,'explicit Clear starts empty ledger')
})

test('Interval signature includes duration, recovery and circuit context; legacy unknown stays distinct from known zero',()=>{
  const day=intervalDay(),e=day.exercises[0],signature=noteSignature(day,e)
  const different=structuredClone(day);different.circuits[0].repeat=1;assert.notEqual(noteSignature(different,different.exercises[0]),signature)
  different.circuits[0].repeat=0;different.exercises[0].prescription.recoverySeconds=0;assert.notEqual(noteSignature(different,different.exercises[0]),signature)
  const state=initialInterval(day),phase=state.phases.find(p=>p.kind==='active')!
  assert.equal(phaseActivity(state,phase).elapsedMs,0);delete state.activity;assert.equal(phaseActivity(state,phase).elapsedMs,undefined)
})

test('adding and swapping exercises uses independent copied defaults without reinitializing entered notes',async t=>{
  const f=await fixture(t),{e,plan}=await planFixture(f),d=await f.sessions.start(f.id,plan.id,plan.days[0].id)
  d.input.exercises[0].notes='Already entered'
  const added=appendSessionExercises({day:d.day,structure:d.structure},d.input,[{prescription:exerciseToInput(e,[]),source:{kind:'exercise',id:e.id}}],'kg')
  assert.deepEqual(added.input.exercises.map(e=>e.notes),['Already entered','Default'])
  assert.equal(added.input.exercises[1].noteEdited,false)
  const replacement=await f.exercises.save(f.id,{...strength('Replacement'),notes:'Replacement default'})
  const swapped=await f.sessions.replaceExercise(f.id,d.id,d.revision,d.day.exercises[0].id,replacement.id,replacement.revision)
  assert.equal(swapped.input.exercises[0].notes,'Replacement default')
  const cleared=await f.sessions.clear(f.id,d.id,swapped.revision)
  assert.deepEqual(cleared.input,blankSession(cleared.day,'kg'))
})

test('restarting a retained phase preserves its target and CSV order follows the prescribed circuits',async t=>{
  const f=await fixture(t),day=intervalDay(),last=day.exercises.pop()!
  day.circuits[0].exerciseIds.pop();day.circuits.push({...newCircuit(2),exerciseIds:[last.id]});day.exercises.push(last)
  const w=await f.workouts.save(f.id,day),d=await f.sessions.startStandalone(f.id,w.id)
  let state=intervalCommand(start(day,initialInterval(day),100000),'stop',117500)
  const phase=state.phases.find(p=>p.kind==='active' && p.exerciseId===day.exercises[0].id)!,amended=structuredClone(day)
  amended.exercises[0].prescription.activeSeconds=40
  state=start(amended,state,200000)
  assert.equal(state.phases.find(p=>p.id===phase.id)!.durationSeconds,20)
  intervalStateSchema.parse(state)
  state=intervalCommand(state,'stop',212000)
  assert.equal(phaseActivity(state,phase).elapsedMs,9500)
  d.interval=intervalCommand(state,'finish',212000);await f.db.drafts.put(d)
  await f.sessions.complete(f.id,d.id,d.revision,d.input,true)
  const rows=analysisRows(await captureAnalysis(f.id,f.db))
  assert.deepEqual(rows.map(r=>r.exercise),['One','Two','Three'])
  assert.equal(rows[0].exercise_time,'9.5, 0')
})

test('analysis exports four ordered Strength rows with snapshots, actual units, notes, formula protection and independent CSV parse',async t=>{
  const f=await fixture(t),{plan}=await planFixture(f),d=await f.sessions.start(f.id,plan.id,plan.days[0].id)
  const text='=SUM(1,2)\n"Unicode 日本語"';const log=await saved(f,d,text,'Workout note')
  await f.profiles.save(f.id,(await f.profiles.snapshot(f.id)).profile.revision,{name:'Analysis',weightUnit:'lb',heightUnit:'cm'})
  const before=await captureProfile(f.id,f.db),snap=await captureAnalysis(f.id,f.db),rows=analysisRows(snap),csv=analysisCsv(snap)
  assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.set_number),[1,2,3,4]);assert.deepEqual(rows.map(r=>r.reps),[5,6,7,8]);assert.equal(rows[1].weight,'22.046226');assert.equal(rows[0].weight,'0');assert.equal(rows[0].rir,0)
  assert.equal(rows[0].plan_notes,'Plan note');assert.equal(rows[0].workout_notes,'Workout note');assert.equal(rows[0].exercise_notes,text);assert.equal(rows[0].exercise_instructions,'Original instructions');assert.equal(rows[0].time_source,'session_completed_at');assert.equal(rows[0].performed_at_utc,log.completedAt)
  const parsed=Papa.parse(csv.csv,{header:true});assert.deepEqual(parsed.errors,[]);assert.equal(parsed.data.length,4);assert.deepEqual(Object.keys(parsed.data[0]),ANALYSIS_COLUMNS);assert.equal(parsed.data[0].exercise_notes,"'"+text)
  const after=await captureProfile(f.id,f.db);before.capturedAt=after.capturedAt;assert.deepEqual(after,before);assert.equal('photos' in snap,false)
})

test('explicit skips and manual completion export saved prescriptions; future occurrences and unfinished drafts are excluded',async t=>{
  const f=await fixture(t),{plan}=await planFixture(f),weekly=weeklyService(f.db),[run]=await weekly.activate(f.id,plan.id),events=occurrences(run,run.startWeek,addDays(run.startWeek,6))
  let updated=await weekly.outcome(f.id,events[0].ref,run.revision,'skipped');await weekly.outcome(f.id,events[1].ref,updated.revision,'completed')
  const rows=analysisRows(await captureAnalysis(f.id,f.db));assert.equal(rows.length,8)
  assert.deepEqual(rows.slice(0,4).map(r=>r.reps),Array(4).fill('Skipped'));assert.equal(rows[4].status,'Marked complete');assert.equal(rows[4].reps,'None');assert.equal(rows[4].workout_status,'Completed')
  const d=await f.sessions.start(f.id,plan.id,plan.days[0].id);assert.equal(analysisRows(await captureAnalysis(f.id,f.db)).length,8);await f.sessions.discard(f.id,d.id,d.revision)
})

test('Interval CSV keeps four executions separate, preserves fractional stopped actuals and backup19 restores the retained ledger',async t=>{
  const f=await fixture(t),day=intervalDay(3);day.exercises=day.exercises.slice(0,1);day.circuits[0].exerciseIds=[day.exercises[0].id]
  const w=await f.workouts.save(f.id,day);let d=await f.sessions.startStandalone(f.id,w.id)
  const now=Date.now(),clock=Date.now;Date.now=()=>now
  try {
    d=await f.sessions.startInterval(f.id,d.id,d.revision,'circuit',day.circuits[0].id)
    Date.now=()=>now+17525;d=await f.sessions.intervalAction(f.id,d.id,d.revision,'stop')
    await assert.rejects(f.sessions.intervalAction(f.id,d.id,d.revision-1,'tick'),/another tab/)
    const snapshot=structuredClone(d);f.db.close();await f.db.open();assert.deepEqual(await f.sessions.getDraft(f.id,d.id),snapshot)
    d.input.exercises[0].notes='Interval own';d.input.exercises[0].noteEdited=true
    const saved=await f.sessions.complete(f.id,d.id,d.revision,d.input,true)
    assert.deepEqual(await f.sessions.complete(f.id,d.id,d.revision,d.input,true),saved,'finalization retry never duplicates activity')
    const rows=analysisRows(await captureAnalysis(f.id,f.db));assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.phase_id)).size,4);assert.deepEqual(rows.map(r=>r.circuit_execution),[1,2,3,4]);assert.equal(rows[0].exercise_time,'7.525, 0');assert.equal(rows[1].exercise_time,'0, 0');assert.equal(rows[0].status,'Partial');assert.equal(rows[0].workout_status,'Completed');assert.equal(rows[0].plan_notes,'NA');assert.equal(rows[0].exercise_notes,'Interval own');assert.equal(rows[0].time_source,'phase_started_at')
    const archive=await generateBackup(await captureProfile(f.id,f.db),'analysis-test'),read=await readBackup(archive.bytes);assert.equal(read.data.backupSchemaVersion,20)
    const restored=await buildRestorePlan(read,undefined,'new',uid(),'Restored',new Date(now).toISOString());assert.deepEqual(restored.result.sessions[0].interval,read.data.sessions[0].interval)
    const invalid=structuredClone(read.data);invalid.sessions[0].interval.activity.attempts.push(invalid.sessions[0].interval.activity.attempts[0]);assert.throws(()=>validateBackupData(invalid),/unique/)
  } finally { Date.now=clock }
})

test('Interval saved notes carry within their prescription/branch; recovery changes, new identities and canceled drafts do not supply notes',async t=>{
  const f=await fixture(t),e=await f.exercises.save(f.id,{trainingType:'interval',name:'Sprint',sets:[],activeSeconds:1,recoverySeconds:0,tagNames:[],notes:'Interval default'})
  const day=()=>{const exercise=copyExercise(exerciseToInput(e,[]),{kind:'exercise' as const,id:e.id});return {id:uid(),trainingType:'interval' as const,name:'Workout',exercises:[exercise],circuits:[{...newCircuit(1),exerciseIds:[exercise.id]}]}}
  const plan=await f.plans.save(f.id,{trainingType:'interval',name:'Interval plan',durationWeeks:3,days:[day(),day()]})
  let d=await f.sessions.start(f.id,plan.id,plan.days[0].id)
  d.interval=intervalCommand(advanceInterval(start(d.day,initialInterval(d.day),Date.now()-11000),Date.now()),'finish');await f.db.drafts.put(d)
  d.input.exercises[0].notes='Carry interval';d.input.exercises[0].noteEdited=true;await f.sessions.complete(f.id,d.id,d.revision,d.input,false)
  d=await f.sessions.start(f.id,plan.id,plan.days[1].id);assert.equal(d.input.exercises[0].notes,'Carry interval');assert.equal(hasDraftProgress(d),false)
  d.input.exercises[0].notes='Canceled';d=await f.sessions.update(f.id,d.id,d.revision,d.input);await f.sessions.discard(f.id,d.id,d.revision)
  const changed=planToInput(plan);changed.days[1].exercises[0].prescription.recoverySeconds=2
  const next=await f.plans.save(f.id,changed,plan);d=await f.sessions.start(f.id,next.id,next.days[1].id);assert.equal(d.input.exercises[0].notes,'Interval default')
})

test('original v18 archive validates its frozen contract before v19 promotion, without inventing timing or note provenance',async t=>{
  const f=await fixture(t),w=await f.workouts.save(f.id,intervalDay()),d=await f.sessions.startStandalone(f.id,w.id)
  d.interval=intervalCommand(advanceInterval(start(d.day,initialInterval(d.day),Date.now()-200000),Date.now()),'finish');await f.db.drafts.put(d);await f.sessions.complete(f.id,d.id,d.revision,d.input,false)
  const snapshot=await captureProfile(f.id,f.db),current=await generateBackup(snapshot,'legacy18'),data=canonicalSnapshot(snapshot)
  data.backupSchemaVersion=18;stripAnalysisFields(data);validateBackupData(data)
  const invalid=structuredClone(data);invalid.drafts[0].interval.activity={version:1,attempts:[]};assert.throws(()=>validateBackupData(invalid),/Unrecognized/)
  const tables=csvTables(data),files=[{path:'data.json',text:JSON.stringify(data)},...tables.map(t=>({path:t.path,text:t.text}))],zip=new JSZip()
  const manifest={...current.manifest,backupSchemaVersion:18,databaseSchemaVersion:12,counts:recordCounts(data),csvRows:Object.fromEntries(tables.map(t=>[t.path,t.rows])),inventory:await Promise.all(files.map(async file=>{const bytes=new TextEncoder().encode(file.text);return {path:file.path,bytes:bytes.length,sha256:await sha256(bytes),mediaType:file.path.endsWith('json')?'application/json':'text/csv; charset=utf-8'}}))}
  files.forEach(file=>zip.file(file.path,file.text,{createFolders:false}));zip.file('manifest.json',JSON.stringify(manifest))
  const restored=await readBackup(await zip.generateAsync({type:'uint8array'}));assert.equal(restored.data.backupSchemaVersion,20);assert.equal(restored.manifest.backupSchemaVersion,18);assert.deepEqual(restored.data.sessions,JSON.parse(JSON.stringify(data.sessions)));assert.equal(restored.data.sessions[0].interval.activity,undefined)
})

test('AI conflicts roll back atomically, per-copy imported notes survive, and retries reuse one authoritative identity',async t=>{
  const f=await fixture(t),a=copyExercise(strength()),b=copyExercise({...strength(),notes:'Other',instructions:'Conflicting'})
  const p={name:'Import',durationWeeks:2,days:[{id:uid(),name:'Day',exercises:[a,b]}]},session=importSession(f.id,f.db)
  await assert.rejects(session.savePlan(p),/Resolve shared instructions/);assert.equal(await f.db.exercises.count(),0);assert.equal(await f.db.plans.count(),0)
  b.prescription.instructions=a.prescription.instructions;const saved=await session.savePlan(p),retry=await session.savePlan(p)
  assert.equal(retry.id,saved.id);assert.equal(await f.db.exercises.count(),1);assert.deepEqual(saved.days[0].exercises.map(e=>e.prescription.notes),['Default','Other'])
  const existing=(await f.db.exercises.toArray())[0];assert.equal(existing.notes,'Default')
  const conflicting={...p,name:'Next',days:[{...p.days[0],id:uid(),exercises:[copyExercise({...strength(),instructions:'Replace library'})]}]}
  await assert.rejects(importSession(f.id,f.db).savePlan(conflicting),/Resolve/);assert.equal((await f.db.exercises.get([f.id,existing.id])).instructions,'Original instructions')
})

test('v12 to v13 upgrade preserves all stores, IDs, active selection and photo bytes without backfilling provenance',async t=>{
  const f=await fixture(t),{plan}=await planFixture(f);await saved(f,await f.sessions.start(f.id,plan.id,plan.days[0].id))
  // Model an actual old schema by opening the existing indexes at v12, retaining
  // data exactly. IndexedDB itself forbids version downgrade, so seed a new test DB.
  const name='boros-test-analysis-upgrade-'+uid(),old=new Dexie(name),schema=Object.fromEntries(f.db.tables.map(table=>[table.name,table.schema.primKey.src + (table.schema.indexes.length ? ','+table.schema.indexes.map(i=>i.src).join(',') : '')]))
  old.version(12).stores(schema);await old.open()
  for(const table of f.db.tables) if(await table.count()) await old.table(table.name).bulkPut(await table.toArray())
  const photoId=uid(), bytes=new Uint8Array([137,80,78,71,0,1,2,3]);await old.table('photos').put({id:photoId,profileId:f.id,role:'avatar',width:1,height:1,createdAt:new Date().toISOString(),blob:new Blob([bytes],{type:'image/png'})})
  const before=await Promise.all(old.tables.map(async table=>[table.name,await table.toArray()]));old.close()
  const upgraded=new BorosDatabase(name);t.after(()=>upgraded.delete());await upgraded.open();assert.equal(upgraded.verno,14)
  assert.deepEqual(await Promise.all(upgraded.tables.map(async table=>[table.name,await table.toArray()])),before)
  assert.deepEqual(new Uint8Array(await (await upgraded.photos.get([f.id,photoId])).blob.arrayBuffer()),bytes)
})

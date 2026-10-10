import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID as uid } from 'node:crypto'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { copyExercise, planInputSchema } from '../../src/schemas/plan.ts'
import { newCircuit, repeatCircuitSchema } from '../../src/schemas/circuit.ts'
import { newCircuit as oldCircuit } from '../../src/schemas/circuit-legacy.ts'
import { convertIntervalDay } from '../../src/schemas/interval-conversion.ts'
import { initialInterval, startInterval, advanceInterval, intervalCommand, intervalDisplay, intervalPhases, intervalStateSchema } from '../../src/schemas/interval-session.ts'
import * as old from '../../src/schemas/interval-session-v2.ts'
import { blankSession, hasDraftProgress } from '../../src/schemas/session.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { parseInterchange, toImportDraft, formattingInstructions } from '../../src/features/create/interchange.ts'
import { photoBytes } from '../fixtures/backup-profile.ts'
import JSZip from 'jszip'
import { csvTables } from '../../src/features/backups/csv.ts'
import { sha256 } from '../../src/features/backups/integrity.ts'
import { validateBackupData, recordCounts } from '../../src/schemas/backup.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { IntervalFeedback } from '../../src/features/train/interval-feedback.ts'

const exercise = (name: string, activeSeconds: number, recoverySeconds: number) => copyExercise({ trainingType: 'interval', name, activeSeconds, recoverySeconds, sets: [], tagNames: [] })
export function sprintMadness() {
  const exercises = [exercise('Push-up',20,10), exercise('Sprint',20,10), exercise('Pull-up',10,20), exercise('High knees',50,10), exercise('Backwards jog',50,10), exercise('Full sprint',20,10)]
  return { id: uid(), trainingType: 'interval' as const, name: 'Sprint Madness', exercises, circuits: [{ ...newCircuit(1), name: 'Starting slow', repeat: 1, restAfterCircuitSeconds: 30, exerciseIds: exercises.slice(0,3).map(e=>e.id) }, { ...newCircuit(2), name: 'Sprint madness', restAfterCircuitSeconds: 30, exerciseIds: exercises.slice(3).map(e=>e.id) }], postWorkoutRestSeconds: 60 }
}
const begin = (day=sprintMadness(), mode: 'continuous'|'circuit'='continuous', circuitId?:string, now=0) => startInterval(initialInterval(day),day,mode,circuitId,uid(),uid(),false,now)
async function fixture(t) { const db=new BorosDatabase('boros-test-repeats-'+uid());t.after(()=>db.delete());const profiles=profileService(db),id=(await profiles.initialize()).activeProfileId;return {db,id,profiles,workouts:workoutService(db),sessions:sessionService(db)} }

test('Sprint Madness is one authoritative 490-second sequence, with distinct recoveries/rests, exact labels and block resets',()=>{
 const day=sprintMadness(),run=begin(day),phases=run.execution!.phaseIds.map(id=>run.phases.find(p=>p.id===id)!)
 assert.equal(intervalDisplay(run).total,490);assert.equal(intervalDisplay(run).title,'Warm Up')
 assert.deepEqual(phases.map(p=>p.durationSeconds),[10,20,10,20,10,10,20,30,20,10,20,10,10,20,30,50,10,50,10,20,10,30,60])
 const expectedNext=['Push-up','Rest','Sprint','Rest','Pull-up','Rest','Rest','Push-up','Rest','Sprint','Rest','Pull-up','Rest','Rest','High knees','Rest','Backwards jog','Rest','Full sprint','Rest','Rest','Post-Workout Rest','Workout Complete!']
 let ms=0
 phases.forEach((phase,index)=>{const view=intervalDisplay(advanceInterval(run,ms));assert.equal(view.next,expectedNext[index]);assert.equal(view.remaining,phase.durationSeconds);assert.equal(view.duration,phase.kind==='preparation'?10:phase.kind==='workout-rest'?60:phase.kind==='circuit-rest'?30:phase.circuitId===day.circuits[0].id?90:150);if(phase.kind==='active' && phase.exerciseName==='Push-up')assert.equal(view.progress,0);ms+=phase.durationSeconds*1000})
 const done=advanceInterval(run,ms);intervalStateSchema.parse(done);assert.equal(done.status,'finished');assert.equal(done.results.filter(r=>r.phase.kind==='active').length,9);assert.equal(new Set(done.results.map(r=>r.phase.id)).size,done.results.length)
 assert.equal(intervalDisplay(begin(day,'circuit',day.circuits[0].id)).total,250);assert.equal(intervalDisplay(begin(day,'circuit',day.circuits[1].id)).total,190)
 for(const c of day.circuits){const one=begin(day,'circuit',c.id);assert.ok(one.execution!.phaseIds.every(id=>one.phases.find(p=>p.id===id)!.kind!=='workout-rest'));const last=advanceInterval(one,intervalDisplay(one).total*1000-1);assert.equal(intervalDisplay(last).next,'Circuit Complete!')}
 day.postWorkoutRestSeconds=0;assert.equal(intervalDisplay(begin(day)).total-10,420);day.circuits[1].restAfterCircuitSeconds=0;assert.equal(intervalDisplay(begin(day)).total-10,390)
})

test('repeat limits are strict; zero repeats executes once, ten executes eleven times, each with its own rest and cue identities',()=>{
 for(const repeat of [0,1,10]){const day=sprintMadness();day.circuits[0].repeat=repeat;const run=begin(day,'circuit',day.circuits[0].id),done=advanceInterval(run,intervalDisplay(run).total*1000);assert.equal(done.results.filter(r=>r.phase.kind==='circuit-rest').length,repeat+1);assert.equal(done.execution!.cues.filter(c=>c.kind==='start').length,3*(repeat+1));assert.equal(done.execution!.cues.filter(c=>c.kind==='warning').length,3*(repeat+1));assert.equal(done.execution!.cues.filter(c=>c.kind==='complete').length,0)}
 for(const repeat of [-1,1.5,11,NaN,Infinity])assert.equal(repeatCircuitSchema.safeParse({...newCircuit(1),exerciseIds:[uid()],repeat}).success,false)
 assert.equal(repeatCircuitSchema.safeParse({...newCircuit(1),exerciseIds:[uid()],sets:1}).success,false)
 const day=sprintMadness();day.circuits.forEach(c=>c.restAfterCircuitSeconds=0);day.exercises.forEach(e=>{e.prescription.recoverySeconds=0});day.postWorkoutRestSeconds=0;const run=begin(day);assert.ok(run.execution!.phaseIds.every(id=>run.phases.find(p=>p.id===id)!.durationSeconds>0))
})

test('Stop resets only its scope, natural completion retains results, and preparation/mode alone are not entered input',()=>{
 const day=sprintMadness(),one=advanceInterval(begin(day,'circuit',day.circuits[0].id),250000)
 const two=startInterval(one,day,'circuit',day.circuits[1].id,uid(),uid(),false,300000),reset=intervalCommand(advanceInterval(two,310000),'stop',310000)
 assert.deepEqual(reset.results,one.results);assert.equal(reset.execution,undefined);assert.equal(reset.status,'ready')
 const continuous=startInterval(reset,day,'continuous',undefined,uid(),uid(),true,400000),cleared=intervalCommand(advanceInterval(continuous,420000),'stop',420000)
 assert.deepEqual(cleared.results,[]);assert.equal(cleared.elapsedMs,0)
 const draft={day,input:blankSession(day,'kg'),interval:begin(day)}
 assert.equal(hasDraftProgress(draft),false);assert.equal(hasDraftProgress({...draft,interval:advanceInterval(draft.interval,9999)}),false)
 assert.equal(hasDraftProgress({...draft,interval:advanceInterval(draft.interval,10001)}),true)
 assert.equal(hasDraftProgress({...draft,interval:cleared}),false);assert.equal(hasDraftProgress({...draft,interval:cleared,input:{...draft.input,notes:'Keep me'}}),true)
 assert.equal(hasDraftProgress({...draft,interval:one}),true);assert.equal(hasDraftProgress({...draft,interval:cleared,structure:{amended:true,exercises:[]}}),true)
})

test('serialized stale writes cannot resurrect Stop results; failed reset leaves recoverable state and notes',async t=>{
 const f=await fixture(t),w=await f.workouts.save(f.id,sprintMadness()),d=await f.sessions.startStandalone(f.id,w.id)
 let run=await f.sessions.startInterval(f.id,d.id,d.revision,'continuous');const at=Date.parse(run.interval!.anchorAt!);run={...run,interval:advanceInterval(run.interval!,at+6000)};await f.db.drafts.put(run)
 const stop=await f.sessions.intervalAction(f.id,d.id,run.revision,'stop','Keep note')
 await assert.rejects(f.sessions.intervalAction(f.id,d.id,run.revision,'tick'),/another tab/);assert.deepEqual((await f.sessions.getDraft(f.id,d.id)).interval!.results,[]);assert.equal(stop.input.notes,'Keep note')
 run=await f.sessions.startInterval(f.id,d.id,stop.revision,'continuous');const before=await f.sessions.getDraft(f.id,d.id)
 const deny=()=>{throw new Error('Injected reset failure')};f.db.drafts.hook('updating',deny);await assert.rejects(f.sessions.intervalAction(f.id,d.id,run.revision,'stop'),/Injected/);f.db.drafts.hook('updating').unsubscribe(deny)
 assert.deepEqual(await f.sessions.getDraft(f.id,d.id),before)
})

test('legacy conversion preserves ordered activity and every old rest boundary, splits counts above eleven, is deterministic and idempotent',()=>{
 for(const [sets,rounds,between,after] of [[3,5,30,40],[100,100,7,9],[1,100,0,0],[1,1,0,20]]){
  const e=exercise('Original',20,10),day={id:uid(),name:'Legacy',trainingType:'interval' as const,exercises:[e],circuits:[{...oldCircuit(1),exerciseIds:[e.id],sets,roundsPerSet:rounds,restBetweenSetsSeconds:between,restAfterCircuitSeconds:after}]}
  const converted=convertIntervalDay(day),signature=phases=>phases.filter(p=>p.durationSeconds>0).map(p=>[p.kind==='set-rest'?'circuit-rest':p.kind,p.exerciseName,p.durationSeconds])
  assert.deepEqual(signature(intervalPhases(converted)),signature(old.intervalPhases(day)));assert.deepEqual(convertIntervalDay(day),converted);assert.deepEqual(convertIntervalDay(converted),converted);assert.equal(converted.exercises[0].id,e.id);assert.ok(converted.circuits.every(c=>c.repeat>=0&&c.repeat<=10&&!('sets'in c)));planInputSchema.parse({name:'Plan',trainingType:'interval',days:[converted]})
 }
})

test('v8 AI is strict and older versions convert explicitly without losing timing',()=>{
 for(const kind of ['exercise','workout','plan'] as const){const prompt=formattingInstructions(kind,'interval'),sample=prompt.slice(prompt.indexOf('{\n'));assert.deepEqual(parseInterchange(sample).issues,[])}
 const payload={schemaVersion:8,trainingType:'interval',kind:'workout',workout:{name:'Import',circuits:[{name:'C',exercises:[{name:'Sprint',activeSeconds:20,recoverySeconds:10}],repeat:1,restAfterCircuitSeconds:30}],postWorkoutRestSeconds:60}}
 assert.deepEqual(parseInterchange(JSON.stringify(payload)).issues,[])
 for(const repeat of [-1,0.5,11])assert.ok(parseInterchange(JSON.stringify({...payload,workout:{...payload.workout,circuits:[{...payload.workout.circuits[0],repeat}]}})).issues.some(i=>i.path.includes('repeat')))
 const contradictory=structuredClone(payload);Object.assign(contradictory.workout.circuits[0],{sets:2});assert.ok(parseInterchange(JSON.stringify(contradictory)).issues.some(i=>i.path.endsWith('.sets')))
 const legacy=structuredClone(payload);legacy.schemaVersion=7;delete legacy.workout.circuits[0].repeat;Object.assign(legacy.workout.circuits[0],{sets:3,roundsPerSet:5,restBetweenSetsSeconds:40});const parsed=parseInterchange(JSON.stringify(legacy));assert.deepEqual(parsed.issues,[]);const draft=toImportDraft(parsed.value!);assert.equal(draft.kind,'workout');assert.ok(draft.input.circuits.length>1);assert.equal(intervalPhases(draft.input).reduce((n,p)=>n+p.durationSeconds,0),15*30+2*40+30+60)
})

test('populated v9 upgrades convert only templates, retaining started/finalized snapshots, selection and photo bytes',async t=>{
 const f=await fixture(t),e=exercise('Old',20,10),day={id:uid(),name:'Old workout',trainingType:'interval' as const,exercises:[e],circuits:[{...oldCircuit(1),exerciseIds:[e.id],sets:3,roundsPerSet:5,restBetweenSetsSeconds:20,restAfterCircuitSeconds:30}]}
 const saved=await f.workouts.save(f.id,day),w={...saved,...day};await f.db.workouts.put(w)
 const d=await f.sessions.startStandalone(f.id,w.id),state=old.startInterval(old.initialInterval(day),day,'circuit',day.circuits[0].id,uid(),uid(),false,Date.now())
 const original={...d,day,input:blankSession(day,'kg'),interval:old.advanceInterval(state,Date.parse(state.anchorAt!)+62000)};await f.db.drafts.put(original)
 const profile=await f.db.profiles.get(f.id);await f.profiles.save(f.id,profile!.revision,{name:'Migration owner',weightUnit:'kg',heightUnit:'cm',weightKg:70},{blob:new Blob([photoBytes],{type:'image/png'}),width:1,height:1})
 const snapshot=Object.fromEntries(await Promise.all(f.db.tables.filter(t => t.name !== 'activeWorkouts').map(async table=>[table.name,await table.toArray()]))),dbName='boros-test-v9-'+uid(),v9=new Dexie(dbName)
 v9.version(9).stores(Object.fromEntries(f.db.tables.filter(t => t.name !== 'activeWorkouts').map(table=>[table.name,[table.schema.primKey.src,...table.schema.indexes.map(i=>i.src)].join(',')])));await v9.open();for(const [name,rows]of Object.entries(snapshot))await v9.table(name).bulkPut(rows);v9.close()
 const next=new BorosDatabase(dbName);t.after(()=>next.delete());await next.open();assert.equal(next.verno,12)
 for(const name of Object.keys(snapshot).filter(n=>n!=='workouts'&&n!=='plans'&&n!=='photos'))assert.deepEqual(await next.table(name).toArray(),snapshot[name],name)
 assert.deepEqual((await next.workouts.toArray())[0],convertIntervalDay(w));assert.deepEqual(new Uint8Array(await (await next.photos.toArray())[0].blob.arrayBuffer()),photoBytes)
 const recovered=await sessionService(next).intervalAction(f.id,d.id,original.revision,'recover',undefined,true);assert.deepEqual(recovered.interval!.results,original.interval.results);assert.equal(recovered.interval!.phaseId,original.interval.phaseId);assert.equal(recovered.interval!.elapsedMs,original.interval.elapsedMs)
})

test('current backup restore/export preserves repeated identities, timings, source links and inert checkpoints',async t=>{
 const f=await fixture(t),w=await f.workouts.save(f.id,sprintMadness()),d=await f.sessions.startStandalone(f.id,w.id),run=await f.sessions.startInterval(f.id,d.id,d.revision,'continuous')
 await f.db.drafts.put({...run,interval:advanceInterval(run.interval!,Date.parse(run.interval!.anchorAt!)+150000)})
 const bundle=await generateBackup(await captureProfile(f.id,f.db),'repeat-test'),read=await readBackup(bundle.bytes,()=>{},async()=>{});assert.equal(read.data.backupSchemaVersion,18)
 const plan=await buildRestorePlan(read,undefined,'new',uid(),'Restored',new Date().toISOString()),checkpoint=plan.result.drafts[0];assert.equal(checkpoint.interval!.status,'paused');assert.equal(checkpoint.interval!.execution!.owner,undefined)
 assert.deepEqual(checkpoint.day,JSON.parse(JSON.stringify(run.day)));assert.equal(intervalDisplay(checkpoint.interval!).duration,90)
 const again=await generateBackup(plan.result,'repeat-test'),reread=await readBackup(again.bytes,()=>{},async()=>{});assert.deepEqual(reread.data.workouts,plan.result.workouts);assert.deepEqual(reread.data.drafts,JSON.parse(JSON.stringify(plan.result.drafts)))
})

test('strict original v15 archive retains started/completed legacy timing including post-rest, then converts templates only',async t=>{
 const f=await fixture(t),day=sprintMadness();day.circuits=day.circuits.map(({repeat: _repeat,...c})=>({...oldCircuit(1),...c,sets:3,roundsPerSet:5,restBetweenSetsSeconds:40}))
 const saved=await f.workouts.save(f.id,day),w={...saved,...day};await f.db.workouts.put(w)
 const make=async()=>{const d=await f.sessions.startStandalone(f.id,w.id),running=old.startInterval(old.initialInterval(day),day,'continuous',undefined,uid(),uid(),false,Date.now()-160000);const record={...d,day,input:blankSession(day,'kg'),structure:undefined,sourceDayId:day.id,interval:old.intervalCommand(running,'pause')};await f.db.drafts.put(record);return record}
 const first=await make();await f.sessions.complete(f.id,first.id,first.revision,first.input,true);const pending=await make()
 const snapshot=await captureProfile(f.id,f.db),bundle=await generateBackup(snapshot,'compat'),data=canonicalSnapshot(snapshot);data.backupSchemaVersion=15;validateBackupData(data)
 const invalid=structuredClone(data);invalid.workouts[0].circuits[0].repeat=1;assert.throws(()=>validateBackupData(invalid),/Unrecognized|repeat/)
 const tables=csvTables(data),payload=[{path:'data.json',bytes:new TextEncoder().encode(JSON.stringify(data)),mediaType:'application/json'},...tables.map(t=>({path:t.path,bytes:new TextEncoder().encode(t.text),mediaType:'text/csv'}))],zip=new JSZip()
 const manifest={...bundle.manifest,backupSchemaVersion:15,databaseSchemaVersion:9,counts:recordCounts(data),csvRows:Object.fromEntries(tables.map(t=>[t.path,t.rows])),inventory:await Promise.all(payload.map(async p=>({path:p.path,bytes:p.bytes.length,sha256:await sha256(p.bytes),mediaType:p.mediaType})))}
 for(const p of payload)zip.file(p.path,p.bytes,{createFolders:false});zip.file('manifest.json',JSON.stringify(manifest))
 const read=await readBackup(await zip.generateAsync({type:'uint8array'}),()=>{},async()=>{});assert.equal(read.manifest.backupSchemaVersion,15);assert.deepEqual(read.data.sessions,JSON.parse(JSON.stringify(snapshot.sessions)));assert.deepEqual(read.data.drafts,JSON.parse(JSON.stringify(snapshot.drafts)));assert.deepEqual(read.data.workouts[0],JSON.parse(JSON.stringify(convertIntervalDay(w))))
 const recovered=await f.sessions.intervalAction(f.id,pending.id,pending.revision,'recover',undefined,true);assert.equal(recovered.interval!.phaseId,pending.interval.phaseId);assert.equal(recovered.interval!.elapsedMs,pending.interval.elapsedMs)
})

test('pending legacy snapshots can append new circuits without dropping either sequence; omitted current repeat defaults to zero',()=>{
 const day=sprintMadness(),legacy={...oldCircuit(1),exerciseIds:day.circuits[0].exerciseIds,sets:2,roundsPerSet:2,restBetweenSetsSeconds:30};day.circuits[0]=legacy
 const phases=intervalPhases(day),prior=old.intervalPhases({...day,circuits:[legacy],postWorkoutRestSeconds:0})
 assert.deepEqual(phases.filter(p=>p.circuitId===legacy.id),prior);assert.equal(phases.filter(p=>p.circuitId===day.circuits[1].id&&p.kind==='active').length,3)
 intervalStateSchema.parse(initialInterval(day))
 const missing=sprintMadness();delete missing.circuits[0].repeat;assert.equal(convertIntervalDay(missing).circuits[0].repeat,0)
})

test('actual feedback plays each repeated active start/warning/end once; preparation, rest and Stop stay silent',async()=>{
 const day=sprintMadness(),run=begin(day,'circuit',day.circuits[0].id),played:string[]=[],audio=(name:string)=>({muted:false,volume:1,currentTime:0,onended:null,onerror:null,pause(){},play(){played.push(name);return Promise.resolve()}}),media={start:audio('start'),warning:audio('warning'),end:audio('end'),complete:audio('complete')},feedback=new IntervalFeedback(media),original=Date.now;let now=0;Date.now=()=>now
 try{feedback.update(run,true,now);for(now=1000;now<=245000;now+=1000){const state=advanceInterval(run,now);feedback.update(state,true,now);feedback.update(state,true,now);Object.values(media).forEach(m=>m.onended?.({}));await Promise.resolve()}assert.equal(played.filter(v=>v==='start').length,6);assert.equal(played.filter(v=>v==='warning').length,6);assert.equal(played.filter(v=>v==='end').length,6);assert.equal(played.includes('complete'),false);const count=played.length;feedback.cancel();feedback.update(intervalCommand(run,'stop',now),true,now);assert.equal(played.length,count)}finally{Date.now=original;feedback.cancel()}
})

test('failed v10 conversion rolls the whole upgrade back and retains the original v9 profile and malformed record',async t=>{
 const f=await fixture(t),day=sprintMadness(),w=await f.workouts.save(f.id,day),name='boros-test-rejected-v10-'+uid(),prior=new Dexie(name)
 prior.version(9).stores(Object.fromEntries(f.db.tables.filter(t => t.name !== 'activeWorkouts').map(table=>[table.name,[table.schema.primKey.src,...table.schema.indexes.map(i=>i.src)].join(',')])));await prior.open()
 for(const table of f.db.tables.filter(t=>t.name!=='activeWorkouts'))await prior.table(table.name).bulkPut(await table.toArray())
 const bad={...w,circuits:[{...oldCircuit(1),exerciseIds:[uid()]}]};await prior.table('workouts').put(bad);const settings=await prior.table('settings').toArray(),profiles=await prior.table('profiles').toArray();prior.close()
 const next=new BorosDatabase(name);await assert.rejects(next.open(),/missing an exercise.*original record was preserved/i);next.close()
 const inspect=new Dexie(name);await inspect.open();t.after(()=>inspect.delete());assert.equal(inspect.verno,9);assert.deepEqual(await inspect.table('workouts').toArray(),[bad]);assert.deepEqual(await inspect.table('profiles').toArray(),profiles);assert.deepEqual(await inspect.table('settings').toArray(),settings)
})

import { newCircuit as oldCircuit } from '../../src/schemas/circuit-legacy.ts'
import { convertIntervalDay } from '../../src/schemas/interval-conversion.ts'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import JSZip from 'jszip'
import { csvTables } from '../../src/features/backups/csv.ts'
import { sha256 } from '../../src/features/backups/integrity.ts'
import { recordCounts } from '../../src/schemas/backup.ts'
import { photoBytes } from '../fixtures/backup-profile.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID as uid } from 'node:crypto'
import { copyExercise } from '../../src/schemas/plan.ts'
import { newCircuit } from '../../src/schemas/circuit.ts'
import { initialInterval, startInterval, advanceInterval, intervalCommand, intervalDisplay, intervalStateSchema, partialInterval, meaningfulInterval, formatIntervalTime, upgradeInterval } from '../../src/schemas/interval-session.ts'
import * as legacy from '../../src/schemas/interval-legacy.ts'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { timerClient } from '../../src/db/timer-coordinator.ts'
import { blankSession, hasDraftProgress, preparationRemaining, timerRemaining, timerElapsed } from '../../src/schemas/session.ts'
import { IntervalFeedback } from '../../src/features/train/interval-feedback.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { formattingInstructions, parseInterchange, toImportDraft } from '../../src/features/create/interchange.ts'
import { copyWorkout } from '../../src/schemas/workout.ts'
import { readFileSync } from 'node:fs'
const exercise = (name, activeSeconds, recoverySeconds) => copyExercise({ name, trainingType: 'interval', activeSeconds, recoverySeconds, tagNames: [], sets: [] })
function workoutA() {
  const exercises = [exercise('Jumping Jacks',20,10),exercise('Push-ups',20,10),exercise('Sprint',20,20),exercise('Squats',40,20)]
  return { id: uid(), name:'Workout A', trainingType:'interval' as const, exercises, circuits:[{...newCircuit(1),exerciseIds:exercises.slice(0,2).map(e=>e.id),restAfterCircuitSeconds:30},{...newCircuit(2),exerciseIds:exercises.slice(2).map(e=>e.id)}], postWorkoutRestSeconds:60 }
}
const begin = (day, mode='continuous', circuitId?, now=0) => startInterval(initialInterval(day),day,mode,circuitId,uid(),uid(),false,now)
async function fixture(t) { const db=new BorosDatabase('boros-test-timer-'+uid());t.after(()=>db.delete());const profiles=profileService(db),id=(await profiles.initialize()).activeProfileId;return {db,id,profiles,workouts:workoutService(db),plans:planService(db),sessions:sessionService(db)} }
test('Workout A: exact 260/100/110 second timelines, separate preparation/circuit/workout blocks and normalized times',()=>{
 const day=workoutA(),state=begin(day)
 const entries=[[0,'Warm Up',10,10],[10,'Jumping Jacks',20,60],[30,'Rest',10,60],[40,'Push-ups',20,60],[60,'Rest',10,60],[70,'Rest',30,30],[100,'Sprint',20,100],[120,'Rest',20,100],[140,'Squats',40,100],[180,'Rest',20,100],[200,'Post-Workout Rest',60,60]]
 for(const [at,title,remaining,duration] of entries){const s=advanceInterval(state,Number(at)*1000),v=intervalDisplay(s);assert.equal(v.title,title);assert.equal(v.remaining,remaining);assert.equal(v.duration,duration);assert.equal(v.total,260);intervalStateSchema.parse(s)}
 assert.equal(advanceInterval(state,260000).status,'finished');assert.equal(partialInterval(advanceInterval(state,260000)),false)
 const first=begin(day,'circuit',day.circuits[0].id),second=begin(day,'circuit',day.circuits[1].id)
 assert.equal(intervalDisplay(first).total,100);assert.equal(intervalDisplay(second).total,110)
 for(const [s,total] of [[first,100],[second,110]]){const done=advanceInterval(s,Number(total)*1000);assert.equal(done.status,'finished');assert.equal(partialInterval(done),true);assert.equal(done.results.some(r=>r.phase.kind==='workout-rest'),false);assert.equal(intervalDisplay(advanceInterval(s,Number(total)*1000-1)).next,'Circuit Complete!')}
 assert.equal(formatIntervalTime(60),'01:00');assert.equal(formatIntervalTime(3601),'60:01');assert.equal(formatIntervalTime(-1),'00:00')
})
test('fixed ring spans the core, freezes exactly on pause, excludes paused/closed time and never accumulates scheduler drift',()=>{
 const day=workoutA(),initial=begin(day),a=advanceInterval(initial,30000),b=advanceInterval(initial,40000)
 assert.equal(intervalDisplay(a).progress,20/60);assert.equal(intervalDisplay(b).progress,30/60)
 const paused=intervalCommand(initial,'pause',32625),view=intervalDisplay(paused);assert.equal(view.remaining,7.375)
 assert.deepEqual(advanceInterval(paused,999999),paused)
 const resumed=intervalCommand(paused,'resume',127625),next=advanceInterval(resumed,135000)
 assert.equal(intervalDisplay(next).title,'Push-ups');assert.equal(intervalDisplay(next).remaining,20)
 const checkpoint=advanceInterval(initial,42625),recovered=intervalCommand(checkpoint,'recover',99999999)
 assert.equal(recovered.elapsedMs,2625);assert.equal(recovered.status,'paused');assert.deepEqual(recovered.results,checkpoint.results)
 let delayed=initial;for(const at of [7101,12903,28611,81999,163401,255007])delayed=advanceInterval(delayed,at)
 assert.deepEqual(delayed.results,advanceInterval(initial,255007).results)
 assert.equal(delayed.results.some(r=>r.phase.kind==='preparation'),false)
})
test('scope restart needs confirmation, keeps other circuit actuals and does not infer whole completion or duplicate results',()=>{
 const day=workoutA();let s=advanceInterval(begin(day,'circuit',day.circuits[1].id),110000)
 const second=structuredClone(s.results)
 s=startInterval(s,day,'circuit',day.circuits[0].id,uid(),uid(),false,110000)
 s=intervalCommand(s,'stop',122000);assert.equal(s.status,'ready');assert.deepEqual(s.results,second)
 assert.throws(()=>startInterval(s,day,'circuit',day.circuits[1].id,uid(),uid(),false,130000),/Confirm/)
 assert.deepEqual(s.results.slice(0,second.length),second)
 s=startInterval(s,day,'circuit',day.circuits[0].id,uid(),uid(),true,130000)
 assert.deepEqual(s.results,second);assert.equal(intervalDisplay(s).title,'Warm Up')
 s=advanceInterval(s,230000);assert.equal(partialInterval(s),false);assert.equal(new Set(s.results.map(r=>r.phase.id)).size,s.results.length);intervalStateSchema.parse(s)
})
test('zero rests skip immediately; final circuit rest stays separate; rounds/sets and preparation count exactly',()=>{
 const day=workoutA();day.circuits[1].restAfterCircuitSeconds=12
 assert.equal(intervalDisplay(begin(day)).total,272)
 let s=advanceInterval(begin(day),200000);assert.equal(intervalDisplay(s).duration,12);assert.equal(intervalDisplay(s).next,'Post-Workout Rest')
 s=advanceInterval(begin(day),212000);assert.equal(intervalDisplay(s).duration,60)
 const e=exercise('Sprint',20,10),single={id:uid(),name:'Sprint',trainingType:'interval' as const,exercises:[e],circuits:[{...oldCircuit(1),exerciseIds:[e.id],roundsPerSet:5,sets:3,restBetweenSetsSeconds:7,restAfterCircuitSeconds:0}],postWorkoutRestSeconds:0}
 assert.throws(()=>begin(single),/individually/)
 const run=begin(single,'circuit',single.circuits[0].id),done=advanceInterval(run,474000)
 assert.equal(intervalDisplay(run).total,474);assert.equal(done.results.filter(r=>r.phase.kind==='active').length,15);assert.equal(done.results.filter(r=>r.phase.kind==='set-rest').length,2);assert.equal(done.execution!.cues.some(c=>c.kind==='complete'),false)
})
test('preparation can pause/stop, resume does not repeat start cues, Stop/Skip never synthesize end cues',()=>{
 const day=workoutA(),p=intervalCommand(begin(day),'pause',2000);assert.equal(intervalDisplay(p).remaining,8);assert.equal(meaningfulInterval(p),false)
 const r=intervalCommand(p,'resume',100000);assert.equal(intervalDisplay(advanceInterval(r,102000)).title,'Warm Up');assert.equal(intervalDisplay(advanceInterval(r,108000)).title,'Jumping Jacks')
 const s=intervalCommand(advanceInterval(r,109000),'stop',109000);assert.equal(s.execution,undefined);assert.deepEqual(s.results,[])
 const skip=intervalCommand(advanceInterval(begin(day),11000),'skip',11000);assert.equal(skip.results[0].status,'partial');assert.equal(skip.execution!.cues.some(c=>c.kind==='end'),false)
 const paused=intervalCommand(advanceInterval(begin(day),21000),'pause',21000),resumed=intervalCommand(paused,'resume',99000)
 assert.deepEqual(resumed.execution!.cues,paused.execution!.cues);assert.equal(resumed.elapsedMs,paused.elapsedMs)
})
test('shared transactional ownership rejects rapid starts, Strength timers and other tabs; explicit recovery revokes stale callbacks',async t=>{
 const f=await fixture(t),w=await f.workouts.save(f.id,workoutA()),a=await f.sessions.startStandalone(f.id,w.id),b=a
 const outcomes=await Promise.allSettled([f.sessions.startInterval(f.id,a.id,a.revision,'continuous'),f.sessions.startInterval(f.id,b.id,b.revision,'continuous')]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1)
 const owned=outcomes.find(r=>r.status==='fulfilled')!.value
 assert.equal(hasDraftProgress(owned),false);assert.equal(meaningfulInterval(owned.interval),false)
 await assert.rejects(f.sessions.startInterval(f.id,owned.id,owned.revision,'continuous'),/Stop/)
 let paused=await f.sessions.intervalAction(f.id,owned.id,owned.revision,'pause');await assert.rejects(f.sessions.intervalMode(f.id,paused.id,paused.revision,'circuit'),/Stop/)
 const foreign={...paused,interval:{...paused.interval,execution:{...paused.interval!.execution!,owner:uid()}}};await f.db.drafts.put(foreign)
 await assert.rejects(f.sessions.intervalAction(f.id,paused.id,paused.revision,'recover'),/another tab/)
 paused=await f.sessions.intervalAction(f.id,paused.id,paused.revision,'recover',undefined,true);assert.equal(paused.interval!.execution!.owner,timerClient());assert.equal(paused.interval!.status,'paused')
 await assert.rejects(f.sessions.intervalAction(f.id,foreign.id,foreign.revision,'tick'),/another tab/)
 const stopped=await f.sessions.intervalAction(f.id,paused.id,paused.revision,'stop');assert.equal(stopped.interval!.status,'ready')
 const selected=await f.sessions.intervalMode(f.id,stopped.id,stopped.revision,'circuit');assert.equal(selected.interval!.results.length,0)
 await f.sessions.discard(f.id,selected.id,selected.revision);await assert.rejects(f.sessions.intervalAction(f.id,selected.id,selected.revision,'tick'),/unavailable/)
})
test('manual countdown/count-up start immediately, pause retains slot, reset starts immediately and zero does not stop another timer',async t=>{
 const f=await fixture(t),e=copyExercise({name:'Lift',sets:[{reps:{min:5,max:5}}],tagNames:[]}),p=await f.plans.save(f.id,{name:'Strength',durationWeeks:2,days:[{id:uid(),name:'Day',exercises:[e]}]});const d=await f.sessions.start(f.id,p.id,p.days[0].id)
 const rest=await f.sessions.startTimer(f.id,d.id,d.revision,e.id,0,10);assert.equal(preparationRemaining(rest!),0);assert.equal(timerRemaining(rest!),10)
 await assert.rejects(f.sessions.startTimer(f.id,d.id,d.revision,e.id,0,0),/Stop/)
 await f.sessions.changeTimer(f.id,d.id,rest!.token,'pause');let saved=(await f.db.restTimers.get('active'))!;assert.ok(saved.pausedAt);await assert.rejects(f.sessions.startTimer(f.id,d.id,d.revision,e.id,0),/Stop/)
 await f.sessions.changeTimer(f.id,d.id,rest!.token,'resume');await f.sessions.changeTimer(f.id,d.id,rest!.token,'reset');saved=(await f.db.restTimers.get('active'))!;assert.notEqual(saved.token,rest!.token);assert.equal(preparationRemaining(saved),0)
 await f.sessions.changeTimer(f.id,d.id,saved.token,'stop');const up=await f.sessions.startTimer(f.id,d.id,d.revision,e.id,0);assert.equal(timerElapsed(up!),0)
 const w=await f.workouts.save(f.id,workoutA());await assert.rejects(f.sessions.startStandalone(f.id,w.id),/active workout/)
})
test('new and older AI contracts keep separate rest fields; library copies, custom snapshots, backup JSON/CSVs and inert restore round trip',async t=>{
 const f=await fixture(t),prompt=formattingInstructions('workout','interval'),value=JSON.parse(prompt.slice(prompt.indexOf('\n{')+1));value.workout.postWorkoutRestSeconds=60
 const parsed=parseInterchange(JSON.stringify(value));assert.deepEqual(parsed.issues,[]);const imported=toImportDraft(parsed.value!);assert.equal(imported.input.postWorkoutRestSeconds,60)
 assert.ok(parseInterchange(JSON.stringify({...value,schemaVersion:6})).issues.length);delete value.workout.postWorkoutRestSeconds;value.workout.circuits=value.workout.circuits.map(({repeat: _repeat,...c})=>({...c,roundsPerSet:1,sets:_repeat+1,restBetweenSetsSeconds:0}));assert.deepEqual(parseInterchange(JSON.stringify({...value,schemaVersion:6})).issues,[])
 const w=await f.workouts.save(f.id,workoutA()),p=await f.plans.save(f.id,{trainingType:'interval',name:'Plan',durationWeeks:2,days:[copyWorkout(w)]});assert.equal(p.days[0].postWorkoutRestSeconds,60)
 const d=await f.sessions.startStandalone(f.id,w.id),run=await f.sessions.startInterval(f.id,d.id,d.revision,'continuous');const snap=await captureProfile(f.id,f.db)
 const zip=await generateBackup(snap,'timer-test'),read=await readBackup(zip.bytes,()=>{},async()=>{});assert.equal(read.data.backupSchemaVersion,18);assert.ok(zip.manifest.csvRows['csv/interval_execution_phases.csv']>0)
 const plan=await buildRestorePlan(read,undefined,'new',uid(),'Restored',new Date().toISOString());const restored=plan.result.drafts[0];assert.equal(restored.interval!.status,'paused');assert.equal(restored.interval!.execution!.owner,undefined);assert.deepEqual(restored.interval!.results,run.interval!.results);assert.equal(restored.day.postWorkoutRestSeconds,60);validateBackupData(canonicalSnapshot(plan.result))
 const second=await readBackup((await generateBackup(plan.result,'roundtrip')).bytes,()=>{},async()=>{});assert.deepEqual(second.data.workouts,read.data.workouts.map(w=>({...w,profileId:plan.result.profile.id})))
})
test('old execution recovers its exact checkpoint without adding preparation or rewriting completed history',()=>{
 const day=workoutA();day.circuits=day.circuits.map(({repeat: _repeat,...c})=>({...oldCircuit(1),...c}));const old=legacy.advanceInterval(legacy.intervalCommand(legacy.initialInterval(day),'resume',0),12345),state=upgradeInterval(old,day)
 assert.equal(state.elapsedMs,old.elapsedMs);assert.equal(state.phaseId,old.phaseId);assert.deepEqual(state.results,old.results);assert.equal(state.execution!.phaseIds.some(id=>id.endsWith(':preparation')),false)
 intervalStateSchema.parse(intervalCommand(state,'recover',999999999))
})
test('local required audio assets exist and are MPEG data, never downloaded substitutes',()=>{
 for(const name of ['circuit-start.mp3','circuit-5s-warning.mp3','circuit-end.mp3','rest-complete.mp3']){const bytes=readFileSync(new URL('../../public/'+name,import.meta.url));assert.ok(bytes.length>1000);assert.ok(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255)}
})
test('cue ledger is once-only: silent preparation and unchanged rest beeps, prioritized zero-rest end/start, pause/off/background suppress old events',async()=>{
 const day=workoutA(),plays: string[]=[],audio=(name)=>({muted:false,volume:1,currentTime:0,onended:null,onerror:null,pause(){},play(){plays.push(name);return Promise.resolve()}}),media={start:audio('start'),warning:audio('warning'),end:audio('end'),complete:audio('complete')}
 const feedback=new IntervalFeedback(media),now=Date.now,at=Date.now();let clock=at;Date.now=()=>clock
 try{
 const run=begin(day,'continuous',undefined,at);feedback.update(run,true,clock);assert.deepEqual(plays,[])
 for(clock=at+1000;clock<at+10000;clock+=1000)feedback.update(advanceInterval(run,clock),true,clock)
 clock=at+10000;const active=advanceInterval(run,clock);feedback.update(active,true,clock);feedback.update(active,true,clock);assert.deepEqual(plays,['start'])
 for(clock=at+11000;clock<at+25000;clock+=1000)feedback.update(advanceInterval(run,clock),true,clock)
 clock=at+25000;feedback.update(advanceInterval(run,clock),true,clock);assert.deepEqual(plays,['start','warning'])
 for(clock=at+26000;clock<at+30000;clock+=1000)feedback.update(advanceInterval(run,clock),true,clock)
 clock=at+30000;feedback.update(advanceInterval(run,clock),true,clock);assert.deepEqual(plays,['start','warning','end'])
 clock=at+40000;feedback.update(advanceInterval(run,clock),false,clock);feedback.update(advanceInterval(run,clock),true,clock);assert.equal(plays.length,3)
 clock=at+60000;feedback.update(advanceInterval(run,clock),true,clock,false);clock+=100;feedback.update(advanceInterval(run,clock),true,clock,true);assert.equal(plays.length,3)
 clock=at+259000;feedback.update(advanceInterval(run,clock),true,clock);clock=at+260000;feedback.update(advanceInterval(run,clock),true,clock);await Promise.resolve();assert.equal(plays.at(-1),'complete');media.complete.onended?.({});media.complete.onended?.({});media.complete.onended?.({});assert.equal(plays.filter(x=>x==='complete').length,3)
 feedback.update(advanceInterval(run,clock),true,clock);assert.equal(plays.filter(x=>x==='complete').length,3)
 }finally{Date.now=now;feedback.cancel()}
})

test('v8 to v9 preserves every record and Blob; original v14 archive validates before promotion, retains old completion meaning',async t=>{
 const f=await fixture(t),profile=(await f.profiles.snapshot(f.id)).profile
 await f.profiles.save(f.id,profile.revision,{name:'Owner',weightUnit:'kg',heightUnit:'cm',weightKg:70},{blob:new Blob([photoBytes],{type:'image/png'}),width:1,height:1})
 const day=workoutA();delete day.postWorkoutRestSeconds;day.circuits=day.circuits.map(({repeat: _repeat,...c})=>({...oldCircuit(1),...c}))
 const w=await f.workouts.save(f.id,day),d=await f.sessions.startStandalone(f.id,w.id)
 d.day=day;d.structure=undefined;d.input=blankSession(day,'kg');d.sourceDayId=day.id;await f.db.workouts.put({...w,circuits:day.circuits});d.interval=legacy.intervalCommand(legacy.advanceInterval(legacy.intervalCommand(legacy.initialInterval(d.day),'resume',Date.now()-7000),Date.now()),'pause')
 await f.db.drafts.put(d);const saved=await f.sessions.complete(f.id,d.id,d.revision,d.input,true)
 const stores=await Promise.all(f.db.tables.map(async table=>[table.name,await table.toArray()] as const))
 const name='boros-test-v8-'+uid(),old=new Dexie(name);old.version(8).stores(Object.fromEntries(f.db.tables.map(table=>[table.name,[table.schema.primKey.src,...table.schema.indexes.map(i=>i.src)].join(',')])));await old.open()
 for(const [store,rows] of stores)await old.table(store).bulkPut(rows)
 old.close();const next=new BorosDatabase(name);t.after(()=>next.delete());await next.open();assert.equal(next.verno,12)
 for(const [store,rows] of stores)assert.deepEqual(await next.table(store).toArray(),store==='workouts'?rows.map(convertIntervalDay):rows)
 assert.deepEqual(new Uint8Array(await (await next.photos.toArray())[0].blob.arrayBuffer()),photoBytes)
 const snapshot=await captureProfile(f.id,f.db),exported=await generateBackup(snapshot,'legacy'),current=await JSZip.loadAsync(exported.bytes),data=canonicalSnapshot(snapshot);data.backupSchemaVersion=14
 validateBackupData(data);assert.equal(data.sessions[0].partial,saved.partial)
 const payload=[{path:'data.json',bytes:new TextEncoder().encode(JSON.stringify(data)),mediaType:'application/json'},...csvTables(data).map(t=>({path:t.path,bytes:new TextEncoder().encode(t.text),mediaType:'text/csv'})),...await Promise.all(data.assets.map(async a=>({path:a.path,bytes:await current.file(a.path)!.async('uint8array'),mediaType:a.mediaType})))],zip=new JSZip()
 const manifest={...exported.manifest,backupSchemaVersion:14,databaseSchemaVersion:8,counts:recordCounts(data),csvRows:Object.fromEntries(csvTables(data).map(t=>[t.path,t.rows])),inventory:await Promise.all(payload.map(async p=>({path:p.path,bytes:p.bytes.length,sha256:await sha256(p.bytes),mediaType:p.mediaType})))}
 for(const file of payload)zip.file(file.path,file.bytes,{createFolders:false});zip.file('manifest.json',JSON.stringify(manifest))
 const bytes=await zip.generateAsync({type:'uint8array'}),read=await readBackup(bytes,()=>{},async()=>{});assert.equal(read.data.backupSchemaVersion,18);assert.equal(read.manifest.backupSchemaVersion,14);assert.deepEqual(read.data.sessions,JSON.parse(JSON.stringify(snapshot.sessions)))
 const invalid=structuredClone(data);invalid.workouts[0].postWorkoutRestSeconds=30;assert.throws(()=>validateBackupData(invalid),/Unrecognized|postWorkout/)
 zip.file('data.json',JSON.stringify(invalid));await assert.rejects(readBackup(await zip.generateAsync({type:'uint8array'}),()=>{},async()=>{}),/checksum|size/)
})
test('zero-rest cue order, short phases, restart generations, denied assets and stale gaps never create overlapping or replayed feedback',async()=>{
 const e=exercise('Short',5,0),day={id:uid(),name:'Short pair',trainingType:'interval' as const,exercises:[e,exercise('Next',5,0)],circuits:[newCircuit(1)]};day.circuits[0].exerciseIds=day.exercises.map(e=>e.id)
 const plays:string[]=[],audio=(name)=>({muted:false,volume:1,currentTime:0,onended:null,onerror:null,pause(){},play(){if(!this.muted)plays.push(name);return Promise.resolve()}}),media={start:audio('start'),warning:audio('warning'),end:audio('end'),complete:audio('complete')},feedback=new IntervalFeedback(media),original=Date.now,at=Date.now();let clock=at;Date.now=()=>clock
 try{
 const run=begin(day,'circuit',day.circuits[0].id,at);feedback.update(run,true,clock);feedback.unlock(true);await Promise.resolve();assert.deepEqual(plays,[])
 for(clock=at+1000;clock<=at+15000;clock+=1000)feedback.update(advanceInterval(run,clock),true,clock)
 assert.deepEqual(plays,['start','end']);for(clock=at+16000;clock<=at+17000;clock+=1000)feedback.update(advanceInterval(run,clock),true,clock);clock=at+17000;media.end.onended?.({});assert.deepEqual(plays,['start','end','start']);assert.equal(plays.includes('warning'),false)
 feedback.cancel();clock=at+20000;feedback.update(advanceInterval(run,clock),true,clock);assert.equal(plays.length,3) // Throttled gap: no old end cue.
 const stopped=intervalCommand(advanceInterval(run,at+16000),'stop',at+16000);feedback.update(stopped,true,at+16000);assert.equal(plays.length,3)
 feedback.reset();const next=startInterval(stopped,day,'circuit',day.circuits[0].id,uid(),uid(),true,clock);feedback.update(next,true,clock)
 media.start.play=()=>Promise.reject(new Error('missing asset'));for(let i=1;i<=10;i++){clock+=1000;feedback.update(advanceInterval(next,clock),true,clock)}await Promise.resolve();assert.equal(advanceInterval(next,clock).status,'running')
 }finally{Date.now=original;feedback.cancel()}
})

test('exercise-name speech uses local voices after the start cue only; newer cues and Sound Off cancel it',()=>{
 const day=workoutA(),spoken:string[]=[],audio=()=>({muted:false,volume:1,currentTime:0,onended:null,onerror:null,pause(){},play(){return Promise.resolve()}}),media={start:audio(),warning:audio(),end:audio(),complete:audio()}
 const local={localService:true},remote={localService:false};let voices=[remote,local],cancels=0
 const speech={cancel(){cancels++},getVoices(){return voices},speak(utterance){assert.equal(utterance.voice,local);spoken.push(utterance.text)}}
 const originalUtterance=globalThis.SpeechSynthesisUtterance,originalNow=Date.now,at=Date.now();let clock=at
 globalThis.SpeechSynthesisUtterance=class {text:string;constructor(text:string){this.text=text}} as unknown as typeof SpeechSynthesisUtterance
 Date.now=()=>clock
 const feedback=new IntervalFeedback(media,speech as unknown as SpeechSynthesis)
 try {
  const run=begin(day,'continuous',undefined,at);feedback.update(run,true,clock)
  for(clock=at+1000;clock<=at+10000;clock+=1000)feedback.update(advanceInterval(run,clock),true,clock)
  for(clock=at+11000;clock<=at+12100;clock+=1000)feedback.update(advanceInterval(run,clock),true,clock)
  clock=at+12100;assert.deepEqual(spoken,[]);media.start.onended?.({});assert.deepEqual(spoken,['Jumping Jacks'])
  const paused=intervalCommand(advanceInterval(run,clock),'pause',clock);feedback.update(paused,true,clock);assert.ok(cancels>0)
  feedback.update(intervalCommand(paused,'resume',clock),true,clock);assert.deepEqual(spoken,['Jumping Jacks'])
  for(clock=at+13000;clock<=at+40000;clock+=1000)feedback.update(advanceInterval(run,clock),true,clock)
  clock=at+40000;voices=[remote];media.start.onended?.({});assert.deepEqual(spoken,['Jumping Jacks','Rest'])
  feedback.update(advanceInterval(run,clock),false,clock);assert.equal(media.start.onended,null)
 } finally {feedback.cancel();Date.now=originalNow;if(originalUtterance)globalThis.SpeechSynthesisUtterance=originalUtterance;else delete globalThis.SpeechSynthesisUtterance}
})

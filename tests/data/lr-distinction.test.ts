import JSZip from 'jszip'
import { csvTables } from '../../src/features/backups/csv.ts'
import { sha256 } from '../../src/features/backups/integrity.ts'
import { recordCounts } from '../../src/schemas/backup.ts'
import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID as uid } from 'node:crypto'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService, exerciseToInput } from '../../src/db/exercises.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { previewLR, LRConfirmationError } from '../../src/db/lr-conversion.ts'
import { copyExercise } from '../../src/schemas/plan.ts'
import { copyWorkout } from '../../src/schemas/workout.ts'
import { blankResult, convertRecorded, convertInput, lrMode } from '../../src/schemas/strength-results.ts'
import { hasSessionInput } from '../../src/schemas/session.ts'
import { deriveProgress, performanceStats } from '../../src/lib/progress-analytics.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { captureAnalysis } from '../../src/db/analysis.ts'
import { analysisRows, ANALYSIS_COLUMNS } from '../../src/features/backups/analysis.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { DraftController } from '../../src/features/train/draft-controller.ts'
import { parseInterchange, toImportDraft, formattingInstructions } from '../../src/features/create/interchange.ts'
import { importSession } from '../../src/db/imports.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { inferRecordedLR } from '../../src/schemas/lr-compatibility.ts'

const provenance = {operationId:uid(),convertedAt:'2026-10-13T12:00:00.000Z',fromMode:'no' as const}
const stripLR = (value: any) => { if (!value || typeof value !== 'object') return; delete value.lrDistinction; for (const child of Object.values(value)) stripLR(child) }
const actual = (weightKg?:number,reps?:number,rir?:number) => ({skipped:false as const,...(weightKg===undefined?{}:{weightKg,load:weightKg,unit:'kg' as const}),...(reps===undefined?{}:{reps}),...(rir===undefined?{}:{rir})})
const prescription = (mode=false,count=2) => ({name:'Lunge',trainingType:'strength' as const,lrDistinction:mode,sets:Array.from({length:count},()=>({reps:{min:5,max:8},rir:{min:0,max:0}})),tagNames:[],instructions:'Keep instructions',notes:'Keep notes',restBetweenSeconds:30})
async function setup(t, mode=false, count=2) {
  const db=new BorosDatabase('boros-test-lr-'+uid());t.after(()=>db.delete())
  const profiles=profileService(db),id=(await profiles.initialize()).activeProfileId,exercises=exerciseService(db),sessions=sessionService(db)
  const exercise=await exercises.save(id,prescription(mode,count)),workout=await workoutService(db).save(id,{id:uid(),name:'Legs',exercises:[copyExercise(exerciseToInput(exercise,[]),{kind:'exercise',id:exercise.id})]})
  const plan=await planService(db).save(id,{name:'Plan',durationWeeks:2,days:[copyWorkout(workout)]})
  return {db,id,profiles,exercises,sessions,exercise,workout,plan}
}
async function toggle(f,mode, approvals?) {
  const source=await f.exercises.get(f.id,f.exercise.id)
  return f.exercises.save(f.id,{...exerciseToInput(source,[]),lrDistinction:mode},source,undefined,approvals)
}
async function complete(f) {
  const d=await f.sessions.startStandalone(f.id,f.workout.id),input=structuredClone(d.input)
  input.exercises[0].sets.forEach((s,i)=>{const fields={load:String(i*10),reps:String(i+5),rir:i?'':'0'};if(s.sides)Object.assign(s.sides.left,fields);else Object.assign(s,fields)})
  return f.sessions.complete(f.id,d.id,d.revision,input,!!input.exercises[0].sets[0].sides)
}
test('conversion preserves missing/zero, complete winning tuple, units, skip/unrecorded, deterministic ties and idempotency',()=>{
  for(const value of [actual(0,0,0),actual(undefined,8),{skipped:true as const},{skipped:true as const,unrecorded:true as const}]) {
    const sided=convertRecorded(value,true,provenance);assert.ok('sides' in sided)
    for(const side of ['left','right'])assert.deepEqual(sided.sides[side],{...value,conversion:{...provenance,copiedFrom:'unsided'}})
    assert.deepEqual(convertRecorded(sided,true,provenance),sided)
  }
  for(const [left,right,winner] of [[actual(30,12,2),actual(35,8,1),'right'],[actual(30,10,2),actual(30,12,1),'right'],[actual(30,12,2),actual(30,12,9),'left'],[actual(undefined,12),actual(undefined,13),'right'],[actual(undefined,20),actual(0,1),'right'],[{skipped:true},actual(0,0),'right'],[{skipped:true,unrecorded:true},{skipped:true},'left'],[{skipped:true,unrecorded:true},{skipped:true,unrecorded:true},'left']]) {
    const set={sides:{left,right}}, collapsed=convertRecorded(set as never,false,{...provenance,fromMode:'lr'})
    assert.deepEqual(collapsed,{...set.sides[winner],conversion:{...provenance,fromMode:'lr',selectedSide:winner}})
    const again=convertRecorded(collapsed,true,provenance);assert.ok('sides' in again);assert.equal(again.sides.left.skipped,collapsed.skipped)
  }
  assert.equal(convertRecorded({sides:{left:actual(),right:actual()}},false,provenance).unrecorded,true)
  const input={...blankResult('kg',true),sides:{left:{...blankResult('lb'),load:'100',reps:'8',rir:'1'},right:{...blankResult('kg'),load:'40',reps:'20',rir:'9'}}}
  assert.equal(convertInput(input,false,provenance).load,'100');assert.equal(convertInput(input,false,provenance).rir,'1')
})
test('staged preview has no writes; atomic conversion covers linked plans/workouts/drafts/results and preserves ownership, IDs and content',async t=>{
  const f=await setup(t), saved=await complete(f), active=await f.sessions.startStandalone(f.id,f.workout.id)
  const controller=new DraftController(active,f.sessions);t.after(()=>controller.dispose())
  const before=await captureProfile(f.id,f.db), preview=await previewLR(f.id,{id:f.exercise.id,mode:true},f.db)
  assert.equal(preview!.results,1);assert.deepEqual(await captureProfile(f.id,f.db).then(canonicalSnapshot),canonicalSnapshot(before))
  await assert.rejects(toggle(f,true),LRConfirmationError)
  assert.deepEqual(await captureProfile(f.id,f.db).then(canonicalSnapshot),canonicalSnapshot(before))
  await toggle(f,false);assert.equal((await f.db.sessions.get([f.id,saved.id]))!.revision,saved.revision)
  const fresh=await previewLR(f.id,{id:f.exercise.id,mode:true},f.db);await toggle(f,true,{[f.exercise.id]:fresh!.token})
  const after=await captureProfile(f.id,f.db);validateBackupData(canonicalSnapshot(after))
  for(const day of [after.workouts[0],after.plans[0].days[0],...after.sessions.map(s=>s.day),...after.drafts.map(s=>s.day)])assert.equal(lrMode(day.exercises[0].prescription),true)
  const converted=after.sessions[0];assert.equal(converted.id,saved.id);assert.equal(converted.completedAt,saved.completedAt);assert.deepEqual(converted.structure,saved.structure);assert.equal(converted.day.exercises[0].prescription.instructions,'Keep instructions')
  assert.deepEqual(converted.day.exercises[0].prescription.sets,saved.day.exercises[0].prescription.sets)
  const next=after.drafts.find(d=>d.id===active.id)!;controller.reconcile(next);assert.ok(controller.input.exercises[0].sets[0].sides)
  assert.equal((await f.db.activeWorkouts.get('active'))!.draftId,active.id);assert.equal(controller.retired,false)
  const again=await toggle(f,true);assert.equal(again.lrDistinction,true);assert.equal((await f.db.sessions.get([f.id,saved.id]))!.revision,converted.revision)
  await assert.rejects(f.sessions.update(f.id,active.id,active.revision,active.input),/changed|another|reload/i)
})
test('stale preview, active pending input, rollback and profile isolation are safe',async t=>{
  const f=await setup(t);await complete(f)
  const active=await f.sessions.startStandalone(f.id,f.workout.id),controller=new DraftController(active,f.sessions);t.after(()=>controller.dispose())
  const other=await f.profiles.create('Other'),foreign=await f.exercises.save(other.id,prescription()),otherBefore=await captureProfile(other.id,f.db)
  const preview=await previewLR(f.id,{id:f.exercise.id,mode:true},f.db)
  const pending=structuredClone(active.input);pending.exercises[0].sets[0].load='47';controller.change(pending)
  const savedInput=structuredClone(active.input);savedInput.exercises[0].sets[0].load='12';await f.sessions.update(f.id,active.id,active.revision,savedInput)
  await assert.rejects(toggle(f,true,{[f.exercise.id]:preview!.token}),LRConfirmationError)
  const current=await previewLR(f.id,{id:f.exercise.id,mode:true},f.db),before=canonicalSnapshot(await captureProfile(f.id,f.db))
  const fail=()=>{throw new Error('Injected conversion failure')};f.db.sessions.hook('updating',fail)
  await assert.rejects(toggle(f,true,{[f.exercise.id]:current!.token}),/Injected/);f.db.sessions.hook('updating').unsubscribe(fail)
  assert.deepEqual(canonicalSnapshot(await captureProfile(f.id,f.db)),before)
  await toggle(f,true,{[f.exercise.id]:current!.token});controller.reconcile((await f.db.drafts.get([f.id,active.id]))!)
  assert.equal(controller.status,'failed');assert.equal(controller.input.exercises[0].sets[0].load,'47');await assert.rejects(controller.flush(),/L\/R/)
  await controller.reload();assert.equal(controller.input.exercises[0].sets[0].sides!.left.load,'12')
  assert.deepEqual(canonicalSnapshot(await captureProfile(other.id,f.db)),canonicalSnapshot(otherBefore));assert.equal(lrMode(foreign),false)
})
test('an autosave response delayed past conversion cannot clear the actionable conflict or recoverable input',async t=>{
  const f=await setup(t), active=await f.sessions.startStandalone(f.id,f.workout.id)
  let release!:()=>void, committed!:()=>void
  const held=new Promise<void>(resolve=>{release=resolve}), written=new Promise<void>(resolve=>{committed=resolve})
  const service={...f.sessions,update:async(...args:Parameters<typeof f.sessions.update>)=>{
    const result=await f.sessions.update(...args);committed();await held;return result
  }}
  const controller=new DraftController(active,service);t.after(()=>controller.dispose())
  const pending=structuredClone(active.input);pending.exercises[0].sets[0].load='47';controller.change(pending)
  const flushed=controller.flush(), failure=assert.rejects(flushed,/L\/R Distinction changed.*reload/)
  await written
  const preview=await previewLR(f.id,{id:f.exercise.id,mode:true},f.db)
  await toggle(f,true,{[f.exercise.id]:preview!.token})
  controller.reconcile((await f.db.drafts.get([f.id,active.id]))!)
  release();await failure
  assert.equal(controller.status,'failed');assert.match(controller.error,/L\/R Distinction changed/)
  assert.equal(controller.input.exercises[0].sets[0].load,'47');assert.equal(controller.input.exercises[0].sets[0].sides,undefined)
  const before=structuredClone(controller.snapshot);controller.addSets(before.day.exercises[0].id,'kg');assert.deepEqual(controller.snapshot,before)
  await controller.reload();assert.equal(controller.input.exercises[0].sets[0].sides!.left.load,'47');assert.equal(controller.status,'saved')
  assert.equal((await f.db.activeWorkouts.get('active'))!.draftId,active.id)
})
for(const count of [2,4])test(`${count} sets stay grouped through partial results, side analytics, CSV, clear and ZIP round trip`,async t=>{
  const f=await setup(t,true,count),saved=await complete(f),snapshot=await captureProfile(f.id,f.db)
  assert.equal(saved.exercises[0].sets.length,count);assert.equal(saved.partial,true)
  const rows=analysisRows(await captureAnalysis(f.id,f.db));assert.equal(rows.length,count*2);assert.equal(ANALYSIS_COLUMNS[ANALYSIS_COLUMNS.indexOf('exercise')+1],'l_r_distinction')
  assert.deepEqual(rows.map(r=>r.l_r_distinction),Array.from({length:count},()=>['left','right']).flat());assert.equal(rows[0].weight,'0');assert.equal(rows[1].status,'Unrecorded');assert.equal(rows[1].weight,'None')
  const analytics=deriveProgress(f.id,snapshot.plans,snapshot.exercises,snapshot.sessions,snapshot.schedules,snapshot.drafts),stats=performanceStats(analytics.performances)
  assert.equal(stats.sets.length,count);assert.ok(stats.sets.every(s=>s.side==='left'));assert.equal(analytics.outcomes[0].completed,false)
  const preview=await previewLR(f.id,{id:f.exercise.id,mode:false},f.db);await toggle(f,false,{[f.exercise.id]:preview!.token})
  const after=await captureProfile(f.id,f.db),csv=analysisRows(await captureAnalysis(f.id,f.db));assert.equal(csv.length,count);assert.ok(csv.every(r=>r.l_r_distinction==='no'))
  const backup=await readBackup((await generateBackup(after,'test')).bytes);assert.deepEqual(backup.data.sessions[0].exercises,after.sessions[0].exercises)
  const restored=await buildRestorePlan(backup,undefined,'new',uid(),'Imported',new Date().toISOString());assert.deepEqual(restored.result.sessions[0].exercises,after.sessions[0].exercises)
  const back=await previewLR(f.id,{id:f.exercise.id,mode:true},f.db);await toggle(f,true,{[f.exercise.id]:back!.token})
  const copied=await readBackup((await generateBackup(await captureProfile(f.id,f.db),'test')).bytes);assert.equal(copied.data.backupSchemaVersion,22);assert.equal(copied.data.sessions[0].exercises[0].sets[0].sides.left.conversion.copiedFrom,'unsided')
  const newDraft=await f.sessions.startStandalone(f.id,f.workout.id),input=structuredClone(newDraft.input);input.exercises[0].sets[0].sides!.left.load='2';const changed=await f.sessions.update(f.id,newDraft.id,newDraft.revision,input);const cleared=await f.sessions.clear(f.id,newDraft.id,changed.revision);assert.equal(hasSessionInput(cleared.input),false);assert.ok(cleared.input.exercises[0].sets[0].sides)
})
test('merge and AI import conflicts require reviewed mode conversion; old modes remain strict',async t=>{
  const f=await setup(t);await complete(f);const b=await f.exercises.save(f.id,{...prescription(true),name:'Other Lunge'}),op=uid(),current=await f.exercises.get(f.id,f.exercise.id)
  let approval;try{await f.exercises.merge(f.id,{id:b.id,revision:b.revision,input:exerciseToInput(b,[])},current,current.id,op)}catch(e){assert.ok(e instanceof LRConfirmationError);approval=e.preview}
  assert.ok(approval);await f.exercises.merge(f.id,{id:b.id,revision:b.revision,input:exerciseToInput(b,[])},current,current.id,op,{[approval.id]:approval.token})
  assert.ok((await f.db.sessions.toArray())[0].exercises[0].sets[0].sides)
  const raw={schemaVersion:10,trainingType:'strength',kind:'workout',workout:{name:'Imported',exercises:[{name:b.name,lrDistinction:false,instructions:'Keep instructions',sets:[{reps:{min:5,max:8}}]}]}}
  const parsed=parseInterchange(JSON.stringify(raw));assert.equal(parsed.issues.length,0);const draft=toImportDraft(parsed.value!);assert.equal(draft.input.exercises[0].prescription.lrDistinction,false)
  const importer=importSession(f.id,f.db);await assert.rejects(importer.saveLibraryWorkout(draft.input),LRConfirmationError)
  raw.workout.exercises[0].lrDistinction='true' as never;assert.ok(parseInterchange(JSON.stringify(raw)).issues.some(i=>i.path.endsWith('lrDistinction')))
  for(const type of ['strength','interval'] as const){const prompt=formattingInstructions('workout',type),json=prompt.slice(prompt.indexOf('\n{')+1);assert.equal(parseInterchange(json).issues.length,0)}
})
test('reviewed backup merge conversion is explicit and uses the same tuple rules without double conversion',async t=>{
  const f=await setup(t);await complete(f);const old=await readBackup((await generateBackup(await captureProfile(f.id,f.db),'test')).bytes)
  const p=await previewLR(f.id,{id:f.exercise.id,mode:true},f.db);await toggle(f,true,{[f.exercise.id]:p!.token});const local=await captureProfile(f.id,f.db)
  const restored=await buildRestorePlan(old,local,'device',uid(),'Guest',new Date().toISOString());validateBackupData(canonicalSnapshot(restored.result))
  assert.deepEqual(restored.result.sessions[0].exercises,local.sessions[0].exercises)
  // Keep an additional old standalone performance so merge must convert it.
  const added=structuredClone(old);const d=added.data.drafts[0],s=added.data.sessions[0];d.id=s.id=s.draftId=uid()
  const merged=await buildRestorePlan(added,local,'device',uid(),'Guest',new Date().toISOString());assert.ok(merged.warnings.some(w=>w.includes('Previous results will be copied')));assert.ok(merged.result.sessions.every(s=>s.exercises[0].sets[0].sides))
})
test('schedule revisions/outcomes and repeated superset slots convert without changing targets, rest, notes or set identities',async t=>{
  const f=await setup(t),plan=await f.db.plans.get([f.id,f.plan.id]),day=plan!.days[0]
  const group={id:uid(),number:1,restBetweenRoundsSeconds:20,restAfterGroupSeconds:0}
  day.groups=[group];day.exercises[0].groupId=group.id;const repeat=structuredClone(day.exercises[0]);repeat.id=uid();repeat.setIds=repeat.setIds?.map(()=>uid());repeat.prescription.sets[1].reps={min:3,max:4};repeat.prescription.notes='Independent';day.exercises.push(repeat)
  await f.db.plans.put(plan!);const [run]=await weeklyService(f.db).activate(f.id,f.plan.id)
  const marker={id:uid(),ref:{key:`${run.id}:${day.id}:${run.startWeek}`,scheduleId:run.id,dayId:day.id,scheduledWeek:run.startWeek,scheduledDate:run.startWeek,timeZone:run.timeZone,scheduleRevisionId:run.revisions[0].id},day:structuredClone(day),planName:plan!.name,status:'completed' as const,recordedAt:provenance.convertedAt,updatedAt:provenance.convertedAt,revision:1}
  run.outcomes=[marker];await f.db.schedules.put(run)
  const saved=await complete(f),p=await previewLR(f.id,{id:f.exercise.id,mode:true},f.db);await toggle(f,true,{[f.exercise.id]:p!.token})
  const schedule=(await f.db.schedules.get([f.id,run.id]))!;for(const d of [...schedule.revisions.flatMap(r=>r.days),...schedule.outcomes!.map(o=>o.day)]){assert.ok(d.exercises.every(e=>lrMode(e.prescription)));assert.deepEqual(d.groups,day.groups);assert.deepEqual(d.exercises[1].prescription.sets,repeat.prescription.sets);assert.equal(d.exercises[1].prescription.notes,'Independent')}
  assert.equal(schedule.outcomes![0].status,'completed');assert.equal((await f.db.sessions.toArray()).length,1);assert.equal((await f.db.sessions.toArray())[0].id,saved.id)
})
test('structured side evidence repairs only absent snapshot mode; explicit modes and unlinked identities are never guessed',async t=>{
  const f=await setup(t,true);await complete(f);const snapshot=await captureProfile(f.id,f.db)
  for(const record of [...snapshot.drafts,...snapshot.sessions])delete record.day.exercises[0].prescription.lrDistinction
  const original=structuredClone(snapshot.sessions[0]);assert.equal(inferRecordedLR(snapshot.sessions[0]),true);assert.equal(snapshot.sessions[0].day.exercises[0].prescription.lrDistinction,true);assert.deepEqual(snapshot.sessions[0].exercises,original.exercises);assert.equal(inferRecordedLR(snapshot.sessions[0]),false)
  snapshot.sessions[0].day.exercises[0].prescription.lrDistinction=false;assert.equal(inferRecordedLR(snapshot.sessions[0]),false)
  snapshot.sessions[0]=original
  const restored=await readBackup((await generateBackup(snapshot,'test')).bytes);assert.ok(restored.data.sessions[0].day.exercises[0].prescription.lrDistinction);assert.deepEqual(restored.data.sessions[0].exercises,original.exercises)
})
test('v14 to v15 is nondestructive and keeps persisted selection and all records',async t=>{
  const f=await setup(t);await complete(f);const before=canonicalSnapshot(await captureProfile(f.id,f.db));stripLR(before);const settings=await f.db.settings.toArray(),name=f.db.name
  // Populate an isolated previous-schema database with the exact persisted stores.
  const previous=new Dexie('boros-test-lr-v14-'+uid());t.after(()=>previous.delete());previous.version(14).stores(Object.fromEntries(f.db.tables.map(t=>[t.name,t.schema.primKey.src+(t.schema.indexes.length?','+t.schema.indexes.map(i=>i.src).join(','):'')])));await previous.open()
  for(const table of f.db.tables){const rows=await table.toArray();stripLR(rows);await previous.table(table.name).bulkPut(rows)}previous.close()
  const upgraded=new BorosDatabase(previous.name);t.after(()=>upgraded.close());await upgraded.open();assert.equal(upgraded.verno,16);assert.deepEqual(canonicalSnapshot(await captureProfile(f.id,upgraded)),before);assert.deepEqual(await upgraded.settings.toArray(),settings);assert.notEqual(upgraded.name,name)
})

test('original v20 ZIP validates frozen fields, checksums and CSV before promotion; L/R cannot be smuggled into it',async t=>{
  const f=await setup(t);await complete(f);const snapshot=await captureProfile(f.id,f.db),generated=await generateBackup(snapshot,'test'),data=canonicalSnapshot(snapshot)
  stripLR(data);data.backupSchemaVersion=20;validateBackupData(data)
  const tables=csvTables(data),payload=[['data.json',JSON.stringify(data)],...tables.map(t=>[t.path,t.text])],zip=new JSZip()
  const manifest={...generated.manifest,backupSchemaVersion:20,databaseSchemaVersion:14,counts:recordCounts(data),csvRows:Object.fromEntries(tables.map(t=>[t.path,t.rows])),inventory:await Promise.all(payload.map(async([path,text])=>({path,bytes:new TextEncoder().encode(text).length,sha256:await sha256(new TextEncoder().encode(text)),mediaType:path.endsWith('json')?'application/json':'text/csv; charset=utf-8'})))}
  for(const[path,text]of payload)zip.file(path,text,{createFolders:false});zip.file('manifest.json',JSON.stringify(manifest));const bytes=await zip.generateAsync({type:'uint8array'}),backup=await readBackup(bytes)
  assert.equal(backup.data.backupSchemaVersion,22);assert.equal(backup.manifest.backupSchemaVersion,20);assert.deepEqual(backup.data.sessions,JSON.parse(JSON.stringify(data.sessions)))
  data.exercises[0].lrDistinction=false;assert.throws(()=>validateBackupData(data),/Unrecognized key/)
})


test('planned and custom starts, additions and replacements reuse independent side inputs and original set identities',async t=>{
 const f=await setup(t,true),planned=await f.sessions.start(f.id,f.plan.id,f.plan.days[0].id)
 assert.equal(planned.input.exercises[0].sets.length,2);assert.ok(planned.input.exercises[0].sets.every(s=>s.sides));await f.sessions.discard(f.id,planned.id,planned.revision)
 const plain=await f.exercises.save(f.id,{...prescription(false),name:'Plain'}),choices=(await planService(f.db).library(f.id)).choices
 const custom=await f.sessions.startStandalone(f.id),controller=new DraftController(custom,f.sessions);t.after(()=>controller.dispose())
 controller.addExercises([choices.find(c=>c.source.kind==='exercise'&&c.source.id===plain.id)!,choices.find(c=>c.source.kind==='exercise'&&c.source.id===f.exercise.id)!],'kg');await controller.flush()
 assert.equal(controller.input.exercises[0].sets[0].sides,undefined);assert.ok(controller.input.exercises[1].sets[0].sides)
 await controller.replaceExercise(controller.snapshot.day.exercises[0].id,f.exercise.id,f.exercise.revision)
 assert.ok(controller.input.exercises[0].sets[0].sides);const ids=structuredClone(controller.snapshot.structure)
 const input=structuredClone(controller.input);Object.assign(input.exercises[0].sets[0].sides!.left,{load:'0',reps:'0',rir:'0'});Object.assign(input.exercises[0].sets[0].sides!.right,{load:'35',reps:'8',rir:'1'});input.exercises[0].sets[1].sides!.right.skipped=true
 controller.change(input);await controller.flush();await controller.reload();assert.equal(controller.input.exercises[0].sets[0].sides!.right.load,'35');assert.equal(controller.input.exercises[1].sets[0].sides!.right.load,'');assert.deepEqual(controller.snapshot.structure,ids)
 const saved=await controller.complete(true);assert.equal(saved.exercises[0].sets.length,2);assert.deepEqual(saved.exercises[0].sets[0].sides!.left,{skipped:false,weightKg:0,load:0,unit:'kg',reps:0,rir:0});assert.equal(saved.exercises[0].sets[0].sides!.right.weightKg,35)
 assert.equal(analysisRows(await captureAnalysis(f.id,f.db)).filter(r=>r.record_type==='exercise_result').length,8)
})

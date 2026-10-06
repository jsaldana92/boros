import 'fake-indexeddb/auto'
import { weeklyService } from '../../src/db/weekly.ts'
import { occurrences } from '../../src/schemas/schedule.ts'
import { addDays } from '../../src/lib/calendar-dates.ts'
import { progressService } from '../../src/db/progress.ts'
import JSZip from 'jszip'
import { csvTables } from '../../src/features/backups/csv.ts'
import { sha256 } from '../../src/features/backups/integrity.ts'
import { recordCounts } from '../../src/schemas/backup.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService, exerciseToInput } from '../../src/db/exercises.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { DraftController } from '../../src/features/train/draft-controller.ts'
import { copyExercise } from '../../src/schemas/plan.ts'
import { copyWorkout } from '../../src/schemas/workout.ts'
import { exerciseResolver } from '../../src/lib/exercise-identity.ts'
import { deriveProgress, selectPerformances, performanceStats } from '../../src/lib/progress-analytics.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { restoreService } from '../../src/db/restores.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { materializeTemplates } from '../../src/lib/template-ownership.ts'
import { previousResults } from '../../src/lib/previous-results.ts'
const uid=()=>crypto.randomUUID()
async function setup(t) {
 const db=new BorosDatabase('boros-test-merge-'+uid());t.after(()=>db.delete());const profiles=profileService(db),id=(await profiles.initialize()).activeProfileId,service=exerciseService(db)
 const input=(name,n)=>({name,sets:Array.from({length:n},()=>({reps:{min:n===3?20:10,max:n===3?20:10}})),tagNames:['Shared',name],instructions:name+' original instructions',notes:name+' original notes',tutorialUrl:'https://youtu.be/dQw4w9WgXcQ'})
 const a=await service.save(id,input('A',3)),b=await service.save(id,input('B',4)),c=await service.save(id,input('C',1)),tags=await db.tags.toArray()
 const group={id:uid(),number:1,restBetweenRoundsSeconds:0},items=[a,b,a].map((e,i)=>({...copyExercise(exerciseToInput(e,tags),{kind:'exercise' as const,id:e.id}),...(i?{groupId:group.id}:{})}))
 const workout=await workoutService(db).save(id,{id:uid(),name:'Repeated',exercises:items,groups:[group]})
 const plan=await planService(db).save(id,{name:'Plan',durationWeeks:4,days:[copyWorkout(workout)]})
 const sessions=sessionService(db),draft=await sessions.startStandalone(id,workout.id),inputResult=structuredClone(draft.input)
 inputResult.notes='Private historical note';inputResult.exercises.forEach((e,i)=>{e.notes='Note '+i;e.sets.forEach((s,j)=>Object.assign(s,{load:String(10+i+j),reps:String(j+1),rir:'0'}))})
 const completed=await sessions.complete(id,draft.id,draft.revision,inputResult,false)
 return {db,id,service,a,b,c,tags,workout,plan,sessions,completed,profiles}
}
const fields=(record,tags)=>({id:record.id,revision:record.revision,input:exerciseToInput(record,tags)})
const clone=value=>JSON.parse(JSON.stringify(value))

test('identity merge preserves all snapshots, repeated supersets/results, destination defaults and combined Overall identity',async t=>{
 const {db,id,service,a,b,tags,workout,plan,completed}=await setup(t),before=await captureProfile(id,db)
 const input={...fields(b,tags),input:{...exerciseToInput(b,tags),name:'B edited',notes:'B unsaved',tagNames:['Shared','B','New']}}
 const destination=await service.merge(id,input,a,a.id,uid()),retired=await service.get(id,a.id)
 assert.equal(destination.id,b.id);assert.equal(destination.name,'B edited');assert.deepEqual(destination.sets,b.sets);assert.equal(destination.notes,'B unsaved')
 assert.equal(retired.mergedIntoId,b.id);for(const key of ['sets','instructions','notes','tutorialUrl'])assert.deepEqual(retired[key],a[key]);assert.equal(retired.activeNameKey,undefined)
 assert.equal(new Set(destination.tagIds).size,destination.tagIds.length);assert.equal(destination.tagIds.length,4)
 const after=await captureProfile(id,db);for(const key of ['plans','workouts','drafts','sessions','schedules'])assert.deepEqual(after[key],before[key])
 assert.equal((await service.library(id)).exercises.length,2);assert.ok(!(await planService(db).library(id)).choices.some(e=>e.source.id===a.id))
 const analytics=deriveProgress(id,after.plans,after.exercises,after.sessions,after.schedules,after.drafts)
 assert.ok(!analytics.items.some(e=>e.key==='library:'+a.id));const performances=selectPerformances(analytics,'library:'+b.id);assert.equal(performances.length,3);assert.equal(performanceStats(performances).sets.length,10)
 assert.equal(new Set(performances.map(p=>p.id)).size,3);assert.equal(performances[0].session.id,completed.id);assert.deepEqual(performances[0].occurrence,completed.day.exercises[0])
 await planService(db).save(id,{...plan,name:'Still editable'},plan);await workoutService(db).save(id,{...workout,name:'Still independent'},workout)
 const repaired=materializeTemplates(id,after,new Date().toISOString());assert.equal(repaired.addedExercises.length,0)
})

test('Switch retains edited source metadata; chained redirects, retries, stale editors and cross-profile operations',async t=>{
 const {db,id,service,a,b,c,tags,profiles}=await setup(t),edited=fields(a,tags);edited.input.notes='Edited source';edited.input.name='Source edit'
 const op=uid(),[first,retry]=await Promise.all([service.merge(id,edited,b,a.id,op),service.merge(id,edited,b,a.id,op)])
 assert.deepEqual(first,retry);assert.equal(first.name,b.name);assert.deepEqual(first.sets,b.sets);assert.equal((await service.get(id,a.id)).notes,'Edited source')
 await assert.rejects(service.save(id,edited.input,a),/merged/);await assert.rejects(service.setArchived(id,a.id,2,false),/merged/)
 const currentB=await service.get(id,b.id);await service.merge(id,fields(c,tags),currentB,b.id,uid())
 const resolve=exerciseResolver(id,await db.exercises.toArray());assert.equal(resolve(a.id),c.id);assert.equal(resolve(b.id),c.id)
 await assert.rejects(service.merge(id,fields(await service.get(id,c.id),tags),a,c.id,uid()),/merged/)
 await assert.rejects(service.merge(id,fields(c,tags),c,c.id,uid()),/different/)
 const other=await profiles.create('Other'),foreign=await service.save(other.id,{name:'Other',sets:[{reps:{min:1,max:1}}],tagNames:[]})
 await assert.rejects(service.merge(id,fields(c,tags),foreign,foreign.id,uid()),/unavailable/)
 assert.equal((await service.library(other.id)).exercises.length,1)
})

test('stale/archived selection and injected second-write failure roll back tags and retirement; retry is safe',async t=>{
 const {db,id,service,a,b,tags}=await setup(t),before=await captureProfile(id,db)
 const changed=fields(b,tags);changed.input.tagNames.push('Pending tag');const op=uid()
 const fail=()=>{throw new Error('Injected destination write failure')}
 const hook=(mods,key)=>{if(key[1]===b.id)fail()};db.exercises.hook('updating',hook)
 await assert.rejects(service.merge(id,changed,a,a.id,op),/Injected/);db.exercises.hook('updating').unsubscribe(hook)
 const after=await captureProfile(id,db);assert.deepEqual(after.exercises,before.exercises);assert.deepEqual(after.tags,before.tags)
 const edited=await service.save(id,{...exerciseToInput(a,tags),notes:'Peer saved'},a)
 await assert.rejects(service.merge(id,changed,a,a.id,op),/another tab/)
 const archived=await service.setArchived(id,edited.id,edited.revision,true)
 await assert.rejects(service.merge(id,changed,archived,archived.id,op),/archived/)
 const restored=await service.setArchived(id,archived.id,archived.revision,false)
 const result=await service.merge(id,changed,restored,restored.id,op);assert.equal(result.id,b.id)
 assert.equal((await db.tags.toArray()).filter(e=>e.name==='Pending tag').length,1)
})

test('active controller/autosave and exact occurrence previous-result hints survive merge without resetting input or timer',async t=>{
 const {db,id,service,a,b,tags,sessions,workout,completed}=await setup(t),draft=await sessions.startStandalone(id,workout.id),controller=new DraftController(draft,sessions)
 t.after(()=>controller.dispose());controller.activate();const input=structuredClone(draft.input);input.exercises[0].sets[0].load='0';input.exercises[0].sets[0].reps='0';input.exercises[0].sets[0].rir='0';controller.change(input)
 await controller.startTimer(draft.day.exercises[0].id,0,90);const timers=await db.restTimers.toArray();controller.change({...input,notes:'Pending during merge'});await service.merge(id,fields(b,tags),a,a.id,uid());await controller.flush();assert.deepEqual(await db.restTimers.toArray(),timers)
 assert.deepEqual(controller.input,{...input,notes:'Pending during merge'});assert.equal((await sessions.getDraft(id,draft.id)).day.exercises[0].source!.id,a.id)
 assert.equal((await service.library(id)).exercises.some(e=>e.id===a.id),false)
 const ref={scheduleId:uid(),dayId:draft.day.id,scheduledWeek:'2026-10-05',scheduledDate:'2026-10-05',timeZone:'UTC',key:'k',scheduleRevisionId:uid()}
 const upcoming={...draft,sourcePlanId:'plan',sourceDayId:'day',occurrence:{...ref,scheduledWeek:'2026-10-12'},startedAt:'2026-10-13T00:00:00.000Z'}
 const history={...completed,sourcePlanId:'plan',sourceDayId:'day',day:draft.day,exercises:completed.exercises.map((e,i)=>({...e,id:draft.day.exercises[i].id})),occurrence:ref,completedAt:'2026-10-06T00:00:00.000Z'}
 const hints=previousResults(upcoming,[history],'lb');assert.ok(hints[draft.day.exercises[0].id][0]);assert.notEqual(hints[draft.day.exercises[0].id][0]?.load,hints[draft.day.exercises[2].id][0]?.load)
 assert.deepEqual(previousResults(upcoming,[{...history,sourcePlanId:'other'}],'kg')[draft.day.exercises[0].id],[undefined,undefined,undefined])
})

test('backup v12 round trip, all restore choices, monotonic retirement and Clear Data retain exact identity meaning',async t=>{
 const {db,id,service,a,b,c,tags}=await setup(t),old=await readBackup((await generateBackup(await captureProfile(id,db),'test')).bytes)
 await service.merge(id,fields(b,tags),a,a.id,uid());const bb=await service.get(id,b.id);await service.merge(id,fields(c,tags),bb,b.id,uid())
 const snapshot=await captureProfile(id,db),zip=await generateBackup(snapshot,'test'),backup=await readBackup(zip.bytes)
 assert.equal(backup.data.backupSchemaVersion,12);assert.equal(backup.manifest.csvRows['csv/library_exercises.csv'],3)
 for(const choice of ['new','replace','device','import'] as const){const plan=await buildRestorePlan(backup,choice==='new'?undefined:snapshot,choice,uid(),choice==='new'?'Restored':'Guest',new Date().toISOString());const exported=await readBackup((await generateBackup(plan.result,'test')).bytes);assert.equal(exerciseResolver(plan.result.profile.id,exported.data.exercises)(a.id),c.id);assert.equal(exported.data.sessions.length,1);assert.equal(exported.data.workouts.length,1)}
 for(const choice of ['device','import'] as const){const merged=await buildRestorePlan(old,snapshot,choice,uid(),'Guest',new Date().toISOString());assert.equal(exerciseResolver(merged.result.profile.id,merged.result.exercises)(a.id),c.id)}
 const restores=restoreService(db),owner=await restores.commit(await restores.preview(backup,'new','Copied'),true),copy=await captureProfile(owner,db)
 const normalize=(records,pid)=>JSON.parse(JSON.stringify(records).replaceAll(pid,'OWNER'))
 assert.deepEqual(normalize(copy.exercises,owner),normalize(snapshot.exercises,id));assert.deepEqual(normalize(copy.sessions,owner),normalize(snapshot.sessions,id))
 await restores.commit(await restores.preview(undefined,'clear',undefined,owner),true);assert.equal(await db.exercises.where('profileId').equals(owner).count(),0);assert.deepEqual((await captureProfile(id,db)).exercises,snapshot.exercises)
})

test('restore rejects cycles, absent/foreign destinations and unrelated same-name identities without writes',async t=>{
 const {db,id,service,a,b,tags}=await setup(t);await service.merge(id,fields(b,tags),a,a.id,uid());const data=canonicalSnapshot(await captureProfile(id,db))
 for(const destination of [a.id,uid()]){const broken=clone(data);broken.exercises.find(e=>e.id===a.id).mergedIntoId=destination;assert.throws(()=>validateBackupData(broken),/cycle|destination/)}
 const foreign=clone(data);foreign.exercises.find(e=>e.id===b.id).profileId=uid();assert.throws(()=>validateBackupData(foreign),/profile/)
 const local=await captureProfile(id,db),backup=await readBackup((await generateBackup(local,'test')).bytes);backup.data=JSON.parse(JSON.stringify(backup.data).replaceAll(b.id,uid()))
 await assert.rejects(buildRestorePlan(backup,local,'import',uid(),'Guest',new Date().toISOString()),/identities share a name|Ambiguous exercise/)
})


test('original v11 ZIP retains workouts/history before promotion and rejects unversioned merge fields',async t=>{
 const {db,id}=await setup(t),snapshot=await captureProfile(id,db),generated=await generateBackup(snapshot,'legacy-v11'),data=canonicalSnapshot(snapshot);data.backupSchemaVersion=11;validateBackupData(data)
 const tables=csvTables(data),payload=[['data.json',JSON.stringify(data)],...tables.map(t=>[t.path,t.text])],zip=new JSZip()
 const manifest={...generated.manifest,backupSchemaVersion:11,counts:recordCounts(data),csvRows:Object.fromEntries(tables.map(t=>[t.path,t.rows])),inventory:await Promise.all(payload.map(async([path,text])=>({path,bytes:new TextEncoder().encode(text).length,sha256:await sha256(new TextEncoder().encode(text)),mediaType:path.endsWith('json')?'application/json':'text/csv; charset=utf-8'})))}
 for(const [path,text]of payload)zip.file(path,text,{createFolders:false});zip.file('manifest.json',JSON.stringify(manifest))
 const bytes=await zip.generateAsync({type:'uint8array'}),before=await sha256(bytes),restored=await readBackup(bytes)
 assert.equal(restored.manifest.backupSchemaVersion,11);assert.equal(restored.data.backupSchemaVersion,12);assert.deepEqual(restored.data.workouts,clone(snapshot.workouts));assert.deepEqual(restored.data.sessions,clone(snapshot.sessions));assert.equal(await sha256(bytes),before)
 data.exercises[0].mergedIntoId=data.exercises[1].id;assert.throws(()=>validateBackupData(data),/Unrecognized key/)
})


test('plan-specific occurrences/completion and Overall totals remain correct after merging and reopening storage',async t=>{
 const {db,id,service,a,b,tags,plan,sessions}=await setup(t),weekly=weeklyService(db),[run]=await weekly.activate(id,plan.id),events=occurrences(run,run.startWeek,addDays(run.startWeek,6))
 const draft=(await sessions.openOccurrence(id,run.id,events[0].day.id,events[0].ref.scheduledDate)).draft!,input=structuredClone(draft.input)
 Object.assign(input.exercises[0].sets[0],{load:'0',reps:'0'});input.exercises[1].sets.forEach(s=>s.skipped=true)
 await sessions.complete(id,draft.id,draft.revision,input,true)
 const progress=progressService(db),before=await progress.read(id),oldHints=previousResults(draft,before.sessions,'kg')
 await service.merge(id,fields(b,tags),a,a.id,uid());db.close();await db.open();const after=await progress.read(id)
 assert.deepEqual(after.plans,before.plans);assert.equal(after.plans[0].daysCompleted,1);assert.equal(after.plans[0].exercisesCompleted,0)
 assert.equal(selectPerformances(after,'library:'+b.id).length,4);assert.equal(performanceStats(selectPerformances(after,'library:'+b.id)).sets.length,11)
 for(const item of before.plans[0].items)assert.deepEqual(selectPerformances(after,item.key,run.id).map(p=>p.sets),selectPerformances(before,item.key,run.id).map(p=>p.sets))
 assert.deepEqual(previousResults(draft,after.sessions,'kg'),oldHints)
})

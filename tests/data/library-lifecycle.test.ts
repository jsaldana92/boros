import { legacyWorkspace } from '../fixtures/legacy-workspace.ts'
import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService, exerciseToInput } from '../../src/db/exercises.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { planService } from '../../src/db/plans.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { libraryDeleteService } from '../../src/db/library-delete.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { repairProfileTemplates } from '../../src/db/template-repair.ts'
import { copyExercise, planToInput } from '../../src/schemas/plan.ts'
import { copyWorkout } from '../../src/schemas/workout.ts'
import { occurrences } from '../../src/schemas/schedule.ts'
import { addDays } from '../../src/lib/calendar-dates.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { restoreService } from '../../src/db/restores.ts'
import { progressService } from '../../src/db/progress.ts'
import { DraftController } from '../../src/features/train/draft-controller.ts'
import { photoBytes } from '../fixtures/backup-profile.ts'
const uid=()=>crypto.randomUUID()
async function fixture(t) {
 const db=new BorosDatabase('boros-test-lifecycle-'+uid()); t.after(()=>db.delete())
 const profiles=profileService(db), id=(await profiles.initialize()).activeProfileId
 const original=await db.profiles.get(id);await profiles.save(id,original!.revision,{name:'Disposable',weightUnit:'kg',heightUnit:'cm',weightKg:70},{blob:new Blob([photoBytes],{type:'image/png'}),width:1,height:1})
 const exercises=exerciseService(db), workouts=workoutService(db), plans=planService(db), sessions=sessionService(db), weekly=weeklyService(db), schedules=scheduleService(db), deletion=libraryDeleteService(db)
 const input=(name,n)=>({name,sets:Array.from({length:n},()=>({reps:{min:5,max:8},rir:{min:0,max:0}})),tagNames:['Strength'],restBetweenSeconds:60,restAfterSeconds:60})
 const a=await exercises.save(id,input('A',2)), b=await exercises.save(id,input('B',3)), c=await exercises.save(id,input('C',1)), tags=await db.tags.toArray()
 const group={id:uid(),number:1,restBetweenRoundsSeconds:45,restAfterGroupSeconds:60}
 const entries=[a,b,a].map((e,i)=>({...copyExercise(exerciseToInput(e,tags),{kind:'exercise' as const,id:e.id}),...(i<2?{groupId:group.id}:{})}))
 const workout=await workouts.save(id,{id:uid(),name:'Basic',exercises:entries,groups:[group]})
 const plan=await plans.save(id,{name:'Summer',durationWeeks:6,days:[copyWorkout(workout),copyWorkout(workout),copyWorkout(workout)]})
 const [run]=await weekly.addPlan(id,plan.id).then(()=>weekly.activate(id,plan.id))
 const fill=d=>{const input=structuredClone(d.input);input.exercises.forEach((e,i)=>{e.notes='Note '+i;e.sets.forEach(s=>Object.assign(s,{load:'0',reps:'5',rir:'0'}))});return input}
 return {db,id,profiles,exercises,workouts,plans,sessions,weekly,schedules,deletion,a,b,c,tags,workout,plan,run,fill}
}
async function roundTrip(db,id) {
 const snapshot=await captureProfile(id,db);validateBackupData(canonicalSnapshot(snapshot))
 const backup=await readBackup((await generateBackup(snapshot,'test')).bytes,()=>{},async()=>{})
 assert.equal(backup.data.backupSchemaVersion,18);assert.equal(backup.manifest.databaseSchemaVersion,12)
 for(const choice of ['new','replace','device','import'] as const){const result=await buildRestorePlan(backup,choice==='new'?undefined:snapshot,choice,uid(),choice==='new'?'Restored':snapshot.profile.name,new Date().toISOString());validateBackupData(canonicalSnapshot(result.result));assert.equal(result.result.deletedSources.length,snapshot.deletedSources.length);assert.deepEqual(result.result.sessions.map(s=>s.id),snapshot.sessions.map(s=>s.id))}
 return backup
}
test('plan edits 2 to 3 to 1 reach pending current/future copies, with protected drafts, outcomes/history and library independence',async t=>{
 const f=await fixture(t),{db,id,plans,sessions,plan,run,schedules,weekly}=f,events=occurrences(run,run.startWeek,addDays(run.startWeek,6))
 const started=(await sessions.openOccurrence(id,run.id,events[0].day.id,events[0].ref.scheduledDate)).draft!
 await weekly.outcome(id,events[1].ref,run.revision,'skipped')
 const saved=await sessions.complete(id,started.id,started.revision,f.fill(started),false)
 await legacyWorkspace(db)
 const pending=(await sessions.openOccurrence(id,run.id,events[2].day.id,events[2].ref.scheduledDate)).draft!
 const change=planToInput(plan);change.days[0].exercises[0].prescription.sets.push({reps:{min:9,max:9}})
 const three=await plans.save(id,change,plan), date=addDays(run.startWeek,7)
 await legacyWorkspace(db)
 const next=(await sessions.openOccurrence(id,run.id,plan.days[0].id,date)).draft!;assert.equal(next.day.exercises[0].prescription.sets.length,3)
 assert.equal(next.day.exercises[2].prescription.sets.length,2);assert.equal((await db.drafts.get([id,pending.id]))!.day.exercises[0].prescription.sets.length,2)
 const one=planToInput(three);one.days[0].exercises[0].prescription.sets=one.days[0].exercises[0].prescription.sets.slice(0,1);await plans.save(id,one,three)
 assert.deepEqual(await sessions.getDraft(id,next.id),next);assert.deepEqual(await db.sessions.get([id,saved.id]),saved)
 await legacyWorkspace(db)
 const later=(await sessions.openOccurrence(id,run.id,plan.days[0].id,addDays(date,7))).draft!;assert.equal(later.day.exercises[0].prescription.sets.length,1)
 const current=await schedules.events(id,run.startWeek,addDays(run.startWeek,6));assert.equal(current.find(e=>e.outcome)!.day.exercises[0].prescription.sets.length,2)
 await f.exercises.save(id,{...exerciseToInput(f.a,f.tags),sets:[{reps:{min:50,max:50}}]},f.a)
 await f.workouts.save(id,{...f.workout,exercises:[...f.workout.exercises,copyExercise(exerciseToInput(f.c,f.tags),{kind:'exercise',id:f.c.id})]},f.workout)
 assert.equal((await plans.get(id,plan.id)).days[0].exercises.length,3);assert.equal((await schedules.events(id,addDays(date,14),addDays(date,14))).find(e=>e.ref.scheduleId===run.id)!.day.exercises[0].prescription.sets.length,1)
 validateBackupData(canonicalSnapshot(await captureProfile(id,db)))
})
test('unique-week edits preserve definition mappings, repeated copies, past missed context and concurrent coherent starts',async t=>{
 const f=await fixture(t),{id,plans,sessions,schedules,weekly,workout,db}=f
 const days=[copyWorkout(workout),copyWorkout(workout)].map(day=>({...day,exercises:day.exercises.map(e=>({...e,setIds:e.prescription.sets.map(uid)}))})),plan=await plans.save(id,{name:'Unique',durationWeeks:4,days,weeks:days.map(d=>({id:uid(),dayIds:[d.id]}))}),[run]=await weekly.activate(id,plan.id)
 const old=structuredClone(run.revisions[0].days),changed=planToInput(plan);changed.days[1].exercises[0].prescription.sets=[{reps:{min:30,max:30}}];changed.days[1].exercises[0].setIds=changed.days[1].exercises[0].setIds!.slice(0,1)
 const date=addDays(run.startWeek,7)
 const [saved,opened]=await Promise.all([plans.save(id,changed,plan),sessions.openOccurrence(id,run.id,days[1].id,date)])
 const count=opened.draft!.day.exercises[0].prescription.sets.length;assert.ok(count===1||count===2)
 assert.deepEqual(opened.draft!.day.exercises[0].prescription.sets,count===1?changed.days[1].exercises[0].prescription.sets:old[1].exercises[0].prescription.sets)
 const later=(await schedules.events(id,addDays(date,14),addDays(date,14))).find(e=>e.ref.scheduleId===run.id)!;assert.equal(later.day.id,days[1].id);assert.equal(later.day.exercises[0].prescription.sets.length,1)
 assert.deepEqual((await db.schedules.get([id,run.id]))!.revisions[0].days,old);assert.equal(saved.days[0].exercises[0].prescription.sets.length,2)
})
test('session replacement preserves position/group/other results and snapshots, clears just one occurrence, persists and counts only replacement',async t=>{
 const f=await fixture(t),{db,id,sessions,workout,c,plan,run}=f,originals=await captureProfile(id,db)
 const draft=(await sessions.openOccurrence(id,run.id,plan.days[0].id,run.startWeek)).draft!,input=f.fill(draft)
 const entered=await sessions.update(id,draft.id,draft.revision,input);await sessions.startGroupTimer(id,draft.id,entered.revision,draft.day.groups![0].id,0)
 const swap=await sessions.replaceExercise(id,draft.id,entered.revision,draft.day.exercises[0].id,c.id,c.revision)
 assert.equal(swap.day.exercises[0].id,draft.day.exercises[0].id);assert.equal(swap.day.exercises[0].groupId,draft.day.exercises[0].groupId);assert.equal(swap.day.exercises[0].source!.id,c.id)
 assert.equal(swap.input.exercises[0].notes,'');assert.equal(swap.input.exercises[0].sets[0].load,'');assert.equal(swap.input.exercises[0].sets.length,1)
 assert.deepEqual(swap.input.exercises.slice(1),entered.input.exercises.slice(1));assert.deepEqual(swap.structure!.exercises.slice(1),entered.structure!.exercises.slice(1));assert.equal(await db.restTimers.count(),0)
 db.close();await db.open();assert.deepEqual(await sessions.getDraft(id,draft.id),swap)
 const saved=await sessions.complete(id,swap.id,swap.revision,f.fill(swap),false),data=await progressService(db).read(id)
 assert.equal(data.performances.filter(p=>p.exerciseKey==='library:'+c.id).length,1);assert.equal(data.performances.filter(p=>p.exerciseKey==='library:'+f.a.id).length,1)
 assert.deepEqual(await db.workouts.get([id,workout.id]),workout);assert.deepEqual((await captureProfile(id,db)).plans,originals.plans);assert.equal(saved.day.exercises.length,3)
 await roundTrip(db,id)
})
test('replacement stale/foreign choices and write failure retain recoverable controller input, without partial timer or source changes',async t=>{
 const f=await fixture(t),{id,sessions,db,c}=f,draft=await sessions.startStandalone(id,f.workout.id),controller=new DraftController(draft,sessions)
 t.after(()=>controller.dispose());controller.change(f.fill(draft));await controller.flush();const before=await captureProfile(id,db),input=structuredClone(controller.input)
 const fail=()=>{throw new Error('Injected replacement failure')};db.drafts.hook('updating',fail)
 await assert.rejects(controller.replaceExercise(draft.day.exercises[1].id,c.id,c.revision),/Injected/);db.drafts.hook('updating').unsubscribe(fail)
 assert.deepEqual(controller.input,input);assert.deepEqual((await captureProfile(id,db)).drafts,before.drafts)
 const other=await f.profiles.create('Foreign');await assert.rejects(sessions.replaceExercise(other.id,draft.id,controller.record.revision,draft.day.exercises[0].id,c.id,c.revision),/unavailable/)
 await f.exercises.save(id,{...exerciseToInput(c,f.tags),name:'Changed'},c);await assert.rejects(controller.replaceExercise(draft.day.exercises[1].id,c.id,c.revision),/changed/)
})
test('merged exercise deletion prunes only standalone matches, preserving plan results, copied templates, photos, other profiles and ZIP round trips',async t=>{
 const f=await fixture(t),{db,id,sessions,deletion,a,b,tags,workout,plan}=f
 const standalone=await sessions.startStandalone(id,workout.id);await sessions.complete(id,standalone.id,standalone.revision,f.fill(standalone),false)
 const planned=await sessions.start(id,plan.id,plan.days[0].id),history=await sessions.complete(id,planned.id,planned.revision,f.fill(planned),false)
 const extra=await f.exercises.save(id,{name:'Independent',sets:[{reps:{min:1,max:1}}],tagNames:[]})
 const pending=await sessions.startStandalone(id);const ctl=new DraftController(pending,sessions);t.after(()=>ctl.dispose());ctl.addExercises([{id:extra.id,nameKey:extra.nameKey,createdAt:extra.createdAt,tagIds:[],label:extra.name,prescription:exerciseToInput(extra,tags),source:{kind:'exercise',id:extra.id}}],'kg');await ctl.flush()
 const other=await f.profiles.create('Other');await f.exercises.save(other.id,exerciseToInput(a,tags));const foreign=await captureProfile(other.id,db)
 const before=await captureProfile(id,db),merged=await f.exercises.merge(id,{id:a.id,revision:a.revision,input:exerciseToInput(a,tags)},b,a.id,uid())
 await deletion.remove(await deletion.preview(id,'exercise',merged.id,merged.revision))
 assert.equal(await db.exercises.get([id,a.id]),undefined);assert.equal(await db.exercises.get([id,b.id]),undefined);assert.equal(await db.sessions.get([id,standalone.id]),undefined)
 assert.deepEqual(await db.sessions.get([id,history.id]),history);assert.deepEqual(await db.workouts.get([id,workout.id]),workout);assert.ok(await db.drafts.get([id,pending.id]))
 await repairProfileTemplates(db,id);assert.equal(await db.exercises.get([id,a.id]),undefined);await f.workouts.save(id,{...workout,name:'Editable copy'},workout)
 const after=await captureProfile(id,db);assert.deepEqual(after.measurements,before.measurements);assert.equal(after.photos.length,before.photos.length);assert.equal(after.deletedSources.length,2)
 const foreignAfter=await captureProfile(other.id,db);assert.deepEqual(foreignAfter.exercises,foreign.exercises)
 await roundTrip(db,id);await f.profiles.select(id);assert.equal((await f.exercises.library(id)).exercises.length,2)
})
test('mixed standalone deletion keeps unrelated results and explicit skipped outcomes valid, never fabricated results',async t=>{
 const f=await fixture(t),{db,id,sessions,deletion,a}=f,draft=await sessions.startStandalone(id,f.workout.id),input=f.fill(draft)
 input.exercises[1].sets.forEach(s=>{s.load='';s.reps='';s.rir='';s.skipped=true})
 await sessions.complete(id,draft.id,draft.revision,input,true);await deletion.remove(await deletion.preview(id,'exercise',a.id,a.revision))
 const saved=(await db.sessions.get([id,draft.id]))!,kept=(await db.drafts.get([id,draft.id]))!
 assert.equal(saved.day.exercises.length,1);assert.equal(saved.day.exercises[0].source!.id,f.b.id);assert.ok(saved.exercises[0].sets.every(s=>s.skipped));assert.deepEqual(kept.input.exercises[0],input.exercises[1]);assert.ok(saved.prunedAt)
 await roundTrip(db,id)
})
test('workout deletion uses explicit standalone/custom ownership and preserves same-name custom work and plan history',async t=>{
 const f=await fixture(t),{db,id,sessions,deletion,workout,plan}=f,draft=await sessions.startStandalone(id,workout.id)
 await sessions.complete(id,draft.id,draft.revision,f.fill(draft),false)
 await legacyWorkspace(db)
 const planned=await sessions.start(id,plan.id,plan.days[0].id),history=await sessions.complete(id,planned.id,planned.revision,f.fill(planned),false)
 const independent=await sessions.startStandalone(id);await db.drafts.put({...independent,day:{...independent.day,name:workout.name}})
 await deletion.remove(await deletion.preview(id,'workout',workout.id,workout.revision))
 assert.equal(await db.sessions.get([id,draft.id]),undefined);assert.deepEqual(await db.sessions.get([id,history.id]),history);assert.ok(await db.drafts.get([id,independent.id]));assert.equal(await db.exercises.where('profileId').equals(id).count(),3)
 await legacyWorkspace(db)
 assert.equal((await sessions.start(id,plan.id,plan.days[1].id)).day.sourceWorkoutId,workout.id);await roundTrip(db,id)
})
test('active plan deletion atomically removes all run/history/draft ownership, stops timers, blocks stale autosaves and preserves standalone/photos',async t=>{
 const f=await fixture(t),{db,id,sessions,plan,run,deletion}=f,draft=(await sessions.openOccurrence(id,run.id,plan.days[0].id,run.startWeek)).draft!
 await sessions.startGroupTimer(id,draft.id,draft.revision,draft.day.groups![0].id,0)
 await legacyWorkspace(db)
 const standalone=await sessions.startStandalone(id,f.workout.id),before=await captureProfile(id,db),preview=await deletion.preview(id,'plan',plan.id,plan.revision)
 assert.equal(preview.active,true);await deletion.remove(preview)
 assert.equal(await db.schedules.where('profileId').equals(id).count(),0);assert.equal(await db.restTimers.count(),0);assert.equal(await db.drafts.get([id,draft.id]),undefined);assert.ok(await db.drafts.get([id,standalone.id]))
 await assert.rejects(sessions.update(id,draft.id,draft.revision,f.fill(draft)),/unavailable/);await assert.rejects(f.plans.save(id,planToInput(plan),plan),/unavailable/)
 assert.ok(!(await db.profiles.get(id))!.selectedPlanIds!.includes(plan.id));const after=await captureProfile(id,db);assert.deepEqual(after.workouts,before.workouts);assert.deepEqual(after.measurements,before.measurements);assert.equal(after.photos.length,before.photos.length);await roundTrip(db,id)
})
test('delete preview Cancel is read-only; stale scope/active state and injected transaction failure never partially delete',async t=>{
 const f=await fixture(t),{id,db,deletion,plan,sessions}=f,before=await captureProfile(id,db),preview=await deletion.preview(id,'plan',plan.id,plan.revision)
 assert.deepEqual((await captureProfile(id,db)).plans,before.plans)
 const d=await sessions.start(id,plan.id,plan.days[0].id);await assert.rejects(deletion.remove(preview),/changed after/)
 const next=await deletion.preview(id,'plan',plan.id,plan.revision),snapshot=await captureProfile(id,db),fail=()=>{throw new Error('Injected deletion failure')};db.deletedSources.hook('creating',fail)
 await assert.rejects(deletion.remove(next),/Injected/);db.deletedSources.hook('creating').unsubscribe(fail)
 const after=await captureProfile(id,db);for(const key of ['plans','schedules','drafts','sessions','deletedSources'])assert.deepEqual(after[key],snapshot[key]);assert.ok(await db.drafts.get([id,d.id]))
 const peer=new BorosDatabase(db.name);t.after(()=>peer.close());await peer.open();const input=structuredClone(d.input);input.notes='Concurrent';await sessionService(peer).update(id,d.id,d.revision,input)
 await assert.rejects(deletion.remove(next),/changed after/)
})
test('v6 to v7 adds only empty tombstones; deleted identities survive committed restore/reopen/profile clear, old merge conflicts remain explicit',async t=>{
 const f=await fixture(t),{db,id,deletion}=f,before=await captureProfile(id,db),name='boros-test-upgrade-'+uid(),old=new Dexie(name)
 const definitions=Object.fromEntries(db.tables.filter(t=>t.name!=='deletedSources').map(t=>[t.name,[t.schema.primKey.src,...t.schema.indexes.map(i=>i.src)].join(',')]))
 old.version(6).stores(definitions);await old.open();for(const table of db.tables.filter(t=>t.name!=='deletedSources'))await old.table(table.name).bulkAdd(await table.toArray());old.close()
 const upgraded=new BorosDatabase(name);t.after(()=>upgraded.delete());await upgraded.open();const after=await captureProfile(id,upgraded);for(const key of ['plans','exercises','workouts','drafts','sessions','measurements'])assert.deepEqual(after[key],before[key]);assert.deepEqual(await after.photos[0].blob.arrayBuffer(),await before.photos[0].blob.arrayBuffer());assert.equal(after.deletedSources.length,0)
 const oldBackup=await readBackup((await generateBackup(before,'old')).bytes,()=>{},async()=>{})
 await deletion.remove(await deletion.preview(id,'exercise',f.a.id,f.a.revision));const backup=await roundTrip(db,id),deleted=await captureProfile(id,db)
 await assert.rejects(buildRestorePlan(oldBackup,deleted,'import',uid(),'Disposable',new Date().toISOString()),/deleted library item/)
 const restores=restoreService(db,async()=>{}),plan=await restores.preview(backup,'new','Recovered'),owner=await restores.commit(plan,true)
 db.close();await db.open();await repairProfileTemplates(db,owner);assert.equal(await db.exercises.get([owner,f.a.id]),undefined)
 const clear=await restores.preview(undefined,'clear',undefined,owner);await restores.commit(clear,true);assert.equal(await db.deletedSources.where('profileId').equals(owner).count(),0);assert.equal(await db.deletedSources.where('profileId').equals(id).count(),1)
})

test('pruned unfinished sessions can continue/save; sparse superset replacement retains surviving set and round identities',async t=>{
 const f=await fixture(t),{db,id,sessions,deletion}=f
 const pending=await sessions.startStandalone(id,f.workout.id),controller=new DraftController(pending,sessions);t.after(()=>controller.dispose())
 controller.addSets(pending.day.groups![0].id,'kg');controller.addSets(pending.day.groups![0].id,'kg');await controller.flush()
 const before=structuredClone(controller.record),swap=await controller.replaceExercise(pending.day.exercises[1].id,f.c.id,f.c.revision)
 assert.deepEqual(swap.structure!.exercises[0],before.structure!.exercises[0]);validateBackupData(canonicalSnapshot(await captureProfile(id,db)))
 await deletion.remove(await deletion.preview(id,'exercise',f.a.id,f.a.revision))
 await assert.rejects(controller.flush().then(()=>controller.replaceExercise(pending.day.exercises[1].id,f.b.id,f.b.revision)),/another tab|changed/)
 const pruned=(await db.drafts.get([id,pending.id]))!;assert.ok(pruned.prunedAt);const saved=await sessions.complete(id,pruned.id,pruned.revision,f.fill(pruned),false);assert.equal(saved.prunedAt,pruned.prunedAt);await roundTrip(db,id)
})


test('deleting a custom Save Yes workout removes its owned history but leaves a same-name unowned custom draft',async t=>{
 const f=await fixture(t),{db,id,sessions,deletion}=f,draft=await sessions.startStandalone(id),controller=new DraftController(draft,sessions);t.after(()=>controller.dispose())
 controller.addExercises([{id:f.a.id,nameKey:f.a.nameKey,createdAt:f.a.createdAt,tagIds:[],label:f.a.name,prescription:exerciseToInput(f.a,f.tags),source:{kind:'exercise',id:f.a.id}}],'kg');await controller.flush()
 const record=controller.record,saved=await sessions.complete(id,record.id,record.revision,f.fill(record),false,undefined,{name:'Custom owner'})
 assert.equal(saved.source!.kind,'custom');assert.ok(saved.source!.workoutId)
 const independent=await sessions.startStandalone(id);await db.drafts.put({...independent,day:{...independent.day,name:'Custom owner'}})
 const owner=(await db.workouts.get([id,saved.source!.workoutId!]))!;await deletion.remove(await deletion.preview(id,'workout',owner.id,owner.revision))
 assert.equal(await db.sessions.get([id,saved.id]),undefined);assert.equal(await db.drafts.get([id,saved.id]),undefined);assert.ok(await db.drafts.get([id,independent.id]));assert.ok(await db.workouts.get([id,f.workout.id]));await roundTrip(db,id)
})

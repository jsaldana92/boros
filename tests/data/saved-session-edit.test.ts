import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID as uid } from 'node:crypto'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService, exerciseToInput } from '../../src/db/exercises.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { savedSessionService } from '../../src/db/saved-sessions.ts'
import { SavedSessionController } from '../../src/features/train/saved-session-controller.ts'
import { copyExercise } from '../../src/schemas/plan.ts'
import { copyWorkout } from '../../src/schemas/workout.ts'
import { displayedLoad } from '../../src/schemas/session.ts'
import { inputRows } from '../../src/schemas/strength-results.ts'
import { captureAnalysis } from '../../src/db/analysis.ts'
import { analysisRows } from '../../src/features/backups/analysis.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { progressService } from '../../src/db/progress.ts'
import { performanceStats } from '../../src/lib/progress-analytics.ts'

async function setup(t, kind='workout', partial=false) {
 const db=new BorosDatabase('boros-test-saved-edit-'+uid());t.after(()=>db.delete())
 const profiles=profileService(db),id=(await profiles.initialize()).activeProfileId,sessions=sessionService(db),service=savedSessionService(db)
 const exercise=await exerciseService(db).save(id,{name:'Lunge',lrDistinction:true,notes:'Default note',instructions:'Original instructions',tagNames:[],sets:[{reps:{min:5,max:8},rir:{min:0,max:2}},{reps:{min:6,max:9}}],restBetweenSeconds:30}),group=uid()
 const workout=await workoutService(db).save(id,{id:uid(),name:'Historical legs',instructions:'Historical workout instructions',groups:[{id:group,number:1,restBetweenRoundsSeconds:30}],exercises:[0,1].map(()=>({...copyExercise(exerciseToInput(exercise,[]),{kind:'exercise',id:exercise.id}),groupId:group}))})
 const plan=await planService(db).save(id,{name:'Saved plan',durationWeeks:2,days:[copyWorkout(workout)]})
 let draft=kind==='plan'?await sessions.start(id,plan.id,plan.days[0].id):await sessions.startStandalone(id,kind==='custom'?undefined:workout.id)
 if(kind==='custom') { const {appendSessionExercises}=await import('../../src/schemas/session-structure.ts');const choices=(await planService(db).library(id)).choices;const next=appendSessionExercises(draft,draft.input,[choices[0],choices[0]],'kg');draft=await sessions.update(id,draft.id,draft.revision,next.input,{day:next.day,structure:next.structure}) }
 const input=structuredClone(draft.input);input.notes='Workout note';input.noteEdited=true
 input.exercises.forEach((e,i)=>{e.notes=i?'  ':'Occurrence note';e.noteEdited=true;e.sets.forEach((s,j)=>{Object.assign(s.sides.left,{load:j?'70.123456789012':'0',reps:j?'8':'0',rir:j?'':'0'});Object.assign(s.sides.right,{load:'35',reps:'7',rir:'1'});if(partial&&j===1){s.sides.left={load:'',reps:'',rir:'',unit:'kg',skipped:false};s.sides.right.skipped=true}})})
 const saved=await sessions.complete(id,draft.id,draft.revision,input,partial)
 return {db,id,profiles,sessions,service,exercise,workout,plan,saved,controller:new SavedSessionController(await service.load(id,saved.id),service)}
}

for(const kind of ['plan','workout','custom'])test(`saved ${kind} loads historical L/R/notes/supersets, preserves precision/date/count and sources on unchanged save`,async t=>{
 const f=await setup(t,kind),before=await captureProfile(f.id,f.db),c=f.controller
 const source=await exerciseService(f.db).save(f.id,{...exerciseToInput(f.exercise,[]),name:'Renamed source',instructions:'New instructions'},f.exercise);await exerciseService(f.db).setArchived(f.id,source.id,source.revision,true)
 assert.equal(c.snapshot.day.exercises[0].prescription.instructions,'Original instructions');assert.equal(c.snapshot.day.exercises[0].prescription.name,'Lunge')
 assert.equal(c.input.notes,'Workout note');assert.equal(c.input.exercises[0].notes,'Occurrence note');assert.equal(c.input.exercises[1].notes,'  ')
 assert.equal(c.input.exercises[0].sets[0].sides!.left.load,'0');assert.equal(c.input.exercises[0].sets[1].sides!.left.rir,'');assert.equal(displayedLoad(c.input.exercises[0].sets[1].sides!.left,'lb'),'154.595759')
 assert.equal(c.dirty,false);const result=await c.complete(false)
 assert.deepEqual({...result,revision:f.saved.revision},f.saved);assert.equal(await f.db.sessions.count(),1)
 assert.deepEqual(await f.db.plans.toArray(),before.plans);assert.deepEqual(await f.db.workouts.toArray(),before.workouts)
 const finalized=await f.db.drafts.get([f.id,f.saved.id]);assert.equal(finalized!.finalizedAt,f.saved.completedAt);assert.equal(finalized!.revision,before.drafts[0].revision+1)
 const backup=await readBackup((await generateBackup(await captureProfile(f.id,f.db),'saved-edit')).bytes);assert.deepEqual(backup.data.sessions[0],JSON.parse(JSON.stringify(result)))
})

test('correction replaces one partial session, its finalized results, future notes/hints, CSV and ZIP without another completion',async t=>{
 const f=await setup(t,'workout',true),c=f.controller
 assert.equal(c.input.exercises[0].sets[1].sides!.left.skipped,false);assert.equal(c.input.exercises[0].sets[1].sides!.right.skipped,true)
 const input=structuredClone(c.input);input.exercises[0].notes='Corrected note';input.exercises[0].sets[0].sides!.left.load='42.125';c.change(input)
 await assert.rejects(c.complete(false),/partial/);assert.deepEqual(await f.db.sessions.get([f.id,f.saved.id]),f.saved)
 const corrected=await c.complete(true);assert.equal(corrected.partial,true);assert.equal(corrected.completedAt,f.saved.completedAt);assert.equal(corrected.loggedAt,f.saved.loggedAt)
 const rows=analysisRows(await captureAnalysis(f.id,f.db));assert.equal(rows.length,8);assert.equal(rows[0].weight,'42.125');assert.equal(rows[0].exercise_notes,'Corrected note');assert.equal(rows[2].status,'Unrecorded');assert.equal(rows[3].status,'Skipped')
 const progress=await progressService(f.db).read(f.id),stats=performanceStats(progress.performances)
 assert.equal(progress.sessions.length,1);assert.equal(progress.performances.length,2);assert.equal(stats.sets.length,4);assert.equal(new Set(stats.sets.map(s=>s.id)).size,4)
 assert.equal(stats.maximum!.result.weightKg,42.125);assert.equal(stats.maximum!.side,'left');assert.equal(stats.sets.find(s=>s.performance.occurrenceIndex===0&&s.side==='right')!.result.weightKg,35)
 const next=await f.sessions.startStandalone(f.id,f.workout.id);assert.equal(next.input.exercises[0].notes,'Corrected note');assert.equal((await f.sessions.hints(next,'kg'))[next.day.exercises[0].id][0].sides!.left.load,'42.125')
 assert.ok(JSON.stringify(await f.sessions.history(next)).includes('42.125'))
 const backup=await readBackup((await generateBackup(await captureProfile(f.id,f.db),'corrected')).bytes);assert.deepEqual(backup.data.sessions[0],JSON.parse(JSON.stringify(corrected)));assert.equal(backup.data.sessions.length,1)
})

test('Clear/Cancel, unapplied structure and failed/stale/deleted saves preserve originals, foreign profiles and live timers',async t=>{
 const f=await setup(t),original=await captureProfile(f.id,f.db),live=await f.sessions.startStandalone(f.id,f.workout.id),timer=await f.sessions.startGroupTimer(f.id,live.id,live.revision,live.day.groups![0].id,0),active=await f.db.activeWorkouts.toArray()
 const c=f.controller;c.addSets(c.snapshot.day.groups![0].id,'kg');await c.clear();assert.equal(c.input.notes,'');assert.equal(c.input.exercises[0].notes,'');assert.ok(c.input.exercises.every(e=>e.sets.every(s=>inputRows(s).every(r=>r.result.load===''))))
 await assert.rejects(c.complete(true),/at least one/);await assert.rejects(c.startGroupTimer(c.snapshot.day.groups![0].id,0),/current timer/);await c.discard()
 assert.deepEqual(await f.db.sessions.toArray(),original.sessions);assert.deepEqual(await f.db.restTimers.get('active'),timer);assert.deepEqual(await f.db.activeWorkouts.toArray(),active);assert.deepEqual(await f.db.drafts.get([f.id,live.id]),live)
 const edit=await f.service.load(f.id,f.saved.id),a=new SavedSessionController(edit,f.service),b=new SavedSessionController(edit,f.service)
 const input=structuredClone(a.input);input.exercises[0].sets[0].sides!.right.reps='99';a.change(input)
 const fail=()=>{throw new Error('Injected quota')};f.db.drafts.hook('updating',fail);await assert.rejects(a.complete(false),/quota/);f.db.drafts.hook('updating').unsubscribe(fail)
 assert.equal(a.input.exercises[0].sets[0].sides!.right.reps,'99');assert.deepEqual(await f.db.sessions.toArray(),original.sessions)
 await a.complete(false);await assert.rejects(b.complete(false),/changed in another tab/);assert.equal(b.input.exercises[0].sets[0].sides!.right.reps,'7')
 const foreign=await f.profiles.create('Other');await assert.rejects(f.service.load(foreign.id,f.saved.id),/unavailable/)
 const latest=new SavedSessionController(await f.service.load(f.id,f.saved.id),f.service);await f.db.sessions.delete([f.id,f.saved.id]);await assert.rejects(latest.complete(false),/deleted/);assert.deepEqual(await f.db.restTimers.get('active'),timer)
})

test('saved editing add/replace and rest controls operate only on the local copy and owned token; concurrent Save is locked',async t=>{
 const f=await setup(t),c=f.controller,source=await exerciseService(f.db).save(f.id,{name:'Replacement',tagNames:[],sets:[{reps:{min:3,max:3}}],notes:'Replacement note'})
 const original=await captureProfile(f.id,f.db),id=c.snapshot.day.exercises[0].id
 await c.replaceExercise(id,source.id,source.revision);c.addSets(c.snapshot.day.groups![0].id,'kg')
 assert.equal(c.snapshot.day.exercises[0].id,id);assert.equal(c.input.exercises[0].notes,'Replacement note');assert.deepEqual(await f.db.sessions.toArray(),original.sessions)
 const timer=await c.startGroupTimer(c.snapshot.day.groups![0].id,0);assert.equal((await f.db.activeWorkouts.toArray()).length,0);assert.ok(timer)
 await c.changeTimer(timer!.token,'pause');assert.ok((await c.timer())!.pausedAt);await c.changeTimer(timer!.token,'reset');assert.notEqual(c.timerToken,timer!.token)
 const input=structuredClone(c.input);input.exercises.forEach(e=>e.sets.forEach(s=>inputRows(s).forEach(({result})=>Object.assign(result,{load:'12',reps:'6',rir:'0',skipped:false}))));c.change(input)
 const saving=c.complete(false);await assert.rejects(c.complete(false),/in progress/);const saved=await saving
 assert.equal(saved.day.exercises[0].prescription.name,'Replacement');assert.equal(await c.timer(),undefined);assert.equal(await f.db.sessions.count(),1)
 assert.deepEqual(await f.db.plans.toArray(),original.plans);assert.deepEqual(await f.db.workouts.toArray(),original.workouts)
 await readBackup((await generateBackup(await captureProfile(f.id,f.db),'amended')).bytes)
})

test('reopening saved editing keeps its own rest reachable; inconsistent finalized results fail without replacement data',async t=>{
 const f=await setup(t),c=f.controller,timer=await c.startGroupTimer(c.snapshot.day.groups![0].id,0)
 const reopened=new SavedSessionController(await f.service.load(f.id,f.saved.id),f.service);assert.equal((await reopened.timer())!.token,timer!.token);await reopened.discard();assert.equal(await f.db.restTimers.get('active'),undefined)
 const draft=await f.db.drafts.get([f.id,f.saved.id]);draft!.input.exercises[0].sets[0].sides!.left.reps='99';await f.db.drafts.put(draft!)
 await assert.rejects(f.service.load(f.id,f.saved.id),/finalized results disagree/);assert.deepEqual(await f.db.sessions.get([f.id,f.saved.id]),f.saved);assert.equal(await f.db.sessions.count(),1)
})

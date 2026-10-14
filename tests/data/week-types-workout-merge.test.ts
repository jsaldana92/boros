import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { randomUUID as uid } from 'node:crypto'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService, exerciseToInput } from '../../src/db/exercises.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { calendarRunService } from '../../src/db/calendar-runs.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { libraryDeleteService } from '../../src/db/library-delete.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { captureAnalysis } from '../../src/db/analysis.ts'
import { copyExercise, duplicateDay, explicitWeeks, identifySets, planInputSchema, planToInput, planWeeks, resolveWeek } from '../../src/schemas/plan.ts'
import { copyWorkout, workoutToInput } from '../../src/schemas/workout.ts'
import { workoutComparison, similarWorkouts, similarityToken, SimilarWorkoutError } from '../../src/lib/workout-comparison.ts'
import { workoutResolver } from '../../src/lib/workout-identity.ts'
import { occurrences, programWeek } from '../../src/schemas/schedule.ts'
import { prescribedDays } from '../../src/lib/run-progress.ts'
import { addDays } from '../../src/lib/calendar-dates.ts'
import { analysisRows } from '../../src/features/backups/analysis.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { parseInterchange, toImportDraft, formattingInstructions } from '../../src/features/create/interchange.ts'
import { representativeProfile } from '../fixtures/backup-profile.ts'
import { legacyWorkspace } from '../fixtures/legacy-workspace.ts'
import JSZip from 'jszip'
import { csvTables } from '../../src/features/backups/csv.ts'
import { recordCounts } from '../../src/schemas/backup.ts'
import { sha256 } from '../../src/features/backups/integrity.ts'

const target = { name:'Press', sets:[{reps:{min:5,max:8},rir:{min:0,max:0}},{reps:{min:3,max:3}}], tagNames:[], restBetweenSeconds:0 }
async function fixture(t) {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-05T14:05:07.123Z')})
  const db = new BorosDatabase('boros-test-week-types-'+uid()); t.after(()=>db.delete())
  const profiles=profileService(db),id=(await profiles.initialize()).activeProfileId,exercises=exerciseService(db),e=await exercises.save(id,target)
  const day=(name='Upper')=>({id:uid(),name,exercises:[copyExercise(exerciseToInput(e,[]),{kind:'exercise' as const,id:e.id})]})
  return {db,id,profiles,e,exercises,day,workouts:workoutService(db),plans:planService(db),sessions:sessionService(db),schedules:scheduleService(db),calendar:calendarRunService(db),weekly:weeklyService(db)}
}
function program(f, assignments=[[1,2,4],[3,5]],counts=[1,2]) {
  const types=assignments.map((programWeeks,i)=>({id:uid(),programWeeks,days:identifySets(Array.from({length:counts[i]},(_,d)=>f.day(`Type ${i+1} Workout ${d+1}`)))}))
  return {name:'Assigned',durationWeeks:Math.max(...assignments.flat()),weeks:types.map(w=>({id:w.id,programWeeks:w.programWeeks,dayIds:w.days.map(d=>d.id)})),days:types.flatMap(w=>w.days)}
}
const mapping=plan=>planWeeks(plan).flatMap(w=>w.days.map((d,weekday)=>({dayId:d.id,weekday})))
async function finish(f,d,notes='') {
  const input=structuredClone(d.input);input.notes=notes;input.noteEdited=true
  input.exercises.forEach(e=>e.sets.forEach(s=>Object.assign(s,{load:'0',reps:'5'})))
  return f.sessions.complete(f.id,d.id,d.revision,input,false)
}
async function confirmed(f,raw,existing?) {
  try {return await f.workouts.save(f.id,raw,existing)} catch(error) { if(!(error instanceof SimilarWorkoutError))throw error;return f.workouts.save(f.id,raw,existing,false,error.token) }
}

test('explicit maps support uneven four/five weeks, one/max types, ownership and concise invalid-map validation',async t=>{
  const f=await fixture(t)
  for(const [map,counts] of [[[[1,2,3],[4]],[1,2]],[[[1,3],[2,4]],[1,2]],[[[1,2,4],[3,5]],[1,2]],[[[1,2,3,4]],[1]],[[[1],[2],[3],[4]],[1,1,1,1]]] as [number[][],number[]][]) {
    const p=program(f,map,counts);assert.equal(planInputSchema.safeParse(p).success,true)
    map.forEach((weeks,i)=>weeks.forEach(n=>assert.deepEqual(resolveWeek(p,n).days.map(d=>d.id),p.weeks[i].dayIds)))
  }
  for(const change of [p=>p.weeks[0].programWeeks.pop(),p=>p.weeks[0].programWeeks.push(3),p=>p.weeks[1].programWeeks=[],p=>p.weeks[0].programWeeks.push(0),p=>p.weeks[0].programWeeks[0]=1.5]) {const p=program(f);change(p);assert.equal(planInputSchema.safeParse(p).success,false)}
  const p=program(f);p.durationWeeks=6;assert.equal(planInputSchema.safeParse(p).success,false);p.weeks[1].programWeeks.push(6);assert.equal(planInputSchema.safeParse(p).success,true)
  assert.deepEqual(resolveWeek({...p,weeks:p.weeks.map(w=>({...w,programWeeks:[]}))},1).days,[],'missing explicit assignments never fall back to modulo')
})

test('Calendar and Train share assigned types, gap shifts and totals sum each program week',async t=>{
  const f=await fixture(t),p=await f.plans.save(f.id,program(f)),run=await f.schedules.create(f.id,{planId:p.id,planRevision:p.revision,startWeek:'2026-10-05',timeZone:'America/New_York',mapping:mapping(p)})
  assert.equal(prescribedDays(run),7)
  assert.deepEqual([0,1,2,3,4].map(i=>occurrences(run,addDays(run.startWeek,7*i),addDays(run.startWeek,7*i+6)).map(e=>e.day.name)),[['Type 1 Workout 1'],['Type 1 Workout 1'],['Type 2 Workout 1','Type 2 Workout 2'],['Type 1 Workout 1'],['Type 2 Workout 1','Type 2 Workout 2']])
  const proposal=await f.weekly.previewMove(f.id,run.id,run.revision,'2026-10-19',1),moved=await f.weekly.move(f.id,proposal)
  assert.equal(occurrences(moved,'2026-10-19','2026-10-25').length,0);assert.equal(programWeek(moved,'2026-10-26'),3)
  assert.equal(occurrences(moved,'2026-10-26','2026-11-01')[0].day.id,p.weeks![1].dayIds[0]);assert.equal(prescribedDays(moved),7);assert.equal(moved.endDate,addDays(run.endDate!,7))
  const duplicate=await f.plans.duplicateDraft(f.id,p.id);assert.deepEqual(duplicate.weeks!.map(w=>w.programWeeks),p.weeks!.map(w=>w.programWeeks));assert.notEqual(duplicate.weeks![0].id,p.weeks![0].id)
})

test('assignment repair is reviewed, preserves started snapshots/outcomes and rejects stale review',async t=>{
  const f=await fixture(t),p=await f.plans.save(f.id,program(f)),run=await f.schedules.create(f.id,{planId:p.id,planRevision:p.revision,startWeek:'2026-10-05',timeZone:'America/New_York',mapping:mapping(p)})
  const event=occurrences(run,run.startWeek,run.startWeek)[0],d=(await f.sessions.openOccurrence(f.id,run.id,event.day.id,event.ref.scheduledDate)).draft!,saved=await finish(f,d)
  const future=(await f.sessions.openOccurrence(f.id,run.id,p.days[0].id,'2026-10-12')).draft!
  const changed=planToInput(p);changed.weeks![0].programWeeks=[1,3,4];changed.weeks![1].programWeeks=[2,5]
  const edited=await f.plans.save(f.id,changed,p),marked=(await f.db.schedules.get([f.id,run.id]))!
  assert.equal(marked.revisions.at(-1)!.needsRepair,true);assert.deepEqual(await f.db.sessions.get([f.id,saved.id]),saved);assert.deepEqual(await f.sessions.getDraft(f.id,future.id),future)
  const review=await f.calendar.beginEdit(f.id,run.id,marked.revision);assert.deepEqual(review.source.weeks,edited.weeks);assert.equal(review.effectiveFrom,'2026-10-12')
  const proposal=await f.calendar.previewEdit(f.id,run.id,marked.revision,mapping(edited)),fixed=await f.calendar.edit(proposal)
  assert.equal(fixed.revisions.at(-1)!.needsRepair,false);assert.ok(fixed.occurrenceExceptions?.some(e=>e.key===future.occurrenceKey));assert.deepEqual(await f.sessions.getDraft(f.id,future.id),future)
  assert.equal(prescribedDays(fixed),8,'seven assigned workouts plus one protected started workout from the old type')
  assert.equal(occurrences(fixed,fixed.startWeek,fixed.endDate!).length,8)
  assert.equal(occurrences(fixed,'2026-10-19','2026-10-25')[0].day.id,p.days[0].id)
  await assert.rejects(f.calendar.edit(proposal),/changed/)
  validateBackupData(canonicalSnapshot(await captureProfile(f.id,f.db)))
})

test('v13 to v14 expands only finite editable cycles while retaining every other store, photo and selection',async t=>{
  const f=await fixture(t);await representativeProfile(f.db);await legacyWorkspace(f.db)
  const input=program(f,[[1,3],[2,4]]),p=await f.plans.save(f.id,input),legacy={...p,weeks:p.weeks!.map(({programWeeks:_assigned,...w})=>w)}
  await f.db.plans.put(legacy);const unbounded={...legacy,id:uid(),name:'Unbounded',nameKey:'unbounded',activeNameKey:'unbounded',durationWeeks:undefined};await f.db.plans.put(unbounded)
  const name='boros-test-prior13-'+uid(),old=new Dexie(name);old.version(13).stores(Object.fromEntries(f.db.tables.map(table=>[table.name,[table.schema.primKey.src,...table.schema.indexes.map(i=>i.src)].join(',')])));await old.open()
  const before=new Map<string,any[]>();for(const table of f.db.tables){const rows=await table.toArray();before.set(table.name,rows);await old.table(table.name).bulkPut(rows)}old.close()
  const next=new BorosDatabase(name);t.after(()=>next.delete());await next.open();assert.equal(next.verno,16)
  for(const table of next.tables) {
    if(table.name==='plans'){assert.deepEqual(await next.plans.get([f.id,p.id]),explicitWeeks(legacy));assert.deepEqual(await next.plans.get([f.id,unbounded.id]),unbounded);continue}
    assert.deepEqual(await table.toArray(),before.get(table.name),table.name)
    if(table.name==='photos') for(const row of await table.toArray()){const prior=before.get('photos')!.find(p=>p.id===row.id);assert.deepEqual(await row.blob.arrayBuffer(),await prior.blob.arrayBuffer())}
  }
  next.close();await next.open();assert.deepEqual(await next.plans.get([f.id,p.id]),explicitWeeks(legacy))
})

test('AI v9 explicit maps, strict legacy contracts and backup20 JSON/CSV retain assignments',async t=>{
  const f=await fixture(t),exercise={name:'Press',sets:[{reps:{min:5,max:8}}]},payload={schemaVersion:9,kind:'plan',trainingType:'strength',plan:{mode:'unique',name:'Five',durationWeeks:5,uniqueWeekCount:2,weeks:[{programWeeks:[1,2,4],trainingDaysPerWeek:1,days:[{name:'A',exercises:[exercise]}]},{programWeeks:[3,5],trainingDaysPerWeek:2,days:[{name:'B',exercises:[exercise]},{name:'C',exercises:[exercise]}]}]}}
  const parsed=parseInterchange(JSON.stringify(payload));assert.deepEqual(parsed.issues,[]);const draft=toImportDraft(parsed.value!);assert.equal(draft.kind,'plan');if(draft.kind!=='plan')return
  assert.deepEqual(draft.input.weeks!.map(w=>w.programWeeks),[[1,2,4],[3,5]])
  for(const schemaVersion of [4,5,6,7,8])assert.equal(parseInterchange(JSON.stringify({...payload,schemaVersion})).value,undefined)
  for(const map of [[[1,2],[3,5]],[[1,2,3],[3,4,5]],[[1,2,3,4,5],[]]]){const bad=structuredClone(payload);bad.plan.weeks.forEach((w,i)=>w.programWeeks=map[i]);assert.equal(parseInterchange(JSON.stringify(bad)).value,undefined)}
  assert.match(formattingInstructions('plan'),/schemaVersion 10/);assert.match(formattingInstructions('plan'),/programWeeks/)
  const p=await f.plans.save(f.id,program(f)),snapshot=await captureProfile(f.id,f.db),zip=await generateBackup(snapshot,'explicit'),read=await readBackup(zip.bytes)
  assert.equal(read.manifest.backupSchemaVersion,22);assert.equal(read.manifest.databaseSchemaVersion,16);assert.deepEqual(read.data.plans[0].weeks,p.weeks)
  assert.throws(()=>validateBackupData({...read.data,backupSchemaVersion:19}),/./,'frozen19 cannot silently accept the new contract')
  const restored=await buildRestorePlan(read,undefined,'new',uid(),'Restored',new Date().toISOString());assert.deepEqual(restored.result.plans[0].weeks,p.weeks)
})

test('a v19 ZIP validates original checksums/contracts before expanding the old cycle; a malformed v13 upgrade rolls back without reset',async t=>{
  const f=await fixture(t),p=await f.plans.save(f.id,program(f,[[1,3],[2,4]])),snapshot=await captureProfile(f.id,f.db),current=await generateBackup(snapshot,'legacy19'),data=canonicalSnapshot(snapshot)
  data.backupSchemaVersion=19;data.plans[0].weeks=data.plans[0].weeks!.map(({programWeeks:_map,...w})=>w);validateBackupData(data)
  const invalid=structuredClone(data);invalid.workouts[0].mergedIntoId=invalid.workouts[0].id;assert.throws(()=>validateBackupData(invalid),/Unrecognized/)
  const tables=csvTables(data),files=[{path:'data.json',text:JSON.stringify(data)},...tables.map(t=>({path:t.path,text:t.text}))],zip=new JSZip()
  const manifest={...current.manifest,backupSchemaVersion:19,databaseSchemaVersion:13,counts:recordCounts(data),csvRows:Object.fromEntries(tables.map(t=>[t.path,t.rows])),inventory:await Promise.all(files.map(async file=>{const bytes=new TextEncoder().encode(file.text);return {path:file.path,bytes:bytes.length,sha256:await sha256(bytes),mediaType:file.path.endsWith('json')?'application/json':'text/csv; charset=utf-8'}}))}
  files.forEach(file=>zip.file(file.path,file.text,{createFolders:false}));zip.file('manifest.json',JSON.stringify(manifest))
  const restored=await readBackup(await zip.generateAsync({type:'uint8array'}));assert.equal(restored.manifest.backupSchemaVersion,19);assert.equal(restored.data.backupSchemaVersion,22);assert.deepEqual(restored.data.plans[0].weeks,p.weeks)
  zip.file('data.json',JSON.stringify({...data,plans:[]}));await assert.rejects(readBackup(await zip.generateAsync({type:'uint8array'})),/checksum|size/)
  const name='boros-test-rejected-v14-'+uid(),old=new Dexie(name);old.version(13).stores(Object.fromEntries(f.db.tables.map(table=>[table.name,[table.schema.primKey.src,...table.schema.indexes.map(i=>i.src)].join(',')])));await old.open()
  for(const table of f.db.tables)await old.table(table.name).bulkPut(await table.toArray())
  const malformed={...data.plans[0],durationWeeks:5};await old.table('plans').put(malformed);const profiles=await old.table('profiles').toArray(),settings=await old.table('settings').toArray();old.close()
  const next=new BorosDatabase(name);await assert.rejects(next.open(),/Invalid legacy week cycle/);next.close()
  const inspect=new Dexie(name);await inspect.open();t.after(()=>inspect.delete());assert.equal(inspect.verno,13);assert.deepEqual(await inspect.table('plans').toArray(),[malformed]);assert.deepEqual(await inspect.table('profiles').toArray(),profiles);assert.deepEqual(await inspect.table('settings').toArray(),settings)
})

test('comparison respects canonical identities, ordered repeated targets, optional zero and all grouping/timing fields',async t=>{
  const f=await fixture(t),a=f.day(),b=duplicateDay(a),resolve=(id:string)=>id
  b.name='Different name';assert.equal(workoutComparison(a,resolve),workoutComparison(b,resolve))
  for(const mutate of [d=>d.exercises[0].prescription.sets.reverse(),d=>delete d.exercises[0].prescription.sets[0].rir,d=>delete d.exercises[0].prescription.restBetweenSeconds,d=>d.exercises[0].prescription.restAfterSeconds=0,d=>d.exercises.push(copyExercise(target,{kind:'exercise',id:f.e.id})),d=>d.exercises[0].source.id=uid()]){const d=structuredClone(b);mutate(d);assert.notEqual(workoutComparison(a,resolve),workoutComparison(d,resolve))}
  b.notes='Branch';assert.equal(workoutComparison(a,resolve),workoutComparison(b,resolve));assert.notEqual(workoutComparison(a,resolve,true),workoutComparison(b,resolve,true))
  const merged=uid();b.exercises[0].source!.id=merged;assert.equal(workoutComparison(a,resolve),workoutComparison(b,id=>id===merged?f.e.id:id))
  const grouped={...a,exercises:[...a.exercises,copyExercise(target,{kind:'exercise' as const,id:f.e.id})],groups:[{id:uid(),number:1,restBetweenRoundsSeconds:0}]};grouped.exercises.forEach(e=>e.groupId=grouped.groups[0].id)
  const changed=duplicateDay(grouped);assert.equal(workoutComparison(grouped,resolve),workoutComparison(changed,resolve));delete changed.groups![0].restBetweenRoundsSeconds;assert.notEqual(workoutComparison(grouped,resolve),workoutComparison(changed,resolve))
  const twoGroups=structuredClone(grouped);twoGroups.groups.push({id:uid(),number:2,restBetweenRoundsSeconds:0});twoGroups.exercises.push(...twoGroups.exercises.map(e=>({...structuredClone(e),id:uid(),groupId:twoGroups.groups[1].id})))
  const reorderedDefinitions=duplicateDay(twoGroups);reorderedDefinitions.groups!.reverse();assert.equal(workoutComparison(twoGroups,resolve,true),workoutComparison(reorderedDefinitions,resolve,true),'group declaration order is not execution order')
  const timed={id:uid(),name:'Timed',trainingType:'interval' as const,postWorkoutRestSeconds:0,exercises:[copyExercise({name:'Run',trainingType:'interval',sets:[],tagNames:[],activeSeconds:20,recoverySeconds:0},{kind:'exercise',id:uid()})],circuits:[] as any[]};timed.circuits=[{id:uid(),name:'Circuit 1',exerciseIds:[timed.exercises[0].id],repeat:1,restAfterCircuitSeconds:0}]
  const twin=duplicateDay(timed);assert.equal(workoutComparison(timed,resolve),workoutComparison(twin,resolve))
  for(const mutate of [d=>d.circuits[0].repeat++,d=>delete d.circuits[0].restAfterCircuitSeconds,d=>d.exercises[0].prescription.activeSeconds++,d=>d.exercises[0].prescription.recoverySeconds++,d=>delete d.postWorkoutRestSeconds]){const d=structuredClone(twin);mutate(d);assert.notEqual(workoutComparison(timed,resolve),workoutComparison(d,resolve))}
})

test('concurrent plan publication deduplicates equivalent workouts but preserves independent occurrence IDs and authored variants',async t=>{
  const f=await fixture(t),first=f.day(),second=duplicateDay(first);second.name='Other occurrence'
  const [a,b]=await Promise.all([f.plans.save(f.id,{name:'One',durationWeeks:2,days:[first,second]}),f.plans.save(f.id,{name:'Two',durationWeeks:2,days:[duplicateDay(first)]})])
  assert.equal(await f.db.workouts.count(),1);assert.equal(a.days[0].publishedWorkoutId,a.days[1].publishedWorkoutId);assert.equal(a.days[0].publishedWorkoutId,b.days[0].publishedWorkoutId);assert.notEqual(a.days[0].id,a.days[1].id);assert.equal(a.days[1].name,'Other occurrence')
  const note=duplicateDay(first);note.notes='Keep branch';const authored=await f.plans.save(f.id,{name:'Authored',durationWeeks:2,days:[note]});assert.equal(await f.db.workouts.count(),2);assert.equal((await f.workouts.get(f.id,authored.days[0].publishedWorkoutId!)).notes,'Keep branch')
  const own=planToInput(a);own.days[0].exercises[0].prescription.sets[0].reps.min=7;await f.plans.save(f.id,own,a);assert.equal((await f.workouts.get(f.id,a.days[0].publishedWorkoutId!)).exercises[0].prescription.sets[0].reps.min,5)
})

test('standalone similarity is transactional, cancellation writes nothing, suffixes serialize, editing keeps identity and excludes itself',async t=>{
  const f=await fixture(t),a=await f.workouts.save(f.id,f.day()),before=await f.db.workouts.toArray(),raw={...duplicateDay(a),name:' UPPER ',notes:'Independently authored'}
  let token='';await assert.rejects(f.workouts.save(f.id,raw),e=>{assert.ok(e instanceof SimilarWorkoutError);token=e.token;return true});assert.deepEqual(await f.db.workouts.toArray(),before)
  const b=await f.workouts.save(f.id,raw,undefined,false,token);assert.equal(b.name,'UPPER (1)');assert.equal(b.notes,raw.notes);assert.notEqual(a.id,b.id)
  const c=await confirmed(f,{...duplicateDay(a),name:'Upper (1)'});assert.equal(c.name,'Upper (2)')
  const edited=await confirmed(f,{...workoutToInput(b),notes:'Updated'},b);assert.equal(edited.id,b.id);assert.equal(await f.db.workouts.count(),3)
  const collisionToken=similarityToken(similarWorkouts(f.id,raw,await f.db.workouts.toArray(),await f.db.exercises.toArray()))
  const results=await Promise.allSettled([f.workouts.save(f.id,{...duplicateDay(a),name:'Upper'},undefined,false,collisionToken),f.workouts.save(f.id,{...duplicateDay(a),name:'Upper'},undefined,false,collisionToken)])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(results.some(r=>r.status==='rejected'&&r.reason instanceof SimilarWorkoutError))
  const other=await f.profiles.create('Other');await f.workouts.save(other.id,{...f.day(),exercises:[copyExercise(target)]});assert.equal((await f.workouts.library(other.id)).length,1)
  const own=(await f.workouts.library(other.id))[0];assert.equal((await f.workouts.save(other.id,{...workoutToInput(own),name:'Own'},own)).id,own.id)
})

test('merge is atomic and profile/type/revision checked; canonical chains retry safely and reject cycles',async t=>{
  const f=await fixture(t),a=await f.workouts.save(f.id,f.day('A')),b=await confirmed(f,f.day('B')),c=await confirmed(f,f.day('C')),other=await f.profiles.create('Other')
  await assert.rejects(f.workouts.merge(other.id,a,b,uid()),/unavailable/);await assert.rejects(f.workouts.merge(f.id,a,a,uid()),/different/)
  const input={id:uid(),name:'Interval',trainingType:'interval' as const,exercises:[copyExercise({name:'Jump',trainingType:'interval',sets:[],tagNames:[],activeSeconds:20,recoverySeconds:0})],circuits:[] as any[]};input.circuits=[{id:uid(),name:'Circuit 1',exerciseIds:input.exercises.map(e=>e.id),repeat:0,restAfterCircuitSeconds:0}]
  const interval=await f.workouts.save(f.id,input);await assert.rejects(f.workouts.merge(f.id,a,interval,uid()),/mixed|converted/)
  const before=await f.db.workouts.toArray(),put=f.db.workouts.put.bind(f.db.workouts);let count=0;f.db.workouts.put=async(...args)=>{if(++count===2)throw Error('injected write');return put(...args)}
  await assert.rejects(f.workouts.merge(f.id,a,b,uid()),/injected/);f.db.workouts.put=put;assert.deepEqual(await f.db.workouts.toArray(),before)
  const operation=uid(),survivor=await f.workouts.merge(f.id,a,b,operation);assert.deepEqual(workoutToInput(survivor),workoutToInput(b));assert.equal((await f.db.workouts.get([f.id,a.id]))!.mergedIntoId,b.id)
  await assert.rejects(f.workouts.merge(f.id,c,b,uid()),/another tab/);await assert.rejects(f.workouts.merge(f.id,b,a,uid()),/merged|another tab/)
  const final=await f.workouts.merge(f.id,survivor,c,uid());assert.equal((await f.workouts.merge(f.id,a,b,operation)).id,final.id)
  assert.equal(workoutResolver(f.id,await f.db.workouts.toArray())(a.id),c.id)
  assert.throws(()=>workoutResolver(f.id,[{...a,mergedIntoId:b.id},{...b,mergedIntoId:a.id}])(a.id),/cycle/)
  assert.throws(()=>workoutResolver(f.id,[{...a,mergedIntoId:uid()}])(a.id),/unavailable/)
})

test('merged workouts keep copies, history, active snapshots and note branches; CSV resolves identity without collapsing rows; backup and deletion retain integrity',async t=>{
  const f=await fixture(t),a=await f.workouts.save(f.id,{...f.day('A'),notes:'Default A'}),b=await confirmed(f,{...f.day('B'),notes:'Default B'}),plan=await f.plans.save(f.id,{name:'Separate occurrences',durationWeeks:2,days:[copyWorkout(a),copyWorkout(b)]})
  await finish(f,await f.sessions.startStandalone(f.id,a.id),'A history');await finish(f,await f.sessions.startStandalone(f.id,b.id),'B history')
  const active=await f.sessions.startStandalone(f.id,a.id),history=await f.db.sessions.toArray(),copies=await f.db.plans.toArray(),premerge=await readBackup((await generateBackup(await captureProfile(f.id,f.db),'premerge')).bytes)
  const survivor=await f.workouts.merge(f.id,a,b,uid());assert.deepEqual(await f.db.sessions.toArray(),history);assert.deepEqual(await f.db.plans.toArray(),copies);assert.deepEqual(await f.sessions.getDraft(f.id,active.id),active)
  const rows=analysisRows(await captureAnalysis(f.id,f.db));assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.session_id)).size,2);assert.deepEqual(new Set(rows.map(r=>r.workout_id)),new Set([b.id]));assert.deepEqual(new Set(rows.map(r=>r.workout)),new Set(['A','B']))
  f.db.close();await f.db.open();const recovered=await f.sessions.getDraft(f.id,active.id);assert.deepEqual(recovered,active);await finish(f,recovered,'A after merge');assert.equal(await f.db.sessions.count(),3)
  const future=await f.sessions.startStandalone(f.id,a.id);assert.equal(future.source.workoutId,b.id);assert.equal(future.input.notes,'B history');await f.sessions.discard(f.id,future.id,future.revision)
  const snapshot=await captureProfile(f.id,f.db),zip=await readBackup((await generateBackup(snapshot,'merged')).bytes);assert.equal(zip.data.workouts.find(w=>w.id===a.id).mergedIntoId,b.id)
  for(const action of ['new','device','import'] as const){const restored=await buildRestorePlan(zip,action==='new'?undefined:snapshot,action,uid(),'Restore',new Date().toISOString());validateBackupData(canonicalSnapshot(restored.result));assert.equal(restored.result.sessions.length,3);assert.equal(restored.result.workouts.find(w=>w.id===a.id)!.mergedIntoId,b.id)}
  const old=await buildRestorePlan(premerge,snapshot,'import',uid(),'Old',new Date().toISOString());assert.equal(old.result.workouts.find(w=>w.id===a.id)!.mergedIntoId,b.id)
  const archived=await f.workouts.setArchived(f.id,b.id,survivor.revision,true);await assert.rejects(f.sessions.startStandalone(f.id,a.id),/unavailable/);const restored=await f.workouts.setArchived(f.id,b.id,archived.revision,false)
  const deletion=libraryDeleteService(f.db);await deletion.remove(await deletion.preview(f.id,'workout',b.id,restored.revision));assert.equal(await f.db.workouts.count(),0);assert.equal(await f.db.sessions.count(),0);assert.deepEqual((await f.db.plans.get([f.id,plan.id]))!.days,plan.days)
  validateBackupData(canonicalSnapshot(await captureProfile(f.id,f.db)))
})

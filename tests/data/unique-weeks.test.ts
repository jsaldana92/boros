import { legacyWorkspace } from '../fixtures/legacy-workspace.ts'
import { stripTrainingFields } from '../fixtures/training-compatibility.ts'
import 'fake-indexeddb/auto'
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { calendarRunService } from '../../src/db/calendar-runs.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { runActionService } from '../../src/db/run-actions.ts'
import { importSession } from '../../src/db/imports.ts'
import { copyExercise, identifySets, newDay, planInputSchema, planToInput, planWeeks, resolveWeek, uniqueWeekCounts, type PlanInput } from '../../src/schemas/plan.ts'
import { occurrences, programWeek } from '../../src/schemas/schedule.ts'
import { addDays } from '../../src/lib/calendar-dates.ts'
import { prescribedDays, runProgress } from '../../src/lib/run-progress.ts'
import { trainingWeekRows } from '../../src/lib/program-display.ts'
import { previousResults } from '../../src/lib/previous-results.ts'
import { appendSessionSets } from '../../src/schemas/session-structure.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { validateBackupData, v9BackupDataSchema } from '../../src/schemas/backup.ts'
import { csvTables } from '../../src/features/backups/csv.ts'
import { parseInterchange, toImportDraft, formattingInstructions } from '../../src/features/create/interchange.ts'
import { representativeProfile } from '../fixtures/backup-profile.ts'

const uid = () => crypto.randomUUID()
export function cycleInput(counts = [4, 3], durationWeeks = 4): PlanInput {
  const weeks = counts.map((count, w) => ({ id: uid(), days: identifySets(Array.from({ length: count }, (_, d) => ({ ...newDay(d + 1), name: `W${w + 1}D${d + 1}`, exercises: [copyExercise({ name: 'Same name', sets: [{ reps: { min: w + 5, max: w + 5 }, rir: { min: 0, max: 0 } }], restBetweenSeconds: 0, tagNames: [] })] }))) }))
  return { name: 'Alternating', durationWeeks, days: weeks.flatMap(w => w.days), weeks: weeks.map(w => ({ id: w.id, dayIds: w.days.map(d => d.id) })) }
}
async function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-05T15:00:00Z') })
  const db = new BorosDatabase(`boros-test-cycles-${uid()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId, plans = planService(db), plan = await plans.save(id, cycleInput())
  const mapping = planWeeks(plan).flatMap(w => w.days.map((d, weekday) => ({ dayId: d.id, weekday })))
  const schedules = scheduleService(db), weekly = weeklyService(db), sessions = sessionService(db), calendar = calendarRunService(db)
  const run = await schedules.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: '2026-10-05', timeZone: 'America/New_York', mapping })
  return { db, id, profiles, plans, plan, mapping, schedules, weekly, sessions, calendar, run }
}
test('cycle divisors, ordered ownership, set identities and legacy/unbounded compatibility', () => {
  assert.deepEqual(uniqueWeekCounts(4), [2,4]); assert.deepEqual(uniqueWeekCounts(6), [2,3,6]); assert.deepEqual(uniqueWeekCounts(12), [2,3,4,6,12])
  for (const n of [0,1,-2,1.5,Infinity,NaN]) assert.deepEqual(uniqueWeekCounts(n), [])
  const four = cycleInput([1,2,3,4],12);assert.equal(resolveWeek(four,5).id,four.weeks![0].id);assert.equal(resolveWeek(four,6).id,four.weeks![1].id)
  const input = cycleInput(); assert.equal(planInputSchema.safeParse(input).success,true)
  assert.equal(resolveWeek(input, 3).days[0].id, input.days[0].id)
  for (const update of [{durationWeeks:3},{durationWeeks:undefined},{weeks:input.weeks!.slice(1)},{weeks:[input.weeks![0],input.weeks![0]]},{days:input.days.slice(1)}]) assert.equal(planInputSchema.safeParse({...input,...update}).success,false)
  const repeated = {...input,weeks:undefined,days:input.days.slice(0,4),durationWeeks:undefined}; assert.equal(planInputSchema.safeParse(repeated).success,true)
  assert.deepEqual(resolveWeek(repeated,400).days,repeated.days)
  const invalid=structuredClone(input);invalid.days[0].exercises[0].setIds=undefined;assert.equal(planInputSchema.safeParse(invalid).success,false)
})
test('four weeks produce fourteen independent occurrences, correct rest placement, totals and finite endings', async t => {
  const {run,weekly,id,db,plan}=await setup(t)
  const events=occurrences(run,run.startWeek,run.endDate!);assert.equal(events.length,14);assert.equal(new Set(events.map(e=>e.ref.key)).size,14)
  assert.deepEqual([0,1,2,3].map(w=>occurrences(run,addDays(run.startWeek,w*7),addDays(run.startWeek,w*7+6)).length),[4,3,4,3])
  assert.equal(events[7].ref.programWeek,3);assert.equal(events[7].day.id,events[0].day.id);assert.notEqual(events[7].ref.key,events[0].ref.key)
  const completed=await weekly.outcome(id,events[0].ref,run.revision,'completed');assert.deepEqual(runProgress(completed,[]),{...runProgress(completed,[]),total:14,completed:1})
  assert.equal(occurrences(completed,'2026-11-02','2026-11-08').length,0)
  await db.schedules.update([id,run.id],{kind:'unscheduled'})
  const unscheduled=(await db.schedules.get([id,run.id]))!, week='2026-10-12', second=occurrences(unscheduled,week,addDays(week,6))
  const rows=trainingWeekRows(unscheduled,week,second);assert.equal(rows.length,7);assert.deepEqual(rows.map(r=>r.events.length),[1,1,1,0,0,0,0]);assert.ok(second.every(e=>e.ref.unscheduled));assert.equal(plan.weeks!.length,2)
})
test('gaps do not advance cycles at year and DST boundaries; reversal and concurrent moves preserve content', async t => {
  const {id,plans,schedules,weekly}=await setup(t)
  for (const start of ['2026-12-21','2026-03-02','2026-10-26']) {
    const plan=await plans.save(id,{...cycleInput(),name:start}),run=await schedules.create(id,{planId:plan.id,planRevision:1,startWeek:start,timeZone:'America/New_York',mapping:planWeeks(plan).flatMap(w=>w.days.map((d,i)=>({dayId:d.id,weekday:i})))})
    const week=addDays(start,7), proposal=await weekly.previewMove(id,run.id,run.revision,week,1),moved=await weekly.move(id,proposal)
    assert.equal(occurrences(moved,week,addDays(week,6)).length,0);assert.equal(programWeek(moved,addDays(week,7)),2)
    assert.equal(occurrences(moved,addDays(week,7),addDays(week,13))[0].day.id,plan.weeks![1].dayIds[0]);assert.equal(prescribedDays(moved),14)
    assert.equal(moved.endDate,addDays(run.endDate!,7));await assert.rejects(weekly.move(id,proposal),/changed/)
    const back=await weekly.move(id,await weekly.previewMove(id,moved.id,moved.revision,addDays(week,7),-1));assert.equal(back.endDate,run.endDate);assert.deepEqual(occurrences(back,start,back.endDate!).map(e=>e.ref.key),occurrences(run,start,run.endDate!).map(e=>e.ref.key))
  }
})
test('per-week mappings protect opened drafts and outcomes, future repetitions and stale writes', async t => {
  const {id,plan,run,mapping,calendar,sessions,schedules,weekly}=await setup(t)
  const event=occurrences(run,run.startWeek,run.startWeek)[0],draft=(await sessions.openOccurrence(id,run.id,event.day.id,event.ref.scheduledDate)).draft!
  const changed=mapping.map(m=>plan.weeks![0].dayIds.includes(m.dayId)?{...m,weekday:m.weekday+1}:m)
  const proposal=await calendar.previewEdit(id,run.id,run.revision,changed),edited=await calendar.edit(proposal)
  assert.equal(edited.occurrenceExceptions![0].key,event.ref.key);assert.deepEqual(await sessions.getDraft(id,draft.id),draft)
  const current=await schedules.events(id,'2026-10-05','2026-10-11');assert.equal(current.find(e=>e.day.id===event.day.id)!.ref.scheduledDate,'2026-10-05')
  assert.equal(occurrences(edited,'2026-10-19','2026-10-25').find(e=>e.day.id===event.day.id)!.ref.scheduledDate,'2026-10-20')
  assert.deepEqual(occurrences(edited,'2026-10-12','2026-10-18').map(e=>e.ref.scheduledDate),['2026-10-12','2026-10-13','2026-10-14'])
  await assert.rejects(calendar.edit(proposal),/changed/);await assert.rejects(weekly.previewMove(id,edited.id,edited.revision,run.startWeek,1),/drafts/)
  await assert.rejects(calendar.previewEdit(id,run.id,edited.revision,mapping.map(m=>({...m,weekday:0}))),/distinct weekday/)
})
test('frozen snapshots, stable hints, session-only amendments, duplicate identity and profile isolation', async t => {
  const {db,id,profiles,plans,plan,run,sessions}=await setup(t)
  const first=occurrences(run,run.startWeek,run.startWeek)[0],draft=(await sessions.openOccurrence(id,run.id,first.day.id,first.ref.scheduledDate)).draft!, input=structuredClone(draft.input)
  Object.assign(input.exercises[0].sets[0],{load:'20',reps:'5',rir:'0'});const saved=await sessions.complete(id,draft.id,draft.revision,input,false)
  const editable=planToInput(plan);editable.days[0].exercises[0].prescription.sets[0].reps={min:20,max:20};await plans.save(id,editable,plan)
  assert.deepEqual((await db.sessions.get([id,saved.id]))!.day,saved.day);assert.deepEqual((await db.schedules.get([id,run.id]))!.revisions[0].days,run.revisions[0].days);assert.equal((await db.schedules.get([id,run.id]))!.revisions.at(-1)!.days[0].exercises[0].prescription.sets[0].reps.min,20)
  t.mock.timers.setTime(Date.parse('2026-10-20T15:00:00Z'))
  const repeat=(await sessions.openOccurrence(id,run.id,first.day.id,'2026-10-19')).draft!
  assert.equal(previousResults(repeat,[saved],'kg')[first.day.exercises[0].id][0],undefined)
  await legacyWorkspace(db)
  const unrelated=(await sessions.openOccurrence(id,run.id,plan.weeks![1].dayIds[0],'2026-10-12')).draft!
  assert.equal(previousResults(unrelated,[saved],'kg')[unrelated.day.exercises[0].id][0],undefined)
  await legacyWorkspace(db)
  const amendment=appendSessionSets(repeat,repeat.input,repeat.day.exercises[0].id,'kg');await sessions.update(id,repeat.id,repeat.revision,amendment.input,amendment)
  assert.equal((await db.schedules.get([id,run.id]))!.revisions[0].days[0].exercises[0].prescription.sets.length,1)
  const copied=await plans.duplicateDraft(id,plan.id),newIds=copied.days.flatMap(d=>[d.id,...d.exercises.flatMap(e=>[e.id,...(e.setIds??[])])]);assert.equal(newIds.some(x=>plan.days.some(d=>d.id===x||d.exercises.some(e=>e.id===x||e.setIds?.includes(x)))),false)
  assert.equal(planInputSchema.safeParse(copied).success,true);assert.notEqual(copied.weeks![0].id,plan.weeks![0].id)
  await assert.rejects(plans.save(id,editable,plan),/another tab/)
  const other=await profiles.create('Other');await assert.rejects(sessions.getDraft(other.id,repeat.id),/unavailable/);assert.equal((await plans.library(other.id)).plans.length,0)
  validateBackupData(canonicalSnapshot(await captureProfile(id,db)))
})
test('end retains history, discards unfinished sessions, re-add is independent; reset resolves definition one', async t => {
  const {db,id,plan,run,weekly,sessions}=await setup(t),actions=runActionService(db),event=occurrences(run,run.startWeek,run.startWeek)[0]
  const draft=(await sessions.openOccurrence(id,run.id,event.day.id,event.ref.scheduledDate)).draft!,input=structuredClone(draft.input);Object.assign(input.exercises[0].sets[0],{load:'0',reps:'5'})
  await sessions.complete(id,draft.id,1,input,false);const unfinished=(await sessions.openOccurrence(id,run.id,plan.weeks![1].dayIds[0],'2026-10-12')).draft!
  await actions.leave(await actions.preview(id,run.id,run.revision));assert.ok(await db.sessions.get([id,draft.id]));assert.equal(await db.drafts.get([id,unfinished.id]),undefined)
  const [fresh]=await weekly.activate(id,plan.id);assert.notEqual(fresh.id,run.id);assert.equal(occurrences(fresh,fresh.startWeek,addDays(fresh.startWeek,6))[0].day.id,plan.days[0].id)
  const reset=await actions.resetRun(await actions.preview(id,fresh.id,fresh.revision));assert.equal(programWeek(reset,reset.startWeek),1);assert.equal(occurrences(reset,reset.startWeek,addDays(reset.startWeek,6))[0].day.id,plan.days[0].id)
})
const ai = () => ({schemaVersion:4,kind:'plan',plan:{mode:'unique',name:'AI cycle',durationWeeks:4,uniqueWeekCount:2,instructions:'Plan only',notes:'Note',weeks:[4,3].map((count,w)=>({trainingDaysPerWeek:count,days:Array.from({length:count},(_,d)=>({name:`W${w+1}D${d+1}`,exercises:[{name:'Same',sets:[{reps:{min:5+w,max:8+w},rir:{min:0,max:0}},{reps:{min:10,max:10},rir:null}],notes:'Exercise note',restBetweenSetsSeconds:0}]}))}))}})
test('AI v4 strict cycles, paths, local identities and atomic import with older payload compatibility',async t=>{
  const {db,id}=await setup(t),payload=ai(),parsed=parseInterchange(JSON.stringify(payload));assert.deepEqual(parsed.issues,[])
  const draft=toImportDraft(parsed.value!);assert.equal(draft.kind,'plan');if(draft.kind!=='plan')return
  assert.equal(planInputSchema.safeParse(draft.input).success,true);assert.equal(draft.input.notes,'Note');assert.equal(draft.input.days[0].exercises[0].prescription.notes,'Exercise note')
  const grouped=ai() as any,day=grouped.plan.weeks[1].days[0];day.exercises.push(structuredClone(day.exercises[0]));day.exercises[1].sets.pop();day.exercises.forEach((e:any)=>e.superset=1);day.supersets=[{number:1,restBetweenRoundsSeconds:0,restAfterGroupSeconds:90}]
  const groupedParsed=parseInterchange(JSON.stringify(grouped));assert.deepEqual(groupedParsed.issues,[]);const groupedDraft=toImportDraft(groupedParsed.value!);if(groupedDraft.kind==='plan'){assert.equal(groupedDraft.input.days[4].groups![0].restAfterGroupSeconds,90);assert.deepEqual(groupedDraft.input.days[4].exercises.map(e=>e.prescription.sets.length),[2,1])}
  day.exercises[1].superset=2;assert.ok(parseInterchange(JSON.stringify(grouped)).issues.some(i=>i.path.includes('plan.weeks[1].days[0]')))
  const count=await db.plans.count();toImportDraft(parsed.value!);assert.equal(await db.plans.count(),count)
  const importer=importSession(id,db),saved=await importer.savePlan(draft.input);assert.equal((await importer.savePlan(draft.input)).id,saved.id);assert.equal(await db.exercises.count(),1)
  for(const bad of [ {...payload,plan:{...payload.plan,durationWeeks:3}}, {...payload,plan:{...payload.plan,uniqueWeekCount:3}}, {...payload,plan:{...payload.plan,days:[]}}, {...payload,plan:{...payload.plan,weeks:[{...payload.plan.weeks[0],trainingDaysPerWeek:1},payload.plan.weeks[1]]}} ]) assert.ok(parseInterchange(JSON.stringify(bad)).issues.some(i=>i.path.startsWith('plan.')))
  for(const v of [1,2,3]) {const old={schemaVersion:v,kind:'plan',plan:{name:'Old',...(v>1?{durationWeeks:4}:{}),trainingDaysPerWeek:1,days:[payload.plan.weeks[0].days[0]]}};delete (old.plan.days[0].exercises[0] as any).notes;assert.equal(parseInterchange(JSON.stringify(old)).value?.kind,'plan')}
  assert.match(formattingInstructions('plan'),/exactly one ```json code block/);assert.match(formattingInstructions('plan'),/uniqueWeekCount/)
})
test('populated v5 storage reopens unchanged; v10 backup and both whole-family merges preserve cycle references, photos and drafts',async t=>{
  const db=new BorosDatabase(`boros-test-cycle-upgrade-${uid()}`);t.after(()=>db.delete());await representativeProfile(db)
  const profiles=profileService(db),id=(await profiles.settings())!.activeProfileId,before=await captureProfile(id,db),legacy=canonicalSnapshot(before)
  stripTrainingFields(legacy); delete (legacy as any).workouts; delete legacy.deletedSources; assert.equal(v9BackupDataSchema.safeParse({...legacy,backupSchemaVersion:9}).success,true)
  db.close();await db.open();const after=await captureProfile(id,db);assert.deepEqual(after.plans,before.plans);assert.deepEqual(after.sessions,before.sessions);assert.deepEqual(after.drafts,before.drafts);assert.deepEqual(await after.photos[0].blob.arrayBuffer(),await before.photos[0].blob.arrayBuffer());assert.equal((await profiles.settings())!.activeProfileId,id)
  await legacyWorkspace(db)
  const plan=await planService(db).save(id,cycleInput()),[run]=await weeklyService(db).activate(id,plan.id),e=occurrences(run,run.startWeek,addDays(run.startWeek,6))[0];await sessionService(db).openOccurrence(id,run.id,e.day.id,e.ref.scheduledDate)
  const snapshot=await captureProfile(id,db),backup=await generateBackup(snapshot,'cycles'),read=await readBackup(backup.bytes,()=>{},async()=>{})
  assert.equal(read.data.backupSchemaVersion, 18);assert.equal(csvTables(read.data).length,40);assert.deepEqual(read.data.plans,JSON.parse(JSON.stringify(snapshot.plans)));assert.equal(backup.manifest.csvRows['csv/unique_weeks.csv'],14)
  assert.equal(v9BackupDataSchema.safeParse({...read.data,backupSchemaVersion:9}).success,false)
  for(const action of ['new','import','device'] as const) {
    const restored=await buildRestorePlan(read,action==='new'?undefined:snapshot,action,uid(),'Restored',new Date().toISOString());validateBackupData(canonicalSnapshot(restored.result));const cycle=restored.result.plans.find(p=>p.name==='Alternating')!;assert.deepEqual(cycle.weeks,plan.weeks);assert.deepEqual(cycle.days.map(d=>({...d,exercises:d.exercises.map(({templateId:_template,...e})=>e)})),plan.days);assert.ok(cycle.days.every(d=>d.exercises.every(e=>restored.result.exercises.some(x=>x.id===e.templateId))))
  }
})

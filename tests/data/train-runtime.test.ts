import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID as uid } from 'node:crypto'
import Dexie from 'dexie'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { workoutService } from '../../src/db/workouts.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { currentWorkout, reconcileWorkout } from '../../src/db/active-workout.ts'
import { DraftController } from '../../src/features/train/draft-controller.ts'
import { IntervalController } from '../../src/features/train/interval-controller.ts'
import { IntervalFeedback } from '../../src/features/train/interval-feedback.ts'
import { TimerFeedback } from '../../src/features/train/timer-feedback.ts'
import { AlertFocus } from '../../src/features/train/audio-runtime.ts'
import { TimerWakeLock } from '../../src/features/train/wake-lock.ts'
import { previousResults, instructionHistory, historyLine } from '../../src/lib/previous-results.ts'
import { copyExercise, newDay } from '../../src/schemas/plan.ts'
import { newCircuit } from '../../src/schemas/circuit.ts'
import { initialInterval, startInterval, advanceInterval, intervalCommand, intervalDisplay, intervalStateSchema } from '../../src/schemas/interval-session.ts'
import { blankSession, assessSession, hasSessionInput, timerRemaining, timerElapsed, type SessionDraft, type CompletedSession } from '../../src/schemas/session.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { photoBytes } from '../fixtures/backup-profile.ts'
import { planService } from '../../src/db/plans.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { runActionService } from '../../src/db/run-actions.ts'
import { occurrences } from '../../src/schemas/schedule.ts'
import { addDays } from '../../src/lib/calendar-dates.ts'
import JSZip from 'jszip'
import { sha256 } from '../../src/features/backups/integrity.ts'

const prescription = { name: 'Incline Bench', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 2, max: 2 } }, { reps: { min: 5, max: 8 }, rir: { min: 2, max: 2 } }], tagNames: [], restBetweenSeconds: 60 }
async function fixture(t) {
  const db = new BorosDatabase('boros-test-active-workout-' + uid()); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId, service = sessionService(db)
  const workout = await workoutService(db).save(id, { ...newDay(1), name: 'Strength workout', exercises: [copyExercise(prescription)] })
  return { db, profiles, id, service, workout }
}
const entered = (draft: SessionDraft) => { const input = structuredClone(draft.input); Object.assign(input.exercises[0].sets[0], { load: '0', reps: '8', rir: '0' }); return input }
test('workspace ownership serializes rapid/two-connection starts, profiles, resume; Save/Cancel release, Clear and Stop retain', async t => {
  const { db, profiles, id, service, workout } = await fixture(t)
  const second = new BorosDatabase(db.name); t.after(() => second.close()); const otherService = sessionService(second)
  const starts = await Promise.allSettled([service.startStandalone(id, workout.id), otherService.startStandalone(id, workout.id)])
  assert.equal(starts.filter(r => r.status === 'fulfilled').length, 1)
  let draft = (starts.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<SessionDraft>).value
  const other = await profiles.create('Other'); await profiles.select(other.id)
  await assert.rejects(service.startStandalone(other.id), /active workout/)
  assert.equal((await currentWorkout(db))!.profileId, id)
  const legacy = { ...structuredClone(draft), id: uid() }; await db.drafts.add(legacy)
  await assert.rejects(service.getDraft(id, legacy.id), /active workout/)
  const timer = await service.startTimer(id, draft.id, draft.revision, draft.day.exercises[0].id, 0)
  assert.equal(timerRemaining(timer!), 60); assert.equal(timer!.preparationEndAt, undefined)
  // A pre-v12 blank Strength draft with an existing rest also recovers ownership.
  await db.activeWorkouts.delete('active');await db.transaction('rw',db.tables,()=>reconcileWorkout(db));assert.equal((await currentWorkout(db))!.draftId,draft.id)
  await service.changeTimer(id, draft.id, timer!.token, 'stop'); assert.equal((await currentWorkout(db))!.draftId, draft.id)
  draft = await service.clear(id, draft.id, draft.revision); assert.equal((await currentWorkout(db))!.draftId, draft.id)
  await assert.rejects(service.complete(id, draft.id, draft.revision, draft.input, true), /at least one/)
  assert.equal((await currentWorkout(db))!.draftId, draft.id)
  await service.complete(id, draft.id, draft.revision, entered(draft), true); assert.equal(await currentWorkout(db), undefined)
  const next = await service.startStandalone(other.id); await service.discard(other.id, next.id, next.revision)
  assert.equal(await currentWorkout(db), undefined); assert.ok(await db.drafts.get([id, legacy.id]))
})
test('failed Save and queued autosave cancellation preserve input without resurrecting ownership; stable standalone positions', async t => {
  const { db, id, service, workout } = await fixture(t), draft = await service.startStandalone(id, workout.id)
  assert.equal(draft.day.exercises[0].id, workout.exercises[0].id)
  const c = new DraftController(draft, service); c.change(entered(draft)); await c.flush()
  const add = db.sessions.add.bind(db.sessions); db.sessions.add = async () => { throw new Error('Quota test') }
  await assert.rejects(c.complete(true), /Quota/); assert.equal(c.input.exercises[0].sets[0].load, '0'); assert.equal((await currentWorkout(db))!.draftId, draft.id)
  db.sessions.add = add
  c.change({ ...c.input, notes: 'pending' }); await c.discard(); await c.flush()
  assert.equal(await currentWorkout(db), undefined); assert.equal(await db.drafts.get([id, draft.id]), undefined)
  await assert.rejects(service.update(id, draft.id, 1, draft.input), /unavailable/)
})
test('Strength countdown, count-up and reset begin immediately without preparation, preserving paused time', async t => {
  const { id, service, workout } = await fixture(t), draft = await service.startStandalone(id, workout.id)
  const countdown = await service.startTimer(id, draft.id, draft.revision, draft.day.exercises[0].id, 0)
  assert.equal(timerRemaining(countdown!), 60); assert.equal(countdown!.preparationEndAt, undefined)
  await service.changeTimer(id, draft.id, countdown!.token, 'stop')
  const countup = await service.startTimer(id, draft.id, draft.revision, draft.day.exercises[0].id, 1)
  assert.equal(countup!.mode, 'countup'); assert.equal(timerElapsed(countup!), 0)
  await service.changeTimer(id, draft.id, countup!.token, 'reset')
  const reset = (await service.library(id)).timer!
  assert.equal(timerElapsed(reset), 0); assert.equal(reset.preparationEndAt, undefined)
})
function intervalDay() {
  const a = copyExercise({ trainingType: 'interval', name: 'Sprint', sets: [], tagNames: [], activeSeconds: 8, recoverySeconds: 2 })
  const b = copyExercise({ ...a.prescription, name: 'Squat' })
  return { ...newDay(1, 'interval'), exercises: [a,b], circuits: [{ ...newCircuit(1), exerciseIds: [a.id], repeat: 1, restAfterCircuitSeconds: 3 }, { ...newCircuit(2), exerciseIds: [b.id] }], postWorkoutRestSeconds: 5 }
}
test('Interval foreground note saves reserve the checkpoint queue before notifying subscribers', async t => {
  const { db, id, service } = await fixture(t)
  const workout = await workoutService(db).save(id, intervalDay())
  const draft = await service.startStandalone(id, workout.id)
  const started = await service.startInterval(id, draft.id, draft.revision, 'continuous')
  const media = () => ({ muted: false, volume: 1, currentTime: 0, onended: null, onerror: null, play: async () => {}, pause() {} })
  const feedback = new IntervalFeedback({ start: media(), warning: media(), end: media(), complete: media() })
  const controller = new IntervalController(started, feedback, service); controller.ready = true
  // A timer poll during the foreground notification must not acquire the empty
  // queue before that foreground operation reserves it.
  const unsubscribe = controller.subscribe(() => { if (controller.busy) controller.tick(false, true) })
  controller.setNotes('Keep this note')
  const saved = await controller.work(async () => {
    const current = controller.record
    controller.apply(await service.update(id, current.id, current.revision, { ...current.input, notes: controller.notes }))
  })
  unsubscribe(); await controller.settle(); controller.dispose()
  assert.equal(saved, true); assert.equal(controller.error, '')
  assert.equal((await db.drafts.get([id, draft.id]))!.input.notes, 'Keep this note')
  assert.equal(controller.record.revision, started.revision + 1)
})
test('new Interval circuit/continuous Warm Up is exactly ten once; pause/repeat/reset/rest-only respect scope denominators', () => {
  const day = intervalDay()
  for (const mode of ['circuit', 'continuous'] as const) {
    const run = startInterval(initialInterval(day), day, mode, mode === 'circuit' ? day.circuits[0].id : undefined, uid(), uid(), false, 0)
    assert.equal(intervalDisplay(run).remaining, 10); assert.equal(intervalDisplay(run).duration, 10)
    assert.equal(intervalDisplay(run).total - intervalDisplay(run).scopeTotal, 10)
    assert.equal(advanceInterval(run, 9999).results.length, 0)
    assert.equal(intervalDisplay(advanceInterval(run, 10000)).title, 'Sprint')
    const paused = intervalCommand(run, 'pause', 6000), resumed = intervalCommand(paused, 'resume', 20000)
    assert.equal(intervalDisplay(resumed).remaining, 4); assert.equal(intervalDisplay(advanceInterval(resumed, 24000)).title, 'Sprint')
    const done = advanceInterval(run, 100000); assert.equal(done.results.filter(r => r.phase.kind === 'active').length, mode === 'circuit' ? 2 : 3)
    assert.equal(done.results.some(r => r.phase.kind === 'preparation'), false)
    const rest = startInterval(done, day, 'rest', undefined, uid(), uid(), false, 100000)
    assert.equal(intervalDisplay(rest).title, 'Post-Workout Rest'); assert.equal(intervalDisplay(rest).total, 5)
    assert.equal(rest.execution!.phaseIds.length, 1); intervalStateSchema.parse(rest)
    assert.deepEqual(advanceInterval(rest, 105000).results, done.results)
    const restart = startInterval(intervalCommand(done, 'stop'), day, mode, mode === 'circuit' ? day.circuits[0].id : undefined, uid(), uid(), true, 110000)
    assert.equal(intervalDisplay(restart).remaining, 10)
  }
})
function historyFixture() {
  const id = uid(), template = uid(), a = copyExercise(prescription, { kind: 'exercise', id: template }), b = copyExercise({ ...prescription, sets: prescription.sets.map(s => ({ ...s, reps: { min: 3, max: 5 } })) }, { kind: 'exercise', id: template })
  const day = { ...newDay(1), exercises: [a,b] }, planId = uid(), run = uid(), now = '2026-10-09T12:00:00.000Z'
  const draft = { id: uid(), profileId: id, sourcePlanId: planId, sourceDayId: day.id, revision: 1, day, input: blankSession(day, 'kg'), startedAt: now, updatedAt: now, occurrence: { scheduleId: run } } as SessionDraft
  const log = (at: string, weight = 10): CompletedSession => ({ id: uid(), draftId: uid(), profileId: id, revision: 1, sourcePlanId: planId, sourceDayId: day.id, planName: 'Plan A', occurrence: structuredClone(draft.occurrence), day: structuredClone(day), notes: '', partial: true, startedAt: at, completedAt: at, loggedAt: at, exercises: day.exercises.map((e,i) => ({ id: e.id, notes: '', sets: [{ skipped: false, load: weight + i, unit: 'kg', weightKg: weight + i, reps: 7-i, rir: i === 0 ? 0 : undefined }, { skipped: true }] })) })
  return { draft, a,b,template,log }
}
test('hint identity, repeated A/B, per-set prescription/missing RIR/zero/units/partial results; no hidden entered data', () => {
  const { draft,a,b,log } = historyFixture(), old = log('2026-10-08T10:00:00.000Z'), latest = log('2026-10-09T10:00:00.000Z',20)
  let hints = previousResults(draft,[old,latest],'lb')
  assert.equal(hints[a.id][0]!.load, '44.092452'); assert.equal(hints[a.id][0]!.rir, '0'); assert.equal(hints[b.id][0]!.reps, '6'); assert.equal(hints[a.id][1], undefined)
  assert.equal(hasSessionInput(draft.input),false); assert.equal(assessSession(draft.input).recorded,0)
  latest.day.exercises[0].prescription.sets[0].rir = { min: 0, max: 0 }
  hints = previousResults(draft,[old,latest],'kg'); assert.equal(hints[a.id][0]!.load,'10')
  draft.day.exercises[0].prescription.sets[0].rir = undefined
  assert.equal(previousResults(draft,[old,latest],'kg')[a.id][0],undefined)
  // Identical sibling prescriptions still cannot cross occurrence IDs.
  draft.day.exercises[0].prescription = structuredClone(b.prescription)
  assert.equal(previousResults(draft,[old,latest],'kg')[a.id][0],undefined)
  draft.day.exercises[0].prescription.sets.push({ reps: { min: 3, max: 5 } })
  assert.equal(previousResults(draft,[old,latest],'kg')[a.id][2],undefined)
})
test('compatible other workouts within the same run, canonical merges, deterministic ties and new-run isolation', () => {
  const { draft,a,template,log } = historyFixture(), first = log('2026-10-08T10:00:00.000Z'), cross = log(first.completedAt,20)
  cross.id='ffffffff-ffff-4fff-afff-ffffffffffff'; first.id='00000000-0000-4000-a000-000000000000'
  cross.sourceDayId = cross.day.id = uid(); const ref=uid(); cross.day.exercises[0].source = {kind:'exercise',id:ref}; cross.day.exercises[0].id=uid(); cross.exercises[0].id=cross.day.exercises[0].id
  const identities=[{id:ref,profileId:draft.profileId,mergedIntoId:template},{id:template,profileId:draft.profileId}]
  assert.equal(previousResults(draft,[first,cross],'kg',identities)[a.id][0]!.load,'20')
  cross.profileId=uid();assert.equal(previousResults(draft,[cross],'kg',identities)[a.id][0],undefined)
  draft.occurrence!.scheduleId=uid();assert.equal(previousResults(draft,[first],'kg',identities)[a.id][0],undefined)
})
test('history shows complete recorded occurrences in order; limits, fallback, actual ordinals and optional values', () => {
  const { draft,a,log }=historyFixture(), old=log('2026-10-07T10:00:00.000Z'), recent=log('2026-10-08T10:00:00.000Z')
  old.exercises = old.exercises.slice(0,1); recent.exercises = recent.exercises.slice(0,1)
  assert.deepEqual(instructionHistory(draft,a,[old,recent]),[])
  recent.day.exercises[0].prescription.sets[0].reps={min:2,max:2}
  assert.equal(instructionHistory(draft,a,[old,recent]).length,1)
  draft.sourcePlanId=uid(); assert.equal(instructionHistory(draft,a,[old,recent]).length,2)
  delete draft.sourcePlanId; draft.source={kind:'custom'}
  const latest=log('2026-10-09T10:00:00.000Z');latest.day.exercises[0].prescription.sets[0].reps={min:2,max:2}
  assert.equal(previousResults(draft,[old,recent,latest],'kg')[a.id][0],undefined)
  assert.equal(instructionHistory(draft,a,[old,recent,latest]).length,2)
  for(const [rir,label] of [[0,'0'],[1,'1st'],[2,'2nd'],[3,'3rd'],[11,'11th'],[12,'12th'],[13,'13th'],[21,'21st']]) assert.equal(historyLine({skipped:false,weightKg:0,load:0,unit:'kg',reps:0,rir: Number(rir)},'lb'),`0 lb x 0 reps with ${label} RIR`)
  assert.equal(historyLine({skipped:false,weightKg:0,load:0,unit:'kg',reps:8},'kg'),'0 kg x 8 reps')
})
test('audio sequences once, muted gesture unlock/start, cancellation, rejection and optional short-alert focus', async () => {
  let plays=0,claims=0,failures=0
  const audio={muted:false,volume:1,currentTime:0,onended:null as null|(()=>void),onerror:null,pause(){},play(){if(!this.muted&&this.volume) plays++;return Promise.resolve()}}
  const f=new TimerFeedback(()=>audio,()=>{},()=>{failures++})
  f.unlock(true);await Promise.resolve();assert.equal(plays,0)
  await f.complete('one',true,async()=>{claims++;return true});audio.onended?.();audio.onended?.();audio.onended?.()
  await f.complete('one',true,async()=>{claims++;return true});assert.equal(plays,3);assert.equal(claims,1)
  await f.complete('off',false,async()=>true);assert.equal(plays,3)
  await f.complete('cancel',true,async()=>true);const stale=audio.onended;f.cancel();stale?.();assert.equal(plays,4)
  audio.play=()=>Promise.reject(new Error('Denied'));await f.complete('reject',true,async()=>true);await Promise.resolve();assert.equal(failures,1)
  new AlertFocus().acquire()();const session={type:'auto'},focus=new AlertFocus(session),one=focus.acquire(),two=focus.acquire();assert.equal(session.type,'transient');one();assert.equal(session.type,'transient');two();assert.equal(session.type,'auto')
  new AlertFocus({get type(){throw new Error('Unsupported')},set type(_){throw new Error('Unsupported')}}).acquire()()
})
test('wake lock only while visible/running, release race and denied API never drive the timer',async()=>{
  let requests=0,releases=0,resolve!:(value:any)=>void
  const wake=new TimerWakeLock(()=>{requests++;return new Promise(r=>{resolve=r})})
  const pending=wake.update(true,true);await wake.update(true,true);assert.equal(requests,1);await wake.update(false,true)
  resolve({released:false,release:async()=>{releases++},addEventListener(){}});await pending;assert.equal(releases,1)
  let denied=0;const unavailable=new TimerWakeLock(async()=>{denied++;throw new Error('Denied')})
  await unavailable.update(true,true);await unavailable.update(true,true);assert.equal(denied,1)
  await unavailable.update(true,false);await unavailable.update(true,true);assert.equal(denied,2)
  await new TimerWakeLock().update(true,true)
})

test('Calendar, planned and custom starts share ownership; ending a plan clears lock and cannot resurrect queued input',async t=>{
  const {db,id,service}=await fixture(t), plans=planService(db),weekly=weeklyService(db),actions=runActionService(db)
  const plan=await plans.save(id,{name:'Plan',durationWeeks:4,days:[{...newDay(1),exercises:[copyExercise(prescription)]}]})
  await weekly.addPlan(id,plan.id);const [run]=await weekly.activate(id,plan.id),event=occurrences(run,run.startWeek,addDays(run.startWeek,6))[0]
  const draft=(await service.openOccurrence(id,run.id,event.ref.dayId,event.ref.scheduledDate)).draft!
  await assert.rejects(service.startStandalone(id),/active workout/)
  await assert.rejects(service.start(id,plan.id,plan.days[0].id),/active workout/)
  const next=occurrences(run,addDays(run.startWeek,7),addDays(run.startWeek,13))[0]
  await assert.rejects(service.openOccurrence(id,run.id,next.ref.dayId,next.ref.scheduledDate),/active workout/)
  const controller=new DraftController(draft,service);controller.change(entered(draft))
  const preview=await actions.preview(id,run.id,run.revision);await actions.leave(preview)
  assert.equal(await currentWorkout(db),undefined)
  await assert.rejects(controller.flush(),/unavailable|left/);controller.retire();assert.equal(controller.input.exercises[0].sets[0].load,'0')
  await assert.rejects(controller.flush(),/another tab/);assert.equal(await db.drafts.count(),0)
})

test('original v17 archive checksums and five-second checkpoints validate before promotion; mislabeled new ten-second states fail',async t=>{
  const {db,id,service}=await fixture(t),w=await workoutService(db).save(id,intervalDay())
  let draft=await service.startStandalone(id,w.id);draft=await service.startInterval(id,draft.id,draft.revision,'circuit',draft.day.circuits![0].id)
  const backup=await generateBackup(await captureProfile(id,db),'legacy-17'),zip=await JSZip.loadAsync(backup.bytes)
  const data=JSON.parse(await zip.file('data.json')!.async('string')),manifest=JSON.parse(await zip.file('manifest.json')!.async('string'))
  data.backupSchemaVersion=17;manifest.backupSchemaVersion=17;manifest.databaseSchemaVersion=11
  async function encode(){const bytes=new TextEncoder().encode(JSON.stringify(data));zip.file('data.json',bytes);const item=manifest.inventory.find((i:any)=>i.path==='data.json');item.bytes=bytes.length;item.sha256=await sha256(bytes);zip.file('manifest.json',JSON.stringify(manifest));return zip.generateAsync({type:'uint8array',compression:'DEFLATE',createFolders:false})}
  await assert.rejects(readBackup(await encode()),/Invalid|preparation|duration|checkpoint/i)
  const interval=data.drafts[0].interval;interval.phases.find((p:any)=>p.kind==='preparation').durationSeconds=5
  const imported=await readBackup(await encode());assert.equal(imported.manifest.backupSchemaVersion,17);assert.equal(imported.data.backupSchemaVersion,18)
  assert.equal(imported.data.drafts[0].interval!.phases.find(p=>p.kind==='preparation')!.durationSeconds,5)
})
test('v11 upgrade preserves records/Blobs and chooses a legacy draft without deleting others; backup18 restores inert ownership',async t=>{
  const {db,id,profiles,service,workout}=await fixture(t),draft=await service.startStandalone(id,workout.id)
  await service.update(id,draft.id,draft.revision,entered(draft));await profiles.save(id,1,{name:'Upgrade',weightUnit:'kg',heightUnit:'cm',weightKg:70},{blob:new Blob([photoBytes],{type:'image/png'}),width:1,height:1})
  const rows=await Promise.all(db.tables.filter(t=>t.name!=='activeWorkouts').map(async t=>[t.name,await t.toArray()] as const)),name='boros-test-upgrade12-'+uid(),legacy=new Dexie(name)
  legacy.version(11).stores(Object.fromEntries(db.tables.filter(t=>t.name!=='activeWorkouts').map(t=>[t.name,[t.schema.primKey.src,...t.schema.indexes.map(i=>i.src)].join(',')])));await legacy.open();for(const [name,values]of rows)await legacy.table(name).bulkPut(values);legacy.close()
  const next=new BorosDatabase(name);t.after(()=>next.delete());await next.open();assert.equal(next.verno,12)
  for(const [name,values]of rows)assert.deepEqual(await next.table(name).toArray(),values)
  await profileService(next).initialize();assert.equal((await currentWorkout(next))!.draftId,draft.id);assert.deepEqual(new Uint8Array(await (await next.photos.toArray())[0].blob.arrayBuffer()),photoBytes)
  const backup=await generateBackup(await captureProfile(id,next),'ownership-test'),read=await readBackup(backup.bytes,()=>{},async()=>{})
  assert.equal(read.manifest.backupSchemaVersion,18);assert.equal(read.manifest.databaseSchemaVersion,12);assert.equal('activeWorkouts' in read.data,false)
  const restored=await buildRestorePlan(read,undefined,'new',uid(),'Restored','2026-10-09T15:00:00.000Z');assert.equal(restored.result.drafts[0].id,draft.id)
  await next.activeWorkouts.delete('active');await next.transaction('rw',next.tables,()=>reconcileWorkout(next));assert.equal((await currentWorkout(next))!.draftId,draft.id)
})

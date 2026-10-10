import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { progressService } from '../../src/db/progress.ts'
import { copyExercise, newDay } from '../../src/schemas/plan.ts'
import { sessionRounds, validateStructure } from '../../src/schemas/session-structure.ts'
import { hasDraftProgress, timerElapsed, timerRemaining, displayedLoad } from '../../src/schemas/session.ts'
import { DraftController } from '../../src/features/train/draft-controller.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { occurrences } from '../../src/schemas/schedule.ts'

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-amend-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId, plans = planService(db), service = sessionService(db)
  const groupId = crypto.randomUUID(), day = newDay(1)
  const exercises = [3, 2, 1].map((count, i) => ({ ...copyExercise({ name: ['A','B','C'][i], tagNames: [], sets: Array.from({length: count}, (_, j) => ({ reps: { min: j + 1, max: j + 2 }, rir: { min: i, max: i } })) }), groupId }))
  const extra = await exerciseService(db).save(id, { name: 'Extra', tagNames: ['Arms'], instructions: 'Plain <b>text</b>', sets: [{ reps: {min: 5, max: 5}, rir: {min: 0, max: 0} }], restAfterSeconds: 0 })
  const plan = await plans.save(id, { name: 'Amendments', durationWeeks: 2, days: [{ ...day, groups: [{id: groupId, number: 1}], exercises }] })
  const weekly = weeklyService(db); await weekly.addPlan(id, plan.id); const [run] = await weekly.activate(id, plan.id), event = occurrences(run, run.startWeek, run.startWeek)[0]
  const draft = (await service.openOccurrence(id, run.id, day.id, event.ref.scheduledDate)).draft!
  const controller = new DraftController(draft, service); t.after(async () => controller.dispose())
  return { db, profiles, id, plans, plan, service, draft, controller, groupId, extra, run }
}

test('unequal supersets append one final round, stable identities, independent repeated additions, recoverable Clear and completion/backup/restore', async t => {
  const { db, id, plans, plan, service, draft, controller: c, groupId, extra, run } = await setup(t)
  assert.equal(hasDraftProgress(draft), false)
  const before = structuredClone(draft), choices = (await plans.library(id)).choices
  c.addSets(groupId, 'kg'); await c.flush()
  assert.deepEqual(c.record.day.exercises.map(e => e.prescription.sets.length), [4,3,2])
  const rounds = sessionRounds(c.record.day.exercises, c.record.structure)
  assert.deepEqual(rounds.map(r => r.map(x => x.member.prescription.name)), [['A','B','C'],['A','B'],['A'],['A','B','C']])
  for (let i=0; i<3; i++) {
    assert.deepEqual(c.record.structure!.exercises[i].sets.slice(0,-1), before.structure!.exercises[i].sets)
    assert.deepEqual(c.record.day.exercises[i].prescription.sets.at(-1), before.day.exercises[i].prescription.sets.at(-1))
    assert.equal(c.input.exercises[i].sets.at(-1)!.load, '')
  }
  c.addExercises([choices[0], choices[0]], 'kg'); await c.flush()
  assert.notEqual(c.record.day.exercises[3].id, c.record.day.exercises[4].id)
  assert.equal(c.record.day.exercises[3].source!.id, extra.id)
  assert.equal(new Set(c.record.structure!.exercises.flatMap(e=>e.sets.map(s=>s.id))).size, 11)
  const ids = structuredClone(c.record.structure)
  const input = structuredClone(c.input); input.notes = 'Note'; Object.assign(input.exercises[0].sets[0], {load:'100',reps:'5',rir:'0'}); c.change(input)
  assert.equal(displayedLoad(c.input.exercises[0].sets[0], 'lb'), '220.462262')
  await c.clear(); assert.equal(c.input.notes, ''); assert.deepEqual(c.record.structure, ids); assert.equal(hasDraftProgress(c.record), true)
  assert.deepEqual((await service.getDraft(id,draft.id)).structure, ids)
  assert.deepEqual(await plans.get(id, plan.id), plan)
  const completedInput = structuredClone(c.input); for(const e of completedInput.exercises) for(const s of e.sets) Object.assign(s,{load:'10',reps:'5',rir:'0'})
  c.change(completedInput); const completed = await c.complete(false)
  assert.deepEqual(completed.structure, ids)
  const progress = await progressService(db).read(id), analytics = progress.plans.find(p=>p.id===run.id)!
  assert.equal(analytics.daysCompleted, 1); assert.equal(analytics.exercisesCompleted, 5); assert.equal(analytics.items.length,5)
  const backup = await generateBackup(await captureProfile(id,db),'amend-test'), bytes = backup.bytes, read = await readBackup(bytes,async()=>{})
  assert.equal(read.data.backupSchemaVersion, 18); assert.deepEqual(read.data.sessions[0].structure,ids)
  assert.equal(backup.manifest.csvRows['csv/session_structure.csv'],22)
  const restored = await buildRestorePlan(read,undefined,'new',crypto.randomUUID(),'Restored',new Date().toISOString())
  validateBackupData(canonicalSnapshot(restored.result)); assert.deepEqual(restored.result.sessions[0].structure,ids)
  const broken = structuredClone(read.data); broken.sessions[0].structure!.exercises[0].sets[0].id = crypto.randomUUID(); assert.throws(()=>validateBackupData(broken),/inconsistent finalized draft/)
})

test('failed amendment keeps local structure/input; retry, stale writes, deletion and profile ownership are protected', async t => {
  const {db,id,profiles,plans,service,draft,controller:c,groupId} = await setup(t)
  const original = service.update; let fail = true
  service.update = async (...args) => { if(fail) throw new Error('Simulated quota'); return original(...args) }
  c.addSets(groupId,'kg'); const input=structuredClone(c.input);input.notes='Keep me';c.change(input)
  await assert.rejects(c.flush(),/quota/); assert.equal(c.snapshot.day.exercises[0].prescription.sets.length,4); assert.equal(c.input.notes,'Keep me')
  assert.equal((await service.getDraft(id,draft.id)).day.exercises[0].prescription.sets.length,3)
  fail=false;await c.flush(); const stale=new DraftController(c.record,service);t.after(async()=>stale.dispose())
  c.addSets(groupId,'kg');await c.flush();stale.addSets(groupId,'kg');await assert.rejects(stale.flush(),/another tab/)
  const second=await profiles.createNextGuest(); await assert.rejects(service.update(second.id,draft.id,c.record.revision,c.input,c.snapshot),/unavailable/)
  const choices=(await plans.library(id)).choices
  const secondExercise=await exerciseService(db).save(second.id,{name:'Private',tagNames:[],sets:[{reps:{min:1,max:1}}]})
  const foreign=structuredClone(choices[0]);foreign.source={kind:'exercise',id:secondExercise.id}
  const bad=new DraftController(c.record,service);t.after(async()=>bad.dispose());bad.addExercises([foreign],'kg');await assert.rejects(bad.flush(),/unavailable in this profile/)
  await c.discard(); await assert.rejects(stale.flush(),/unavailable/);assert.equal(await db.drafts.count(),0)
  assert.equal((await plans.library(id)).plans.length,1)
})

test('count-up timestamps, zero rest, legacy countdown/reset and token claims retain one active timer through amendments', async t => {
  const { db,id,plans,service,draft,controller:c,groupId } = await setup(t)
  const up=await c.startGroupTimer(groupId,0);assert.equal(up!.mode,'countup')
  assert.equal(timerElapsed(up!, Date.parse((up as any).startedAt)+3_661_000),3661)
  assert.equal(await service.claimTimer(id,draft.id,up!.token),false)
  c.addSets(groupId,'kg');await c.flush();assert.deepEqual(await db.restTimers.get('active'),up)
  await c.changeTimer(up!.token,'reset'); const reset=await db.restTimers.get('active');assert.equal(reset!.mode,'countup');assert.notEqual(reset!.token,up!.token)
  c.addExercises((await plans.library(id)).choices,'kg');await c.flush();const extra=c.record.day.exercises.at(-1)!
  await assert.rejects(c.startTimer(extra.id,0), /Stop/)
  await c.changeTimer(reset!.token,'stop')
  assert.equal(await c.startTimer(extra.id,0),undefined);assert.equal(await db.restTimers.count(),0)
  const down=await c.startGroupTimer(groupId,0,60);assert.equal(down!.mode,'countdown');assert.equal(timerRemaining(down!),60)
  const legacy={...down};delete legacy.mode;await db.restTimers.put(legacy as any)
  await c.changeTimer(down!.token,'reset');const next=await db.restTimers.get('active');assert.equal(timerRemaining(next!),60)
  await db.restTimers.put({...next,endAt:new Date(Date.now()-1000).toISOString()} as any)
  assert.equal(await service.claimTimer(id,draft.id,next!.token),true);assert.equal(await service.claimTimer(id,draft.id,next!.token),false)
  await c.discard();assert.equal(await db.restTimers.count(),0)
})

test('legacy drafts receive identities lazily without rewriting prescriptions and invalid round metadata is rejected', async t => {
  const { db,id,service,draft,groupId }=await setup(t)
  delete draft.structure;await db.drafts.put(draft);const c=new DraftController(await service.getDraft(id,draft.id),service);t.after(async()=>c.dispose())
  c.addSets(groupId,'kg');await c.flush();validateStructure(c.record.day,c.record.structure)
  assert.deepEqual(c.record.day.exercises[1].prescription.sets.slice(0,2),draft.day.exercises[1].prescription.sets)
  const invalid=structuredClone(c.record.structure)!;invalid.exercises[1].sets.at(-1)!.round=2
  assert.throws(()=>validateStructure(c.record.day,invalid),/unique and ordered/)
})


test('Settings preparation locks edits before awaiting the pending draft write and retains failed input', async t => {
  const { service, controller:c, groupId, id, draft } = await setup(t)
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve}),original=service.update
  service.update=async(...args)=>{await gate;return original(...args)}
  c.addSets(groupId,'kg');const input=structuredClone(c.input);input.notes='Keep for Settings';c.change(input)
  const pending=c.prepareSettings();assert.equal(c.busy,true)
  const later=structuredClone(c.input);later.notes='Unexpected input while disabled';c.change(later)
  assert.equal(c.input.notes,'Keep for Settings');release();await pending
  assert.equal(c.busy,false);assert.equal(c.status,'saved');assert.equal((await service.getDraft(id,draft.id)).input.notes,'Keep for Settings')
  service.update=async()=>{throw new Error('Storage unavailable')};c.addSets(groupId,'kg')
  await assert.rejects(c.prepareSettings(),/Storage unavailable/);assert.equal(c.busy,false);assert.equal(c.status,'failed');assert.equal(c.snapshot.day.exercises[0].prescription.sets.length,5)
})

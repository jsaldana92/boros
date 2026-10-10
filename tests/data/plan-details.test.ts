import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { importSession } from '../../src/db/imports.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { restoreService } from '../../src/db/restores.ts'
import { copyExercise, newDay, planInputSchema, planToInput, trainingBlocks } from '../../src/schemas/plan.ts'
import { occurrences } from '../../src/schemas/schedule.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'
import { addDays, localToday, monday, nextMonday } from '../../src/lib/calendar-dates.ts'
import { prescriptionSummary } from '../../src/features/create/prescription-summary.ts'
import { formattingInstructions, parseInterchange, toImportDraft } from '../../src/features/create/interchange.ts'
import { generateBackup } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { csvTables } from '../../src/features/backups/csv.ts'

const text = ' =SUM(1,2)\n<em>Plain plan instructions</em>\n雪 “quoted”'
const prescription = { name: 'Repeated', tagNames: [], instructions: 'Exercise instructions', notes: 'Exercise note', sets: [{ reps: { min: 8, max: 12 }, rir: { min: 0, max: 0 } }] }
const input = () => ({ name: 'Plan', durationWeeks: 12, instructions: text, notes: 'Separate plan note', days: [1, 2].map((n) => ({ ...newDay(n), exercises: [copyExercise(prescription)] })) })
async function setup(t) {
  const db = new BorosDatabase(`boros-test-plan-details-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId
  return { db, id, profiles, plans: planService(db), sessions: sessionService(db), schedules: scheduleService(db), weekly: weeklyService(db) }
}

test('prescription summaries retain fixed/range/zero/missing targets and varying per-set meaning', () => {
  assert.deepEqual(prescriptionSummary(Array(3).fill({ reps: { min: 8, max: 12 }, rir: { min: 1, max: 2 } })), { summary: '3 sets · 8–12 reps · 1–2 RIR', details: [] })
  assert.deepEqual(prescriptionSummary(prescription.sets), { summary: '1 set · 8–12 reps · 0 RIR', details: [] })
  assert.deepEqual(prescriptionSummary([{ reps: { min: 5, max: 5 } }]), { summary: '1 set · 5 reps', details: [] })
  assert.deepEqual(prescriptionSummary([...prescription.sets, { reps: { min: 5, max: 5 } }]), { summary: '2 sets', details: ['Set 1: 8–12 reps · 0 RIR', 'Set 2: 5 reps'] })
  const day = newDay(1), groupId = crypto.randomUUID()
  day.groups = [{ id: groupId, number: 3 }]
  day.exercises = [copyExercise(prescription), ...[1, 2].map(() => ({ ...copyExercise(prescription), groupId })), copyExercise(prescription)]
  assert.deepEqual(trainingBlocks(day).map((block) => block.members.map((item) => item.id)), [[day.exercises[0].id], [day.exercises[1].id, day.exercises[2].id], [day.exercises[3].id]])
})

test('optional plan instructions validate without inventing old text; failures, stale writes, duplicates and profile isolation preserve records', async (t) => {
  const { db, id, profiles, plans } = await setup(t), original = await plans.save(id, input())
  const absent = input(); delete absent.instructions
  assert.equal(Object.hasOwn(planInputSchema.parse(absent), 'instructions'), false)
  for (const invalid of [null, 12, 'x'.repeat(20001)]) assert.equal(planInputSchema.safeParse({ ...input(), instructions: invalid }).success, false)
  const second = new BorosDatabase(db.name); t.after(async () => second.close())
  assert.equal((await planService(second).get(id, original.id)).instructions, text)
  const updated = await plans.save(id, { ...planToInput(original), instructions: 'Updated instructions' }, original)
  await assert.rejects(planService(second).save(id, { ...planToInput(original), instructions: 'Stale' }, original), /another tab/)
  const fail = () => { throw new Error('Disk full') }; db.plans.hook('updating', fail)
  await assert.rejects(plans.save(id, { ...planToInput(updated), instructions: 'Recoverable' }, updated), /Disk full/)
  db.plans.hook('updating').unsubscribe(fail)
  assert.deepEqual(await plans.get(id, original.id), updated)
  const copy = await plans.save(id, await plans.duplicateDraft(id, original.id))
  assert.notEqual(copy.id, original.id); assert.notEqual(copy.days[0].id, original.days[0].id)
  assert.equal(copy.instructions, updated.instructions); assert.equal(copy.notes, original.notes)
  const other = await profiles.create('Other')
  await assert.rejects(plans.save(other.id, planToInput(copy), copy), /unavailable/)
  assert.deepEqual((await plans.library(other.id)).plans, [])
})

test('instructions freeze into scheduled/weekly revisions, outcomes, drafts and history; edits/archive leave library and existing snapshots unchanged', async (t) => {
  const { db, id, plans, sessions, schedules, weekly } = await setup(t)
  const exercise = await exerciseService(db).save(id, prescription), source = input()
  source.days.forEach((day) => { day.exercises[0].source = { kind: 'exercise', id: exercise.id } })
  const plan = await plans.save(id, source)
  const startWeek = monday(localToday('UTC'))
  const scheduled = await schedules.create(id, { planId: plan.id, planRevision: plan.revision, startWeek, timeZone: 'UTC', mapping: plan.days.map((day, weekday) => ({ dayId: day.id, weekday })) })
  assert.equal(scheduled.revisions[0].planInstructions, text)
  const { draft } = await sessions.openOccurrence(id, scheduled.id, plan.days[0].id, startWeek)
  const results = structuredClone(draft!.input); results.notes = 'Session note'; Object.assign(results.exercises[0].sets[0], { load: '0', reps: '8', rir: '0' })
  const completed = await sessions.complete(id, draft!.id, draft!.revision, results, false)
  assert.equal(completed.planInstructions, text); assert.equal(completed.notes, 'Session note')
  const [run] = await weekly.activate(id, plan.id)
  const event = occurrences(run, run.startWeek, addDays(run.startWeek, 6))[1]
  const marked = await weekly.outcome(id, event.ref, run.revision, 'skipped')
  assert.equal(marked.outcomes![0].planInstructions, text)
  const beforeSchedules = await db.schedules.toArray(), beforeDrafts = await db.drafts.toArray()
  const changed = await plans.save(id, { ...planToInput(plan), instructions: 'New instructions', notes: 'New note' }, plan)
  assert.deepEqual((await db.schedules.toArray())[0].revisions[0].days, beforeSchedules[0].revisions[0].days); assert.equal((await db.schedules.toArray())[0].revisions.at(-1)!.planInstructions, 'New instructions'); assert.deepEqual(await db.drafts.toArray(), beforeDrafts)
  assert.deepEqual(await db.sessions.get([id, completed.id]), completed); assert.deepEqual(await exerciseService(db).get(id, exercise.id), exercise)
  const freshDraft = await sessions.start(id, plan.id, plan.days[1].id)
  assert.equal(freshDraft.planInstructions, 'New instructions')
  const preview = await schedules.preview(id, { scheduleId: scheduled.id, revision: (await schedules.get(id, scheduled.id)).revision, kind: 'remap', effectiveFrom: nextMonday(localToday('UTC')), mapping: scheduled.revisions[0].mapping })
  const refreshed = await schedules.commit(id, preview, true)
  assert.equal(refreshed.revisions[0].planInstructions, text); assert.equal(refreshed.revisions.at(-1)!.planInstructions, 'New instructions')
  await plans.setArchived(id, plan.id, changed.revision, true)
  assert.deepEqual(await db.sessions.get([id, completed.id]), completed)
  assert.equal((await db.schedules.get([id, scheduled.id]))!.closedAt, undefined)
})

test('AI v3 plan instructions reach editable drafts and saved imports; v1/v2 remain strict and no version invents missing instructions', async (t) => {
  const { db, id } = await setup(t)
  const base = { name: 'AI', trainingDaysPerWeek: 1, days: [{ name: 'Day', exercises: [{ name: 'Press', sets: [{ reps: { min: 5, max: 8 } }], instructions: 'Exercise only' }] }] }
  for (const schemaVersion of [1, 2, 3]) {
    const plan = { ...base, ...(schemaVersion > 1 ? { durationWeeks: 2 } : {}) }
    const parsed = parseInterchange(JSON.stringify({ schemaVersion, kind: 'plan', plan }))
    assert.deepEqual(parsed.issues, []); const draft = toImportDraft(parsed.value!)
    assert.equal(draft.input.instructions, undefined)
    if (schemaVersion < 3) assert.equal(parseInterchange(JSON.stringify({ schemaVersion, kind: 'plan', plan: { ...plan, instructions: text } })).value, undefined)
  }
  const parsed = parseInterchange('```json\n' + JSON.stringify({ schemaVersion: 3, kind: 'plan', plan: { ...base, durationWeeks: 2, instructions: text } }) + '\n```')
  const draft = toImportDraft(parsed.value!); assert.equal(draft.kind, 'plan'); if (draft.kind !== 'plan') return
  draft.input.notes = 'Preview note'
  const saved = await importSession(id, db).savePlan(draft.input)
  assert.equal(saved.instructions, text); assert.equal(saved.notes, 'Preview note')
  assert.equal(saved.days[0].exercises[0].prescription.instructions, 'Exercise only')
  assert.match(formattingInstructions('plan'), /exactly one ```json code block/)
  assert.match(formattingInstructions('plan'), /optional "instructions" and "notes" strings/)
  for (const instructions of [null, 'x'.repeat(20001)]) assert.equal(parseInterchange(JSON.stringify({ schemaVersion: 3, kind: 'plan', plan: { ...base, durationWeeks: 2, instructions } })).value, undefined)
})

test('backup v7 JSON/CSV and all restore choices preserve distinct plan instructions and historical snapshots; v6 rejects new fields', async (t) => {
  const { db, id, plans, sessions, weekly } = await setup(t), plan = await plans.save(id, input())
  const [run] = await weekly.activate(id, plan.id), events = occurrences(run, run.startWeek, addDays(run.startWeek, 6))
  await weekly.outcome(id, events[1].ref, run.revision, 'skipped')
  const { draft } = await sessions.openOccurrence(id, run.id, plan.days[0].id, events[0].ref.scheduledDate)
  const results = structuredClone(draft!.input); Object.assign(results.exercises[0].sets[0], { load: '0', reps: '8' })
  await sessions.complete(id, draft!.id, draft!.revision, results, false)
  await plans.save(id, { ...planToInput(plan), instructions: 'Current plan instructions' }, plan)
  const snapshot = await captureProfile(id, db), archive = await generateBackup(snapshot, 'test'), backup = await readBackup(archive.bytes)
  assert.equal(backup.data.backupSchemaVersion, 18); assert.equal(backup.data.plans[0].instructions, 'Current plan instructions')
  for (const record of [...backup.data.drafts, ...backup.data.sessions, backup.data.schedules[0].revisions[0], ...backup.data.schedules[0].outcomes!]) assert.equal(record.planInstructions, text)
  const tables = csvTables(backup.data)
  for (const name of ['plans', 'schedule_revisions', 'occurrence_outcomes', 'drafts', 'sessions']) {
    const table = tables.find((item) => item.path === `csv/${name}.csv`)!
    assert.ok(table.text.includes(name === 'plans' ? ',instructions' : ',planInstructions'))
    assert.ok(table.text.includes(name === 'plans' ? 'Current plan instructions' : "' =SUM(1,2)"))
  }
  const legacy = structuredClone(backup.data); legacy.backupSchemaVersion = 6
  assert.throws(() => validateBackupData(legacy), /Unrecognized key/)
  const mismatch = structuredClone(backup.data); mismatch.sessions[0].planInstructions = 'Changed history'
  assert.throws(() => validateBackupData(mismatch), /inconsistent finalized draft/)
  const service = restoreService(db)
  for (const choice of ['new', 'device', 'import', 'replace'] as const) {
    const preview = await service.preview(backup, choice, choice === 'new' ? 'Copied' : undefined)
    const restoredId = await service.commit(preview, true), restored = await captureProfile(restoredId, db)
    const round = await readBackup((await generateBackup(restored, 'test')).bytes)
    assert.equal(round.data.plans[0].instructions, 'Current plan instructions')
    assert.equal(round.data.sessions[0].planInstructions, text); assert.equal(round.data.schedules[0].outcomes![0].planInstructions, text)
  }
})

import 'fake-indexeddb/auto'
import { profileService } from '../../src/db/profiles.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { planService } from '../../src/db/plans.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { measurementService } from '../../src/db/measurements.ts'
import { copyExercise, newDay, planToInput } from '../../src/schemas/plan.ts'
import { localToday, nextMonday } from '../../src/lib/calendar-dates.ts'
import type { BorosDatabase } from '../../src/db/database.ts'

export const photoBytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
export const strangeText = ' \t=SUM(1,2)\n雪, "quoted"\nsecond line'
export async function representativeProfile(db: BorosDatabase) {
  const profiles = profileService(db), exercises = exerciseService(db), plans = planService(db), schedules = scheduleService(db), sessions = sessionService(db), measurements = measurementService(db)
  const id = (await profiles.initialize()).activeProfileId
  await profiles.save(id, 1, { name: 'Ada, "雪" / :', age: 0, heightCm: 177.8, heightUnit: 'ft', weightUnit: 'lb', weightKg: 70 }, { blob: new Blob([photoBytes], { type: 'image/png' }), width: 1, height: 1 })
  const exercise = await exercises.save(id, { name: '=Range 雪', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 0, max: 0 } }, { reps: { min: 10, max: 12 }, rir: { min: 1, max: 3 } }, { reps: { min: 6, max: 6 } }], tagNames: ['Legs', '@tag'], restBetweenSeconds: 0, instructions: strangeText, notes: strangeText, tutorialUrl: 'https://youtu.be/abcdefghijk' })
  const standalone = await exercises.save(id, { name: 'Standalone', sets: [{ reps: { min: 1, max: 1 } }], tagNames: [] })
  const prescription = { name: exercise.name, sets: exercise.sets, tagNames: ['Legs', 'historical only'], restBetweenSeconds: 0, instructions: strangeText, notes: strangeText }
  const plan = await plans.save(id, { name: 'Plan 雪', durationWeeks: 104, days: Array.from({ length: 4 }, (_, i) => ({ ...newDay(i + 1), exercises: [copyExercise(prescription, { kind: 'exercise', id: exercise.id })] })) })
  const schedule = await schedules.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: '2025-01-06', timeZone: 'America/New_York', mapping: plan.days.map((day, weekday) => ({ dayId: day.id, weekday })) })
  for (const [dayIndex, date] of ['2025-01-06', '2025-01-07'].entries()) {
    const { draft } = await sessions.openOccurrence(id, schedule.id, plan.days[dayIndex].id, date)
    const input = structuredClone(draft!.input); input.notes = strangeText; input.exercises[0].notes = '@exercise note'
    input.exercises[0].sets.forEach((set, i) => { if (!dayIndex || i === 0) Object.assign(set, { load: i === 0 ? '0' : '100', reps: '5', rir: i === 0 ? '0' : '', unit: 'lb' }) })
    await sessions.complete(id, draft!.id, draft!.revision, input, !!dayIndex)
  }
  const { draft } = await sessions.openOccurrence(id, schedule.id, plan.days[2].id, '2025-01-08')
  const input = structuredClone(draft!.input); input.notes = 'Saved draft\nnotes'; input.exercises[0].notes = strangeText
  Object.assign(input.exercises[0].sets[0], { load: '12.', reps: '', rir: '0', unit: 'lb' })
  const savedDraft = await sessions.update(id, draft!.id, draft!.revision, input)
  await sessions.startTimer(id, savedDraft.id, savedDraft.revision, savedDraft.day.exercises[0].id, 0, 60)
  // Explicit timer fixture because the prescribed zero rest deliberately creates none.
  await db.restTimers.put({ id: 'active', token: crypto.randomUUID(), profileId: id, draftId: savedDraft.id, label: 'Transient', durationSeconds: 60, endAt: new Date(Date.now() + 60000).toISOString() })
  const changed = planToInput(plan); changed.days[0].exercises[0].prescription.instructions = 'Current plan differs from history'
  const edited = await plans.save(id, changed, plan)
  const preview = await schedules.preview(id, { scheduleId: schedule.id, revision: (await schedules.get(id, schedule.id)).revision, kind: 'remap', effectiveFrom: nextMonday(localToday(schedule.timeZone)), mapping: schedule.revisions[0].mapping })
  await schedules.commit(id, preview, true)
  await plans.setArchived(id, edited.id, edited.revision, true)
  await exercises.setArchived(id, exercise.id, exercise.revision, true)
  await db.tags.update([id, exercise.tagIds[0]], { archivedAt: new Date().toISOString() })
  const entry = await measurements.save(id, crypto.randomUUID(), undefined, { weightKg: 68, measuredAt: '2025-01-01T12:00:00.000Z' }, { blob: new Blob([photoBytes], { type: 'image/png' }), width: 1, height: 1 }, crypto.randomUUID())
  const shared = await measurements.save(id, crypto.randomUUID(), undefined, { weightKg: 69, measuredAt: '2025-01-02T12:00:00.000Z' }, undefined, crypto.randomUUID())
  await db.measurements.update([id, shared.id], { photoId: entry.photoId })
  const other = await profiles.create('Other private profile')
  await profiles.save(other.id, other.revision, { name: other.name, heightUnit: 'cm', weightUnit: 'kg', weightKg: 99 }, { blob: new Blob([photoBytes], { type: 'image/png' }), width: 1, height: 1 })
  await exercises.save(other.id, { name: 'Never leak this', sets: [{ reps: { min: 1, max: 1 } }], tagNames: ['Private'] })
  await profiles.select(id)
  return { id, otherId: other.id, savedDraft, entry, shared, plan, exercise, standalone }
}

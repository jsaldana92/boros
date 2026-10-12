import { similarWorkouts } from '../lib/workout-comparison.ts'
import { instructionView } from './instructions.ts'
import { templateReference } from '../lib/template-ownership.ts'
import { workoutResolver } from '../lib/workout-identity.ts'
import { createId } from '../lib/browser-crypto.ts'
import type { BorosDatabase } from './database.ts'
import { duplicateDay, type TrainingDay } from '../schemas/plan.ts'
import { workoutInputSchema, type Workout } from '../schemas/workout.ts'
import { assertSameTrainingType, trainingTypeOf } from '../schemas/training-type.ts'
import { nameKey } from '../schemas/profile.ts'

// Identity-free prescription comparison. Names are never used to deduplicate.
export function workoutPrescription(day: TrainingDay) {
  const groups = new Map(day.groups?.map((g, i) => [g.id, i]))
  return JSON.stringify({ type: trainingTypeOf(day), name: day.name, postWorkoutRestSeconds: day.postWorkoutRestSeconds, instructions: day.instructions, notes: day.notes,
    groups: day.groups?.map(({ id: _id, ...g }) => g),
    exercises: day.exercises.map(e => ({ prescription: { ...e.prescription, trainingType: trainingTypeOf(e.prescription) }, group: e.groupId ? groups.get(e.groupId) : undefined })),
    circuits: day.circuits?.map(({ id: _id, exerciseIds, ...c }) => ({ ...c, exercises: exerciseIds.map(id => day.exercises.findIndex(e => e.id === id)) })),
  }, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)
}

// Caller owns a transaction including workouts/deletedSources/plans. Publication
// marks the plan copy once; later edits remain independent from library defaults.
export async function publishWorkouts(database: BorosDatabase, profileId: string, days: TrainingDay[], at: string, previous: TrainingDay[] = [], reconciling = false) {
  const result = structuredClone(days)
  const identities = await database.exercises.where('profileId').equals(profileId).toArray()
  const stored = await database.workouts.where('profileId').equals(profileId).toArray()
  const library = stored.map(w => instructionView(w, identities, stored, profileId, true))
  const deleted = await database.deletedSources.where('profileId').equals(profileId).toArray()
  const exerciseIdentities = [...identities, ...deleted.filter(t=>t.kind==='exercise')]
  const resolve = workoutResolver(profileId, [...library, ...deleted.filter(t=>t.kind==='workout')])
  for (const day of result) {
    const old = previous.find(d => d.id === day.id)
    if (old?.publishedWorkoutId) { day.publishedWorkoutId = old.publishedWorkoutId; continue }
    if (day.publishedWorkoutId) {
      const linked = await database.workouts.get([profileId, day.publishedWorkoutId])
      if (linked) assertSameTrainingType(day, linked)
      else if (!await database.deletedSources.get([profileId, 'workout', day.publishedWorkoutId])) throw new Error('A published workout reference is unavailable in this profile.')
      continue
    }
    const source = day.sourceWorkoutId ? library.find(w => w.id === resolve(day.sourceWorkoutId!)) : undefined
    if (source) {
      assertSameTrainingType(day, source)
      // Legacy workouts can predate library exercise ownership. An explicit
      // source relationship permits comparing their copied, unlinked positions;
      // it never permits matching unrelated exercises by display name.
      const comparable = { ...day, exercises: day.exercises.map((e, i) => !templateReference(e) && source.exercises[i] && !templateReference(source.exercises[i]) ? { ...e, id: source.exercises[i].id } : e) }
      comparable.circuits = day.circuits?.map(c => ({ ...c, exerciseIds: c.exerciseIds.map(id => comparable.exercises[day.exercises.findIndex(e => e.id === id)].id) }))
      if (source.archivedAt && reconciling || !source.archivedAt && similarWorkouts(profileId,comparable,[source],exerciseIdentities,undefined,true).length > 0) { day.publishedWorkoutId = source.id; continue }
    } else if (day.sourceWorkoutId) {
      // Missing historical reference cannot distinguish deletion from lost data.
      // Never resurrect it, including when pre-v7 deletions lack tombstones.
      if (await database.deletedSources.get([profileId, 'workout', day.sourceWorkoutId])) day.publishedWorkoutId = day.sourceWorkoutId
      else if (!reconciling && !old) throw new Error('The source workout is unavailable. Its copy is kept; restore the source before publishing this new copy.')
      continue
    }
    if (await database.deletedSources.get([profileId, 'workout', day.id])) { day.publishedWorkoutId = day.id; continue }
    const equivalent = similarWorkouts(profileId,day,library,exerciseIdentities,undefined,true)[0]
    if (equivalent) { day.publishedWorkoutId = equivalent.id; continue }
    const collision = await database.workouts.get([profileId, day.id])

    let name = day.name, n = 0
    while (await database.workouts.where('[profileId+activeNameKey]').equals([profileId, nameKey(name)]).first()) {
      const suffix = ` (${++n})`; name = day.name.slice(0, 120 - suffix.length).trimEnd() + suffix
    }
    const input = workoutInputSchema.parse({ ...duplicateDay(day), id: collision ? createId() : day.id, name })
    for (const item of input.exercises) {
      const ref = item.templateId ?? (item.source?.kind === 'exercise' ? item.source.id : item.source?.libraryId)
      if (ref && !await database.exercises.get([profileId, ref]) && !await database.deletedSources.get([profileId, 'exercise', ref])) { delete item.templateId; delete item.source }
    }
    const value: Workout = { ...input, trainingType: trainingTypeOf(day), profileId, nameKey: nameKey(name), activeNameKey: nameKey(name), revision: 1, createdAt: at, updatedAt: at }
    await database.workouts.add(value)
    library.push(value)
    day.publishedWorkoutId = value.id
  }
  return result
}

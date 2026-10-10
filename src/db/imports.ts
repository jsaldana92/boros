import { workoutService } from './workouts.ts'
import type { WorkoutInput } from '../schemas/workout.ts'
import { createId } from '../lib/browser-crypto.ts'
import { db, type BorosDatabase } from './database.ts'
import { exerciseService } from './exercises.ts'
import { planService } from './plans.ts'
import type { ExerciseInput } from '../schemas/exercise.ts'
import { planToInput, type Plan, type PlanInput } from '../schemas/plan.ts'
import { materializeTemplates } from '../lib/template-ownership.ts'

// One local creation ID per validated preview. Reuse it after any failed or
// uncertain save; no database writes occur until one of these callbacks runs.
export function importSession(profileId: string, database: BorosDatabase = db) {
  const creationId = createId()
  return {
    saveLibraryWorkout: (input: WorkoutInput) => database.transaction('rw', database.profiles, database.deletedSources, database.workouts, database.exercises, database.tags, async () => {
      const committed = await database.workouts.get([profileId, creationId])
      return committed ?? workoutService(database).save(profileId, { ...input, id: creationId }, undefined, true)
    }),
    saveWorkout: (input: ExerciseInput) => exerciseService(database).save(profileId, input, undefined, creationId),
    savePlan: (input: PlanInput) => database.transaction('rw', [database.workouts, database.profiles, database.deletedSources, database.exercises, database.tags, database.plans, database.schedules], async () => {
      if (!await database.profiles.get(profileId)) throw new Error('This profile is unavailable. Nothing was saved.')
      const committed = await database.plans.get([profileId, creationId])
      if (committed) return committed
      const at = new Date().toISOString()
      const virtual: Plan = { ...input, id: creationId, profileId, nameKey: '', revision: 1, createdAt: at, updatedAt: at }
      const [exercises, tags] = await Promise.all([database.exercises.where('profileId').equals(profileId).toArray(), database.tags.where('profileId').equals(profileId).toArray()])
      const linked = materializeTemplates(profileId, { plans: [virtual], exercises, tags }, at, true)
      if (linked.addedTags.length) await database.tags.bulkAdd(linked.addedTags)
      if (linked.addedExercises.length) await database.exercises.bulkAdd(linked.addedExercises)
      return planService(database).save(profileId, planToInput(linked.plans[0]), undefined, creationId)
    }),
  }
}

import { db, type BorosDatabase } from './database.ts'
import { exerciseService } from './exercises.ts'
import { planService } from './plans.ts'
import type { ExerciseInput } from '../schemas/exercise.ts'
import type { PlanInput } from '../schemas/plan.ts'

// One local creation ID per validated preview. Reuse it after any failed or
// uncertain save; no database writes occur until one of these callbacks runs.
export function importSession(profileId: string, database: BorosDatabase = db) {
  const creationId = crypto.randomUUID()
  return {
    saveWorkout: (input: ExerciseInput) => exerciseService(database).save(profileId, input, undefined, creationId),
    savePlan: (input: PlanInput) => planService(database).save(profileId, input, undefined, creationId),
  }
}

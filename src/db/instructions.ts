import type { BorosDatabase } from './database.ts'
import type { TrainingDay, Plan } from '../schemas/plan.ts'
import type { Exercise } from '../schemas/exercise.ts'
import type { Workout } from '../schemas/workout.ts'
import type { Schedule } from '../schemas/schedule.ts'
import { exerciseResolver } from '../lib/exercise-identity.ts'
import { templateReference } from '../lib/template-ownership.ts'

// Read-time/current-save resolution only. Never call this on completed records or
// existing drafts. Missing sources retain the copy's last usable snapshot.
export function instructionView<T extends TrainingDay>(day: T, exercises: Exercise[], workouts: Workout[], profileId: string, baseWorkout = false): T {
  const resolve = exerciseResolver(profileId, exercises), next = structuredClone(day)
  const source = !baseWorkout && workouts.find(w => w.profileId === profileId && w.id === (day.publishedWorkoutId ?? day.sourceWorkoutId))
  if (source) { if (source.instructions === undefined) delete next.instructions; else next.instructions = source.instructions }
  next.exercises.forEach(e => {
    const id = templateReference(e), source = id && exercises.find(x => x.profileId === profileId && x.id === resolve(id))
    if (source) { if (source.instructions === undefined) delete e.prescription.instructions; else e.prescription.instructions = source.instructions }
  })
  return next
}
export async function currentInstructions<T extends TrainingDay>(database: BorosDatabase, profileId: string, day: T, baseWorkout = false): Promise<T> {
  return instructionView(day, await database.exercises.where('profileId').equals(profileId).toArray(), await database.workouts.where('profileId').equals(profileId).toArray(), profileId, baseWorkout)
}
export async function currentPlanInstructions(database: BorosDatabase, plan: Plan) {
  return { ...plan, days: await Promise.all(plan.days.map(d => currentInstructions(database, plan.profileId, d))) }
}
export async function currentScheduleInstructions(database: BorosDatabase, schedule: Schedule) {
  const { profileId } = schedule
  const exercises = await database.exercises.where('profileId').equals(profileId).toArray(), workouts = await database.workouts.where('profileId').equals(profileId).toArray()
  const plan = await database.plans.get([profileId,schedule.planId])
  // Pending Train previews only. Outcomes and draft/session records keep their
  // own frozen snapshots, and no schedule revision is written here.
  return { ...schedule, revisions: schedule.revisions.map(r => ({ ...r, ...(plan ? { planInstructions: plan.instructions } : {}), days: r.days.map(day => instructionView(day,exercises,workouts,profileId)) })) }
}

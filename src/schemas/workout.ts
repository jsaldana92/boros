import { daySchema, duplicateDay, planInputSchema, type TrainingDay } from './plan.ts'
import { z } from 'zod'

export const workoutInputSchema = daySchema.omit({ sourceWorkoutId: true }).superRefine((day, context) => {
  const parsed = planInputSchema.safeParse({ name: day.name, days: [day] })
  if (!parsed.success) parsed.error.issues.forEach((issue) => context.addIssue({ ...issue, path: issue.path[0] === 'days' ? issue.path.slice(2) : issue.path }))
})
export type WorkoutInput = z.infer<typeof workoutInputSchema>
export interface Workout extends WorkoutInput {
  profileId: string; nameKey: string; activeNameKey?: string; revision: number
  createdAt: string; updatedAt: string; archivedAt?: string
}
export const workoutToInput = (value: Workout): WorkoutInput => workoutInputSchema.parse(structuredClone(value))
export const copyWorkout = (value: Workout): TrainingDay => ({ ...duplicateDay(workoutToInput(value)), sourceWorkoutId: value.id })

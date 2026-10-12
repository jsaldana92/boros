import { convertIntervalDay } from './interval-conversion.ts'
import { daySchema, duplicateDay, planInputSchema, type TrainingDay } from './plan-v13.ts'
import { z } from 'zod'

export const workoutInputSchema = daySchema.omit({ sourceWorkoutId: true, publishedWorkoutId: true }).superRefine((day, context) => {
  const parsed = planInputSchema.safeParse({ trainingType: day.trainingType, name: day.name, days: [day] })
  if (!parsed.success) parsed.error.issues.forEach((issue) => context.addIssue({ ...issue, path: issue.path[0] === 'days' ? issue.path.slice(2) : issue.path }))
})
export type WorkoutInput = z.infer<typeof workoutInputSchema>
export interface Workout extends WorkoutInput {
  profileId: string; nameKey: string; activeNameKey?: string; revision: number
  createdAt: string; updatedAt: string; archivedAt?: string
}
export const workoutToInput = (value: Workout): WorkoutInput => workoutInputSchema.parse(convertIntervalDay(value))
export const copyWorkout = (value: Workout): TrainingDay => { const copy = duplicateDay(workoutToInput(value)); return { ...copy, sourceWorkoutId: value.id, ...(copy.notes === undefined ? {} : { noteOverride: false }), exercises: copy.exercises.map(e => ({ ...e, prescription: { ...e.prescription, ...(e.prescription.notes === undefined ? {} : { noteOverride: false }) } })) } }

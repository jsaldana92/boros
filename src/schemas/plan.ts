import { z } from 'zod'
import { exerciseInputSchema, type ExerciseInput } from './exercise.ts'
import { nameKey } from './profile.ts'

const name = z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.').refine((value) => !!nameKey(value), 'Enter a name.')
export const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exercise'), id: z.string().uuid() }),
  z.object({ kind: z.literal('plan'), id: z.string().uuid(), dayId: z.string().uuid(), occurrenceId: z.string().uuid() }),
])
export const occurrenceSchema = z.object({ id: z.string().uuid(), prescription: exerciseInputSchema, source: sourceSchema.optional() })
export const daySchema = z.object({ id: z.string().uuid(), name, exercises: z.array(occurrenceSchema).min(1, 'Add at least one exercise to this day.').max(100, 'Use at most 100 exercises per day.') })
export const planInputSchema = z.object({ name, days: z.array(daySchema).min(1, 'Add at least one training day.').max(7, 'Use at most 7 training days.') }).superRefine((plan, context) => {
  const ids = new Set<string>()
  plan.days.forEach((day, index) => {
    for (const [id, path] of [[day.id, ['days', index, 'id']], ...day.exercises.map((exercise, i) => [exercise.id, ['days', index, 'exercises', i, 'id']])] as [string, (string | number)[]][]) {
      if (ids.has(id)) context.addIssue({ code: 'custom', path, message: 'Each day and exercise occurrence needs a unique ID.' })
      ids.add(id)
    }
  })
})
export type PlanInput = z.infer<typeof planInputSchema>
export type TrainingDay = PlanInput['days'][number]
export type PlanExercise = TrainingDay['exercises'][number]
export type ExerciseSource = z.infer<typeof sourceSchema>
export interface Plan extends PlanInput {
  id: string; profileId: string; nameKey: string; activeNameKey?: string
  revision: number; createdAt: string; updatedAt: string; archivedAt?: string
}
export const newDay = (number: number): TrainingDay => ({ id: crypto.randomUUID(), name: `Day ${number}`, exercises: [] })
export const copyExercise = (prescription: ExerciseInput, source?: ExerciseSource): PlanExercise => ({ id: crypto.randomUUID(), prescription: structuredClone(prescription), ...(source ? { source: structuredClone(source) } : {}) })
export const planToInput = (plan: Plan): PlanInput => ({ name: plan.name, days: structuredClone(plan.days) })

import { z } from 'zod'
import { exerciseInputSchema, range } from './exercise.ts'
import { daySchema } from './plan.ts'

// Public data deliberately has no IDs, profile ownership, revisions or provenance.
export const interchangeExerciseSchema = z.object({
  name: exerciseInputSchema.shape.name,
  sets: z.array(z.object({ reps: range(1), rir: range(0).nullable().default(null) }).strict()).min(1, 'Add at least one set.').max(100, 'Use at most 100 sets.'),
  restBetweenSetsSeconds: exerciseInputSchema.shape.restBetweenSeconds.unwrap().nullable().default(null),
  restAfterExerciseSeconds: exerciseInputSchema.shape.restAfterSeconds.unwrap().nullable().default(null),
  instructions: exerciseInputSchema.shape.instructions.unwrap().default(''),
  youtubeUrl: exerciseInputSchema.shape.tutorialUrl.unwrap().nullable().default(null),
  tags: exerciseInputSchema.shape.tagNames.default([]),
}).strict()
export const interchangePlanSchema = z.object({
  name: daySchema.shape.name,
  trainingDaysPerWeek: z.number().int().min(1).max(7),
  days: z.array(z.object({ name: daySchema.shape.name, exercises: z.array(interchangeExerciseSchema).min(1, 'Add at least one exercise.').max(100) }).strict()).min(1).max(7),
}).strict().superRefine((plan, context) => {
  if (plan.days.length !== plan.trainingDaysPerWeek) context.addIssue({ code: 'custom', path: ['days'], message: 'Day count must equal trainingDaysPerWeek.' })
})
export const interchangeSchema = z.discriminatedUnion('kind', [
  z.object({ schemaVersion: z.literal(1), kind: z.literal('workout'), workout: interchangeExerciseSchema }).strict(),
  z.object({ schemaVersion: z.literal(1), kind: z.literal('plan'), plan: interchangePlanSchema }).strict(),
])
export type Interchange = z.infer<typeof interchangeSchema>
export type InterchangeExercise = z.infer<typeof interchangeExerciseSchema>
export type ImportKind = Interchange['kind']

// Both visible instructions and tests consume these schema-checked examples.
export function interchangeExample(kind: ImportKind): Interchange {
  const exercise = { name: 'Example exercise', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 0, max: 0 } }, { reps: { min: 10, max: 10 }, rir: null }], restBetweenSetsSeconds: 0, restAfterExerciseSeconds: null, instructions: 'Illustrative instructions only.', youtubeUrl: null, tags: ['Example tag'] }
  return interchangeSchema.parse(kind === 'workout' ? { schemaVersion: 1, kind, workout: exercise } : { schemaVersion: 1, kind, plan: { name: 'Example plan', trainingDaysPerWeek: 1, days: [{ name: 'Day 1', exercises: [exercise] }] } })
}

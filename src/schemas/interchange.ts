import { z } from 'zod'
import { exerciseInputSchema, range } from './exercise.ts'
import { daySchema, planInstructionsSchema, positiveInteger } from './plan.ts'

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
  if (plan.days.length !== plan.trainingDaysPerWeek) context.addIssue({ code: 'custom', path: ['days'], message: 'Workout count must equal trainingDaysPerWeek.' })
})
export const legacyInterchangeSchema = z.discriminatedUnion('kind', [
  z.object({ schemaVersion: z.literal(1), kind: z.literal('workout'), workout: interchangeExerciseSchema }).strict(),
  z.object({ schemaVersion: z.literal(1), kind: z.literal('plan'), plan: interchangePlanSchema }).strict(),
])
export const interchangeGroupSchema = z.object({ number: positiveInteger, restBetweenRoundsSeconds: exerciseInputSchema.shape.restBetweenSeconds.unwrap().nullable().default(null), restAfterGroupSeconds: exerciseInputSchema.shape.restAfterSeconds.unwrap().nullable().default(null) }).strict()
const groupedDay = z.object({ name: daySchema.shape.name, exercises: z.array(interchangeExerciseSchema.extend({ superset: positiveInteger.nullable().default(null) })).min(1).max(100), supersets: z.array(interchangeGroupSchema).max(50).default([]) }).strict().superRefine((day, context) => {
  const numbers = new Set<number>()
  day.supersets.forEach((group, g) => {
    if (numbers.has(group.number)) context.addIssue({ code: 'custom', path: ['supersets', g, 'number'], message: 'Duplicate superset number in this workout.' })
    numbers.add(group.number)
    const positions = day.exercises.flatMap((item, i) => item.superset === group.number ? [i] : [])
    if (positions.length < 2) context.addIssue({ code: 'custom', path: ['supersets', g], message: 'A superset needs at least two members.' })
    if (positions.length && positions.at(-1)! - positions[0] + 1 !== positions.length) context.addIssue({ code: 'custom', path: ['supersets', g], message: 'Place superset members together in execution order.' })
  })
  day.exercises.forEach((item, i) => { if (item.superset !== null && !numbers.has(item.superset)) context.addIssue({ code: 'custom', path: ['exercises', i, 'superset'], message: 'Declare this group in the day supersets array.' }) })
})
const groupedPlan = z.object({ name: daySchema.shape.name, durationWeeks: positiveInteger, trainingDaysPerWeek: z.number().int().min(1).max(7), days: z.array(groupedDay).min(1).max(7) }).strict()
const validateDayCount = (plan: { days: unknown[]; trainingDaysPerWeek: number }, context: z.RefinementCtx) => {
  if (plan.days.length !== plan.trainingDaysPerWeek) context.addIssue({ code: 'custom', path: ['days'], message: 'Workout count must equal trainingDaysPerWeek.' })
}
export const v2InterchangeSchema = z.discriminatedUnion('kind', [
  z.object({ schemaVersion: z.literal(2), kind: z.literal('workout'), workout: interchangeExerciseSchema }).strict(),
  z.object({ schemaVersion: z.literal(2), kind: z.literal('plan'), plan: groupedPlan.superRefine(validateDayCount) }).strict(),
])
export const v3InterchangeSchema = z.discriminatedUnion('kind', [
  z.object({ schemaVersion: z.literal(3), kind: z.literal('workout'), workout: interchangeExerciseSchema }).strict(),
  z.object({ schemaVersion: z.literal(3), kind: z.literal('plan'), plan: groupedPlan.extend({ instructions: planInstructionsSchema }).superRefine(validateDayCount) }).strict(),
])
const v4Exercise = interchangeExerciseSchema.extend({ notes: z.string().max(20000).optional() })
const v4Day = groupedDay.innerType().extend({ exercises: z.array(v4Exercise.extend({ superset: positiveInteger.nullable().default(null) })).min(1).max(100) }).superRefine((day, context) => {
  const checked = groupedDay.safeParse({ ...day, exercises: day.exercises.map(({ notes: _notes, ...exercise }) => exercise) })
  if (!checked.success) checked.error.issues.forEach((issue) => context.addIssue(issue))
})
const v4Week = z.object({ trainingDaysPerWeek: z.number().int().min(1).max(7), days: z.array(v4Day).min(1).max(7) }).strict().superRefine(validateDayCount)
const v4PlanBase = { name: daySchema.shape.name, instructions: planInstructionsSchema, notes: z.string().max(20000).optional(), durationWeeks: positiveInteger }
export const cycleInterchangePlan = z.discriminatedUnion('mode', [
  z.object({ ...v4PlanBase, mode: z.literal('repeating'), trainingDaysPerWeek: z.number().int().min(1).max(7), days: z.array(v4Day).min(1).max(7) }).strict(),
  z.object({ ...v4PlanBase, mode: z.literal('unique'), uniqueWeekCount: positiveInteger.min(2), weeks: z.array(v4Week).min(2) }).strict(),
]).superRefine((plan, context) => {
  if (plan.mode === 'repeating') validateDayCount(plan, context)
  else {
    if (plan.weeks.length !== plan.uniqueWeekCount) context.addIssue({ code: 'custom', path: ['weeks'], message: 'Week count must equal uniqueWeekCount.' })
    if (plan.durationWeeks % plan.uniqueWeekCount !== 0) context.addIssue({ code: 'custom', path: ['uniqueWeekCount'], message: 'Unique week count must divide durationWeeks evenly.' })
  }
})
export const v4InterchangeSchema = z.discriminatedUnion('kind', [
  z.object({ schemaVersion: z.literal(4), kind: z.literal('workout'), workout: v4Exercise }).strict(),
  z.object({ schemaVersion: z.literal(4), kind: z.literal('plan'), plan: cycleInterchangePlan }).strict(),
])
export const interchangeWorkoutSchema = v4Day.innerType().extend({ instructions: z.string().max(20000).optional(), notes: z.string().max(20000).optional() }).superRefine((day, context) => {
  const { instructions: _instructions, notes: _notes, ...body } = day
  const checked = v4Day.safeParse(body)
  if (!checked.success) checked.error.issues.forEach(issue => context.addIssue(issue))
})
export const currentInterchangeSchema = z.discriminatedUnion('kind', [
  z.object({ schemaVersion: z.literal(5), kind: z.literal('exercise'), exercise: v4Exercise }).strict(),
  z.object({ schemaVersion: z.literal(5), kind: z.literal('workout'), workout: interchangeWorkoutSchema }).strict(),
  z.object({ schemaVersion: z.literal(5), kind: z.literal('plan'), plan: cycleInterchangePlan }).strict(),
])
export const interchangeSchema = z.union([currentInterchangeSchema, v4InterchangeSchema, v3InterchangeSchema, v2InterchangeSchema, legacyInterchangeSchema])
export type Interchange = z.infer<typeof interchangeSchema>
export type InterchangeExercise = z.infer<typeof interchangeExerciseSchema>
export type ImportKind = Interchange['kind']

// Both visible instructions and tests consume these schema-checked examples.
export function interchangeExample(kind: ImportKind): Interchange {
  const exercise = { name: 'Example exercise', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 0, max: 0 } }, { reps: { min: 10, max: 10 }, rir: null }], restBetweenSetsSeconds: 0, restAfterExerciseSeconds: null, instructions: 'Illustrative instructions only.', youtubeUrl: null, tags: ['Example tag'] }
  return interchangeSchema.parse(kind === 'exercise' ? { schemaVersion: 5, kind, exercise } : kind === 'workout' ? { schemaVersion: 5, kind, workout: { name: 'Example workout', exercises: [{ ...exercise, superset: null }], supersets: [] } } : { schemaVersion: 5, kind, plan: { mode: 'repeating', name: 'Example plan', instructions: 'Illustrative plan instructions only.', durationWeeks: 2, trainingDaysPerWeek: 1, days: [{ name: 'Day 1', exercises: [{ ...exercise, superset: null }, { ...exercise, superset: 1 }, { ...exercise, name: 'Second example', superset: 1 }], supersets: [{ number: 1, restBetweenRoundsSeconds: 0, restAfterGroupSeconds: null }] }] } })
}

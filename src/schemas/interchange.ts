import { intervalInterchangeSchema as v7IntervalInterchangeSchema } from './interval-interchange-v7.ts'
export { v7IntervalInterchangeSchema }
import { intervalInterchangeSchema as v6IntervalInterchangeSchema } from './interval-interchange-v6.ts'
export { v6IntervalInterchangeSchema }
import { publicIntervalWorkout, intervalInterchangeSchema } from './interval-interchange.ts'
import { z } from 'zod'
import { strengthInputSchema, range } from './exercise.ts'
import { daySchema, planInstructionsSchema, positiveInteger } from './plan.ts'

// Public data deliberately has no IDs, profile ownership, revisions or provenance.
export const interchangeExerciseSchema = z.object({
  name: strengthInputSchema.shape.name,
  sets: z.array(z.object({ reps: range(1), rir: range(0).nullable().default(null) }).strict()).min(1, 'Add at least one set.').max(100, 'Use at most 100 sets.'),
  restBetweenSetsSeconds: strengthInputSchema.shape.restBetweenSeconds.unwrap().nullable().default(null),
  restAfterExerciseSeconds: strengthInputSchema.shape.restAfterSeconds.unwrap().nullable().default(null),
  instructions: strengthInputSchema.shape.instructions.unwrap().default(''),
  youtubeUrl: strengthInputSchema.shape.tutorialUrl.unwrap().nullable().default(null),
  tags: strengthInputSchema.shape.tagNames.default([]),
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
export const interchangeGroupSchema = z.object({ number: positiveInteger, restBetweenRoundsSeconds: strengthInputSchema.shape.restBetweenSeconds.unwrap().nullable().default(null), restAfterGroupSeconds: strengthInputSchema.shape.restAfterSeconds.unwrap().nullable().default(null) }).strict()
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
const strengthWeek = z.object({ trainingDaysPerWeek: z.number().int().min(1).max(7), days: z.array(interchangeWorkoutSchema).min(1).max(7) }).strict().superRefine(validateDayCount)
const strengthPlan = z.discriminatedUnion('mode', [
  z.object({ ...v4PlanBase, mode: z.literal('repeating'), trainingDaysPerWeek: z.number().int().min(1).max(7), days: z.array(interchangeWorkoutSchema).min(1).max(7) }).strict(),
  z.object({ ...v4PlanBase, mode: z.literal('unique'), uniqueWeekCount: positiveInteger.min(2), weeks: z.array(strengthWeek).min(2) }).strict(),
]).superRefine((plan, context) => {
  if (plan.mode === 'repeating') validateDayCount(plan, context)
  else {
    if (plan.weeks.length !== plan.uniqueWeekCount) context.addIssue({ code: 'custom', path: ['weeks'], message: 'Week count must equal uniqueWeekCount.' })
    if (plan.durationWeeks % plan.uniqueWeekCount !== 0) context.addIssue({ code: 'custom', path: ['uniqueWeekCount'], message: 'Unique week count must divide durationWeeks evenly.' })
  }
})
export const strengthInterchangeSchema = z.discriminatedUnion('kind', [
  currentInterchangeSchema.options[0].extend({ schemaVersion: z.literal(6), trainingType: z.literal('strength') }),
  currentInterchangeSchema.options[1].extend({ schemaVersion: z.literal(6), trainingType: z.literal('strength') }),
  currentInterchangeSchema.options[2].extend({ schemaVersion: z.literal(6), trainingType: z.literal('strength'), plan: strengthPlan }),
])
export const v7StrengthInterchangeSchema = z.discriminatedUnion('kind', [strengthInterchangeSchema.options[0].extend({ schemaVersion: z.literal(7) }), strengthInterchangeSchema.options[1].extend({ schemaVersion: z.literal(7) }), strengthInterchangeSchema.options[2].extend({ schemaVersion: z.literal(7) })])
export const v8StrengthInterchangeSchema = z.discriminatedUnion('kind', [v7StrengthInterchangeSchema.options[0].extend({ schemaVersion: z.literal(8) }), v7StrengthInterchangeSchema.options[1].extend({ schemaVersion: z.literal(8) }), v7StrengthInterchangeSchema.options[2].extend({ schemaVersion: z.literal(8) })])
// v9 keeps the public week list but assigns explicit program weeks to each type.
function assignedPlan<T extends z.ZodTypeAny>(day: T) {
  const count = z.number().int().min(1).max(7)
  const days = z.array(day).min(1).max(7)
  return z.discriminatedUnion('mode', [
    z.object({ ...v4PlanBase, mode: z.literal('repeating'), trainingDaysPerWeek: count, days }).strict(),
    z.object({ ...v4PlanBase, mode: z.literal('unique'), uniqueWeekCount: positiveInteger, weeks: z.array(z.object({ programWeeks: z.array(positiveInteger).min(1), trainingDaysPerWeek: count, days }).strict()).min(1) }).strict(),
  ]).superRefine((p, ctx) => {
    if (p.mode === 'repeating') validateDayCount(p,ctx)
    else {
      const assigned = p.weeks.flatMap(w => w.programWeeks)
      if (p.uniqueWeekCount !== p.weeks.length || p.uniqueWeekCount > p.durationWeeks) ctx.addIssue({code:'custom',path:['uniqueWeekCount'],message:'Use 1 through Duration week types and match the weeks count.'})
      if (assigned.length !== p.durationWeeks || new Set(assigned).size !== assigned.length || assigned.some(n => n > p.durationWeeks)) ctx.addIssue({code:'custom',path:['weeks'],message:'Assign every program week exactly once.'})
      p.weeks.forEach((w,i) => { if(w.days.length !== w.trainingDaysPerWeek) ctx.addIssue({code:'custom',path:['weeks',i,'days'],message:'Workout count must equal trainingDaysPerWeek.'}) })
    }
  })
}
export const v9StrengthInterchangeSchema = z.discriminatedUnion('kind', [
  v8StrengthInterchangeSchema.options[0].extend({schemaVersion:z.literal(9)}),
  v8StrengthInterchangeSchema.options[1].extend({schemaVersion:z.literal(9)}),
  v8StrengthInterchangeSchema.options[2].extend({schemaVersion:z.literal(9),plan:assignedPlan(interchangeWorkoutSchema)}),
])
export const v9IntervalInterchangeSchema = z.discriminatedUnion('kind', [
  intervalInterchangeSchema.options[0].extend({schemaVersion:z.literal(9)}),
  intervalInterchangeSchema.options[1].extend({schemaVersion:z.literal(9)}),
  intervalInterchangeSchema.options[2].extend({schemaVersion:z.literal(9),plan:assignedPlan(publicIntervalWorkout)}),
])
const lrExercise = v4Exercise.extend({ lrDistinction: z.boolean().default(false) })
const lrWorkout = interchangeWorkoutSchema.innerType().extend({ exercises: z.array(lrExercise.extend({ superset: positiveInteger.nullable().default(null) })).min(1).max(100) }).superRefine((day, context) => {
  const checked = interchangeWorkoutSchema.safeParse({ ...day, exercises: day.exercises.map(({lrDistinction: _lr, ...e}) => e) })
  if (!checked.success) checked.error.issues.forEach(issue => context.addIssue(issue))
})
export const v10StrengthInterchangeSchema = z.discriminatedUnion('kind', [
  v9StrengthInterchangeSchema.options[0].extend({schemaVersion:z.literal(10),exercise:lrExercise}),
  v9StrengthInterchangeSchema.options[1].extend({schemaVersion:z.literal(10),workout:lrWorkout}),
  v9StrengthInterchangeSchema.options[2].extend({schemaVersion:z.literal(10),plan:assignedPlan(lrWorkout)}),
])
export const v10IntervalInterchangeSchema = z.discriminatedUnion('kind', [
  v9IntervalInterchangeSchema.options[0].extend({schemaVersion:z.literal(10)}),
  v9IntervalInterchangeSchema.options[1].extend({schemaVersion:z.literal(10)}),
  v9IntervalInterchangeSchema.options[2].extend({schemaVersion:z.literal(10)}),
])
export const interchangeSchema = z.union([v10StrengthInterchangeSchema, v10IntervalInterchangeSchema, v9StrengthInterchangeSchema, v9IntervalInterchangeSchema, intervalInterchangeSchema, v7IntervalInterchangeSchema, v8StrengthInterchangeSchema, v6IntervalInterchangeSchema, v7StrengthInterchangeSchema, strengthInterchangeSchema, currentInterchangeSchema, v4InterchangeSchema, v3InterchangeSchema, v2InterchangeSchema, legacyInterchangeSchema])
export type Interchange = z.infer<typeof interchangeSchema>
export type InterchangeExercise = z.infer<typeof interchangeExerciseSchema>
export type ImportKind = Interchange['kind']

// Both visible instructions and tests consume these schema-checked examples.
export function interchangeExample(kind: ImportKind): z.infer<typeof currentInterchangeSchema> {
  const exercise = { name: 'Example exercise', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 0, max: 0 } }, { reps: { min: 10, max: 10 }, rir: null }], restBetweenSetsSeconds: 0, restAfterExerciseSeconds: null, instructions: 'Illustrative instructions only.', youtubeUrl: null, tags: ['Example tag'] }
  return currentInterchangeSchema.parse(kind === 'exercise' ? { schemaVersion: 5, kind, exercise } : kind === 'workout' ? { schemaVersion: 5, kind, workout: { name: 'Example workout', exercises: [{ ...exercise, superset: null }], supersets: [] } } : { schemaVersion: 5, kind, plan: { mode: 'repeating', name: 'Example plan', instructions: 'Illustrative plan instructions only.', durationWeeks: 2, trainingDaysPerWeek: 1, days: [{ name: 'Day 1', exercises: [{ ...exercise, superset: null }, { ...exercise, superset: 1 }, { ...exercise, name: 'Second example', superset: 1 }], supersets: [{ number: 1, restBetweenRoundsSeconds: 0, restAfterGroupSeconds: null }] }] } })
}

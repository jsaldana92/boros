import { z } from 'zod'
import { strengthInputSchema } from './exercise.ts'

const name = strengthInputSchema.shape.name, text = z.string().max(20000).optional()
const duration = z.number().int().min(0).max(86400), count = z.number().int().min(1).max(100)
export const publicIntervalExercise = z.object({ name, activeSeconds: duration.min(1), recoverySeconds: duration, instructions: text, notes: text, youtubeUrl: strengthInputSchema.shape.tutorialUrl.unwrap().nullable().default(null), tags: strengthInputSchema.shape.tagNames.default([]) }).strict()
export const publicCircuit = z.object({ name, exercises: z.array(publicIntervalExercise).min(1).max(100), roundsPerSet: count, sets: count, restBetweenSetsSeconds: duration, restAfterCircuitSeconds: duration }).strict()
export const publicIntervalWorkout = z.object({ name, instructions: text, notes: text, circuits: z.array(publicCircuit).min(1).max(100) }).strict().superRefine((w, ctx) => {
  if (w.circuits.reduce((n, c) => n + c.exercises.length, 0) > 100) ctx.addIssue({ code: 'custom', path: ['circuits'], message: 'Use at most 100 exercises per workout.' })
  if (w.circuits.reduce((n, c) => n + c.exercises.length * c.sets * c.roundsPerSet, 0) > 10000) ctx.addIssue({ code: 'custom', path: ['circuits'], message: 'Use at most 10,000 activities per workout.' })
})
const days = z.array(publicIntervalWorkout).min(1).max(7), trainingDaysPerWeek = z.number().int().min(1).max(7)
const base = { name, instructions: text, notes: text, durationWeeks: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }
export const publicIntervalPlan = z.discriminatedUnion('mode', [
  z.object({ ...base, mode: z.literal('repeating'), trainingDaysPerWeek, days }).strict(),
  z.object({ ...base, mode: z.literal('unique'), uniqueWeekCount: z.number().int().min(2), weeks: z.array(z.object({ trainingDaysPerWeek, days }).strict()).min(2) }).strict(),
]).superRefine((p, ctx) => {
  const check = (w: { days: unknown[]; trainingDaysPerWeek: number }, path: (string | number)[]) => { if (w.days.length !== w.trainingDaysPerWeek) ctx.addIssue({ code: 'custom', path, message: 'Workout count must equal trainingDaysPerWeek.' }) }
  if (p.mode === 'repeating') check(p, ['days'])
  else {
    if (p.uniqueWeekCount !== p.weeks.length || p.durationWeeks % p.uniqueWeekCount) ctx.addIssue({ code: 'custom', path: ['uniqueWeekCount'], message: 'Definition count must match weeks and divide duration evenly.' })
    p.weeks.forEach((w, i) => check(w, ['weeks', i, 'days']))
  }
})
const envelope = { schemaVersion: z.literal(6), trainingType: z.literal('interval') }
export const intervalInterchangeSchema = z.discriminatedUnion('kind', [
  z.object({ ...envelope, kind: z.literal('exercise'), exercise: publicIntervalExercise }).strict(),
  z.object({ ...envelope, kind: z.literal('workout'), workout: publicIntervalWorkout }).strict(),
  z.object({ ...envelope, kind: z.literal('plan'), plan: publicIntervalPlan }).strict(),
])
export type IntervalInterchange = z.infer<typeof intervalInterchangeSchema>

import { createId } from '../lib/browser-crypto.ts'
import { z } from 'zod'
import { strengthInputSchema, exerciseInputSchema, type ExerciseInput } from './exercise.ts'
import { nameKey } from './profile.ts'
import { trainingTypeSchema, trainingTypeOf, type TrainingType } from './training-type.ts'
import { circuitSchema, newCircuit, isRepeatCircuit } from './circuit.ts'

const name = z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.').refine((value) => !!nameKey(value), 'Enter a name.')
export const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exercise'), id: z.string().uuid() }),
  z.object({ kind: z.literal('plan'), id: z.string().uuid(), dayId: z.string().uuid(), occurrenceId: z.string().uuid(), libraryId: z.string().uuid().optional() }),
])
export const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const groupSchema = z.object({ id: z.string().uuid(), number: positiveInteger, restBetweenRoundsSeconds: strengthInputSchema.shape.restBetweenSeconds, restAfterGroupSeconds: strengthInputSchema.shape.restAfterSeconds }).strict()
export const occurrenceSchema = z.object({ id: z.string().uuid(), prescription: exerciseInputSchema, source: sourceSchema.optional(), setIds: z.array(z.string().uuid()).min(1).max(100).optional(), templateId: z.string().uuid().optional(), groupId: z.string().uuid().optional() })
// Optional fields intentionally remain absent in legacy records; no rewrite/default duration.
export const daySchema = z.object({ postWorkoutRestSeconds: z.number().int().nonnegative().max(86400).optional(), trainingType: trainingTypeSchema.optional(), circuits: z.array(circuitSchema).min(1).max(10000).optional(), publishedWorkoutId: z.string().uuid().optional(), id: z.string().uuid(), name, instructions: z.string().max(20000).optional(), notes: z.string().max(20000).optional(), sourceWorkoutId: z.string().uuid().optional(), groups: z.array(groupSchema).max(50).optional(), exercises: z.array(occurrenceSchema).min(1, 'Add at least one exercise to this workout.').max(10000, 'Use at most 10,000 stored exercise occurrences.') })
export function validateGroups(day: z.infer<typeof daySchema>, context: z.RefinementCtx, prefix: (string | number)[] = []) {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: 'custom', path: [...prefix, ...path], message })
  day.exercises.forEach((item, i) => { if (trainingTypeOf(item.prescription) !== trainingTypeOf(day)) issue(['exercises', i, 'prescription', 'trainingType'], 'Every exercise must match the workout training type.') })
  if (day.trainingType === 'interval') {
    if (day.groups?.length || day.exercises.some(e => e.groupId || e.setIds?.length)) issue(['groups'], 'Interval circuits cannot contain Strength supersets or sets.')
    if (!day.circuits?.length) issue(['circuits'], 'Add at least one circuit.')
    if (day.circuits?.flatMap(c => c.exerciseIds).join() !== day.exercises.map(e => e.id).join()) issue(['circuits'], 'Every exercise must belong to exactly one ordered circuit.')
    const positions = (day.circuits ?? []).reduce((sum, c) => sum + c.exerciseIds.length * (isRepeatCircuit(c) ? c.repeat + 1 : c.sets * c.roundsPerSet), 0)
    if (positions > 10000) issue(['circuits'], 'Use at most 10,000 timed activities per workout.')
    return
  }
  if (day.postWorkoutRestSeconds !== undefined) issue(['postWorkoutRestSeconds'], 'Post-workout rest is an Interval field.')
  if (day.circuits !== undefined) issue(['circuits'], 'Strength workouts cannot contain Interval circuits.')
  if (day.exercises.length > 100) issue(['exercises'], 'Use at most 100 Strength exercises per workout.')
  const groups = day.groups ?? [], ids = new Set<string>(), numbers = new Set<number>()
  groups.forEach((group, index) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', path: [...prefix, 'groups', index], message })
    if (ids.has(group.id) || numbers.has(group.number)) issue('Superset IDs and numbers must be unique within a workout.')
    ids.add(group.id); numbers.add(group.number)
    const positions = day.exercises.flatMap((item, i) => item.groupId === group.id ? [i] : [])
    if (positions.length < 2) issue(`Superset ${group.number} needs at least two members. Add a member or dissolve the group.`)
    if (positions.length && positions.at(-1)! - positions[0] + 1 !== positions.length) issue(`Superset ${group.number} members must be together in execution order.`)
  })
  day.exercises.forEach((item, i) => { if (item.groupId && !ids.has(item.groupId)) context.addIssue({ code: 'custom', path: [...prefix, 'exercises', i, 'groupId'], message: 'Superset membership must reference a group in this workout.' }) })
}
export const planInstructionsSchema = z.string().max(20000).optional()
export const planInstructionsSnapshot = (instructions?: string) => instructions === undefined ? {} : { planInstructions: instructions }
export const weekSchema = z.object({ id: z.string().uuid(), dayIds: z.array(z.string().uuid()).min(1).max(7) }).strict()
export type UniqueWeek = z.infer<typeof weekSchema>
export interface WeeklyStructure { days: TrainingDay[]; weeks?: UniqueWeek[] }
export function uniqueWeekCounts(duration: number): number[] {
  if (!Number.isSafeInteger(duration) || duration < 2) return []
  const values = new Set([duration])
  for (let n = 2; n <= Math.sqrt(duration); n++) if (duration % n === 0) { values.add(n); values.add(duration / n) }
  return [...values].sort((a, b) => a - b)
}
// Flattened snapshots retain existing day/source references. Definitions own an
// ordered partition of those days; no duplicated Week 1/global day-count value.
export function planWeeks(source: WeeklyStructure) {
  return source.weeks ? source.weeks.map((week) => ({ id: week.id, days: week.dayIds.map((id) => source.days.find((day) => day.id === id)!) })) : [{ id: undefined, days: source.days }]
}
export function resolveWeek(source: WeeklyStructure, programWeek: number) {
  if (!Number.isSafeInteger(programWeek) || programWeek < 1) throw new Error('Choose a positive program week.')
  const definitions = planWeeks(source)
  return definitions[(programWeek - 1) % definitions.length]
}
export const planInputSchema = z.object({ trainingType: trainingTypeSchema.optional(), name, instructions: planInstructionsSchema, notes: z.string().max(20000).optional(), durationWeeks: positiveInteger.optional(), weeks: z.array(weekSchema).min(2).optional(), days: z.array(daySchema).min(1, 'Add at least one workout.') }).superRefine((plan, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: 'custom', path, message })
  if (plan.weeks) {
    if (!plan.durationWeeks || plan.durationWeeks % plan.weeks.length !== 0) issue(['weeks'], 'Choose a unique-week count that divides the duration evenly.')
    if (plan.weeks.map((week) => week.dayIds).flat().join() !== plan.days.map((day) => day.id).join()) issue(['weeks'], 'Every workout must belong to exactly one ordered week.')
  } else if (plan.days.length > 7) issue(['days'], 'Use at most 7 workouts.')
  const ids = new Set<string>()
  const add = (id: string, path: (string | number)[]) => { if (ids.has(id)) issue(path, 'Each week, workout, group, exercise and set needs a unique ID.'); ids.add(id) }
  plan.weeks?.forEach((week, index) => add(week.id, ['weeks', index, 'id']))
  plan.days.forEach((day, index) => {
    if (trainingTypeOf(day) !== trainingTypeOf(plan)) issue(['days', index, 'trainingType'], 'Every workout must match the plan training type.')
    day.circuits?.forEach((c, i) => add(c.id, ['days', index, 'circuits', i, 'id']))
    validateGroups(day, context, ['days', index]); add(day.id, ['days', index, 'id'])
    day.groups?.forEach((group, i) => add(group.id, ['days', index, 'groups', i, 'id']))
    day.exercises.forEach((exercise, i) => {
      add(exercise.id, ['days', index, 'exercises', i, 'id'])
      if (exercise.setIds && exercise.setIds.length !== exercise.prescription.sets.length) issue(['days', index, 'exercises', i, 'setIds'], 'Set identities must match the prescription.')
      exercise.setIds?.forEach((id, n) => add(id, ['days', index, 'exercises', i, 'setIds', n]))
      if (plan.weeks && trainingTypeOf(day) === 'strength' && !exercise.setIds) issue(['days', index, 'exercises', i, 'setIds'], 'Each set requires a stable identity.')
    })
  })
})
export type PlanInput = z.infer<typeof planInputSchema>
export type TrainingDay = z.infer<typeof daySchema>
export type PlanExercise = TrainingDay['exercises'][number]
export type ExerciseSource = z.infer<typeof sourceSchema>
export interface Plan extends PlanInput {
  id: string; profileId: string; nameKey: string; activeNameKey?: string
  revision: number; createdAt: string; updatedAt: string; archivedAt?: string
}
export const newDay = (number: number, trainingType: TrainingType = 'strength'): TrainingDay => ({ trainingType, ...(trainingType === 'interval' ? { circuits: [newCircuit(1)] } : {}), id: createId(), name: `Day ${number}`, exercises: [] })
export const copyExercise = (prescription: ExerciseInput, source?: ExerciseSource): PlanExercise => ({ id: createId(), prescription: structuredClone(prescription), ...(source ? { source: structuredClone(source) } : {}) })
export const planToInput = (plan: Plan): PlanInput => ({ trainingType: trainingTypeOf(plan), name: plan.name, ...(plan.instructions === undefined ? {} : { instructions: plan.instructions }), ...(plan.notes === undefined ? {} : { notes: plan.notes }), ...(plan.durationWeeks === undefined ? {} : { durationWeeks: plan.durationWeeks }), ...(plan.weeks ? { weeks: structuredClone(plan.weeks) } : {}), days: structuredClone(plan.days) })
export type Superset = z.infer<typeof groupSchema>
export function trainingBlocks(day: TrainingDay) {
  const seen = new Set<string>()
  return day.exercises.flatMap((exercise) => {
    if (!exercise.groupId) return [{ id: exercise.id, group: undefined as Superset | undefined, members: [exercise] }]
    if (seen.has(exercise.groupId)) return []
    seen.add(exercise.groupId)
    return [{ id: exercise.groupId, group: day.groups?.find((group) => group.id === exercise.groupId), members: day.exercises.filter((item) => item.groupId === exercise.groupId) }]
  })
}
export const roundCount = (members: PlanExercise[]) => Math.max(...members.map((item) => item.prescription.sets.length))
export function compactGroups(day: TrainingDay): TrainingDay {
  return { ...day, groups: day.groups?.filter((group) => day.exercises.some((item) => item.groupId === group.id)), exercises: trainingBlocks(day).flatMap((block) => block.members) }
}
export function joinGroup(day: TrainingDay, exerciseId: string, number?: number): TrainingDay {
  const next = structuredClone(day), exercise = next.exercises.find((item) => item.id === exerciseId)!
  if (number === undefined) delete exercise.groupId
  else {
    positiveInteger.parse(number)
    next.groups ??= []
    let group = next.groups.find((item) => item.number === number)
    if (!group) { group = { id: createId(), number }; next.groups.push(group) }
    exercise.groupId = group.id
  }
  return compactGroups(next)
}
export function dissolveGroup(day: TrainingDay, id: string): TrainingDay {
  const next = structuredClone(day)
  next.exercises.forEach((item) => { if (item.groupId === id) delete item.groupId })
  return compactGroups(next)
}
export function moveOccurrence(day: TrainingDay, id: string, offset: number): TrainingDay {
  const blocks = trainingBlocks(day), at = blocks.findIndex((block) => block.members.some((item) => item.id === id)), block = blocks[at]
  const member = block.members.findIndex((item) => item.id === id), target = member + offset
  if (block.group && target >= 0 && target < block.members.length) {
    const [moved] = block.members.splice(member, 1); block.members.splice(target, 0, moved)
  } else if (at + offset >= 0 && at + offset < blocks.length) {
    const [moved] = blocks.splice(at, 1); blocks.splice(at + offset, 0, moved)
  }
  return { ...day, exercises: blocks.flatMap((item) => item.members) }
}
export function duplicateDay(day: TrainingDay): TrainingDay {
  const ids = new Map((day.groups ?? []).map((group) => [group.id, createId()]))
  const occurrenceIds = new Map(day.exercises.map(e => [e.id, createId()]))
  return { ...structuredClone(day), publishedWorkoutId: undefined, sourceWorkoutId: day.publishedWorkoutId ?? day.sourceWorkoutId, id: createId(), ...(day.circuits ? { circuits: day.circuits.map(c => ({ ...c, id: createId(), exerciseIds: c.exerciseIds.map(id => occurrenceIds.get(id)!) })) } : {}), groups: day.groups?.map((group) => ({ ...group, id: ids.get(group.id)! })), exercises: day.exercises.map((exercise) => ({ ...copyExercise(exercise.prescription, exercise.source), id: occurrenceIds.get(exercise.id)!, ...(exercise.setIds ? { setIds: exercise.setIds.map(() => createId()) } : {}), ...(exercise.templateId ? { templateId: exercise.templateId } : {}), ...(exercise.groupId ? { groupId: ids.get(exercise.groupId)! } : {}) })) }
}

export const validatedDaySchema = daySchema.superRefine(validateGroups)

export function identifySets(days: TrainingDay[]): TrainingDay[] {
  return days.map((day) => day.trainingType === 'interval' ? day : ({ ...day, exercises: day.exercises.map((exercise) => ({ ...exercise, setIds: exercise.prescription.sets.map((_, index) => exercise.setIds?.[index] ?? createId()) })) }))
}
export function duplicateStructure(source: WeeklyStructure): WeeklyStructure {
  const days = source.days.map(duplicateDay), ids = new Map(source.days.map((day, index) => [day.id, days[index].id]))
  return { days, ...(source.weeks ? { weeks: source.weeks.map((week) => ({ id: createId(), dayIds: week.dayIds.map((id) => ids.get(id)!) })) } : {}) }
}
export const weekSnapshot = (source: WeeklyStructure) => source.weeks ? { weeks: structuredClone(source.weeks) } : {}

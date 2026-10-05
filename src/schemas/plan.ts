import { createId } from '../lib/browser-crypto.ts'
import { z } from 'zod'
import { exerciseInputSchema, type ExerciseInput } from './exercise.ts'
import { nameKey } from './profile.ts'

const name = z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.').refine((value) => !!nameKey(value), 'Enter a name.')
export const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exercise'), id: z.string().uuid() }),
  z.object({ kind: z.literal('plan'), id: z.string().uuid(), dayId: z.string().uuid(), occurrenceId: z.string().uuid(), libraryId: z.string().uuid().optional() }),
])
export const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const groupSchema = z.object({ id: z.string().uuid(), number: positiveInteger, restBetweenRoundsSeconds: exerciseInputSchema.shape.restBetweenSeconds, restAfterGroupSeconds: exerciseInputSchema.shape.restAfterSeconds }).strict()
export const occurrenceSchema = z.object({ id: z.string().uuid(), prescription: exerciseInputSchema, source: sourceSchema.optional(), templateId: z.string().uuid().optional(), groupId: z.string().uuid().optional() })
// Optional fields intentionally remain absent in legacy records; no rewrite/default duration.
export const daySchema = z.object({ id: z.string().uuid(), name, groups: z.array(groupSchema).max(50).optional(), exercises: z.array(occurrenceSchema).min(1, 'Add at least one exercise to this day.').max(100, 'Use at most 100 exercises per day.') })
export function validateGroups(day: z.infer<typeof daySchema>, context: z.RefinementCtx, prefix: (string | number)[] = []) {
  const groups = day.groups ?? [], ids = new Set<string>(), numbers = new Set<number>()
  groups.forEach((group, index) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', path: [...prefix, 'groups', index], message })
    if (ids.has(group.id) || numbers.has(group.number)) issue('Superset IDs and numbers must be unique within a day.')
    ids.add(group.id); numbers.add(group.number)
    const positions = day.exercises.flatMap((item, i) => item.groupId === group.id ? [i] : [])
    if (positions.length < 2) issue(`Superset ${group.number} needs at least two members. Add a member or dissolve the group.`)
    if (positions.length && positions.at(-1)! - positions[0] + 1 !== positions.length) issue(`Superset ${group.number} members must be together in execution order.`)
  })
  day.exercises.forEach((item, i) => { if (item.groupId && !ids.has(item.groupId)) context.addIssue({ code: 'custom', path: [...prefix, 'exercises', i, 'groupId'], message: 'Superset membership must reference a group in this training day.' }) })
}
export const planInstructionsSchema = z.string().max(20000).optional()
export const planInstructionsSnapshot = (instructions?: string) => instructions === undefined ? {} : { planInstructions: instructions }
export const planInputSchema = z.object({ name, instructions: planInstructionsSchema, notes: z.string().max(20000).optional(), durationWeeks: positiveInteger.optional(), days: z.array(daySchema).min(1, 'Add at least one training day.').max(7, 'Use at most 7 training days.') }).superRefine((plan, context) => {
  const ids = new Set<string>()
  plan.days.forEach((day, index) => {
    validateGroups(day, context, ['days', index])
    for (const [id, path] of [[day.id, ['days', index, 'id']], ...(day.groups ?? []).map((group, i) => [group.id, ['days', index, 'groups', i, 'id']]), ...day.exercises.map((exercise, i) => [exercise.id, ['days', index, 'exercises', i, 'id']])] as [string, (string | number)[]][]) {
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
export const newDay = (number: number): TrainingDay => ({ id: createId(), name: `Day ${number}`, exercises: [] })
export const copyExercise = (prescription: ExerciseInput, source?: ExerciseSource): PlanExercise => ({ id: createId(), prescription: structuredClone(prescription), ...(source ? { source: structuredClone(source) } : {}) })
export const planToInput = (plan: Plan): PlanInput => ({ name: plan.name, ...(plan.instructions === undefined ? {} : { instructions: plan.instructions }), ...(plan.notes === undefined ? {} : { notes: plan.notes }), ...(plan.durationWeeks === undefined ? {} : { durationWeeks: plan.durationWeeks }), days: structuredClone(plan.days) })
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
  return { ...structuredClone(day), id: createId(), groups: day.groups?.map((group) => ({ ...group, id: ids.get(group.id)! })), exercises: day.exercises.map((exercise) => ({ ...copyExercise(exercise.prescription, exercise.source), ...(exercise.templateId ? { templateId: exercise.templateId } : {}), ...(exercise.groupId ? { groupId: ids.get(exercise.groupId)! } : {}) })) }
}

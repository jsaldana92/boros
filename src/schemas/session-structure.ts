import { z } from 'zod'
import { createId } from '../lib/browser-crypto.ts'
import { copyExercise, planInputSchema, trainingBlocks, type PlanExercise, type TrainingDay } from './plan.ts'
import { blankSession, type SessionInput } from './session.ts'
import type { WeightUnit } from './profile.ts'
import type { PrescriptionChoice } from '../db/plans.ts'

// Session-only identity and execution order. Plan/AI prescriptions stay unchanged.
export const sessionStructureSchema = z.object({
  amended: z.boolean(),
  exercises: z.array(z.object({ id: z.string().uuid(), sets: z.array(z.object({ id: z.string().uuid(), round: z.number().int().min(1).max(100) }).strict()).min(1).max(100) }).strict()).min(1).max(100),
}).strict()
export type SessionStructure = z.infer<typeof sessionStructureSchema>
export interface SessionSnapshot { day: TrainingDay; structure?: SessionStructure }
export const initialStructure = (day: TrainingDay): SessionStructure => ({ amended: false, exercises: day.exercises.map((e) => ({ id: e.id, sets: e.prescription.sets.map((_, s) => ({ id: e.setIds?.[s] ?? createId(), round: s + 1 })) })) })
export function sessionRounds(members: PlanExercise[], structure?: SessionStructure) {
  const rounds = members.map((member) => structure?.exercises.find((e) => e.id === member.id)?.sets.map((s) => s.round) ?? member.prescription.sets.map((_, s) => s + 1))
  return Array.from({ length: Math.max(...rounds.flat()) }, (_, r) => members.flatMap((member, m) => {
    const index = rounds[m].indexOf(r + 1)
    return index < 0 ? [] : [{ member, index }]
  }))
}
export function validateStructure(day: TrainingDay, structure?: SessionStructure) {
  if (!structure) return
  sessionStructureSchema.parse(structure)
  const ids = new Set<string>()
  if (structure.exercises.length !== day.exercises.length) throw new Error('Session structure does not match its exercises.')
  structure.exercises.forEach((e, i) => {
    if (e.id !== day.exercises[i].id || e.sets.length !== day.exercises[i].prescription.sets.length) throw new Error('Session structure does not match its sets.')
    e.sets.forEach((s, index) => { if (ids.has(s.id) || (index > 0 && s.round <= e.sets[index - 1].round)) throw new Error('Session set identities and rounds must be unique and ordered.'); ids.add(s.id) })
  })
  for (const block of trainingBlocks(day)) if (sessionRounds(block.members, structure).some((round) => !round.length)) throw new Error('Session rounds must not contain empty rounds.')
}
export function validateAmendment(old: SessionSnapshot, next: SessionSnapshot) {
  planInputSchema.parse({ name: 'Session', days: [next.day] }); validateStructure(next.day, next.structure)
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  if (old.day.id !== next.day.id || old.day.name !== next.day.name || !equal(old.day.groups, next.day.groups) || next.day.exercises.length < old.day.exercises.length) throw new Error('A session amendment can only append exercises or sets.')
  old.day.exercises.forEach((e, i) => {
    const updated = next.day.exercises[i]
    if (!equal(e, { ...updated, ...(updated.setIds ? { setIds: updated.setIds.slice(0, e.prescription.sets.length) } : {}), prescription: { ...updated.prescription, sets: updated.prescription.sets.slice(0, e.prescription.sets.length) } })) throw new Error('Existing session prescriptions cannot be replaced.')
    const before = old.structure?.exercises[i], after = next.structure?.exercises[i]
    if (before && (!after || !equal(before.sets, after.sets.slice(0, before.sets.length)))) throw new Error('Existing session set identities cannot change.')
  })
  const changed = !equal(old.day, next.day)
  if ((changed || old.structure?.amended) && !next.structure?.amended) throw new Error('Amended session structure must remain recoverable.')
}
export function appendSessionSets(snapshot: SessionSnapshot, input: SessionInput, blockId: string, unit: WeightUnit) {
  const day = structuredClone(snapshot.day), structure = structuredClone(snapshot.structure ?? initialStructure(day)), next = structuredClone(input)
  const block = trainingBlocks(day).find((b) => b.id === blockId)
  if (!block || block.members.some((m) => m.prescription.sets.length >= 100)) throw new Error('Use at most 100 sets per exercise.')
  const round = sessionRounds(block.members, structure).length + 1
  if (round > 100) throw new Error('Use at most 100 rounds per superset.')
  for (const member of block.members) {
    member.prescription.sets.push(structuredClone(member.prescription.sets.at(-1)!))
    const i = day.exercises.findIndex((e) => e.id === member.id)
    const id = createId()
    member.setIds?.push(id)
    structure.exercises[i].sets.push({ id, round })
    next.exercises[i].sets.push({ load: '', reps: '', rir: '', unit, skipped: false })
  }
  structure.amended = true
  return { day, structure, input: next }
}
export function appendSessionExercises(snapshot: SessionSnapshot, input: SessionInput, choices: PrescriptionChoice[], unit: WeightUnit) {
  const day = structuredClone(snapshot.day), structure = structuredClone(snapshot.structure ?? initialStructure(day)), next = structuredClone(input)
  if (!choices.length || day.exercises.length + choices.length > 100) throw new Error('Use at most 100 exercises per session.')
  const additions = choices.map((choice) => copyExercise(choice.prescription, choice.source))
  day.exercises.push(...additions)
  structure.exercises.push(...initialStructure({ ...day, exercises: additions }).exercises)
  next.exercises.push(...blankSession({ ...day, exercises: additions }, unit).exercises)
  structure.amended = true
  return { day, structure, input: next }
}

import type { SessionStructure } from './session-structure.ts'
import { z } from 'zod'
import type { TrainingDay } from './plan.ts'
import type { OccurrenceRef } from './schedule.ts'
import { displayNumber, fromKg, toKg, weightUnitSchema, type WeightUnit } from './profile.ts'

const text = z.string().max(64)
export const resultInputSchema = z.object({ load: text, reps: text, rir: text, unit: weightUnitSchema, skipped: z.boolean() }).strict()
export const sessionInputSchema = z.object({ notes: z.string().max(20000), exercises: z.array(z.object({ id: z.string().uuid(), notes: z.string().max(20000), sets: z.array(resultInputSchema).min(1).max(100) }).strict()).min(0).max(100) }).strict()
export type ResultInput = z.infer<typeof resultInputSchema>
export type SessionInput = z.infer<typeof sessionInputSchema>
export type StandaloneSource = { kind: 'workout'; workoutId: string } | { kind: 'custom'; workoutId?: string }
export interface SessionDraft {
  source?: StandaloneSource; timeZone?: string
  structure?: SessionStructure
  occurrence?: OccurrenceRef; occurrenceKey?: string
  id: string; profileId: string; revision: number; sourcePlanId?: string; sourceDayId: string; activeSourceKey?: string
  planName?: string; planInstructions?: string; day: TrainingDay; input: SessionInput; startedAt: string; updatedAt: string; finalizedAt?: string
}
export type RecordedSet = { skipped: true } | { skipped: false; weightKg: number; load: number; unit: WeightUnit; reps: number; rir?: number }
export interface CompletedSession {
  source?: StandaloneSource; timeZone?: string
  structure?: SessionStructure
  occurrence?: OccurrenceRef; occurrenceKey?: string
  id: string; draftId: string; profileId: string; revision: number; sourcePlanId?: string; sourceDayId: string
  planName?: string; planInstructions?: string; day: TrainingDay; notes: string; exercises: { id: string; notes: string; sets: RecordedSet[] }[]
  partial: boolean; startedAt: string; completedAt: string; loggedAt: string
}
export type RestTimer = { id: 'active'; token: string; profileId: string; draftId: string; label: string; alertedAt?: string } & ({ mode?: 'countdown'; durationSeconds: number; endAt: string } | { mode: 'countup'; startedAt: string })
export const blankSession = (day: TrainingDay, unit: WeightUnit): SessionInput => ({ notes: '', exercises: day.exercises.map((exercise) => ({ id: exercise.id, notes: '', sets: exercise.prescription.sets.map(() => ({ load: '', reps: '', rir: '', unit, skipped: false })) })) })
// Deliberate zero and explicit skips count; timer state and visual hints never do.
export const hasSessionInput = (input: SessionInput) => !!input.notes || input.exercises.some((exercise) => !!exercise.notes || exercise.sets.some((set) => set.load !== '' || set.reps !== '' || set.rir !== '' || set.skipped))
export const hasDraftProgress = (draft: SessionDraft) => !!draft.structure?.amended || hasSessionInput(draft.input)
export const timerElapsed = (timer: RestTimer, now = Date.now()) => timer.mode === 'countup' ? Math.max(0, Math.floor((now - Date.parse(timer.startedAt)) / 1000)) : 0
export function validateDraftInput(raw: SessionInput, day: TrainingDay) {
  const input = sessionInputSchema.parse(raw)
  if (input.exercises.length !== day.exercises.length || input.exercises.some((exercise, index) => exercise.id !== day.exercises[index].id || exercise.sets.length !== day.exercises[index].prescription.sets.length)) throw new Error('Results must match the saved prescription. Nothing was saved.')
  return input
}
export function numericResult(text: string, integer = false): number | undefined {
  if (!text.trim() || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim())) return undefined
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER && (!integer || Number.isSafeInteger(value)) ? value : undefined
}
export function displayedLoad(set: ResultInput, unit: WeightUnit) {
  const load = numericResult(set.load)
  return set.unit === unit || load === undefined ? set.load : displayNumber(fromKg(toKg(load, set.unit), unit))
}
export function assessSession(input: SessionInput) {
  const errors: Record<string, string> = {}; let recorded = 0, skipped = 0
  const exercises = input.exercises.map((exercise, e) => ({ id: exercise.id, notes: exercise.notes, sets: exercise.sets.map((set, s): RecordedSet => {
    const path = `${e}.${s}`
    if (set.skipped || (!set.load.trim() && !set.reps.trim() && !set.rir.trim())) { skipped++; return { skipped: true } }
    const load = numericResult(set.load), reps = numericResult(set.reps, true), rir = numericResult(set.rir, true)
    if (load === undefined) errors[`${path}.load`] = 'Enter a nonnegative load, including 0, or explicitly skip this set.'
    if (reps === undefined) errors[`${path}.reps`] = 'Enter whole repetitions, including 0, or explicitly skip this set.'
    if (set.rir.trim() && rir === undefined) errors[`${path}.rir`] = 'RIR must be a nonnegative whole number, or blank.'
    if (load === undefined || reps === undefined || (set.rir.trim() && rir === undefined)) return { skipped: true }
    recorded++; return { skipped: false, weightKg: toKg(load, set.unit), load, unit: set.unit, reps, ...(rir === undefined ? {} : { rir }) }
  }) }))
  return { errors, recorded, skipped, exercises }
}
export const timerRemaining = (timer: RestTimer, now = Date.now()) => timer.mode === 'countup' ? 0 : Math.max(0, Math.ceil((Date.parse(timer.endAt) - now) / 1000))
export function timerEnd(duration: number, now = Date.now()) {
  z.number().finite().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(duration)
  const end = new Date(now + duration * 1000)
  if (!Number.isFinite(end.getTime())) throw new Error('This duration is too large for a timer.')
  return end.toISOString()
}

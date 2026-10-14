import { meaningfulInterval, type IntervalState } from './interval-session.ts'
import type { SessionStructure } from './session-structure-v14.ts'
import { z } from 'zod'
import type { TrainingDay } from './plan-v14.ts'
import type { OccurrenceRef } from './schedule.ts'
import { displayNumber, fromKg, toKg, weightUnitSchema, type WeightUnit } from './profile.ts'

export const noteInputFields = { noteInheritedClear: z.boolean().optional(), noteInitial: z.string().max(20000).optional(), noteEdited: z.boolean().optional() }
const text = z.string().max(64)
export const resultInputSchema = z.object({ load: text, reps: text, rir: text, unit: weightUnitSchema, skipped: z.boolean() }).strict()
export const sessionInputSchema = z.object({ ...noteInputFields, notes: z.string().max(20000), exercises: z.array(z.object({ ...noteInputFields, id: z.string().uuid(), notes: z.string().max(20000), sets: z.array(resultInputSchema).min(0).max(100) }).strict()).min(0).max(10000) }).strict()
export type ResultInput = z.infer<typeof resultInputSchema>
export type SessionInput = z.infer<typeof sessionInputSchema>
export type StandaloneSource = { kind: 'workout'; workoutId: string } | { kind: 'custom'; workoutId?: string }
export interface SessionDraft {
  interval?: IntervalState
  source?: StandaloneSource; timeZone?: string
  prunedAt?: string
  structure?: SessionStructure
  occurrence?: OccurrenceRef; occurrenceKey?: string
  id: string; profileId: string; revision: number; sourcePlanId?: string; sourceDayId: string; activeSourceKey?: string
  planName?: string; planInstructions?: string; planNotes?: string; day: TrainingDay; input: SessionInput; startedAt: string; updatedAt: string; finalizedAt?: string
}
export type RecordedSet = { skipped: true } | { skipped: false; weightKg: number; load: number; unit: WeightUnit; reps: number; rir?: number }
export interface CompletedSession {
  interval?: IntervalState
  source?: StandaloneSource; timeZone?: string
  prunedAt?: string
  structure?: SessionStructure
  occurrence?: OccurrenceRef; occurrenceKey?: string
  id: string; draftId: string; profileId: string; revision: number; sourcePlanId?: string; sourceDayId: string
  planName?: string; planInstructions?: string; planNotes?: string; day: TrainingDay; notes: string; noteEdited?: boolean; exercises: { id: string; notes: string; noteEdited?: boolean; sets: RecordedSet[] }[]
  partial: boolean; startedAt: string; completedAt: string; loggedAt: string
}
export type RestTimer = { preparationEndAt?: string; pausedAt?: string; id: 'active'; token: string; profileId: string; draftId: string; label: string; position?: string; exerciseId?: string; groupId?: string; alertedAt?: string } & ({ mode?: 'countdown'; durationSeconds: number; endAt: string } | { mode: 'countup'; startedAt: string })
export const blankSession = (day: TrainingDay, unit: WeightUnit): SessionInput => ({ notes: '', exercises: day.exercises.map((exercise) => ({ id: exercise.id, notes: '', sets: exercise.prescription.sets.map(() => ({ load: '', reps: '', rir: '', unit, skipped: false })) })) })
// Only newly appended/replaced occurrences take copied defaults. Clear remains
// deliberately blank, and existing draft notes are never reinitialized.
export function copiedExerciseInputs(day: TrainingDay, unit: WeightUnit) {
  return blankSession(day, unit).exercises.map((input, index) => {
    const source = day.exercises[index].prescription, notes = source.notes ?? ''
    return notes || source.noteOverride === true ? { ...input, notes, noteInitial: notes, noteEdited: false, noteInheritedClear: !notes && source.noteOverride === true } : input
  })
}
// Deliberate zero and explicit skips count; timer state and visual hints never do.
export const noteWasEdited = (value: { notes: string; noteInitial?: string; noteEdited?: boolean }) => !!value.noteEdited || value.notes !== (value.noteInitial ?? '')
export const hasSessionInput = (input: SessionInput) => noteWasEdited(input) || input.exercises.some((exercise) => noteWasEdited(exercise) || exercise.sets.some((set) => set.load !== '' || set.reps !== '' || set.rir !== '' || set.skipped))
export const hasDraftProgress = (draft: SessionDraft) => !!draft.structure?.amended || meaningfulInterval(draft.interval) || !!draft.interval?.results.length || !!draft.interval?.activity?.attempts.some(a => a.results.some(r => r.elapsedMs > 0 || r.status === 'skipped')) || hasSessionInput(draft.input)
// A rest checkpoint can be reopened without treating it as performed exercise
// or changing the empty-session leave/Save rules.
export const hasResumableDraft = (draft: SessionDraft) => hasDraftProgress(draft) || draft.interval?.execution?.mode === 'rest' && (draft.interval.status === 'running' || draft.interval.status === 'paused')
export const timerElapsed = (timer: RestTimer, now = Date.now()) => timer.mode === 'countup' ? Math.max(0, Math.floor(((timer.pausedAt ? Date.parse(timer.pausedAt) : now) - Date.parse(timer.startedAt)) / 1000)) : 0
export function validateDraftInput(raw: SessionInput, day: TrainingDay) {
  const input = sessionInputSchema.parse(raw)
  if (input.exercises.length !== day.exercises.length || input.exercises.some((exercise, index) => exercise.id !== day.exercises[index].id || exercise.sets.length !== day.exercises[index].prescription.sets.length)) throw new Error('Results must match the saved prescription. Nothing was saved.')
  for (const note of [input, ...input.exercises]) if (note.noteInitial && note.notes === '') note.noteEdited = true
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
  const exercises = input.exercises.map((exercise, e) => ({ id: exercise.id, notes: exercise.notes, ...(exercise.noteEdited === undefined ? {} : { noteEdited: exercise.noteEdited || !!exercise.noteInheritedClear && exercise.notes === '' }), sets: exercise.sets.map((set, s): RecordedSet => {
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
export const timerRemaining = (timer: RestTimer, now = Date.now()) => timer.mode === 'countup' ? 0 : Math.max(0, Math.ceil((Date.parse(timer.endAt) - (timer.pausedAt ? Date.parse(timer.pausedAt) : now)) / 1000))
export function timerEnd(duration: number, now = Date.now()) {
  z.number().finite().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(duration)
  const end = new Date(now + duration * 1000)
  if (!Number.isFinite(end.getTime())) throw new Error('This duration is too large for a timer.')
  return end.toISOString()
}

export const preparationRemaining = (timer: RestTimer, now = Date.now()) => timer.preparationEndAt ? Math.max(0, Math.ceil((Date.parse(timer.preparationEndAt) - (timer.pausedAt ? Date.parse(timer.pausedAt) : now)) / 1000)) : 0

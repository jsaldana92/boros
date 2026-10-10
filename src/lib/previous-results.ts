import { displayNumber, fromKg, type WeightUnit } from '../schemas/profile.ts'
import type { CompletedSession, RecordedSet, SessionDraft } from '../schemas/session.ts'
import type { PlanExercise } from '../schemas/plan.ts'
import { exerciseResolver, type ExerciseIdentity } from './exercise-identity.ts'
import { templateReference } from './template-ownership.ts'
import { ordinal } from './ordinal.ts'

export type ResultHints = Record<string, ({ load: string; reps: string; rir?: string } | undefined)[]>
export interface ExercisePerformance { session: CompletedSession; exercise: PlanExercise; sets: RecordedSet[] }
const rangeKey = (range?: { min: number; max: number }) => range ? `${range.min}:${range.max}` : 'missing'
export const sameTarget = (a: PlanExercise['prescription']['sets'][number], b?: PlanExercise['prescription']['sets'][number]) => !!b && rangeKey(a.reps) === rangeKey(b.reps) && rangeKey(a.rir) === rangeKey(b.rir)
const sameDefinition = (draft: SessionDraft, session: CompletedSession) => draft.sourcePlanId
  ? draft.sourcePlanId === session.sourcePlanId && draft.sourceDayId === session.sourceDayId
  : !!draft.source?.workoutId && draft.source.workoutId === session.source?.workoutId

export function exerciseHistory(draft: SessionDraft, sessions: CompletedSession[], identities: ExerciseIdentity[] = []) {
  const resolve = exerciseResolver(draft.profileId, identities)
  const identity = (e: PlanExercise) => {
    const ref = templateReference(e)
    return ref ? `exercise:${resolve(ref)}` : e.source?.kind === 'plan' ? `plan:${e.source.id}:${e.source.dayId}:${e.source.occurrenceId}` : `occurrence:${e.id}`
  }
  const performances = sessions.filter(s => s.profileId === draft.profileId && s.id !== draft.id && s.day.trainingType !== 'interval').flatMap(session => session.day.exercises.flatMap(exercise => {
    const sets = session.exercises.find(e => e.id === exercise.id)?.sets
    return sets?.some(s => !s.skipped) ? [{ session, exercise, sets }] : []
  })).sort((a,b) => b.session.completedAt.localeCompare(a.session.completedAt) || b.session.loggedAt.localeCompare(a.session.loggedAt) || b.session.id.localeCompare(a.session.id) || b.exercise.id.localeCompare(a.exercise.id))
  return (exercise: PlanExercise) => performances.filter(p => identity(p.exercise) === identity(exercise))
}

export function previousResults(draft: SessionDraft, sessions: CompletedSession[], unit: WeightUnit, identities: ExerciseIdentity[] = []): ResultHints {
  const history = exerciseHistory(draft, sessions, identities)
  return Object.fromEntries(draft.day.exercises.map(exercise => {
    const all = history(exercise)
    const candidates = (draft.sourcePlanId
      ? draft.occurrence ? all.filter(p => p.session.sourcePlanId === draft.sourcePlanId && p.session.occurrence?.scheduleId === draft.occurrence!.scheduleId) : []
      : all.slice(0, 2))
      // Never substitute a sibling from the same definition, even for equal targets.
      .filter(p => !sameDefinition(draft, p.session) || p.exercise.id === exercise.id)
    return [exercise.id, exercise.prescription.sets.map((target, at) => {
      for (const p of candidates) {
        if (!sameTarget(target, p.exercise.prescription.sets[at])) continue
        const set = p.sets[at]
        if (set && !set.skipped) return { load: displayNumber(fromKg(set.weightKg, unit)), reps: String(set.reps), ...(set.rir === undefined ? {} : { rir: String(set.rir) }) }
      }
      return undefined
    })]
  }))
}

export function instructionHistory(draft: SessionDraft, exercise: PlanExercise, sessions: CompletedSession[], identities: ExerciseIdentity[] = []): ExercisePerformance[] {
  const all = exerciseHistory(draft, sessions, identities)(exercise)
  if (!draft.sourcePlanId) return all.slice(0, 2)
  const plan = all.find(p => p.session.sourcePlanId === draft.sourcePlanId)
  if (!plan) return all.slice(0, 2)
  const prescribed = exercise.prescription.sets, old = plan.exercise.prescription.sets
  return prescribed.length !== old.length || prescribed.some((set,i) => !sameTarget(set, old[i])) ? [plan] : []
}
export function historyLine(set: Exclude<RecordedSet, { skipped: true }>, unit: WeightUnit) {
  return `${displayNumber(fromKg(set.weightKg, unit))} ${unit} x ${set.reps} reps${set.rir === undefined ? '' : ` with ${set.rir === 0 ? '0' : ordinal(set.rir)} RIR`}`
}

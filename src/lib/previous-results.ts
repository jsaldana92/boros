import { displayNumber, fromKg, type WeightUnit } from '../schemas/profile.ts'
import type { CompletedSession, RecordedSet, SessionDraft } from '../schemas/session.ts'
import type { PlanExercise } from '../schemas/plan.ts'
import { exerciseResolver, type ExerciseIdentity } from './exercise-identity.ts'
import { workoutResolver, type WorkoutIdentity } from './workout-identity.ts'
import { templateReference } from './template-ownership.ts'
import { actualSide, lrMode, recordedRows, type RecordedSide } from '../schemas/strength-results.ts'
import { ordinal } from './ordinal.ts'

export type SideHints = { load?: string; reps?: string; rir?: string }
export type SetHints = SideHints & { sides?: { left?: SideHints; right?: SideHints } }
export type ResultHints = Record<string, (SetHints | undefined)[]>
export interface ExercisePerformance { session: CompletedSession; exercise: PlanExercise; sets: RecordedSet[] }
const rangeKey = (range?: { min: number; max: number }) => range ? `${range.min}:${range.max}` : 'missing'
export const sameTarget = (a: PlanExercise['prescription']['sets'][number], b?: PlanExercise['prescription']['sets'][number]) => !!b && rangeKey(a.reps) === rangeKey(b.reps) && rangeKey(a.rir) === rangeKey(b.rir)
export const samePrescription = (a: PlanExercise, b: PlanExercise) => lrMode(a.prescription) === lrMode(b.prescription) && a.prescription.sets.length === b.prescription.sets.length && a.prescription.sets.every((s,i) => sameTarget(s,b.prescription.sets[i]))
function matching(draft: SessionDraft, identities: ExerciseIdentity[], workouts: WorkoutIdentity[]) {
  const resolve = exerciseResolver(draft.profileId, identities), workout = workoutResolver(draft.profileId, workouts)
  const identity = (e: PlanExercise) => {
    const ref = templateReference(e)
    return ref ? `exercise:${resolve(ref)}` : e.source?.kind === 'plan' ? `plan:${e.source.id}:${e.source.dayId}:${e.source.occurrenceId}` : `occurrence:${e.id}`
  }
  const context = (session: CompletedSession) => {
    if (draft.sourcePlanId !== session.sourcePlanId) return false
    if (draft.source?.kind === 'custom' || session.source?.kind === 'custom') return draft.source?.kind === 'custom' && session.source?.kind === 'custom' && (!draft.sourcePlanId || draft.occurrence?.scheduleId === session.occurrence?.scheduleId)
    if (draft.sourcePlanId) return draft.sourceDayId === session.sourceDayId && draft.occurrence?.scheduleId === session.occurrence?.scheduleId
    return draft.source?.kind === 'workout' && session.source?.kind === 'workout' && workout(draft.source.workoutId) === workout(session.source.workoutId)
  }
  const slot = (exercise: PlanExercise, p: ExercisePerformance) => {
    if (exercise.id === p.exercise.id) return true
    // Custom sessions have fresh IDs. A deliberate workout merge can also join
    // two definitions. Only an unambiguous single canonical occurrence may match.
    const fresh = draft.source?.kind === 'custom' || !draft.sourcePlanId && draft.source?.workoutId !== p.session.source?.workoutId
    return fresh && !!templateReference(exercise) && draft.day.exercises.filter(e => identity(e) === identity(exercise)).length === 1 && p.session.day.exercises.filter(e => identity(e) === identity(exercise)).length === 1
  }
  return { identity, context, slot }
}
export function exerciseHistory(draft: SessionDraft, sessions: CompletedSession[], identities: ExerciseIdentity[] = []) {
  const { identity } = matching(draft,identities,[])
  const performances = sessions.filter(s => s.profileId === draft.profileId && s.id !== draft.id && s.draftId !== draft.id && s.day.trainingType !== 'interval').flatMap(session => session.day.exercises.flatMap(exercise => {
    const sets = session.exercises.find(e => e.id === exercise.id)?.sets
    return sets?.some(s => recordedRows(s).some(r => actualSide(r.result))) ? [{ session, exercise, sets }] : []
  })).sort((a,b) => Date.parse(b.session.completedAt) - Date.parse(a.session.completedAt) || b.session.id.localeCompare(a.session.id) || b.exercise.id.localeCompare(a.exercise.id))
  const unique = [...new Map(performances.map(p => [`${p.session.id}:${p.exercise.id}`,p])).values()]
  return (exercise: PlanExercise) => unique.filter(p => identity(p.exercise) === identity(exercise))
}
function selection(draft: SessionDraft, exercise: PlanExercise, sessions: CompletedSession[], identities: ExerciseIdentity[], workouts: WorkoutIdentity[]) {
  const all = exerciseHistory(draft,sessions,identities)(exercise), {context,slot} = matching(draft,identities,workouts)
  const contextual = all.filter(p => context(p.session))
  // Legacy plan-only logs lack a reset/run boundary and cannot supply hints.
  const hint = draft.sourcePlanId && !draft.occurrence ? undefined : contextual.find(p => slot(exercise,p) && samePrescription(exercise,p.exercise))
  const history = [...contextual,...all.filter(p => !contextual.includes(p))].slice(0,2)
  if (hint && !history.includes(hint)) history.splice(1,1,hint)
  return { hint, history }
}
export function previousResults(draft: SessionDraft, sessions: CompletedSession[], unit: WeightUnit, identities: ExerciseIdentity[] = [], workouts: WorkoutIdentity[] = []): ResultHints {
  const values = (set?: RecordedSide): SideHints | undefined => !set || set.skipped ? undefined : { ...(set.weightKg === undefined ? {} : {load:displayNumber(fromKg(set.weightKg,unit))}), ...(set.reps === undefined ? {} : {reps:String(set.reps)}), ...(set.rir === undefined ? {} : {rir:String(set.rir)}) }
  return Object.fromEntries(draft.day.exercises.map(exercise => {
    const {hint} = selection(draft,exercise,sessions,identities,workouts)
    return [exercise.id,exercise.prescription.sets.map((_,i) => { const set=hint?.sets[i];return !set ? undefined : 'sides' in set ? {sides:{left:values(set.sides.left),right:values(set.sides.right)}} : values(set) })]
  }))
}
export function instructionHistory(draft: SessionDraft, exercise: PlanExercise, sessions: CompletedSession[], identities: ExerciseIdentity[] = [], workouts: WorkoutIdentity[] = []): ExercisePerformance[] {
  return selection(draft,exercise,sessions,identities,workouts).history
}
export function historyLine(set: Exclude<RecordedSide, { skipped: true }>, unit: WeightUnit) {
  return `${set.weightKg === undefined ? 'None' : displayNumber(fromKg(set.weightKg, unit))} ${unit} x ${set.reps ?? 'None'} reps${set.rir === undefined ? '' : ` with ${set.rir === 0 ? '0' : ordinal(set.rir)} RIR`}`
}

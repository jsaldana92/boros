import type { TrainingDay, PlanExercise } from '../schemas/plan.ts'
import type { CompletedSession, SessionDraft } from '../schemas/session.ts'
import { exerciseResolver, type ExerciseIdentity } from './exercise-identity.ts'
import { templateReference } from './template-ownership.ts'

export const ownsNote = (value: { notes?: string; noteOverride?: boolean }) => value.noteOverride ?? !!value.notes
export function noteSignature(day: TrainingDay, exercise: PlanExercise, canonical: (id: string) => string = id => id) {
  const p = exercise.prescription
  if (p.trainingType !== 'interval') return JSON.stringify(p.sets.map(s => [s.reps.min, s.reps.max, s.rir ? [s.rir.min, s.rir.max] : null]))
  const c = day.circuits?.find(c => c.exerciseIds.includes(exercise.id))
  // Ordered circuit prescription, repetitions and circuit rest affect the effort
  // context. No names, retired model conversion, actuals or array-position identity.
  return JSON.stringify([p.activeSeconds, p.recoverySeconds, c && ('repeat' in c ? c.repeat : [c.sets, c.roundsPerSet, c.restBetweenSetsSeconds]), c?.restAfterCircuitSeconds, c?.exerciseIds.map(id => {
    const item = day.exercises.find(e => e.id === id)!
    const target = item.prescription
    return [canonical(templateReference(item) ?? item.id), target.trainingType === 'interval' ? target.activeSeconds : null, target.trainingType === 'interval' ? target.recoverySeconds : null]
  })])
}
export function inheritNotes(draft: SessionDraft, history: CompletedSession[], identities: ExerciseIdentity[]) {
  const resolve = exerciseResolver(draft.profileId, identities)
  const identity = (e: PlanExercise) => { const id = templateReference(e); return id ? resolve(id) : `occurrence:${e.id}` }
  const sameBranch = (s: CompletedSession) => draft.sourcePlanId
    ? s.sourcePlanId === draft.sourcePlanId && s.sourceDayId === draft.sourceDayId
    : !!draft.source?.workoutId && s.source?.workoutId === draft.source.workoutId && !s.sourcePlanId
  const saved = history.filter(s => s.profileId === draft.profileId).sort((a,b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || b.loggedAt.localeCompare(a.loggedAt) || b.id.localeCompare(a.id))
  const note = (value?: { notes: string; noteEdited?: boolean }) => value && (value.notes !== '' || value.noteEdited) ? value.notes : undefined
  const ownWorkout = saved.find(s => sameBranch(s) && note(s) !== undefined)
  const workoutNote = ownWorkout ? ownWorkout.notes : draft.day.notes ?? ''
  const workoutClear = !!ownWorkout && workoutNote === '' || !ownWorkout && draft.day.noteOverride === true && workoutNote === ''
  if (workoutNote !== '' || workoutClear) Object.assign(draft.input, { notes: workoutNote, noteInitial: workoutNote, noteEdited: false, noteInheritedClear: workoutClear })
  for (const item of draft.day.exercises) {
    const signature = noteSignature(draft.day, item, resolve)
    const candidates = saved.flatMap(s => s.day.exercises.flatMap(e => {
      const result = s.exercises.find(r => r.id === e.id)
      return identity(e) === identity(item) && noteSignature(s.day,e, resolve) === signature && note(result) !== undefined ? [{ s,e,value: result!.notes }] : []
    }))
    const own = candidates.find(c => sameBranch(c.s) && c.e.id === item.id)
    const cross = draft.sourcePlanId && candidates.find(c => c.s.sourcePlanId === draft.sourcePlanId && c.s.sourceDayId !== draft.sourceDayId)
    const value = own?.value ?? (ownsNote(item.prescription) ? item.prescription.notes ?? '' : cross ? cross.value : item.prescription.notes ?? '')
    const input = draft.input.exercises.find(e => e.id === item.id)!
    const cleared = value === '' && (!!own || ownsNote(item.prescription) || !!cross)
    if (value !== '' || cleared) Object.assign(input, { notes: value, noteInitial: value, noteEdited: false, noteInheritedClear: cleared })
  }
  return draft
}

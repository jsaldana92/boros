import { displayNumber, fromKg, type WeightUnit } from '../schemas/profile.ts'
import type { CompletedSession, SessionDraft } from '../schemas/session.ts'

export type ResultHints = Record<string, ({ load: string; reps: string; rir?: string } | undefined)[]>
export function previousResults(draft: SessionDraft, sessions: CompletedSession[], unit: WeightUnit): ResultHints {
  if (!draft.occurrence) return {}
  const ref = draft.occurrence
  // Prior occurrence weeks only. Ties: completedAt, loggedAt, UUID descending.
  // Never combine fields from different results; skipped sets permit an older set.
  const history = sessions.filter((s) => s.profileId === draft.profileId && s.sourcePlanId === draft.sourcePlanId && s.sourceDayId === draft.sourceDayId && s.occurrence?.scheduleId === ref.scheduleId && s.occurrence.dayId === ref.dayId && s.occurrence.scheduledWeek < ref.scheduledWeek && s.completedAt <= draft.startedAt)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.loggedAt.localeCompare(a.loggedAt) || b.id.localeCompare(a.id))
  return Object.fromEntries(draft.day.exercises.map((exercise) => [exercise.id, exercise.prescription.sets.map((_, index) => {
    for (const session of history) {
      const prior = session.day.exercises.filter((item) => item.id === exercise.id)
      if (prior.length !== 1) continue
      const candidate = prior[0]
      // Sets have no stable IDs. Any target/count edit makes correspondence
      // ambiguous; do not infer it from names or a new array position.
      if (candidate.prescription.name !== exercise.prescription.name || candidate.templateId !== exercise.templateId || JSON.stringify(candidate.source) !== JSON.stringify(exercise.source) || JSON.stringify(candidate.prescription.sets) !== JSON.stringify(exercise.prescription.sets)) continue
      const set = session.exercises.find((item) => item.id === exercise.id)?.sets[index]
      if (set && !set.skipped) return { load: displayNumber(fromKg(set.weightKg, unit)), reps: String(set.reps), ...(set.rir === undefined ? {} : { rir: String(set.rir) }) }
    }
    return undefined
  })])) as ResultHints
}

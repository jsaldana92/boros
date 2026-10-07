import type { DeletedSource } from '../schemas/deleted-source.ts'
import { exerciseResolver } from './exercise-identity.ts'
import type { Schedule } from '../schemas/schedule.ts'
import { resolvedDays, runProgress } from './run-progress.ts'
import { nameKey } from '../schemas/profile.ts'
import type { Exercise } from '../schemas/exercise.ts'
import type { Plan, PlanExercise, TrainingDay } from '../schemas/plan.ts'
import type { CompletedSession, RecordedSet, SessionDraft } from '../schemas/session.ts'

export type ActualSet = Extract<RecordedSet, { skipped: false }>
export interface Performance {
  id: string; exerciseKey: string; itemKey: string; instanceId: string
  session: CompletedSession; occurrence: PlanExercise; occurrenceIndex: number
  sets: { id: string; index: number; result: ActualSet }[]
}
export interface ProgressItem { key: string; name: string; context: string; nameKey: string; createdAt: string; tagIds: string[] }
export interface ExerciseOutcome { id: string; instanceId: string; itemKey: string; exerciseKey: string; completed: boolean; skipped: boolean }
export interface ProgressPlan { id: string; sourcePlanId: string; name: string; legacy: boolean; sessions: CompletedSession[]; timesCompleted: number; daysCompleted: number; daysSkipped: number; manualCompletions: number; exercisesCompleted: number; items: ProgressItem[] }
export interface ProgressAnalytics { plans: ProgressPlan[]; items: ProgressItem[]; performances: Performance[]; outcomes: ExerciseOutcome[]; sessions: CompletedSession[]; runs: Schedule[] }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export const sessionOrder = (a: CompletedSession, b: CompletedSession) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || compare(a.id, b.id)

// Only frozen explicit provenance may link an occurrence to Overall. Never infer
// identity from a name or a mutable source plan's current contents.
export function exerciseIdentity(planId: string | undefined, dayId: string, exercise: PlanExercise) {
  const source = exercise.source
  if (source?.kind === 'exercise') return `library:${source.id}`
  if (source?.kind === 'plan' && source.libraryId) return `library:${source.libraryId}`
  return `plan:${JSON.stringify(source?.kind === 'plan' ? [source.id, source.dayId, source.occurrenceId] : [planId, dayId, exercise.id])}`
}
export const occurrenceItemKey = (dayId: string, exerciseId: string) => JSON.stringify([dayId, exerciseId])
export const legacyPlanKey = (planId: string) => `legacy:${planId}`
const validActual = (set: RecordedSet): set is ActualSet => !set.skipped && Number.isFinite(set.weightKg) && set.weightKg >= 0 && Number.isSafeInteger(set.reps) && set.reps >= 0

export function deriveProgress(profileId: string, _allPlans: Plan[], allExercises: Exercise[], allSessions: CompletedSession[], schedules: Schedule[] = [], drafts: SessionDraft[] = [], deletedSources: DeletedSource[] = []): ProgressAnalytics {
  const library = allExercises.filter((e) => e.profileId === profileId), runs = schedules.filter((r) => r.profileId === profileId)
  const resolve = exerciseResolver(profileId, [...library, ...deletedSources.filter(t => t.kind === 'exercise')])
  const identity = (planId: string | undefined, dayId: string, exercise: PlanExercise) => { const key = exerciseIdentity(planId, dayId, exercise); return key.startsWith('library:') ? `library:${resolve(key.slice(8))}` : key }
  const sessions = allSessions.filter((s) => s.profileId === profileId).sort(sessionOrder), performances: Performance[] = [], outcomes = new Map<string, ExerciseOutcome>()
  const catalogs = new Map<string, Map<string, ProgressItem>>()
  const collect = (instanceId: string, day: TrainingDay, createdAt: string) => {
    const catalog = catalogs.get(instanceId) ?? new Map<string, ProgressItem>(); catalogs.set(instanceId, catalog)
    for (const exercise of day.exercises) {
      const key = occurrenceItemKey(day.id, exercise.id), old = catalog.get(key)
      catalog.set(key, { key, name: exercise.prescription.name, nameKey: nameKey(exercise.prescription.name), context: day.name, createdAt: old?.createdAt ?? createdAt, tagIds: exercise.prescription.tagNames.map(nameKey) })
    }
  }
  for (const run of runs) for (const revision of run.revisions) for (const day of revision.days) collect(run.id, day, revision.createdAt)
  for (const session of sessions) {
    const run = runs.find((r) => r.id === session.occurrence?.scheduleId && r.planId === session.sourcePlanId)
    const instanceId = run?.id ?? (session.source ? `standalone:${session.id}` : legacyPlanKey(session.sourcePlanId!))
    collect(instanceId, session.day, session.completedAt)
    const savedDraft = drafts.find((d) => d.profileId === profileId && d.id === session.draftId && d.finalizedAt && d.sourcePlanId === session.sourcePlanId && d.sourceDayId === session.sourceDayId)
    for (const [index, occurrence] of session.day.exercises.entries()) {
      const results = session.exercises.find((e) => e.id === occurrence.id)?.sets ?? []
      const sets = results.flatMap((result, s) => validActual(result) ? [{ id: `${session.id}:${occurrence.id}:${session.structure?.exercises[index]?.sets[s]?.id ?? s}`, index: s, result }] : [])
      const itemKey = occurrenceItemKey(session.day.id, occurrence.id), exerciseKey = identity(session.sourcePlanId, session.day.id, occurrence)
      const id = `${instanceId}:${session.occurrence?.key ?? session.id}:${occurrence.id}`
      const prior = outcomes.get(id), count = occurrence.prescription.sets.length
      const explicit = savedDraft?.input.exercises.find((e) => e.id === occurrence.id)?.sets
      const completed = count > 0 && results.length === count && sets.length === count
      // Blank fields were historically serialized as skipped sets too. Without
      // retained explicit input evidence, do not invent an exercise-level skip.
      const skipped = count > 0 && results.length === count && results.every((r) => r.skipped) && explicit?.length === count && explicit.every((r) => r.skipped)
      outcomes.set(id, { id, instanceId, itemKey, exerciseKey, completed: !!(prior?.completed || completed), skipped: !(prior?.completed || completed || sets.length) && !!(prior?.skipped || skipped) })
      if (sets.length) performances.push({ id: `${session.id}:${occurrence.id}`, exerciseKey, itemKey, instanceId, session, occurrence, occurrenceIndex: index, sets })
    }
  }
  for (const run of runs) {
    const logs = sessions.filter((s) => s.occurrence?.scheduleId === run.id && s.sourcePlanId === run.planId), resolved = resolvedDays(logs, run.outcomes)
    for (const marker of run.outcomes ?? []) {
      if (marker.ref.scheduleId !== run.id) continue
      collect(run.id, marker.day, marker.recordedAt)
      if (!resolved.skipped.has(marker.ref.key)) continue
      for (const exercise of marker.day.exercises) {
        const id = `${run.id}:${marker.ref.key}:${exercise.id}`, old = outcomes.get(id)
        // A saved partial performance is not a wholly skipped exercise.
        if (old?.completed || performances.some((p) => p.instanceId === run.id && p.session.occurrence?.key === marker.ref.key && p.occurrence.id === exercise.id)) continue
        outcomes.set(id, { id, instanceId: run.id, itemKey: occurrenceItemKey(marker.day.id, exercise.id), exerciseKey: identity(run.planId, marker.day.id, exercise), completed: false, skipped: true })
      }
    }
  }
  const sorted = (items: Iterable<ProgressItem>) => Array.from(items).sort((a, b) => a.nameKey.localeCompare(b.nameKey) || a.context.localeCompare(b.context) || compare(a.key, b.key))
  const planSummaries = runs.map((run): ProgressPlan => {
    const history = sessions.filter((s) => s.occurrence?.scheduleId === run.id && s.sourcePlanId === run.planId), counts = runProgress(run, history), resolved = resolvedDays(history, run.outcomes)
    return { id: run.id, sourcePlanId: run.planId, name: run.revisions.at(-1)?.planName ?? history.at(-1)?.planName ?? 'Plan unavailable', legacy: false, sessions: history,
      timesCompleted: counts.total !== undefined && counts.total > 0 && counts.resolved >= counts.total ? 1 : 0,
      daysCompleted: counts.completed, daysSkipped: counts.skipped, manualCompletions: resolved.manual.size,
      exercisesCompleted: [...outcomes.values()].filter((o) => o.instanceId === run.id && o.completed).length, items: sorted(catalogs.get(run.id)?.values() ?? []) }
  })
  for (const id of [...catalogs.keys()].filter((key) => key.startsWith('legacy:'))) {
    const sourcePlanId = id.slice(7), history = sessions.filter((s) => s.sourcePlanId === sourcePlanId && !runs.some((r) => r.id === s.occurrence?.scheduleId && r.planId === sourcePlanId)), resolved = resolvedDays(history)
    planSummaries.push({ id, sourcePlanId, name: history.at(-1)?.planName ?? 'Historical plan', legacy: true, sessions: history, timesCompleted: 0, daysCompleted: resolved.completed.size, daysSkipped: 0, manualCompletions: 0, exercisesCompleted: [...outcomes.values()].filter((o) => o.instanceId === id && o.completed).length, items: sorted(catalogs.get(id)!.values()) })
  }
  return { sessions, performances, outcomes: [...outcomes.values()], runs, plans: planSummaries,
    items: sorted(library.filter(e => !e.mergedIntoId).map((e) => ({ key: `library:${e.id}`, name: e.name, nameKey: e.nameKey, context: '', createdAt: e.createdAt, tagIds: e.tagIds }))) }
}
export function selectPerformances(data: ProgressAnalytics, key: string, instanceId?: string) {
  return data.performances.filter((p) => instanceId ? p.instanceId === instanceId && p.itemKey === key : p.exerciseKey === key)
}
export function exerciseCounts(data: ProgressAnalytics, key: string, instanceId?: string) {
  const matches = data.outcomes.filter((o) => instanceId ? o.instanceId === instanceId && o.itemKey === key : o.exerciseKey === key)
  return { completed: matches.filter((o) => o.completed).length, skipped: matches.filter((o) => o.skipped && !o.completed).length }
}
export function performanceStats(performances: Performance[]) {
  const ordered = [...performances].sort((a, b) => sessionOrder(a.session, b.session) || a.occurrenceIndex - b.occurrenceIndex)
  const sets = ordered.flatMap((performance) => performance.sets.map((set) => ({ ...set, performance })))
  const extreme = (field: 'weightKg' | 'reps', max: boolean) => sets.reduce<typeof sets[number] | undefined>((best, set) => !best || (max ? set.result[field] > best.result[field] : set.result[field] < best.result[field]) ? set : best, undefined)
  return { sets, minimum: extreme('weightKg', false), maximum: extreme('weightKg', true), repsMinimum: extreme('reps', false), repsMaximum: extreme('reps', true), starting: ordered.filter((p) => p.session.id === ordered[0]?.session.id), latest: ordered.filter((p) => p.session.id === ordered.at(-1)?.session.id) }
}

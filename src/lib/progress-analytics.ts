import type { Schedule } from '../schemas/schedule.ts'
import type { Exercise } from '../schemas/exercise.ts'
import type { Plan, PlanExercise, TrainingDay } from '../schemas/plan.ts'
import type { CompletedSession, RecordedSet } from '../schemas/session.ts'

export type ActualSet = Extract<RecordedSet, { skipped: false }>
export interface Performance {
  id: string; exerciseKey: string; groupKey?: string; memberIndex?: number
  session: CompletedSession; occurrence: PlanExercise; occurrenceIndex: number
  sets: { id: string; index: number; result: ActualSet }[]
}
export interface ProgressItem { key: string; name: string; context: string; members?: { key: string; name: string }[] }
export interface ProgressPlan { id: string; name: string; archived: boolean; historical: boolean; sessions: CompletedSession[]; daysCompleted: number; daysSkipped: number; manualCompletions: number; exercisesCompleted: number; items: ProgressItem[] }
export interface ProgressAnalytics { plans: ProgressPlan[]; items: ProgressItem[]; performances: Performance[]; sessions: CompletedSession[] }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export const sessionOrder = (a: CompletedSession, b: CompletedSession) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || compare(a.id, b.id)

// Resolve only explicit provenance. Looking through today's mutable source plan
// could retroactively attach an old snapshot to a different library exercise.
export function exerciseIdentity(planId: string, dayId: string, exercise: PlanExercise) {
  const source = exercise.source
  if (source?.kind === 'exercise') return `library:${source.id}`
  if (source?.kind === 'plan' && source.libraryId) return `library:${source.libraryId}`
  return `plan:${JSON.stringify(source?.kind === 'plan' ? [source.id, source.dayId, source.occurrenceId] : [planId, dayId, exercise.id])}`
}
function groups(planId: string, day: TrainingDay) {
  return (day.groups ?? []).map((group) => {
    const members = day.exercises.filter((item) => item.groupId === group.id)
    const identities = members.map((item) => exerciseIdentity(planId, day.id, item))
    return { id: group.id, key: `group:${JSON.stringify(identities)}`, members, identities }
  })
}
export function deriveProgress(profileId: string, allPlans: Plan[], allExercises: Exercise[], allSessions: CompletedSession[], schedules: Schedule[] = []): ProgressAnalytics {
  const plans = allPlans.filter((p) => p.profileId === profileId), library = allExercises.filter((e) => e.profileId === profileId)
  const sessions = allSessions.filter((s) => s.profileId === profileId).sort(sessionOrder)
  const names = new Map(library.map((e) => [`library:${e.id}`, e.name]))
  const performances: Performance[] = []
  const catalog = new Map<string, ProgressItem>(), perPlan = new Map<string, Map<string, ProgressItem>>()
  const collect = (planId: string, planName: string, day: TrainingDay) => {
    const items = perPlan.get(planId) ?? new Map<string, ProgressItem>(); perPlan.set(planId, items)
    const member = (exercise: PlanExercise) => { const key = exerciseIdentity(planId, day.id, exercise); return { key, name: names.get(key) ?? exercise.prescription.name } }
    for (const [index, exercise] of day.exercises.entries()) {
      const item = { ...member(exercise), context: names.has(exerciseIdentity(planId, day.id, exercise)) ? 'Library exercise' : `${planName} / ${day.name} / Exercise ${index + 1}` }
      items.set(item.key, item); catalog.set(item.key, item)
    }
    for (const group of groups(planId, day)) {
      const members = group.members.map(member), item = { key: group.key, name: `Superset · ${members.map((m) => m.name).join(' + ')}`, context: `${members.length} members`, members }
      items.set(item.key, item); catalog.set(item.key, item)
    }
  }
  // History first, then current labels. Membership always comes from each snapshot.
  for (const session of sessions) {
    collect(session.sourcePlanId, session.planName, session.day)
    const grouping = groups(session.sourcePlanId, session.day), results = new Map(session.exercises.map((entry) => [entry.id, entry]))
    for (const [index, occurrence] of session.day.exercises.entries()) {
      const sets = (results.get(occurrence.id)?.sets ?? []).flatMap((result, s) => result.skipped ? [] : [{ id: `${session.id}:${occurrence.id}:${s}`, index: s, result }])
      if (!sets.length) continue
      const group = grouping.find((g) => g.id === occurrence.groupId)
      performances.push({ id: `${session.id}:${occurrence.id}`, exerciseKey: exerciseIdentity(session.sourcePlanId, session.day.id, occurrence), session, occurrence, occurrenceIndex: index, sets,
        ...(group ? { groupKey: group.key, memberIndex: group.members.findIndex((m) => m.id === occurrence.id) } : {}) })
    }
  }
  for (const plan of plans) for (const day of plan.days) collect(plan.id, plan.name, day)
  for (const exercise of library) {
    const key = `library:${exercise.id}`
    if (!exercise.archivedAt || catalog.has(key)) catalog.set(key, { key, name: exercise.name, context: exercise.archivedAt ? 'Archived library exercise' : 'Library exercise' })
  }
  const sorted = (items: Iterable<ProgressItem>) => Array.from(items).sort((a, b) => a.name.localeCompare(b.name) || a.context.localeCompare(b.context) || compare(a.key, b.key))
  const planIds = new Set([...plans.map((p) => p.id), ...sessions.map((s) => s.sourcePlanId)])
  return { sessions, performances, items: sorted(catalog.values()), plans: Array.from(planIds).flatMap((id): ProgressPlan[] => {
    const plan = plans.find((p) => p.id === id), history = sessions.filter((s) => s.sourcePlanId === id)
    const markers = schedules.filter((run) => run.profileId === profileId && run.planId === id).flatMap((run) => run.outcomes ?? []).filter((outcome) => !history.some((session) => session.occurrenceKey === outcome.ref.key))
    if (plan?.archivedAt && !history.length && !markers.some((m) => m.status !== 'pending')) return []
    return [{ id, name: plan?.name ?? history.at(-1)!.planName, archived: !!plan?.archivedAt, historical: !plan, sessions: history,
      daysCompleted: new Set(history.map((s) => s.occurrence ? `scheduled:${s.occurrence.key}` : `session:${s.id}`)).size + markers.filter((m) => m.status === 'completed').length,
      daysSkipped: markers.filter((m) => m.status === 'skipped').length, manualCompletions: markers.filter((m) => m.status === 'completed').length,
      exercisesCompleted: performances.filter((p) => p.session.sourcePlanId === id).length, items: sorted(perPlan.get(id)?.values() ?? []) }]
  }).sort((a, b) => a.name.localeCompare(b.name) || compare(a.id, b.id)) }
}
export function selectPerformances(data: ProgressAnalytics, key: string, planId?: string, memberIndex?: number) {
  return data.performances.filter((p) => (!planId || p.session.sourcePlanId === planId) && (memberIndex === undefined ? p.exerciseKey === key : p.groupKey === key && p.memberIndex === memberIndex))
}
export function performanceStats(performances: Performance[]) {
  const ordered = [...performances].sort((a, b) => sessionOrder(a.session, b.session) || a.occurrenceIndex - b.occurrenceIndex)
  const sets = ordered.flatMap((performance) => performance.sets.map((set) => ({ ...set, performance })))
  // Strict comparisons keep the first chronological match, then occurrence/set order.
  const minimum = sets.reduce<typeof sets[number] | undefined>((best, set) => !best || set.result.weightKg < best.result.weightKg ? set : best, undefined)
  const maximum = sets.reduce<typeof sets[number] | undefined>((best, set) => !best || set.result.weightKg > best.result.weightKg ? set : best, undefined)
  return { sets, minimum, maximum, starting: ordered.filter((p) => p.session.id === ordered[0]?.session.id), latest: ordered.filter((p) => p.session.id === ordered.at(-1)?.session.id) }
}

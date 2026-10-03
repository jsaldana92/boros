import { addDays, localToday, weekday } from './calendar-dates.ts'
import { occurrences, revisionAt, type OccurrenceRef, type Schedule } from '../schemas/schedule.ts'
import type { CompletedSession, SessionDraft } from '../schemas/session.ts'

export type PlanStatus = 'PAST DUE' | 'DUE TODAY' | 'ON GOING' | 'COMPLETED'
const maxDate = '9999-12-31'
const advance = (date: string, days: number) => { try { return addDays(date, days) } catch { return undefined } }

// Walk effective segments and at most the saved completions, never all elapsed
// days/weeks or an infinite series. Occurrence identity remains schedule/day/date.
function pendingSegments(schedule: Schedule, completed: Set<string>) {
  const boundaries = [...new Set([schedule.startWeek, ...schedule.revisions.flatMap((r) => [r.effectiveFrom, ...(r.effectiveUntil ? [r.effectiveUntil] : [])]), ...(schedule.durationChanges ?? []).map((c) => c.effectiveFrom), ...(schedule.stoppedFrom ? [schedule.stoppedFrom] : [])])].filter((d) => d >= schedule.startWeek).sort()
  let next: OccurrenceRef | undefined, workload = false, repair = false
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i], revision = revisionAt(schedule, start)
    const boundary = schedule.durationChanges?.findLast((c) => c.effectiveFrom <= start) ?? schedule
    if (schedule.stoppedFrom && start >= schedule.stoppedFrom) continue
    const end = [boundaries[i + 1] ? addDays(boundaries[i + 1], -1) : maxDate, boundary.endDate ?? maxDate, schedule.stoppedFrom ? addDays(schedule.stoppedFrom, -1) : maxDate].sort()[0]
    if (start > end || !revision) continue
    if (revision.needsRepair) { repair = true; continue }
    for (const assignment of revision.mapping) {
      let date = advance(start, (assignment.weekday - weekday(start) + 7) % 7)
      if (!date || date > end) continue
      workload = true
      while (date && date <= end) {
        const ref = occurrences(schedule, date, date)[0]?.ref
        if (!ref) break
        if (!completed.has(ref.key)) { if (!next || date < next.scheduledDate) next = ref; break }
        date = advance(date, 7)
      }
    }
  }
  return { next, workload, repair }
}

export function schedulePending(schedule: Schedule, completed: Set<string>) {
  const { next, workload, repair } = pendingSegments(schedule, completed)
  let previousEnd = schedule.endDate, removedPending = false
  const changes = schedule.durationChanges ?? []
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (change.endDate && (!previousEnd || change.endDate < previousEnd)) {
      const afterEnd = advance(change.endDate, 1)
      if (afterEnd) {
        const start = [change.effectiveFrom, afterEnd].sort().at(-1)!
        const end = [previousEnd ?? maxDate, changes[i + 1] ? addDays(changes[i + 1].effectiveFrom, -1) : maxDate].sort()[0]
        if (start <= end) {
          const removed = pendingSegments({ ...schedule, startWeek: start, endDate: end, durationChanges: undefined }, completed)
          removedPending ||= !!removed.next || removed.repair
        }
      }
    }
    previousEnd = change.endDate
  }
  return { next, fullyCompleted: workload && !next && !repair && !removedPending && !schedule.stoppedFrom && !!previousEnd }
}

export function planStatus(planId: string, schedules: Schedule[], sessions: CompletedSession[], drafts: SessionDraft[], instant: Date) {
  const relevant = schedules.filter((s) => s.planId === planId)
  const active = relevant.filter((s) => !s.stoppedFrom || s.stoppedFrom > localToday(s.timeZone, instant))
  const history = sessions.filter((s) => s.sourcePlanId === planId).sort((a, b) => b.completedAt.localeCompare(a.completedAt))
  const completed = new Set(history.flatMap((s) => s.occurrenceKey ? [s.occurrenceKey] : []))
  const pending: OccurrenceRef[] = [], summaries = active.map((schedule) => schedulePending(schedule, completed))
  summaries.forEach((item) => { if (item.next) pending.push(item.next) })
  for (const draft of drafts) if (!draft.finalizedAt && draft.sourcePlanId === planId && draft.occurrence && active.some((s) => s.id === draft.occurrence!.scheduleId) && !completed.has(draft.occurrence.key)) pending.push(draft.occurrence)
  const distinct = [...new Map(pending.map((ref) => [ref.key, ref])).values()].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.key.localeCompare(b.key))
  let status: PlanStatus | undefined
  if (distinct.some((ref) => ref.scheduledDate < localToday(ref.timeZone, instant))) status = 'PAST DUE'
  else if (distinct.some((ref) => ref.scheduledDate === localToday(ref.timeZone, instant))) status = 'DUE TODAY'
  else if (distinct.length) status = 'ON GOING'
  else if (summaries.length && summaries.every((s) => s.fullyCompleted)
    // Excluding a stopped schedule from pending cards must not make its unfinished
    // natural workload look completed when another schedule is fully saved.
    && relevant.filter((s) => s.stoppedFrom).every((s) => schedulePending({ ...s, stoppedFrom: undefined }, completed).fullyCompleted)) status = 'COMPLETED'
  return { scheduled: relevant.length > 0, scheduleCount: active.length, last: history[0], next: distinct[0], status }
}

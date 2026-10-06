import { addDays, localToday, monday, validDate, validZone, viewRange, weekday } from './calendar-dates.ts'
import { occurrences, revisionAt, programWeek, type Schedule, type OccurrenceOutcome } from '../schemas/schedule.ts'
import { resolveWeek } from '../schemas/plan.ts'
import type { CompletedSession } from '../schemas/session.ts'

// Shared with Progress: a partial log retains its results but is not a fully
// completed day. Explicit completion wins; skip is never inferred from age.
export function resolvedDays(sessions: CompletedSession[], outcomes: OccurrenceOutcome[] = []) {
  const completed = new Set(sessions.filter((s) => !s.partial).map((s) => s.occurrence?.key ?? `session:${s.id}`))
  const skipped = new Set<string>(), manual = new Set<string>()
  for (const outcome of outcomes) {
    if (outcome.status === 'completed') { completed.add(outcome.ref.key); manual.add(outcome.ref.key) }
    if (outcome.status === 'skipped') skipped.add(outcome.ref.key)
  }
  completed.forEach((key) => skipped.delete(key))
  return { completed, skipped, manual }
}

const civilDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
// Count weekly prescriptions over saved revision/boundary segments, without
// generating every day. Leave/Stop does not erase the committed denominator.
export function prescribedDays(run: Schedule): number | undefined {
  const final = run.durationChanges?.at(-1) ?? run
  if (!validDate(run.startWeek) || !final.endDate || !validDate(final.endDate)) return undefined
  const boundaries = [...new Set([run.startWeek, ...run.revisions.flatMap((r) => [r.effectiveFrom, ...(r.effectiveUntil ? [r.effectiveUntil] : [])]), ...(run.durationChanges ?? []).map((c) => c.effectiveFrom)])].filter((d) => validDate(d) && d >= run.startWeek).sort()
  let total = 0
  for (const [index, start] of boundaries.entries()) {
    const revision = revisionAt(run, start), duration = run.durationChanges?.findLast((c) => c.effectiveFrom <= start) ?? run
    const end = [boundaries[index + 1] ? addDays(boundaries[index + 1], -1) : final.endDate, duration.endDate ?? '9999-12-31'].sort()[0]
    if (!revision || start > end) continue
    if (revision.weeks) {
      for (let week = monday(start); week <= end; week = addDays(week, 7)) {
        if (run.excludedWeeks?.includes(week)) continue
        const days = resolveWeek(revision, programWeek(run, week)).days
        total += revision.mapping.filter((entry) => days.some((day) => day.id === entry.dayId) && addDays(week, entry.weekday) >= start && addDays(week, entry.weekday) <= end).length
        if (civilDays(week, end) < 7) break
      }
      continue
    }
    // A repair marker freezes the old prescription; editing the template alone
    // must not turn its suspended future workload into zero planned days.
    for (const assignment of revision.mapping) {
      if (!revision.days.some((day) => day.id === assignment.dayId)) continue
      const offset = (assignment.weekday - weekday(start) + 7) % 7
      const span = civilDays(start, end) - offset
      if (span < 0) continue
      total += Math.floor(span / 7) + 1
      for (const gap of new Set(run.excludedWeeks ?? [])) {
        if (!validDate(gap) || gap > end || gap < monday(start)) continue
        if (civilDays(gap, end) < assignment.weekday) continue
        const date = addDays(gap, assignment.weekday)
        if (date >= start && date <= end) total--
      }
    }
  }
  return total
}

export function runProgress(run: Schedule, sessions: CompletedSession[]) {
  const logs = sessions.filter((s) => s.profileId === run.profileId && s.sourcePlanId === run.planId && s.occurrence?.scheduleId === run.id), outcomes = (run.outcomes ?? []).filter((o) => o.ref.scheduleId === run.id)
  const resolved = resolvedDays(logs, outcomes), completed = resolved.completed.size, skipped = resolved.skipped.size
  let total = prescribedDays(run)
  if (total !== undefined) {
    // Remapping/shortening can retain a recorded original occurrence outside the
    // revised prescription. Include its frozen workload once, too: otherwise
    // counts could exceed T or incorrectly end a still-incomplete assignment.
    // Ignore Leave/Stop and repair suspension, just as the segment count does.
    const committed = { ...run, stoppedFrom: undefined, revisions: run.revisions.map((r) => ({ ...r, needsRepair: false })) }
    const refs = new Map([...logs.map((s) => s.occurrence!), ...outcomes.map((o) => o.ref)].map((ref) => [ref.key, ref]))
    for (const ref of refs.values()) {
      if (!validDate(ref.scheduledDate)) continue
      const range = viewRange(ref.scheduledDate, run.identity ? 'week' : 'day')
      if (!occurrences(committed, range.start, range.end).some((event) => event.ref.key === ref.key)) total++
    }
  }
  return { total, completed, skipped, resolved: completed + skipped }
}

export function effectiveRunEnd(run: Schedule) {
  if (!validDate(run.startWeek)) return undefined
  const segments = [{ effectiveFrom: run.startWeek, endDate: run.endDate }, ...(run.durationChanges ?? [])]
  if (!segments.at(-1)?.endDate) return undefined
  const ends = segments.flatMap((segment, index) => {
    const next = segments[index + 1]?.effectiveFrom
    const end = [segment.endDate ?? '9999-12-31', next ? addDays(next, -1) : '9999-12-31'].sort()[0]
    return segment.effectiveFrom <= end ? [end] : []
  })
  return ends.sort().at(-1)
}

export function runLifecycle(run: Schedule, sessions: CompletedSession[], instant = new Date()) {
  const effectiveEnd = effectiveRunEnd(run)
  const today = validZone(run.timeZone) ? localToday(run.timeZone, instant) : undefined
  const closure = run.closedAt && Number.isFinite(Date.parse(run.closedAt)) && validZone(run.timeZone) ? localToday(run.timeZone, new Date(run.closedAt)) : undefined
  const progress = runProgress(run, sessions)
  const stopped = !!(today && run.stoppedFrom && run.stoppedFrom <= today)
  const ended = !!(today && effectiveEnd && effectiveEnd < today)
  const complete = progress.total !== undefined && progress.total > 0 && progress.resolved >= progress.total
  const previous = !!run.closedAt || stopped || ended || complete
  const completion = complete && validZone(run.timeZone) ? [...sessions.filter((s) => s.profileId === run.profileId && s.occurrence?.scheduleId === run.id && !s.partial).map((s) => s.completedAt), ...(run.outcomes ?? []).filter((o) => o.status !== 'pending').map((o) => o.updatedAt)].filter((at) => Number.isFinite(Date.parse(at))).sort().at(-1) : undefined
  // stoppedFrom is exclusive; an explicit Leave uses its actual closure date.
  const end = run.closedAt ? closure : stopped ? [effectiveEnd, run.stoppedFrom! > '0001-01-01' ? addDays(run.stoppedFrom!, -1) : undefined].filter((d): d is string => !!d).sort()[0] : complete && completion ? localToday(run.timeZone, new Date(completion)) : effectiveEnd
  return { previous, end, progress }
}

export function calendarAssignments(runs: Schedule[], sessions: CompletedSession[], instant = new Date()) {
  return runs.filter((run) => run.kind !== 'unscheduled' && !runLifecycle(run, sessions, instant).previous)
}
export function displayRunDate(date?: string) { return date && validDate(date) ? `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : 'Date unavailable' }

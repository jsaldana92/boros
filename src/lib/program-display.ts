import { resolveWeek, weekSnapshot } from '../schemas/plan.ts'
import { addDays, localToday, monday, weekday } from './calendar-dates.ts'
import { programWeek, revisionAt, type Schedule } from '../schemas/schedule.ts'
import type { CompletedSession } from '../schemas/session.ts'
import type { CalendarEvent } from '../db/schedules.ts'
import { runLifecycle } from './run-progress.ts'

// Use the committed instance, never the editable library template or browsed week.
export function programSummary(run: Schedule, date: string) {
  const source = revisionAt(run, date) ?? (date < run.startWeek ? run.revisions[0] : run.revisions.at(-1))!
  const duration = [...(run.durationChanges ?? [])].reverse().find((change) => change.effectiveFrom <= date) ?? run
  return { name: source.planName, days: source.days, ...weekSnapshot(source), durationWeeks: duration.durationWeeks }
}
export function currentProgramLabel(run: Schedule, sessions: CompletedSession[], instant: Date) {
  const today = localToday(run.timeZone, instant), week = monday(today)
  if (runLifecycle(run, sessions, instant).previous) return 'Ended'
  if (today < run.startWeek) return 'Upcoming'
  if (run.excludedWeeks?.includes(week) || revisionAt(run, today)?.needsRepair) return 'Paused'
  const number = programWeek(run, week), duration = programSummary(run, today).durationWeeks
  return number < 1 ? 'Upcoming' : duration !== undefined && number > duration ? 'Ended' : `Week ${number}`
}

// Rest rows are presentation only. Frozen scheduled exceptions keep their date;
// unscheduled records use the saved day's order without changing their reference.
export function trainingWeekRows(run: Schedule, week: string, events: CalendarEvent[]) {
  if (!events.length || run.excludedWeeks?.includes(week)) return []
  const source = revisionAt(run, week) ?? run.revisions.at(-1)!
  const rows = Array.from({ length: 7 }, (_, index) => ({ date: addDays(week, index), events: [] as CalendarEvent[] }))
  for (const event of events) {
    const index = run.kind === 'unscheduled' ? resolveWeek(source, programWeek(run, week)).days.findIndex((day) => day.id === event.day.id) : weekday(event.ref.scheduledDate)
    // An older frozen day may no longer exist in the current prescription.
    rows[index >= 0 ? index : weekday(event.ref.scheduledDate)].events.push(event)
  }
  return rows
}

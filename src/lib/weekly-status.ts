import { addDays, localToday } from './calendar-dates.ts'
import type { CalendarEvent } from '../db/schedules.ts'

export function dayStatus(event: CalendarEvent, instant = new Date()) {
  if (event.session || event.outcome?.status === 'completed') return 'Completed'
  if (event.outcome?.status === 'skipped') return 'Skipped'
  if (event.unscheduled) return 'Pending'
  const today = localToday(event.ref.timeZone, instant)
  return event.ref.scheduledDate === today ? 'Due Today' : event.ref.scheduledDate < today ? 'Past Due' : 'Pending'
}
export function weekLabel(week: string) {
  const end = addDays(week, 6), format = (date: string, year: boolean) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace(/ (\d{4})$/, ', $1')
  return `${format(week, week.slice(0, 4) !== end.slice(0, 4))} - ${format(end, true)}`
}

import type { CalendarView } from './calendar-dates.ts'

const key = 'boros.calendar-view'
let remembered: CalendarView = 'month'
const valid = (value: unknown): value is CalendarView => value === 'day' || value === 'week' || value === 'month'
export function readCalendarView(storage?: Pick<Storage, 'getItem'>): CalendarView {
  try {
    const value = (storage ?? window.localStorage).getItem(key)
    return remembered = valid(value) ? value : 'month'
  } catch { return remembered }
}
export function saveCalendarView(value: CalendarView, storage?: Pick<Storage, 'setItem'>) {
  if (!valid(value)) return
  remembered = value
  try { (storage ?? window.localStorage).setItem(key, value) } catch { /* An interface preference must not block Calendar. */ }
}

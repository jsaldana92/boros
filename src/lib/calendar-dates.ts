// Civil dates are Gregorian labels, not instants. UTC is only an arithmetic
// carrier here; schedule-local Today is obtained separately through Intl.
export const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
function carrier(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('Enter a valid calendar date.')
  const [year, month, day] = key.split('-').map(Number)
  const value = new Date(0); value.setUTCFullYear(year, month - 1, day); value.setUTCHours(0, 0, 0, 0)
  if (year < 1 || format(value) !== key) throw new Error('Enter a valid calendar date.')
  return value
}
function format(value: Date) {
  const year = value.getUTCFullYear()
  if (year < 1 || year > 9999) throw new Error('Date is outside the supported calendar range (years 1–9999).')
  return `${String(year).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}
export function validDate(key: string) { try { carrier(key); return true } catch { return false } }
export function addDays(key: string, days: number) { const value = carrier(key); value.setUTCDate(value.getUTCDate() + days); return format(value) }
export function weekday(key: string) { return (carrier(key).getUTCDay() + 6) % 7 }
export const monday = (key: string) => addDays(key, -weekday(key))
export const nextMonday = (key: string) => addDays(monday(key), 7)
export function monthStart(key: string, offset = 0) { const value = carrier(key); value.setUTCDate(1); value.setUTCMonth(value.getUTCMonth() + offset); return format(value) }
export function localToday(zone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const part = (type: string) => parts.find((item) => item.type === type)!.value
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`
}
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
export function validZone(zone: string) { try { if (/^[+-]/.test(zone)) return false; new Intl.DateTimeFormat('en', { timeZone: zone }); return true } catch { return false } }
export type CalendarView = 'day' | 'week' | 'month'
export function viewRange(date: string, view: CalendarView) {
  const start = view === 'week' ? monday(date) : view === 'month' ? monday(monthStart(date)) : date
  const monthEnd = view === 'month' ? date.startsWith('9999-12-') ? '9999-12-31' : addDays(monthStart(date, 1), -1) : date
  const lastMonday = view === 'month' ? monday(monthEnd) : start
  const end = view === 'day' ? date : lastMonday > '9999-12-25' ? '9999-12-31' : addDays(lastMonday, 6)
  return { start, end }
}
export function dateRange(start: string, end: string) {
  carrier(start); carrier(end)
  const dates: string[] = []
  for (let date = start; date <= end;) { dates.push(date); if (date === end) break; date = addDays(date, 1) }
  return dates
}

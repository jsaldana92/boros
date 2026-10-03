import type { Measurement } from '../schemas/profile.ts'
import { browserZone, validDate, validZone } from './calendar-dates.ts'

const pad = (value: number, width = 2) => String(value).padStart(width, '0')
export function localDateTime(date = new Date()) {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}
export const measurementInstant = (date = new Date()) => ({ measuredAt: date.toISOString(), measuredLocal: localDateTime(date), timeZone: browserZone(), offsetMinutes: date.getTimezoneOffset() })
export function measurementTime(value: string, expectedZone = browserZone()) {
  if (expectedZone !== browserZone()) throw new Error('Device time zone changed. Reopen the editor before choosing a new measurement time. Your input is kept.')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value) || !validDate(value.slice(0, 10))) throw new Error('Enter a valid measurement date and time.')
  const date = new Date(value), normalized = value.length === 16 ? `${value}:00.000` : value.includes('.') ? value.padEnd(23, '0') : `${value}.000`
  if (!Number.isFinite(date.getTime()) || localDateTime(date) !== normalized) throw new Error('This local time is invalid or skipped by daylight saving. Choose an existing time.')
  return { measuredAt: date.toISOString(), measuredLocal: normalized, timeZone: expectedZone, offsetMinutes: date.getTimezoneOffset() }
}
export function validateTimeContext(value: { measuredAt: string; measuredLocal?: string; timeZone?: string; offsetMinutes?: number }) {
  if (value.measuredLocal === undefined && value.timeZone === undefined && value.offsetMinutes === undefined) return
  if (!value.measuredLocal || !value.timeZone || value.offsetMinutes === undefined || !validZone(value.timeZone) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(value.measuredLocal) || !validDate(value.measuredLocal.slice(0, 10))) throw new Error('Measurement date context is invalid.')
  const instant = new Date(value.measuredAt), parts = new Intl.DateTimeFormat('en-CA', { timeZone: value.timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  const local = `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.${pad(instant.getUTCMilliseconds(), 3)}`
  if (local !== value.measuredLocal || Date.parse(`${local}Z`) + value.offsetMinutes * 60000 !== instant.getTime()) throw new Error('Measurement time does not match its saved zone and offset.')
}
export function measurementDateLabel(value: Measurement) {
  return value.measuredLocal ? `${value.measuredLocal.replace('T', ' ')} · ${value.timeZone}` : `${value.measuredAt} (UTC)`
}

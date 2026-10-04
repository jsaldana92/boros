export interface RestFields { minutes: string; seconds: string }
export interface RestErrors { minutes?: string; seconds?: string }
export function restFields(value?: number): RestFields {
  return value === undefined ? { minutes: '', seconds: '' } : { minutes: String(Math.floor(value / 60)), seconds: String(value % 60) }
}
export function parseRest(fields: RestFields): { value?: number; errors: RestErrors } {
  const errors: RestErrors = {}, minutes = fields.minutes.trim(), seconds = fields.seconds.trim()
  if (!minutes && !seconds) return { errors }
  if (minutes && (!/^\d+$/.test(minutes) || !Number.isSafeInteger(Number(minutes)))) errors.minutes = 'Use nonnegative whole minutes.'
  if (seconds && (!/^\d+$/.test(seconds) || !Number.isSafeInteger(Number(seconds)) || Number(seconds) > 59)) errors.seconds = 'Use whole seconds from 0 to 59.'
  if (Object.keys(errors).length) return { errors }
  const total = BigInt(minutes || '0') * 60n + BigInt(seconds || '0')
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) return { errors: { minutes: 'Rest must be at most 9007199254740991 seconds in total.' } }
  return { value: Number(total), errors }
}

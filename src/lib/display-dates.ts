// Presentation only: never feed these shortened strings back into saved records.
export function displayDateTime(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(value))
}

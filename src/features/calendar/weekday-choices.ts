import { validateMapping, type Mapping } from '../../schemas/schedule'
import type { TrainingDay } from '../../schemas/plan'

export type WeekdayChoices = Record<string, string>
export const weekdayChoices = (mapping: Mapping = []): WeekdayChoices => Object.fromEntries(mapping.map((m) => [m.dayId, String(m.weekday)]))
export function selectedMapping(days: TrainingDay[], choices: WeekdayChoices): Mapping {
  const missing = days.filter((d) => choices[d.id] === undefined || choices[d.id] === '')
  if (missing.length) throw new Error(`Choose a weekday for ${missing.map((d) => d.name).join(', ')}.`)
  const mapping = days.map((d) => ({ dayId: d.id, weekday: Number(choices[d.id]) }))
  if (new Set(mapping.map((m) => m.weekday)).size !== mapping.length) throw new Error('Choose a distinct weekday for each training day.')
  validateMapping(mapping, days); return mapping
}

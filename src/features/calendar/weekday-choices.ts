import { validateMapping, type Mapping } from '../../schemas/schedule'
import type { TrainingDay, UniqueWeek } from '../../schemas/plan'

export type WeekdayChoices = Record<string, string>
export const weekdayChoices = (mapping: Mapping = []): WeekdayChoices => Object.fromEntries(mapping.map((m) => [m.dayId, String(m.weekday)]))
export function selectedMapping(days: TrainingDay[], choices: WeekdayChoices, weeks?: UniqueWeek[]): Mapping {
  const missing = days.filter((d) => choices[d.id] === undefined || choices[d.id] === '')
  if (missing.length) throw new Error(`Choose a weekday for ${missing.map((d) => d.name).join(', ')}.`)
  const mapping = days.map((d) => ({ dayId: d.id, weekday: Number(choices[d.id]) }))
  validateMapping(mapping, days, weeks); return mapping
}

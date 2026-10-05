import { useId } from 'react'
import { weekdays } from '../../lib/calendar-dates'
import type { WeekdayChoices } from './weekday-choices'
import type { TrainingDay } from '../../schemas/plan'

export function WeekdayFields({ days, choices, onChange }: { days: TrainingDay[]; choices: WeekdayChoices; onChange: (value: WeekdayChoices) => void }) {
  const id = useId()
  return <div className="weekday-fields"><div className="weekday-columns" aria-hidden="true"><strong>Training Days</strong><strong>Day of Week</strong></div>{days.map((day) => <div className="weekday-row" key={day.id}><label htmlFor={`${id}-${day.id}`}>{day.name}</label><select id={`${id}-${day.id}`} aria-label={`${day.name} weekday`} value={choices[day.id] ?? ''} onChange={(e) => onChange({ ...choices, [day.id]: e.target.value })}><option value="">Choose a weekday</option>{weekdays.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></div>)}</div>
}

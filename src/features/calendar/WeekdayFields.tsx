import { useId } from 'react'
import { weekdays } from '../../lib/calendar-dates'
import type { WeekdayChoices } from './weekday-choices'
import { planWeeks, type TrainingDay, type UniqueWeek } from '../../schemas/plan'

export function WeekdayFields({ days, weeks, choices, onChange }: { days: TrainingDay[]; weeks?: UniqueWeek[]; choices: WeekdayChoices; onChange: (value: WeekdayChoices) => void }) {
  const id = useId()
  return <>{planWeeks({ days, weeks }).map((week, index) => <section key={week.id ?? index} aria-label={weeks ? `Week ${index + 1}` : undefined}>{weeks && <><hr /><h3 className="unique-week-heading">Week {index + 1}</h3></>}<div className="weekday-fields"><div className="weekday-columns" aria-hidden="true"><strong>Workouts</strong><strong>Day of Week</strong></div>{week.days.map((day) => <div className="weekday-row" key={day.id}><label htmlFor={`${id}-${day.id}`}>{day.name}</label><select id={`${id}-${day.id}`} aria-label={`${day.name} weekday`} value={choices[day.id] ?? ''} onChange={(e) => onChange({ ...choices, [day.id]: e.target.value })}><option value="">Choose a weekday</option>{weekdays.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></div>)}</div></section>)}</>
}

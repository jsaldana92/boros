import { planWeeks, type Plan } from '../../schemas/plan'

export function weeklyCounts(plan: Pick<Plan, 'days' | 'weeks'>) {
  const counts = planWeeks(plan).map((week) => week.days.length)
  const range = (values: number[]) => Math.min(...values) === Math.max(...values) ? String(values[0]) : `${Math.min(...values)}–${Math.max(...values)}`
  return { training: range(counts), rest: range(counts.map((count) => 7 - count)) }
}
export function planSubtitle(plan: Pick<Plan, 'days' | 'durationWeeks' | 'weeks'>) {
  const counts = weeklyCounts(plan)
  return `${plan.durationWeeks === undefined ? 'Legacy unbounded duration' : `${plan.durationWeeks} ${plan.durationWeeks === 1 ? 'week' : 'weeks'}`} · ${counts.training} training ${counts.training === '1' ? 'day' : 'days'} · ${counts.rest} rest ${counts.rest === '1' ? 'day' : 'days'}`
}

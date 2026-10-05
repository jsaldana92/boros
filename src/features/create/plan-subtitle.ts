import type { Plan } from '../../schemas/plan'

export function planSubtitle(plan: Pick<Plan, 'days' | 'durationWeeks'>) {
  return `${plan.durationWeeks === undefined ? 'Legacy unbounded duration' : `${plan.durationWeeks} ${plan.durationWeeks === 1 ? 'week' : 'weeks'}`} · ${plan.days.length} training ${plan.days.length === 1 ? 'day' : 'days'} · ${7 - plan.days.length} rest ${7 - plan.days.length === 1 ? 'day' : 'days'}`
}

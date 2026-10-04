import type { Plan } from '../../schemas/plan'

export function PlanCard({ plan, onClick, disabled, note = false }: { plan: Plan; onClick: () => void; disabled?: boolean; note?: boolean }) {
  return <article className="plan-card" aria-label={`Plan ${plan.name}`}><button className="catalog-card" disabled={disabled} onClick={onClick}><strong>{plan.name}</strong>{note ? plan.notes?.trim() && <span className="plan-note-preview">{plan.notes}</span> : <span className="muted">{plan.days.length} training {plan.days.length === 1 ? 'day' : 'days'} · {7 - plan.days.length} rest {7 - plan.days.length === 1 ? 'day' : 'days'} · {plan.durationWeeks === undefined ? 'Legacy unbounded duration' : `${plan.durationWeeks} ${plan.durationWeeks === 1 ? 'week' : 'weeks'}`}</span>}</button></article>
}

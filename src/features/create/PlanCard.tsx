import { TypeIcon } from '../../components/ui/TrainingType'
import { planSubtitle } from './plan-subtitle'
import type { Plan } from '../../schemas/plan'
import type { ReactNode } from 'react'

export function PlanCard({ plan, onClick, disabled, note = false, label, children, subtitle, actions }: { plan: Pick<Plan, 'name' | 'days' | 'durationWeeks' | 'notes' | 'weeks' | 'trainingType'> & { archivedAt?: string }; onClick: () => void; disabled?: boolean; note?: boolean; label?: string; children?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return <article className={`plan-card${actions ? ' has-actions' : ''}`} aria-label={label ?? `Plan ${plan.name}`}><button className="catalog-card" disabled={disabled} onClick={onClick}><strong><span className="card-name">{plan.name}</span><TypeIcon type={plan.trainingType ?? plan.days[0]?.trainingType} /></strong>{subtitle ?? (note ? plan.notes?.trim() && <span className="plan-note-preview">{plan.notes}</span> : <span className="muted">{planSubtitle(plan)}</span>)}{plan.archivedAt && <small>Archived</small>}{children}</button>{actions}</article>
}

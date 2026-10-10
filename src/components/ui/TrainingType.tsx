import { Dumbbell } from 'lucide-react'
import { ActionDialog } from './ConfirmDialog'
import { trainingTypeName, type TrainingType } from '../../schemas/training-type'

export function TypeIcon({ type = 'strength' }: { type?: TrainingType }) {
  return <span className="training-type-icon" role="img" aria-label={trainingTypeName(type)} title={trainingTypeName(type)}>{type === 'strength' ? <Dumbbell size={18} aria-hidden="true" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="16" cy="4" r="2" /><path d="m7 9 5-2 3 5 5 1M12 7l-2 7 5 3-1 5M10 14l-4 5H2M7 9l-3 4" /></svg>}</span>
}
export function TypeChoice({ onChoose, onClose, title = 'Training type', intervalUnavailable = false }: { title?: string; intervalUnavailable?: boolean; onChoose: (type: TrainingType) => void; onClose: () => void }) {
  return <ActionDialog title={title} className="type-choice-dialog" onClose={onClose} actions={<button type="button" onClick={onClose}>Cancel</button>}><div className="type-choices">{(['strength', 'interval'] as const).map(type => <button type="button" disabled={intervalUnavailable && type === 'interval'} aria-label={trainingTypeName(type)} key={type} onClick={() => onChoose(type)}><TypeIcon type={type} />{trainingTypeName(type)}</button>)}</div>{intervalUnavailable && <p>Custom Interval workouts are unavailable.</p>}</ActionDialog>
}

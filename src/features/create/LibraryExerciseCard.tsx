import { TypeIcon } from '../../components/ui/TrainingType'
import type { TrainingType } from '../../schemas/training-type'
import type { MouseEventHandler } from 'react'
import { displayRunDate } from '../../lib/run-progress'

export function LibraryExerciseCard({ name, createdAt, onClick, trainingType, showType = true }: { name: string; trainingType?: TrainingType; showType?: boolean; createdAt: string; onClick: MouseEventHandler<HTMLButtonElement> }) {
  return <button className="catalog-card library-exercise-card" aria-label={name} onClick={onClick}><strong><span className="card-name">{name}</span>{showType && <TypeIcon type={trainingType} />}</strong><small>Added: {displayRunDate(createdAt.slice(0, 10))}</small></button>
}

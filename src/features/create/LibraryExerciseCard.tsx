import type { MouseEventHandler } from 'react'
import { displayRunDate } from '../../lib/run-progress'

export function LibraryExerciseCard({ name, createdAt, onClick }: { name: string; createdAt: string; onClick: MouseEventHandler<HTMLButtonElement> }) {
  return <button className="catalog-card library-exercise-card" aria-label={name} onClick={onClick}><strong>{name}</strong><small>Added: {displayRunDate(createdAt.slice(0, 10))}</small></button>
}

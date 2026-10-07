import { DetailsActions, DetailsActionsButton } from './DetailsActions'
import { useState } from 'react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { youtubeEmbedUrl } from '../../lib/youtube'
import type { Exercise } from '../../schemas/exercise'

export function ExerciseDetails({ exercise, tags, busy, error, onClose, onEdit, onDuplicate, onArchive, onDelete, onMerge }: {
  exercise: Exercise; tags: string[]; busy: boolean; error: string; onClose: () => void
  onEdit: () => void; onDuplicate: () => void; onArchive: () => void; onDelete: () => void; onMerge?: () => void
}) {
  const [actions, setActions] = useState(false)
  const embed = youtubeEmbedUrl(exercise.tutorialUrl)
  return <>
    <ActionDialog title={exercise.name} className="exercise-details" onClose={onClose}
      headerActions={<DetailsActionsButton label="Exercise actions" expanded={actions} onClick={() => setActions(true)} />}>
      <ol>{exercise.sets.map((set, index) => <li key={index}>Set {index + 1}: {set.reps.min === set.reps.max ? set.reps.min : `${set.reps.min}–${set.reps.max}`} reps; {set.rir ? `${set.rir.min === set.rir.max ? set.rir.min : `${set.rir.min}–${set.rir.max}`} RIR` : 'RIR unspecified'}</li>)}</ol>
      <p>Rest between sets: {exercise.restBetweenSeconds === undefined ? 'unspecified' : `${exercise.restBetweenSeconds} seconds`}. Rest after exercise: {exercise.restAfterSeconds === undefined ? 'unspecified' : `${exercise.restAfterSeconds} seconds`}.</p>
      <div className="tag-list">{tags.map((name) => <span className="tag-chip" key={name}>{name}</span>)}</div>
      {exercise.instructions?.trim() && <section className="exercise-information" aria-label="Instructions"><h3>Instructions</h3><p className="plain-text">{exercise.instructions}</p></section>}
      {exercise.notes?.trim() && <section className="exercise-information exercise-note" aria-label="Note"><h3>Note</h3><p className="plain-text">{exercise.notes}</p></section>}
      {/* Dispose while a higher popup obscures the player, and on every exit. */}
      {embed && !actions && <iframe className="youtube-player" src={embed} title="YouTube exercise tutorial" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen />}
    </ActionDialog>
    {actions && <DetailsActions title="Exercise actions" busy={busy} archived={!!exercise.archivedAt} error={error} onClose={() => setActions(false)} onEdit={onEdit} onDuplicate={onDuplicate} onArchive={onArchive} onDelete={onDelete} onMerge={onMerge} />}
  </>
}

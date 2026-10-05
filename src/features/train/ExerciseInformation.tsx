import { Fragment } from 'react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { youtubeEmbedUrl } from '../../lib/youtube'
import type { ExerciseInput } from '../../schemas/exercise'

// Callers pass the frozen session prescription, never a live library template.
export function ExerciseInformation({ exercise, onClose }: { exercise: ExerciseInput; onClose: () => void }) {
  const embed = youtubeEmbedUrl(exercise.tutorialUrl)
  const sections = [
    exercise.instructions?.trim() ? <section key="instructions" aria-label="Instructions"><h3>Instructions</h3><p className="plain-text">{exercise.instructions}</p></section> : null,
    exercise.notes?.trim() ? <section key="note" aria-label="Note"><h3>Note</h3><p className="plain-text">{exercise.notes}</p></section> : null,
    embed ? <iframe key="video" className="youtube-player" src={embed} title="YouTube exercise tutorial" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen /> : null,
  ].filter(Boolean)
  return <ActionDialog title={exercise.name} className="session-information" onClose={onClose}>{sections.length ? sections.map((section, index) => <Fragment key={index}>{index > 0 && <hr />}{section}</Fragment>) : <p>Add exercise information in Create.</p>}</ActionDialog>
}

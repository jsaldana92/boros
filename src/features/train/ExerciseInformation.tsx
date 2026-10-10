import { Fragment, useRef, type RefObject } from 'react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { youtubeEmbedUrl } from '../../lib/youtube'
import type { ExerciseInput } from '../../schemas/exercise'
import { historyLine, type ExercisePerformance } from '../../lib/previous-results'
import type { WeightUnit } from '../../schemas/profile'

// Callers pass the frozen session prescription, never a live library template.
export function ExerciseInformation({ exercise, onClose, returnFocus, history = [], unit = 'kg' }: { exercise: ExerciseInput; onClose: () => void; returnFocus?: RefObject<HTMLElement | null>; history?: ExercisePerformance[]; unit?: WeightUnit }) {
  const close = useRef<HTMLButtonElement>(null)
  const embed = youtubeEmbedUrl(exercise.tutorialUrl)
  const sections = [
    exercise.instructions?.trim() ? <section key="instructions" aria-label="Instructions"><h3>Instructions</h3><p className="plain-text">{exercise.instructions}</p></section> : null,
    history.length ? <section key="history" aria-label="History"><h3>History</h3>{history.map(performance => <div className="exercise-history" key={`${performance.session.id}:${performance.exercise.id}`}><h4>{performance.session.planName ? `${performance.session.planName} · ` : ''}{performance.session.day.name}</h4>{performance.sets.map((set, index) => set.skipped ? null : <p key={index}>{historyLine(set, unit)}</p>)}</div>)}</section> : null,
    exercise.notes?.trim() ? <section key="note" aria-label="Note"><h3>Note</h3><p className="plain-text">{exercise.notes}</p></section> : null,
    embed ? <iframe key="video" className="youtube-player" src={embed} title="YouTube exercise tutorial" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen /> : null,
  ].filter(Boolean)
  return <ActionDialog title={exercise.name} className="session-information" onClose={onClose} returnFocus={returnFocus} initialFocus={close} actions={<button ref={close} onClick={onClose}>Close</button>}>{sections.length ? sections.map((section, index) => <Fragment key={index}>{index > 0 && <hr />}{section}</Fragment>) : <p>Add exercise information in Create.</p>}</ActionDialog>
}

import { recordedRows } from '../../schemas/strength-results'
import { displayDateTime } from '../../lib/display-dates'
import { Fragment, useRef, type RefObject } from 'react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { youtubeEmbedUrl } from '../../lib/youtube'
import type { ExerciseInput } from '../../schemas/exercise'
import { historyLine, type ExercisePerformance } from '../../lib/previous-results'
import type { WeightUnit } from '../../schemas/profile'

const target = (range?: { min: number; max: number }) => !range ? 'unspecified' : range.min === range.max ? String(range.min) : `${range.min}–${range.max}`

// Callers pass the frozen session prescription, never a live library template.
export function ExerciseInformation({ exercise, onClose, returnFocus, history = [], unit = 'kg' }: { exercise: ExerciseInput; onClose: () => void; returnFocus?: RefObject<HTMLElement | null>; history?: ExercisePerformance[]; unit?: WeightUnit }) {
  const close = useRef<HTMLButtonElement>(null)
  const embed = youtubeEmbedUrl(exercise.tutorialUrl)
  const sections = [
    exercise.instructions?.trim() ? <section key="instructions" aria-label="Instructions"><h3>Instructions</h3><p className="plain-text">{exercise.instructions}</p></section> : null,
    history.length ? <section key="history" aria-label="History"><h3>History</h3>{history.map(performance => <div className="exercise-history" key={`${performance.session.id}:${performance.exercise.id}`}><h4>{performance.session.planName ? `${performance.session.planName} · ` : ''}{performance.session.day.name}</h4><p>{displayDateTime(performance.session.completedAt)}</p>{performance.sets.map((set, index) => <div key={index}><p className="muted">Set {index + 1} · Target: {target(performance.exercise.prescription.sets[index]?.reps)} reps · {target(performance.exercise.prescription.sets[index]?.rir)} RIR</p>{recordedRows(set).map(({side, result}) => result.skipped ? null : <p key={side ?? 'no'}>{side && `${side === 'left' ? 'Left' : 'Right'}: `}{historyLine(result, unit)}</p>)}</div>)}</div>)}</section> : null,
    exercise.notes?.trim() ? <section key="note" aria-label="Note"><h3>Note</h3><p className="plain-text">{exercise.notes}</p></section> : null,
    embed ? <iframe key="video" className="youtube-player" src={embed} title="YouTube exercise tutorial" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen /> : null,
  ].filter(Boolean)
  return <ActionDialog title={exercise.name} className="session-information" onClose={onClose} returnFocus={returnFocus} initialFocus={close} actions={<button ref={close} onClick={onClose}>Close</button>}>{sections.length ? sections.map((section, index) => <Fragment key={index}>{index > 0 && <hr />}{section}</Fragment>) : <p>Add exercise information in Create.</p>}</ActionDialog>
}

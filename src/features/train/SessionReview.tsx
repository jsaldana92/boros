import { Fragment, useState } from 'react'
import { Info } from 'lucide-react'
import { displayDateTime } from '../../lib/display-dates'
import type { CompletedSession } from '../../schemas/session'
import { type ExerciseInput, isYouTubeUrl } from '../../schemas/exercise'
import { roundCount, trainingBlocks, type PlanExercise } from '../../schemas/plan'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
const target = (range?: { min: number; max: number }) => range ? range.min === range.max ? String(range.min) : `${range.min}–${range.max}` : 'unspecified'
export function SessionReview({ session, onClose, backLabel = 'Back to training days' }: { session: CompletedSession; onClose: () => void; backLabel?: string }) {
  const [info, setInfo] = useState<ExerciseInput>()
  const result = (exercise: PlanExercise, s: number) => {
    const entry = session.exercises.find((item) => item.id === exercise.id)!, set = entry.sets[s], prescribed = exercise.prescription.sets[s]
    return set ? <li key={exercise.id}>{exercise.groupId && `${exercise.prescription.name}: `}Set {s + 1}: {set.skipped ? 'Skipped' : `${set.load} ${set.unit} · ${set.reps} reps · ${set.rir === undefined ? 'unspecified' : set.rir} actual RIR`}<p className="muted">Target: {target(prescribed.reps)} reps · {target(prescribed.rir)} RIR</p></li> : null
  }
  return <section aria-label="Saved session details"><h2>{session.planName} / {session.day.name}</h2><p>{session.partial ? 'Partial session' : 'Complete session'}</p>{session.occurrence && <p>{session.occurrence.unscheduled ? 'Weekly program' : 'Scheduled: ' + session.occurrence.scheduledDate} · Week of {session.occurrence.scheduledWeek} · {session.occurrence.timeZone} · Completed</p>}<p>Started: {displayDateTime(session.startedAt)}<br />Completed: {displayDateTime(session.completedAt)}<br />Logged: {displayDateTime(session.loggedAt)}</p><p className="plain-text">Session note: {session.notes || 'None'}</p>
    {trainingBlocks(session.day).map((block) => <section className="training-exercise" key={block.id} aria-label={block.group ? `Saved superset ${block.group.number}` : block.members[0].prescription.name}>
      {block.group && <><h3>Superset {block.group.number}</h3><p>Rest between rounds: {block.group.restBetweenRoundsSeconds ?? 'unspecified'} seconds · After group: {block.group.restAfterGroupSeconds ?? 'unspecified'} seconds</p></>}
      {block.members.map((exercise) => <div key={exercise.id}><div className="training-heading"><h3>{exercise.prescription.name}</h3><button aria-label={`Information for ${exercise.prescription.name}`} onClick={() => setInfo(exercise.prescription)}><Info aria-hidden="true" size={20} /></button></div><p className="plain-text">Exercise note: {session.exercises.find((item) => item.id === exercise.id)!.notes || 'None'}</p>{!block.group && <p className="muted">Rest between sets: {exercise.prescription.restBetweenSeconds ?? 'unspecified'} seconds · After exercise: {exercise.prescription.restAfterSeconds ?? 'unspecified'} seconds</p>}</div>)}
      {block.group ? Array.from({ length: roundCount(block.members) }, (_, s) => <section className="superset-round" key={s}><h4>Set {s + 1}</h4><ul>{block.members.map((member) => result(member, s))}</ul></section>) : <ol>{block.members[0].prescription.sets.map((_, s) => <Fragment key={s}>{result(block.members[0], s)}</Fragment>)}</ol>}
    </section>)}
    {info && <ConfirmDialog title={info.name} confirmLabel="Close" onConfirm={() => setInfo(undefined)} onCancel={() => setInfo(undefined)}><p className="plain-text">{info.instructions || 'No instructions.'}</p><p className="plain-text">Prescription note: {info.notes || 'None'}</p>{info.tutorialUrl && isYouTubeUrl(info.tutorialUrl) && <a className="tutorial-link" href={info.tutorialUrl} target="_blank" rel="noopener noreferrer">Open YouTube tutorial</a>}</ConfirmDialog>}
    <button onClick={onClose}>{backLabel}</button>
  </section>
}

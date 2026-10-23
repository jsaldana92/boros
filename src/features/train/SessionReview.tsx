import { recordedRows } from '../../schemas/strength-results'
import { phaseActivity } from '../../schemas/interval-session'
import { sessionRounds } from '../../schemas/session-structure'
import { Fragment, useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { displayDateTime } from '../../lib/display-dates'
import type { CompletedSession } from '../../schemas/session'
import { trainingBlocks, type PlanExercise } from '../../schemas/plan'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
const target = (range?: { min: number; max: number }) => range ? range.min === range.max ? String(range.min) : `${range.min}–${range.max}` : 'unspecified'
function StrengthSessionReview({ session, onClose, onEdit, busy, backLabel = 'Back to workouts' }: { session: CompletedSession; onClose: () => void; onEdit?: () => void; busy?: boolean; backLabel?: string }) {
  const [note, setNote] = useState<{ title: string; text: string }>()
  const result = (exercise: PlanExercise, s: number) => {
    const entry = session.exercises.find((item) => item.id === exercise.id)!, set = entry.sets[s], prescribed = exercise.prescription.sets[s]
    return set ? <li key={exercise.id}>{exercise.groupId && `${exercise.prescription.name}: `}Set {s + 1}: {recordedRows(set).map(({side, result}) => <p key={side ?? 'no'}>{side && `${side === 'left' ? 'Left' : 'Right'}: `}{result.skipped ? result.unrecorded ? 'Unrecorded' : 'Skipped' : `${result.load ?? '—'} ${result.unit ?? ''} · ${result.reps ?? '—'} reps · ${result.rir === undefined ? 'unspecified' : result.rir} actual RIR`}</p>)}<p className="muted">Target: {target(prescribed.reps)} reps · {target(prescribed.rir)} RIR</p></li> : null
  }
  return <section aria-label="Saved session details"><div className="training-heading"><h2>{session.day.name}</h2><button aria-label="Session Note" onClick={() => setNote({ title: 'Session note', text: session.notes })}><NotebookPen aria-hidden="true" size={20} /></button></div><p>{session.partial ? 'Partial session' : 'Complete session'}</p><p>Started: {displayDateTime(session.startedAt)}<br />Completed: {displayDateTime(session.completedAt)}<br />Logged: {displayDateTime(session.loggedAt)}</p>
    {trainingBlocks(session.day).map((block) => <section className="training-exercise" key={block.id} aria-label={block.group ? `Saved superset ${block.group.number}` : block.members[0].prescription.name}>
      {block.group && <><h3>Superset {block.group.number}</h3><p>Rest between rounds: {block.group.restBetweenRoundsSeconds ?? 'unspecified'} seconds · After group: {block.group.restAfterGroupSeconds ?? 'unspecified'} seconds</p></>}
      {block.members.map((exercise) => <div key={exercise.id}><div className="training-heading"><h3>{exercise.prescription.name}</h3><button aria-label={`Note for ${exercise.prescription.name}`} onClick={() => setNote({ title: `Note: ${exercise.prescription.name}`, text: session.exercises.find((item) => item.id === exercise.id)!.notes })}><NotebookPen aria-hidden="true" size={20} /></button></div>{!block.group && <p className="muted">Rest between sets: {exercise.prescription.restBetweenSeconds ?? 'unspecified'} seconds · After exercise: {exercise.prescription.restAfterSeconds ?? 'unspecified'} seconds</p>}</div>)}
      {block.group ? sessionRounds(block.members, session.structure).map((round, s) => <section className="superset-round" key={s}><h4>Set {session.structure?.exercises.find(e => e.id === round[0].member.id)?.sets[round[0].index].round ?? s + 1}</h4><ul>{round.map(({ member, index }) => result(member, index))}</ul></section>) : <ol>{block.members[0].prescription.sets.map((_, s) => <Fragment key={s}>{result(block.members[0], s)}</Fragment>)}</ol>}
    </section>)}
    {note && <ActionDialog title={note.title} onClose={() => setNote(undefined)} actions={<button onClick={() => setNote(undefined)}>Close note</button>}><p className="plain-text">{note.text || 'No notes.'}</p></ActionDialog>}
    <div className="actions"><button disabled={busy} onClick={onClose}>{backLabel}</button>{onEdit && <button disabled={busy} onClick={onEdit}>Edit</button>}</div>
  </section>
}

export function SessionReview(props: Parameters<typeof StrengthSessionReview>[0]) {
  const session = props.session
  if (session.day.trainingType !== 'interval') return <StrengthSessionReview {...props} />
  return <section aria-label="Saved Interval session"><h2>{session.day.name}</h2><p>{session.partial ? 'Partial session' : 'Complete session'}</p><p>Completed: {displayDateTime(session.completedAt)}</p>{session.notes && <section><h3>Note:</h3><p className="plain-text">{session.notes}</p></section>}<ol className="interval-results">{session.interval?.phases.filter(p => p.kind === 'active' || p.kind === 'recovery').map(p => { const actual = phaseActivity(session.interval!, p); return <li key={p.id}><strong>{p.exerciseName}</strong><p>{p.circuitName} &middot; {p.repetition === undefined ? <>Set {p.set} &middot; Round {p.round}</> : p.repetition ? `Repeat ${p.repetition}` : 'Initial'} &middot; {p.kind === 'active' ? 'Active' : 'Rest'}</p><p>{actual.skipped ? 'Skipped' : actual.elapsedMs === undefined ? 'Unknown' : `${actual.elapsedMs / 1000}s / ${p.durationSeconds}s`}</p>{p.kind === 'active' && <p className="plain-text">{session.exercises.find(e => e.id === p.exerciseId)?.notes}</p>}</li> })}</ol><button onClick={props.onClose}>{props.backLabel ?? 'Back'}</button></section>
}

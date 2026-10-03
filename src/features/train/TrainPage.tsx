import { Fragment, useEffect, useRef, useState } from 'react'
import { Info, NotebookPen } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWorkspace } from '../../app/workspace-context'
import { ScreenButton } from '../../app/ScreenButton'
import { useScreenNavigation } from '../../app/navigation-context'
import { sessions } from '../../db/sessions'
import { assessSession, displayedLoad, numericResult, timerRemaining, type CompletedSession, type RestTimer, type SessionDraft } from '../../schemas/session'
import type { WeightUnit } from '../../schemas/profile'
import type { ExerciseInput } from '../../schemas/exercise'
import { isYouTubeUrl } from '../../schemas/exercise'
import { DraftController } from './draft-controller'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, TextareaField } from '../../components/ui/Field'

const target = (range?: { min: number; max: number }) => range ? range.min === range.max ? String(range.min) : `${range.min}–${range.max}` : 'unspecified'
export function TrainPage() {
  const { snapshot } = useWorkspace()
  return <TrainWorkspace key={snapshot.profile.id} profileId={snapshot.profile.id} unit={snapshot.profile.weightUnit} />
}
function TrainWorkspace({ profileId, unit }: { profileId: string; unit: WeightUnit }) {
  const { allowLeave } = useWorkspace()
  const { trainingEntry } = useScreenNavigation()
  const [attempt, setAttempt] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [planId, setPlan] = useState(''), [dayId, setDay] = useState('')
  const [opened, setOpened] = useState<SessionDraft>(), [review, setReview] = useState<CompletedSession>()
  const result = useLiveQuery(async () => {
    try { return { data: await sessions.library(profileId), error: '' } } catch (error) { return { data: undefined, error: (error as Error).message } }
  }, [profileId, attempt])
  const data = result?.data, plan = data?.plans.find((item) => item.id === planId)
  useEffect(() => {
    if (!trainingEntry || trainingEntry.profileId !== profileId) return
    let alive = true
    sessions.library(profileId).then((saved) => {
      if (!alive) return
      const session = saved.sessions.find((item) => item.id === trainingEntry.sessionId || item.draftId === trainingEntry.draftId)
      const draft = saved.drafts.find((item) => item.id === trainingEntry.draftId)
      if (session) setReview(session)
      else if (draft) setOpened(draft)
      else setError('This scheduled session is unavailable. Open it again from Calendar.')
    }).catch((error: Error) => { if (alive) setError(error.message) })
    return () => { alive = false }
  }, [trainingEntry, profileId])
  const focus = () => requestAnimationFrame(() => document.getElementById('train-heading')?.focus())
  const act = async (work: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await work() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <><h1 id="train-heading" tabIndex={-1}>Train</h1>
    {result?.error && <p role="alert">Could not refresh saved training data or timer. {result.error} <button onClick={() => setAttempt((value) => value + 1)}>Retry training</button></p>}
    {opened ? <SessionEditor key={opened.id} initial={opened} unit={unit} timer={data?.timer?.draftId === opened.id ? data.timer : undefined} onClose={() => { if (allowLeave()) { setOpened(undefined); focus() } }} onCompleted={(session) => { setOpened(undefined); setReview(session); focus() }} />
      : review ? <SessionReview session={review} onClose={() => { setReview(undefined); focus() }} />
        : <>
          {!result && <p role="status">Loading training days...</p>}
          {data && <>
            <h2>Start or resume</h2>
            {data.drafts.length > 0 && <section aria-label="Unfinished sessions"><h3>Unfinished sessions</h3>{data.drafts.map((draft) => <p key={draft.id}><button disabled={busy} onClick={() => { setOpened(draft); focus() }}>Resume {draft.planName} / {draft.day.name}{draft.occurrence && ` · ${draft.occurrence.scheduledDate} · ${draft.occurrence.timeZone}`}</button></p>)}</section>}
            {!data.plans.length ? <p>No active plans. <ScreenButton to="create">Open Create</ScreenButton></p> : <fieldset disabled={busy}>
              <label htmlFor="training-plan">Plan</label><select id="training-plan" value={planId} onChange={(event) => { setPlan(event.target.value); setDay('') }}><option value="">Choose a plan</option>{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
              <label htmlFor="training-day">Training day</label><select id="training-day" value={dayId} disabled={!plan} onChange={(event) => setDay(event.target.value)}><option value="">Choose a day</option>{plan?.days.map((day, index) => <option key={day.id} value={day.id}>{index + 1}. {day.name}</option>)}</select>
              <p className="muted">This starts an unscheduled session. Open Calendar to train a scheduled date.</p>
              <button className="primary" disabled={!dayId} onClick={() => void act(async () => { setOpened(await sessions.start(profileId, planId, dayId)); focus() })}>{data.drafts.some((draft) => !draft.occurrence && draft.sourcePlanId === planId && draft.sourceDayId === dayId) ? 'Resume selected day' : 'Start session'}</button>
            </fieldset>}
            <h2 className="library-heading">Saved sessions</h2>
            {!data.sessions.length && <p className="muted">No saved sessions.</p>}
            {data.sessions.map((session) => <article className="exercise-card" key={session.id} aria-label={`Session ${session.planName} / ${session.day.name}`}><h3>{session.planName} / {session.day.name}</h3><p>{session.partial ? 'Partial session' : 'Complete session'} · {new Date(session.completedAt).toLocaleString()}</p><button onClick={() => { setReview(session); focus() }}>Review session</button></article>)}
          </>}
        </>}
    {error && <p role="alert">{error}</p>}
  </>
}
function SessionEditor({ initial, unit, timer, onClose, onCompleted }: { initial: SessionDraft; unit: WeightUnit; timer?: RestTimer; onClose: () => void; onCompleted: (session: CompletedSession) => void }) {
  const { setDirty } = useWorkspace()
  const [controller] = useState(() => new DraftController(initial)), [, render] = useState(0)
  const [note, setNote] = useState<{ index?: number; value: string }>(), [noteDirty, setNoteDirty] = useState(false)
  const [info, setInfo] = useState<ExerciseInput>(), [confirm, setConfirm] = useState<'clear' | 'partial' | 'reload'>()
  const [error, setError] = useState(''), [timerBusy, setTimerBusy] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    controller.activate()
    const unsubscribe = controller.subscribe(() => render((value) => value + 1))
    heading.current?.focus()
    return () => { unsubscribe(); controller.dispose(); setDirty(false) }
  }, [controller, setDirty])
  const unsaved = controller.status !== 'saved' || controller.busy || noteDirty
  useEffect(() => { setDirty(unsaved) }, [unsaved, setDirty])
  const assessed = assessSession(controller.input)
  const act = async (work: () => Promise<unknown>) => { setError(''); try { await work() } catch (error) { setError((error as Error).message) } }
  const timerAction = async (work: () => Promise<unknown>) => { if (timerBusy) return; setTimerBusy(true); await act(work); setTimerBusy(false) }
  const save = () => {
    setError('')
    if (Object.keys(assessed.errors).length) { setError('Correct invalid or partly entered sets, or select Skip set for each omitted set.'); requestAnimationFrame(() => document.querySelector<HTMLElement>('.training-session [aria-invalid="true"]')?.focus()); return }
    if (!assessed.recorded) { setError('Record at least one valid set before saving a session.'); return }
    if (assessed.skipped) setConfirm('partial'); else void finish(false)
  }
  const finish = (partial: boolean) => act(async () => { const result = await controller.complete(partial); setDirty(false); onCompleted(result) })
  return <section className="training-session" aria-label="Training session">
    <div className="training-heading"><h2 ref={heading} tabIndex={-1}>{initial.day.name}</h2><button aria-label="Session Note" disabled={controller.busy || !!controller.record.finalizedAt} onClick={() => setNote({ value: controller.input.notes })}><NotebookPen aria-hidden="true" size={20} /></button></div>
    <p className="muted">{initial.planName} · Weight ({unit}) · Change units in Settings.</p>
    {initial.occurrence && <p>Scheduled: {initial.occurrence.scheduledDate} · Week of {initial.occurrence.scheduledWeek} · {initial.occurrence.timeZone} · In progress</p>}
    <p role="status">{controller.status === 'saved' ? 'Draft saved locally.' : controller.status === 'saving' ? 'Saving draft...' : controller.status === 'pending' ? 'Unsaved changes — saving shortly...' : 'Draft not saved. Your input is kept.'}</p>
    {controller.error && <p role="alert">{controller.error}</p>}
    {controller.status === 'failed' && <div className="actions"><button disabled={controller.busy} onClick={() => void act(() => controller.flush())}>Retry draft save</button><button disabled={controller.busy} onClick={() => setConfirm('reload')}>Reload saved draft</button></div>}
    <p className="muted">Results autosave; notes save after Apply. Complete each set or mark it skipped.</p>
    {timer && <TimerDisplay timer={timer} disabled={timerBusy || controller.busy} onAction={(action) => void timerAction(() => controller.changeTimer(timer.token, action))} />}
    {controller.record.finalizedAt && <p role="status">This draft is completed. Return to training days to review the saved session.</p>}
    <fieldset disabled={controller.busy || timerBusy || !!controller.record.finalizedAt}><legend className="sr-only">Session results</legend>
      {initial.day.exercises.map((exercise, e) => <section className="training-exercise" key={exercise.id} aria-label={exercise.prescription.name}>
        <div className="training-heading"><h3>{exercise.prescription.name}</h3><button aria-label={`Note for ${exercise.prescription.name}`} onClick={() => setNote({ index: e, value: controller.input.exercises[e].notes })}><NotebookPen aria-hidden="true" size={20} /></button><button aria-label={`Information for ${exercise.prescription.name}`} onClick={() => setInfo(exercise.prescription)}><Info aria-hidden="true" size={20} /></button></div>
        <p className="muted">{exercise.prescription.sets.length} sets · targets shown per set</p>
        {exercise.prescription.sets.map((prescribed, s) => {
          const set = controller.input.exercises[e].sets[s], prefix = `${e}.${s}`, label = `${exercise.prescription.name} set ${s + 1}`
          const update = (field: 'load' | 'reps' | 'rir' | 'skipped', value: string | boolean) => { const input = structuredClone(controller.input); Object.assign(input.exercises[e].sets[s], { [field]: value }, field === 'load' ? { unit } : {}); controller.change(input) }
          const between = s < exercise.prescription.sets.length - 1, after = !between && e < initial.day.exercises.length - 1
          return <Fragment key={s}><div className="training-set"><h4>Set {s + 1}</h4><p>Target: {target(prescribed.reps)} reps · {target(prescribed.rir)} RIR</p><div className="training-fields">
            <Field label={`Weight (${unit})`} aria-label={`${label} Weight (${unit})`} inputMode="decimal" maxLength={64} disabled={set.skipped} value={displayedLoad(set, unit)} error={assessed.errors[`${prefix}.load`]} onChange={(event) => update('load', event.target.value)} />
            <Field label="Reps" aria-label={`${label} Repetitions`} inputMode="numeric" maxLength={64} disabled={set.skipped} value={set.reps} error={assessed.errors[`${prefix}.reps`]} onChange={(event) => update('reps', event.target.value)} />
            <Field label="RIR (optional)" aria-label={`${label} Actual RIR (optional)`} inputMode="numeric" maxLength={64} disabled={set.skipped} value={set.rir} error={assessed.errors[`${prefix}.rir`]} onChange={(event) => update('rir', event.target.value)} />
          </div>{set.unit !== unit && set.load && numericResult(set.load) === undefined && <p className="field-error">Invalid saved load in {set.unit}; replace it with a valid {unit} value.</p>}<label className="check-label"><input type="checkbox" checked={set.skipped} onChange={(event) => update('skipped', event.target.checked)} />Skip {label}</label></div>
            {(between || after) && <RestControl label={`${exercise.prescription.name} ${between ? `after set ${s + 1}` : 'between exercises'}`} seconds={between ? exercise.prescription.restBetweenSeconds : exercise.prescription.restAfterSeconds} onStart={(seconds) => timerAction(() => controller.startTimer(exercise.id, s, seconds))} />}
          </Fragment>
        })}
      </section>)}
    </fieldset>
    {error && error !== controller.error && <p role="alert">{error}</p>}
    <button disabled={controller.busy || timerBusy} onClick={onClose}>Back to training days</button>
    <div className="session-actions"><button className="primary" disabled={controller.busy || timerBusy || !!controller.record.finalizedAt} onClick={save}>{controller.busy ? 'Working...' : 'Save'}</button><button disabled={controller.busy || timerBusy || !!controller.record.finalizedAt} onClick={() => setConfirm('clear')}>Clear</button></div>
    {note && <NoteDialog value={note.value} title={note.index === undefined ? 'Session note' : `Note: ${initial.day.exercises[note.index].prescription.name}`} onDirty={setNoteDirty} onClose={() => { setNote(undefined); setNoteDirty(false) }} onApply={(value) => { const input = structuredClone(controller.input); if (note.index === undefined) input.notes = value; else input.exercises[note.index].notes = value; controller.change(input); setNote(undefined); setNoteDirty(false) }} />}
    {info && <ConfirmDialog title={info.name} confirmLabel="Close" onCancel={() => setInfo(undefined)} onConfirm={() => setInfo(undefined)}><p className="plain-text">{info.instructions || 'No instructions.'}</p>{info.tutorialUrl && isYouTubeUrl(info.tutorialUrl) && <a className="tutorial-link" href={info.tutorialUrl} target="_blank" rel="noopener noreferrer">Open YouTube tutorial</a>}</ConfirmDialog>}
    {confirm && <ConfirmDialog title={confirm === 'clear' ? 'Clear this draft?' : confirm === 'partial' ? 'Save partial session?' : 'Reload saved draft?'} confirmLabel={confirm === 'clear' ? 'Clear draft' : confirm === 'partial' ? 'Save partial session' : 'Reload draft'} onCancel={() => setConfirm(undefined)} onConfirm={() => {
      const action = confirm; setConfirm(undefined)
      if (action === 'partial') void finish(true)
      else if (action === 'clear') void act(() => controller.clear())
      else void act(async () => { await controller.reload(); requestAnimationFrame(() => heading.current?.focus()) })
    }}><p>{confirm === 'clear' ? 'Reset only this draft’s entered results, session/exercise notes, and timer. Its prescription and all saved sessions and plans are kept.' : confirm === 'partial' ? `${assessed.skipped} omitted sets will be marked skipped. ${assessed.recorded} recorded sets will be saved. Cancel keeps all input.` : 'Copy any input you need first. Load the latest saved version and discard your unpersisted edits.'}</p></ConfirmDialog>}
  </section>
}
function NoteDialog({ value, title, onDirty, onApply, onClose }: { value: string; title: string; onDirty: (value: boolean) => void; onApply: (value: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value)
  const close = () => { if (text === value || window.confirm('Discard unapplied note changes?')) onClose() }
  return <ConfirmDialog title={title} confirmLabel="Apply note" onCancel={close} onConfirm={() => onApply(text)}><TextareaField label="Note" maxLength={20000} value={text} onChange={(event) => { setText(event.target.value); onDirty(event.target.value !== value) }} /></ConfirmDialog>
}
function RestControl({ label, seconds, onStart }: { label: string; seconds?: number; onStart: (seconds?: number) => Promise<void> }) {
  const [manual, setManual] = useState(''), [error, setError] = useState('')
  return <div className="rest-control">{seconds === undefined && <Field label={`Rest seconds ${label}`} inputMode="numeric" maxLength={16} value={manual} error={error} onChange={(event) => setManual(event.target.value)} />}<button disabled={seconds === 0} aria-label={`REST ${label}`} onClick={() => {
    const value = seconds ?? numericResult(manual, true)
    if (value === undefined) { setError('Enter nonnegative whole seconds.'); return }
    setError(''); void onStart(value)
  }}>REST · {seconds === undefined ? 'manual duration' : seconds === 0 ? '0 seconds — no timed rest' : `${seconds} seconds`}</button></div>
}
function TimerDisplay({ timer, disabled, onAction }: { timer: RestTimer; disabled: boolean; onAction: (action: 'stop' | 'reset') => void }) {
  const [, tick] = useState(0)
  useEffect(() => { const update = () => tick((value) => value + 1); const interval = setInterval(update, 250); document.addEventListener('visibilitychange', update); return () => { clearInterval(interval); document.removeEventListener('visibilitychange', update) } }, [])
  const left = timerRemaining(timer)
  return <section className="rest-timer" aria-label="Rest timer"><p>{timer.label} · {timer.durationSeconds} seconds configured</p><p role="timer" aria-live="off">{left ? `${left} seconds remaining` : 'Rest finished'}</p><div className="actions"><button disabled={disabled} onClick={() => onAction('stop')}>Stop timer</button><button disabled={disabled} onClick={() => onAction('reset')}>Reset timer</button></div><p className="muted">No background alarm or notification.</p></section>
}
function SessionReview({ session, onClose }: { session: CompletedSession; onClose: () => void }) {
  const [info, setInfo] = useState<ExerciseInput>()
  return <section aria-label="Saved session details"><h2>{session.planName} / {session.day.name}</h2><p>{session.partial ? 'Partial session' : 'Complete session'}</p>{session.occurrence && <p>Scheduled: {session.occurrence.scheduledDate} · Week of {session.occurrence.scheduledWeek} · {session.occurrence.timeZone} · Completed</p>}<p>Started: {session.startedAt}<br />Completed: {session.completedAt}<br />Logged: {session.loggedAt}</p><p className="plain-text">Session note: {session.notes || 'None'}</p>
    {session.day.exercises.map((exercise, e) => <section className="training-exercise" key={exercise.id}><div className="training-heading"><h3>{exercise.prescription.name}</h3><button aria-label={`Information for ${exercise.prescription.name}`} onClick={() => setInfo(exercise.prescription)}><Info aria-hidden="true" size={20} /></button></div><p className="plain-text">Exercise note: {session.exercises[e].notes || 'None'}</p><p className="muted">Rest between sets: {exercise.prescription.restBetweenSeconds ?? 'unspecified'} seconds · After exercise: {exercise.prescription.restAfterSeconds ?? 'unspecified'} seconds</p><ol>{session.exercises[e].sets.map((set, s) => <li key={s}>Set {s + 1}: {set.skipped ? 'Skipped' : `${set.load} ${set.unit} · ${set.reps} reps · ${set.rir === undefined ? 'unspecified' : set.rir} actual RIR`}<p className="muted">Target: {target(exercise.prescription.sets[s].reps)} reps · {target(exercise.prescription.sets[s].rir)} RIR</p></li>)}</ol></section>)}
    {info && <ConfirmDialog title={info.name} confirmLabel="Close" onConfirm={() => setInfo(undefined)} onCancel={() => setInfo(undefined)}><p className="plain-text">{info.instructions || 'No instructions.'}</p><p className="plain-text">Prescription note: {info.notes || 'None'}</p>{info.tutorialUrl && isYouTubeUrl(info.tutorialUrl) && <a className="tutorial-link" href={info.tutorialUrl} target="_blank" rel="noopener noreferrer">Open YouTube tutorial</a>}</ConfirmDialog>}
    <button onClick={onClose}>Back to training days</button><p className="muted">To train again, return to training days and deliberately start another session.</p>
  </section>
}

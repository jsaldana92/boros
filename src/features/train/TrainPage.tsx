import { TimerDisplay } from './TimerDisplay'
import { TimerFeedback } from './timer-feedback'
import { RestInput } from '../../components/ui/RestInput'
import { parseRest, restFields, restLabel } from '../../lib/rest-duration'
import { SessionReview } from './SessionReview'
import { displayDateTime } from '../../lib/display-dates'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Info, NotebookPen } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWorkspace } from '../../app/workspace-context'
import { PlanSelection } from './PlanSelection'
import { PlanCard } from '../create/PlanCard'
import { WeeklyPlan } from './WeeklyPlan'
import { weekly } from '../../db/weekly'
import { useScreenNavigation } from '../../app/navigation-context'
import { sessions } from '../../db/sessions'
import { assessSession, displayedLoad, numericResult, type CompletedSession, type RestTimer, type SessionDraft } from '../../schemas/session'
import type { WeightUnit } from '../../schemas/profile'
import type { ExerciseInput } from '../../schemas/exercise'
import { isYouTubeUrl } from '../../schemas/exercise'
import { roundCount, trainingBlocks, type PlanExercise } from '../../schemas/plan'
import { DraftController } from './draft-controller'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, TextareaField } from '../../components/ui/Field'

const target = (range?: { min: number; max: number }) => range ? range.min === range.max ? String(range.min) : `${range.min}–${range.max}` : 'unspecified'
export function TrainPage() {
  const { snapshot } = useWorkspace()
  return <TrainWorkspace key={snapshot.profile.id} profileId={snapshot.profile.id} unit={snapshot.profile.weightUnit} />
}
function TrainWorkspace({ profileId, unit }: { profileId: string; unit: WeightUnit }) {
  const { snapshot } = useWorkspace(), { trainingEntry } = useScreenNavigation()
  const [selecting, setSelecting] = useState(false), [history, setHistory] = useState(false)
  const [attempt, setAttempt] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false), [planId, setPlan] = useState('')
  const [opened, setOpened] = useState<SessionDraft>(), [review, setReview] = useState<CompletedSession>()
  const result = useLiveQuery(async () => {
    try { return { data: await sessions.library(profileId), error: '' } } catch (error) { return { data: undefined, error: (error as Error).message } }
  }, [profileId, attempt])
  const data = result?.data, selected = (snapshot.profile.selectedPlanIds ?? []).flatMap((id) => data?.plans.find((p) => p.id === id) ?? [])
  const plan = selected.find((item) => item.id === planId)
  const focus = () => requestAnimationFrame(() => document.getElementById('train-heading')?.focus())
  const open = (value: { draft?: SessionDraft; session?: CompletedSession }) => { setOpened(value.draft); setReview(value.session); focus() }
  useEffect(() => {
    if (!trainingEntry || trainingEntry.profileId !== profileId) return
    let alive = true
    sessions.library(profileId).then((saved) => {
      if (!alive) return
      const session = saved.sessions.find((item) => item.id === trainingEntry.sessionId || item.draftId === trainingEntry.draftId)
      const draft = saved.drafts.find((item) => item.id === trainingEntry.draftId)
      if (session) { setOpened(undefined); setReview(session) }
      else if (draft) { setReview(undefined); setOpened(draft) }
      else setError('This session is unavailable. Open it again from its program.')
    }).catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [trainingEntry, profileId])
  const act = async (work: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await work() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <><h1 id="train-heading" tabIndex={-1}>{!opened && !review && !history && plan ? plan.name : 'Train'}</h1>
    {result?.error && <p role="alert">Could not refresh saved training data or timer. {result.error} <button onClick={() => setAttempt((value) => value + 1)}>Retry training</button></p>}
    {opened ? <SessionEditor key={opened.id} initial={opened} unit={unit} timer={data?.timer?.draftId === opened.id ? data.timer : undefined} onClose={() => { setOpened(undefined); focus() }} onCompleted={(session) => { setOpened(undefined); setReview(session); focus() }} />
      : review ? <SessionReview session={review} onClose={() => { setReview(undefined); focus() }} /> : <>
        {!result && <p role="status">Loading training days...</p>}
        {data && <>
          {plan && !history ? <><WeeklyPlan key={plan.id} plan={plan} runs={data.schedules.filter((run) => run.planId === plan.id)} onOpened={open} /><div className="actions"><button onClick={() => { setPlan(''); focus() }}>Back to plans</button><button disabled={busy} onClick={() => void act(async () => { await weekly.removePlan(profileId, plan.id); setPlan(''); focus() })}>Remove from Train</button></div></> : <>
            <button className="catalog-card add-plan-card" onClick={() => setSelecting(true)}>Add Plan</button>
            {!selected.length && <p>No active plan(s) selected.</p>}
            <div className="train-plan-cards">{selected.map((item) => <PlanCard key={item.id} plan={item} note disabled={busy} onClick={() => void act(async () => { await weekly.activate(profileId, item.id); setPlan(item.id); setHistory(false); focus() })} />)}</div>
          </>}
          {!!data.sessions.length && <button aria-expanded={history} onClick={() => setHistory(!history)}>Saved sessions ({data.sessions.length})</button>}
          {history && <section aria-label="Saved sessions"><h2>Saved sessions</h2>{data.sessions.map((session) => <article className="exercise-card" key={session.id} aria-label={'Session ' + session.planName + ' / ' + session.day.name}><h3>{session.planName} / {session.day.name}</h3><p>{session.partial ? 'Partial session' : 'Complete session'} / {displayDateTime(session.completedAt)}</p><button onClick={() => open({ session })}>Review session</button></article>)}</section>}
          {data.drafts.length > 0 && <section aria-label="Unfinished sessions"><h2>Unfinished sessions</h2>{data.drafts.map((draft) => <p key={draft.id}><button onClick={() => { setPlan(draft.sourcePlanId); open({ draft }) }}>Resume {draft.planName} / {draft.day.name}{draft.occurrence ? ' / Week of ' + draft.occurrence.scheduledWeek + ' / ' + draft.occurrence.timeZone : ' / Legacy session (week unassigned)'}</button></p>)}</section>}
          {selecting && <PlanSelection plans={data.plans} onClose={() => { setSelecting(false); setHistory(false) }} />}
        </>}
      </>}
    {error && <p role="alert">{error}</p>}
  </>
}
function SessionEditor({ initial, unit, timer, onClose, onCompleted }: { initial: SessionDraft; unit: WeightUnit; timer?: RestTimer; onClose: () => void; onCompleted: (session: CompletedSession) => void }) {
  const { setDirty, sound } = useWorkspace()
  const [controller] = useState(() => new DraftController(initial)), [, render] = useState(0)
  const [note, setNote] = useState<{ index?: number; value: string }>(), [noteDirty, setNoteDirty] = useState(false)
  const [info, setInfo] = useState<ExerciseInput>(), [confirm, setConfirm] = useState<'clear' | 'partial' | 'reload' | 'leave'>()
  const [error, setError] = useState(''), [timerBusy, setTimerBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [feedback] = useState(() => new TimerFeedback(() => new Audio(new URL(import.meta.env.BASE_URL + 'rest-complete.mp3', document.baseURI).href), (milliseconds) => { navigator.vibrate?.(milliseconds) }, setError))
  useEffect(() => () => feedback.cancel(), [feedback, sound])
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
  const entered = !!controller.input.notes || controller.input.exercises.some((exercise) => !!exercise.notes || exercise.sets.some((set) => !!set.load || !!set.reps || !!set.rir || set.skipped))
  const leave = async () => { if (leaving) return; setLeaving(true); setError(''); try { await controller.flush(); feedback.cancel(); setDirty(false); onClose() } catch (e) { setError((e as Error).message) } finally { setLeaving(false) } }
  const act = async (work: () => Promise<unknown>) => { setError(''); try { await work() } catch (error) { setError((error as Error).message) } }
  const timerAction = async (work: () => Promise<unknown>) => { if (timerBusy) return; setTimerBusy(true); await act(work); setTimerBusy(false) }
  const save = () => {
    setError('')
    if (Object.keys(assessed.errors).length) { setError('Correct invalid or partly entered sets, or select Skip set for each omitted set.'); requestAnimationFrame(() => document.querySelector<HTMLElement>('.training-session [aria-invalid="true"]')?.focus()); return }
    if (!assessed.recorded) { setError('Record at least one valid set before saving a session.'); return }
    if (assessed.skipped) setConfirm('partial'); else void finish(false)
  }
  const finish = (partial: boolean) => act(async () => { const result = await controller.complete(partial); setDirty(false); onCompleted(result) })
  const memberLabel = (exercise: PlanExercise) => initial.day.exercises.filter((item) => item.prescription.name === exercise.prescription.name).length > 1 ? `${exercise.prescription.name} occurrence ${initial.day.exercises.findIndex((item) => item.id === exercise.id) + 1}` : exercise.prescription.name
  const memberHeading = (exercise: PlanExercise) => {
    const e = initial.day.exercises.findIndex((item) => item.id === exercise.id), label = memberLabel(exercise)
    return <div className="training-heading" key={exercise.id}><h3>{label}</h3><button aria-label={`Note for ${label}`} onClick={() => setNote({ index: e, value: controller.input.exercises[e].notes })}><NotebookPen aria-hidden="true" size={20} /></button><button aria-label={`Information for ${label}`} onClick={() => setInfo(exercise.prescription)}><Info aria-hidden="true" size={20} /></button></div>
  }
  const setFields = (exercise: PlanExercise, s: number) => {
    const e = initial.day.exercises.findIndex((item) => item.id === exercise.id), prescribed = exercise.prescription.sets[s]
    if (!prescribed) return null
    const set = controller.input.exercises[e].sets[s], prefix = `${e}.${s}`, label = `${memberLabel(exercise)} set ${s + 1}`
    const update = (field: 'load' | 'reps' | 'rir' | 'skipped', value: string | boolean) => { const input = structuredClone(controller.input); Object.assign(input.exercises[e].sets[s], { [field]: value }, field === 'load' ? { unit } : {}); controller.change(input) }
    return <div className="training-set" key={exercise.id} data-occurrence-id={exercise.id}><h4>{exercise.groupId ? memberLabel(exercise) : `Set ${s + 1}`}</h4><p>Target: {target(prescribed.reps)} reps · {target(prescribed.rir)} RIR</p><div className="training-fields">
      <Field label={`Weight (${unit})`} aria-label={`${label} Weight (${unit})`} inputMode="decimal" maxLength={64} disabled={set.skipped} value={displayedLoad(set, unit)} error={assessed.errors[`${prefix}.load`]} onChange={(event) => update('load', event.target.value)} />
      <Field label="Reps" aria-label={`${label} Repetitions`} inputMode="numeric" maxLength={64} disabled={set.skipped} value={set.reps} error={assessed.errors[`${prefix}.reps`]} onChange={(event) => update('reps', event.target.value)} />
      <Field label="RIR (optional)" aria-label={`${label} Actual RIR (optional)`} inputMode="numeric" maxLength={64} disabled={set.skipped} value={set.rir} error={assessed.errors[`${prefix}.rir`]} onChange={(event) => update('rir', event.target.value)} />
    </div>{set.unit !== unit && set.load && numericResult(set.load) === undefined && <p className="field-error">Invalid saved load in {set.unit}; replace it with a valid {unit} value.</p>}<label className="check-label"><input type="checkbox" checked={set.skipped} onChange={(event) => update('skipped', event.target.checked)} />Skip {label}</label></div>
  }
  return <section className="training-session" aria-label="Training session">
    <div className="training-heading"><h2 ref={heading} tabIndex={-1}>{initial.day.name}</h2><button aria-label="Session Note" disabled={controller.busy || !!controller.record.finalizedAt} onClick={() => setNote({ value: controller.input.notes })}><NotebookPen aria-hidden="true" size={20} /></button></div>
    <p className="muted">{initial.planName} · Weight ({unit}) · Change units in Settings.</p>
    {initial.occurrence && <p>{initial.occurrence.unscheduled ? 'Weekly program' : 'Scheduled: ' + initial.occurrence.scheduledDate} · Week of {initial.occurrence.scheduledWeek} · {initial.occurrence.timeZone} · In progress</p>}
    {controller.status !== 'saved' && <p role="status">{controller.status === 'failed' ? 'Draft not saved. Your input is kept.' : 'Saving…'}</p>}
    {controller.error && <p role="alert">{controller.error}</p>}
    {controller.status === 'failed' && <div className="actions"><button disabled={controller.busy} onClick={() => void act(() => controller.flush())}>Retry draft save</button><button disabled={controller.busy} onClick={() => setConfirm('reload')}>Reload saved draft</button></div>}
    {timer && <TimerDisplay key={timer.token} feedback={feedback} sound={sound} timer={timer} disabled={timerBusy || controller.busy} onAction={(action) => void timerAction(() => controller.changeTimer(timer.token, action))} />}
    {controller.record.finalizedAt && <p role="status">This draft is completed. Return to training days to review the saved session.</p>}
    <fieldset disabled={leaving || controller.busy || timerBusy || !!controller.record.finalizedAt}><legend className="sr-only">Session results</legend>
      {trainingBlocks(initial.day).map((block, b, blocks) => block.group ? <section className="training-exercise training-superset" key={block.id} aria-label={`Superset ${block.group.number}`}>
        <h3>Superset {block.group.number}</h3><p>{block.members.map((member) => `${memberLabel(member)}: ${member.prescription.sets.length} sets`).join(' · ')}</p>
        {block.members.map(memberHeading)}
        {Array.from({ length: roundCount(block.members) }, (_, s) => <section className="superset-round" key={s} aria-label={`Superset ${block.group!.number} set ${s + 1}`}><h4>Set {s + 1}</h4>{block.members.map((member) => setFields(member, s))}
          {<RestControl label={`Superset ${block.group!.number} ${s < roundCount(block.members) - 1 ? `after round ${s + 1}` : 'after group'}`} seconds={s < roundCount(block.members) - 1 ? block.group!.restBetweenRoundsSeconds : block.group!.restAfterGroupSeconds} onStart={(seconds) => { feedback.unlock(sound); return timerAction(() => controller.startGroupTimer(block.id, s, seconds)) }} />}
        </section>)}
      </section> : <section className="training-exercise" key={block.id} aria-label={memberLabel(block.members[0])}>
        {memberHeading(block.members[0])}<p className="muted">{block.members[0].prescription.sets.length} sets · targets shown per set</p>
        {block.members[0].prescription.sets.map((_, s, sets) => <Fragment key={s}>{setFields(block.members[0], s)}{(s < sets.length - 1 || b < blocks.length - 1) && <RestControl label={`${memberLabel(block.members[0])} ${s < sets.length - 1 ? `after set ${s + 1}` : 'between exercises'}`} seconds={s < sets.length - 1 ? block.members[0].prescription.restBetweenSeconds : block.members[0].prescription.restAfterSeconds} onStart={(seconds) => { feedback.unlock(sound); return timerAction(() => controller.startTimer(block.id, s, seconds)) }} />}</Fragment>)}
      </section>)}
    </fieldset>
    {error && error !== controller.error && <p role="alert">{error}</p>}
    <div className="session-actions"><button className="primary" disabled={leaving || controller.busy || timerBusy || !!controller.record.finalizedAt} onClick={save}>{controller.busy ? 'Working...' : 'Save'}</button><div className="session-secondary"><button disabled={leaving || controller.busy || timerBusy} onClick={() => entered ? setConfirm('leave') : void leave()}>Back</button><button disabled={leaving || controller.busy || timerBusy || !!controller.record.finalizedAt} onClick={() => setConfirm('clear')}>Clear</button></div></div>
    {note && <NoteDialog value={note.value} title={note.index === undefined ? 'Session note' : `Note: ${initial.day.exercises[note.index].prescription.name}`} onDirty={setNoteDirty} onClose={() => { setNote(undefined); setNoteDirty(false) }} onApply={(value) => { const input = structuredClone(controller.input); if (note.index === undefined) input.notes = value; else input.exercises[note.index].notes = value; controller.change(input); setNote(undefined); setNoteDirty(false) }} />}
    {info && <ConfirmDialog title={info.name} confirmLabel="Close" onCancel={() => setInfo(undefined)} onConfirm={() => setInfo(undefined)}><p className="plain-text">{info.instructions || 'No instructions.'}</p><p className="plain-text">Prescription note: {info.notes || 'None'}</p>{info.tutorialUrl && isYouTubeUrl(info.tutorialUrl) && <a className="tutorial-link" href={info.tutorialUrl} target="_blank" rel="noopener noreferrer">Open YouTube tutorial</a>}</ConfirmDialog>}
    {confirm && <ConfirmDialog title={confirm === 'clear' ? 'Clear entered results and notes?' : confirm === 'leave' ? 'Leave this session?' : confirm === 'partial' ? 'Save partial session?' : 'Reload saved draft?'} confirmLabel={confirm === 'clear' ? 'Clear draft' : confirm === 'leave' ? 'Leave session' : confirm === 'partial' ? 'Save partial session' : 'Reload draft'} onCancel={() => setConfirm(undefined)} onConfirm={() => {
      const action = confirm; setConfirm(undefined)
      if (action === 'leave') void leave()
      else if (action === 'partial') void finish(true)
      else if (action === 'clear') { feedback.cancel(); void act(() => controller.clear()) }
      else void act(async () => { await controller.reload(); requestAnimationFrame(() => heading.current?.focus()) })
    }}><p>{confirm === 'leave' ? 'Leave this session? Your saved draft will be kept. Pending changes must finish saving before leaving.' : confirm === 'clear' ? 'Reset only this draft’s entered results, session/exercise notes, and timer. Its prescription and all saved sessions and plans are kept.' : confirm === 'partial' ? `${assessed.skipped} omitted sets will be marked skipped. ${assessed.recorded} recorded sets will be saved. Cancel keeps all input.` : 'Copy any input you need first. Load the latest saved version and discard your unpersisted edits.'}</p></ConfirmDialog>}
  </section>
}
function NoteDialog({ value, title, onDirty, onApply, onClose }: { value: string; title: string; onDirty: (value: boolean) => void; onApply: (value: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value)
  const close = () => { if (text === value || window.confirm('Discard unapplied note changes?')) onClose() }
  return <ConfirmDialog title={title} confirmLabel="Apply note" onCancel={close} onConfirm={() => onApply(text)}><TextareaField label="Note" maxLength={20000} value={text} onChange={(event) => { setText(event.target.value); onDirty(event.target.value !== value) }} /></ConfirmDialog>
}
function RestControl({ label, seconds, onStart }: { label: string; seconds?: number; onStart: (seconds?: number) => Promise<void> }) {
  const [manual, setManual] = useState(() => restFields()), [error, setError] = useState('')
  const parsed = parseRest(manual)
  return <div className="rest-control">{seconds === undefined && <RestInput label={`Rest ${label}`} value={manual} errors={parsed.errors} onChange={(value) => { setManual(value); setError('') }} />}<button disabled={seconds === 0} aria-label={`REST ${label}`} onClick={() => {
    const value = seconds ?? parsed.value
    if (value === undefined || Object.keys(parsed.errors).length) { setError('Enter a valid rest duration in minutes and seconds.'); return }
    setError(''); void onStart(value)
  }}>REST · {seconds === undefined ? 'manual duration' : seconds === 0 ? '0 seconds — no timed rest' : restLabel(seconds)}</button>{error && <p role="alert">{error}</p>}</div>
}

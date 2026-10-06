import { WorkoutPicker } from '../create/WorkoutPicker'
import { plans } from '../../db/plans'
import { ExercisePicker } from '../create/ExercisePicker'
import { sessionRounds } from '../../schemas/session-structure'
import type { Screen } from '../../app/navigation-preference'
import { ExerciseInformation } from './ExerciseInformation'
import { browserZone, localToday } from '../../lib/calendar-dates'
import type { ResultHints } from '../../lib/previous-results'
import { TimerDisplay } from './TimerDisplay'
import { TimerFeedback } from './timer-feedback'
import { restLabel } from '../../lib/rest-duration'
import { SessionReview } from './SessionReview'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Info, NotebookPen } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWorkspace } from '../../app/workspace-context'
import { PlanSelection } from './PlanSelection'
import { PlanCard } from '../create/PlanCard'
import { WeeklyPlan } from './WeeklyPlan'
import { currentProgramLabel, programSummary } from '../../lib/program-display'
import { planSubtitle } from '../create/plan-subtitle'
import { useCurrentInstant } from '../../lib/use-current-instant'
import { activePlanRuns } from '../../db/active-plans'
import { useScreenNavigation } from '../../app/navigation-context'
import { sessions } from '../../db/sessions'
import { assessSession, hasSessionInput, hasDraftProgress, displayedLoad, numericResult, type CompletedSession, type RestTimer, type SessionDraft } from '../../schemas/session'
import type { WeightUnit } from '../../schemas/profile'
import type { ExerciseInput } from '../../schemas/exercise'
import { trainingBlocks, type PlanExercise } from '../../schemas/plan'
import { DraftController } from './draft-controller'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, TextareaField } from '../../components/ui/Field'

const target = (range?: { min: number; max: number }) => range ? range.min === range.max ? String(range.min) : `${range.min}–${range.max}` : 'unspecified'
export function TrainPage() {
  const { snapshot } = useWorkspace()
  return <TrainWorkspace key={snapshot.profile.id} profileId={snapshot.profile.id} unit={snapshot.profile.weightUnit} />
}
function TrainWorkspace({ profileId, unit }: { profileId: string; unit: WeightUnit }) {
  const { snapshot } = useWorkspace(), { trainingEntry, returnScreen, openScreen } = useScreenNavigation()
  const [selecting, setSelecting] = useState(false), [workoutPicker, setWorkoutPicker] = useState(false), [starting, setStarting] = useState(false)
  const [attempt, setAttempt] = useState(0), [error, setError] = useState(''), [planId, setPlan] = useState('')
  const [opened, setOpened] = useState<SessionDraft>(), [review, setReview] = useState<CompletedSession>()
  const [programContext, setProgramContext] = useState<{ planId: string; runId: string; week?: string }>()
  const instant = useCurrentInstant()
  const result = useLiveQuery(async () => {
    try { return { data: await sessions.library(profileId), error: '' } } catch (error) { return { data: undefined, error: (error as Error).message } }
  }, [profileId, attempt])
  const data = result?.data, activeRuns = activePlanRuns(data?.schedules ?? [], data?.sessions ?? [], instant), activeIds = new Set(activeRuns.map((run) => run.planId))
  const selected = data?.plans.filter((plan) => activeIds.has(plan.id)) ?? []
  const plan = data?.plans.find((item) => item.id === planId)
  const focus = () => requestAnimationFrame(() => document.getElementById('train-heading')?.focus())
  const open = (value: { draft?: SessionDraft; session?: CompletedSession }) => { const record = value.draft ?? value.session; if (record?.occurrence) setProgramContext({ planId: record.sourcePlanId!, runId: record.occurrence.scheduleId, week: record.occurrence.scheduledWeek }); setOpened(value.draft); setReview(value.session); focus() }
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
  const startWorkout = async (id?: string) => { if (starting) return; setStarting(true); setError(''); try { const draft = await sessions.startStandalone(profileId, id); setWorkoutPicker(false); setPlan(''); open({ draft }) } catch (e) { setError((e as Error).message) } finally { setStarting(false) } }
  const selectedRun = data?.schedules.find((run) => run.id === programContext?.runId && run.planId === planId)
  return <><h1 id="train-heading" tabIndex={-1}>{opened ? opened.source?.kind === 'custom' ? 'Custom Workout' : opened.source?.kind === 'workout' ? 'Standalone Workout' : opened.planName : !review && plan ? selectedRun ? programSummary(selectedRun, localToday(selectedRun.timeZone, instant)).name : plan.name : 'Train'}</h1>
    {result?.error && <p role="alert">Could not refresh saved training data or timer. {result.error} <button onClick={() => setAttempt((value) => value + 1)}>Retry training</button></p>}
    {opened ? <SessionEditor key={opened.id} initial={opened} unit={unit} timer={data?.timer?.draftId === opened.id ? data.timer : undefined} onClose={() => { setOpened(undefined); if (trainingEntry && returnScreen !== 'train') openScreen(returnScreen); else focus() }} onCompleted={(session) => { setOpened(undefined); setReview(session); focus() }} />
      : review ? <SessionReview session={review} onClose={() => { setReview(undefined); focus() }} /> : <>
        {!result && <p role="status">Loading workouts...</p>}
        {data && <>
          {plan ? <WeeklyPlan key={programContext?.runId ?? plan.id} plan={plan} runId={programContext?.planId === plan.id ? programContext.runId : ''} initialWeek={programContext?.planId === plan.id ? programContext.week : undefined} runs={data.schedules.filter((run) => run.planId === plan.id)} onOpened={open} onBack={() => { setPlan(''); focus() }} onLeft={() => { setPlan(''); setProgramContext(undefined); focus() }} /> : <>
            <h2>Active Plans</h2><p>Complete an on going plan</p>
            {!selected.length && <p className="train-empty">No active plan(s) selected.</p>}
            <div className="train-plan-cards">{selected.flatMap((item) => {
              const runs = activeRuns.filter((run) => run.planId === item.id)
              return runs.map((run) => { const summary = programSummary(run, localToday(run.timeZone, instant)); return <PlanCard key={run.id} plan={summary} subtitle={<><span className="current-program-week">{currentProgramLabel(run, data.sessions, instant)}</span><span className="muted">{planSubtitle(summary)}</span></>} onClick={() => { setProgramContext({ planId: item.id, runId: run.id }); setPlan(item.id); focus() }} /> })
            })}</div><button className="catalog-card add-plan-card" onClick={() => setSelecting(true)}>Add Plan</button>
            <h2>Workout</h2><p>Start a workout</p><div className="train-workout-actions"><button disabled={starting} onClick={() => setWorkoutPicker(true)}>Existing Workout</button><button disabled={starting} onClick={() => void startWorkout()}>Custom Workout</button></div>
          </>}
          {data.drafts.some((draft) => hasDraftProgress(draft)) && <section aria-label="Unfinished sessions"><h2>Unfinished sessions</h2><div className="unfinished-cards">{data.drafts.filter((draft) => hasDraftProgress(draft)).map((draft) => <button className="catalog-card unfinished-card" key={draft.id} aria-label={'Resume ' + (draft.planName ?? draft.day.name) + ' / ' + draft.day.name + ' / ' + localToday(draft.occurrence?.timeZone ?? snapshot.profile.timeZone ?? browserZone(), new Date(draft.startedAt))} onClick={() => { setPlan(draft.sourcePlanId ?? ''); open({ draft }) }}><span>{draft.planName ?? (draft.source?.kind === 'custom' ? 'Custom Workout' : 'Standalone Workout')} &middot; {localToday(draft.occurrence?.timeZone ?? snapshot.profile.timeZone ?? browserZone(), new Date(draft.startedAt))}</span><small>{draft.day.name}</small></button>)}</div></section>}
          {selecting && <PlanSelection plans={data.plans} activeIds={activeIds} onClose={() => { setSelecting(false) }} />}
        </>}
      </>}
    {workoutPicker && <WorkoutPicker profileId={profileId} onClose={() => setWorkoutPicker(false)} onChoose={(workout) => void startWorkout(workout.id)} />}
    {error && <p role="alert">{error}</p>}
  </>
}
function SessionEditor({ initial, unit, timer, onClose, onCompleted }: { initial: SessionDraft; unit: WeightUnit; timer?: RestTimer; onClose: () => void; onCompleted: (session: CompletedSession) => void }) {
  const { setDirty, sound, registerLeaveGuard, snapshot } = useWorkspace()
  const { rememberTraining } = useScreenNavigation()
  const [picking, setPicking] = useState(false)
  const [savingCustom, setSavingCustom] = useState<{ partial: boolean }>(), [addToLibrary, setAddToLibrary] = useState(false), [workoutName, setWorkoutName] = useState('')
  const choices = useLiveQuery(async () => { try { return { data: await plans.library(initial.profileId) } } catch (error) { return { error: (error as Error).message } } }, [initial.profileId])
  const [controller] = useState(() => new DraftController(initial)), [, render] = useState(0)
  const day = controller.snapshot.day, structure = controller.snapshot.structure
  useEffect(() => { rememberTraining({ profileId: initial.profileId, draftId: initial.id }) }, [initial.profileId, initial.id, rememberTraining])
  const [note, setNote] = useState<{ index?: number; value: string }>(), [noteDirty, setNoteDirty] = useState(false)
  const [info, setInfo] = useState<ExerciseInput>(), [confirm, setConfirm] = useState<'clear' | 'partial' | 'reload' | 'leave'>()
  const [error, setError] = useState(''), [timerBusy, setTimerBusy] = useState(false)
  const [leaving, setLeaving] = useState(false), leaveBusy = useRef(false), leaveReply = useRef<((allowed: boolean) => void) | undefined>(undefined)
  const hints = useLiveQuery(async () => { try { return { values: await sessions.hints({ ...controller.record, day }, unit) } } catch { return { values: {} as ResultHints, error: 'Previous results could not load. You can still enter this session.' } } }, [initial.id, day, unit])
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
  const discard = async (reply: (allowed: boolean) => void) => {
    if (leaveBusy.current) { reply(false); return }
    leaveBusy.current = true; setLeaving(true); setError('')
    try { await controller.discard(); feedback.cancel(); rememberTraining(); setDirty(false); reply(true) }
    catch (e) { setError((e as Error).message); reply(false) }
    finally { leaveBusy.current = false; setLeaving(false); leaveReply.current = undefined }
  }
  const requestSessionLeave = (destination?: Screen) => new Promise<boolean>((resolve) => {
    if (destination === 'settings') {
      void controller.prepareSettings().then(() => { setDirty(false); resolve(true) }).catch((e: Error) => { setError(e.message); resolve(false) })
      return
    }
    if (leaveReply.current || leaveBusy.current) { resolve(false); return }
    if (controller.record.finalizedAt || controller.discarded) { resolve(true); return }
    if (destination || hasSessionInput(controller.input) || structure?.amended || noteDirty) { leaveReply.current = resolve; setConfirm('leave') }
    else void discard(resolve)
  })
  useEffect(() => registerLeaveGuard(requestSessionLeave))
  useEffect(() => () => { leaveReply.current?.(false) }, [])
  const act = async (work: () => Promise<unknown>) => { setError(''); try { await work() } catch (error) { setError((error as Error).message) } }
  const timerAction = async (work: () => Promise<unknown>) => { if (timerBusy) return; setTimerBusy(true); await act(work); setTimerBusy(false) }
  const save = () => {
    setError('')
    if (Object.keys(assessed.errors).length) { setError('Correct invalid or partly entered sets, or select Skip set for each omitted set.'); requestAnimationFrame(() => document.querySelector<HTMLElement>('.training-session [aria-invalid="true"]')?.focus()); return }
    if (!assessed.recorded) { setError('Record at least one valid set before saving a session.'); return }
    if (assessed.skipped) setConfirm('partial'); else requestFinish(false)
  }
  const requestFinish = (partial: boolean) => { if (initial.source?.kind === 'custom') { setAddToLibrary(false); setSavingCustom({ partial }) } else void finish(partial) }
  const finish = (partial: boolean, library?: { name: string }) => act(async () => { const result = await controller.complete(partial, library); rememberTraining(); setDirty(false); onCompleted(result) })
  const memberLabel = (exercise: PlanExercise) => day.exercises.filter((item) => item.prescription.name === exercise.prescription.name).length > 1 ? `${exercise.prescription.name} occurrence ${day.exercises.findIndex((item) => item.id === exercise.id) + 1}` : exercise.prescription.name
  const memberHeading = (exercise: PlanExercise) => {
    const e = day.exercises.findIndex((item) => item.id === exercise.id), label = memberLabel(exercise)
    return <div className="training-heading" key={exercise.id}><h3>{label}</h3><button aria-label={`Note for ${label}`} onClick={() => setNote({ index: e, value: controller.input.exercises[e].notes })}><NotebookPen aria-hidden="true" size={20} /></button><button aria-label={`Information for ${label}`} onClick={() => setInfo(exercise.prescription)}><Info aria-hidden="true" size={20} /></button></div>
  }
  const setFields = (exercise: PlanExercise, s: number) => {
    const e = day.exercises.findIndex((item) => item.id === exercise.id), prescribed = exercise.prescription.sets[s]
    if (!prescribed) return null
    const hint = hints?.values[exercise.id]?.[s]
    const set = controller.input.exercises[e].sets[s], prefix = `${e}.${s}`, label = `${memberLabel(exercise)} set ${s + 1}`
    const update = (field: 'load' | 'reps' | 'rir' | 'skipped', value: string | boolean) => { const input = structuredClone(controller.input); Object.assign(input.exercises[e].sets[s], { [field]: value }, field === 'load' ? { unit } : {}); controller.change(input) }
    return <div className="training-set" key={exercise.id} data-occurrence-id={exercise.id}><h4 className="set-heading">{exercise.groupId ? memberLabel(exercise) : `Set ${s + 1}`}</h4><p className="set-target">{target(prescribed.reps)} reps{prescribed.rir && <> · {target(prescribed.rir)} RIR</>}</p><div className="training-fields">
      <Field label={`Weight (${unit})`} aria-label={`${label} Weight (${unit})`} inputMode="decimal" maxLength={64} disabled={set.skipped} placeholder={hint?.load} aria-describedby={hint ? `previous-${exercise.id}-${s}` : undefined} value={displayedLoad(set, unit)} error={assessed.errors[`${prefix}.load`]} onChange={(event) => update('load', event.target.value)} />
      <Field label="Reps" aria-label={`${label} Repetitions`} inputMode="numeric" maxLength={64} disabled={set.skipped} placeholder={hint?.reps} aria-describedby={hint ? `previous-${exercise.id}-${s}` : undefined} value={set.reps} error={assessed.errors[`${prefix}.reps`]} onChange={(event) => update('reps', event.target.value)} />
      <Field label="RIR (optional)" aria-label={`${label} Actual RIR (optional)`} inputMode="numeric" maxLength={64} disabled={set.skipped} placeholder={hint?.rir} aria-describedby={hint?.rir !== undefined ? `previous-${exercise.id}-${s}` : undefined} value={set.rir} error={assessed.errors[`${prefix}.rir`]} onChange={(event) => update('rir', event.target.value)} />
    </div>{hint && <span className="sr-only" id={`previous-${exercise.id}-${s}`}>Placeholders show previous results, not entered values.</span>}{set.unit !== unit && set.load && numericResult(set.load) === undefined && <p className="field-error">Invalid saved load in {set.unit}; replace it with a valid {unit} value.</p>}<label className="check-label"><input type="checkbox" aria-label={`Skip ${label}`} checked={set.skipped} onChange={(event) => update('skipped', event.target.checked)} />Skip</label></div>
  }
  return <section className="training-session" aria-label="Training session">
    <div className="training-heading"><h2 ref={heading} tabIndex={-1}>{day.name}</h2><button aria-label="Session Note" disabled={controller.busy || !!controller.record.finalizedAt} onClick={() => setNote({ value: controller.input.notes })}><NotebookPen aria-hidden="true" size={20} /></button></div>
    <p>Started: {localToday(initial.occurrence?.timeZone ?? snapshot.profile.timeZone ?? browserZone(), new Date(initial.startedAt))}</p>
    {hints?.error && <p role="alert">{hints.error}</p>}
    {controller.status !== 'saved' && <p role="status">{controller.status === 'failed' ? 'Draft not saved. Your input is kept.' : 'Saving…'}</p>}
    {controller.error && <p role="alert">{controller.error}</p>}
    {controller.status === 'failed' && <div className="actions"><button disabled={controller.busy} onClick={() => void act(() => controller.flush())}>Retry draft save</button><button disabled={controller.busy} onClick={() => setConfirm('reload')}>Reload saved draft</button></div>}
    {timer && <TimerDisplay key={timer.token} feedback={feedback} sound={sound} timer={timer} disabled={timerBusy || controller.busy} onAction={(action) => void timerAction(() => controller.changeTimer(timer.token, action))} />}
    {controller.record.finalizedAt && <p role="status">This draft is completed. Return to workouts to review the saved session.</p>}
    <fieldset disabled={leaving || controller.busy || timerBusy || !!controller.record.finalizedAt}><legend className="sr-only">Session results</legend>
      {trainingBlocks(day).map((block) => {
        const rounds = sessionRounds(block.members, structure), member = block.members[0]
        const rest = (index: number, after: boolean) => <RestControl label={block.group ? `Superset ${block.group.number} ${after ? 'after group' : `after round ${index + 1}`}` : `${memberLabel(member)} ${after ? 'between exercises' : `after set ${index + 1}`}`} seconds={block.group ? after ? block.group.restAfterGroupSeconds : block.group.restBetweenRoundsSeconds : after ? member.prescription.restAfterSeconds : member.prescription.restBetweenSeconds} onStart={() => { feedback.unlock(sound); return timerAction(() => block.group ? controller.startGroupTimer(block.id, index) : controller.startTimer(block.id, index)) }} />
        return <section className={`training-exercise${block.group ? ' training-superset' : ''}`} key={block.id} aria-label={block.group ? `Superset ${block.group.number}` : memberLabel(member)}>
          {block.group && <><h3>Superset {block.group.number}</h3><p>{block.members.map((m) => `${memberLabel(m)}: ${m.prescription.sets.length} sets`).join(' \u00b7 ')}</p></>}
          {block.members.map(memberHeading)}
          {block.group ? rounds.map((round, r) => <section className="superset-round" key={r} aria-label={`Superset ${block.group!.number} set ${r + 1}`}><h4>Set {r + 1}</h4>{round.map(({ member, index }) => setFields(member, index))}{r < rounds.length - 1 && rest(r, false)}</section>) : member.prescription.sets.map((_, s, sets) => <Fragment key={structure?.exercises.find((e) => e.id === member.id)?.sets[s].id ?? s}>{setFields(member, s)}{s < sets.length - 1 && rest(s, false)}</Fragment>)}
          <div className="session-add"><button aria-label={`Add Set to ${block.group ? `Superset ${block.group.number}` : memberLabel(member)}`} disabled={rounds.length >= 100} onClick={() => { try { controller.addSets(block.id, unit) } catch (e) { setError((e as Error).message) } }}>Add Set</button></div>
          <div className="post-exercise-rest">{rest(rounds.length - 1, true)}</div>
        </section>
      })}
      <div className="session-add session-add-exercise"><button disabled={day.exercises.length >= 100} onClick={() => setPicking(true)}>Add Exercise</button></div>
    </fieldset>
    {error && error !== controller.error && <p role="alert">{error}</p>}
    <div className="session-actions"><button className="primary" disabled={leaving || controller.busy || timerBusy || !!controller.record.finalizedAt} onClick={save}>{controller.busy ? 'Working...' : 'Save'}</button><div className="session-secondary"><button disabled={leaving || controller.busy || timerBusy} onClick={() => void requestSessionLeave().then((allowed) => { if (allowed) onClose() })}>Cancel</button><button disabled={leaving || controller.busy || timerBusy || !!controller.record.finalizedAt} onClick={() => hasSessionInput(controller.input) ? setConfirm('clear') : void act(() => controller.clear())}>Clear</button></div></div>
    {note && <NoteDialog value={note.value} title={note.index === undefined ? 'Session note' : `Note: ${day.exercises[note.index].prescription.name}`} onDirty={setNoteDirty} onClose={() => { setNote(undefined); setNoteDirty(false) }} onApply={(value) => { const input = structuredClone(controller.input); if (note.index === undefined) input.notes = value; else input.exercises[note.index].notes = value; controller.change(input); setNote(undefined); setNoteDirty(false) }} />}
    {picking && <ActionDialog title="Add Exercise" onClose={() => setPicking(false)}>{choices?.error ? <p role="alert">{choices.error}</p> : choices?.data ? <ExercisePicker path={['Train', 'Exercise']} choices={choices.data.choices} remaining={100 - day.exercises.length} onClose={() => setPicking(false)} onChoose={(items) => { try { controller.addExercises(items, unit); setPicking(false) } catch (e) { setError((e as Error).message); setPicking(false) } }} /> : <p role="status">Loading exercises...</p>}</ActionDialog>}
    {info && <ExerciseInformation exercise={info} onClose={() => setInfo(undefined)} />}
    {savingCustom && <ActionDialog title="Saving Completed Workout" onClose={() => { if (!controller.busy) setSavingCustom(undefined) }} actions={<><button disabled={controller.busy} onClick={() => setSavingCustom(undefined)}>Cancel</button><button className="primary" disabled={controller.busy} onClick={() => void finish(savingCustom.partial, addToLibrary ? { name: workoutName } : undefined)}>Save</button></>}><p>Do you wish to add this workout to your workout library?</p><div className="segmented" aria-label="Add to workout library"><button aria-pressed={addToLibrary} onClick={() => setAddToLibrary(true)}>Yes</button><button aria-pressed={!addToLibrary} onClick={() => setAddToLibrary(false)}>No</button></div>{addToLibrary && <Field label="Workout name:" maxLength={120} value={workoutName} onChange={(event) => setWorkoutName(event.target.value)} />}{error && <p role="alert">{error}</p>}</ActionDialog>}
    {confirm && <ConfirmDialog title={confirm === 'clear' ? 'Clear entered results?' : confirm === 'leave' ? `Leaving ${day.name}` : confirm === 'partial' ? 'Save partial session?' : 'Reload saved draft?'} confirmLabel={confirm === 'clear' ? 'Clear' : confirm === 'leave' ? 'Leave' : confirm === 'partial' ? 'Save partial session' : 'Reload draft'} busy={leaving || controller.busy} destructive={confirm === 'clear' || confirm === 'leave'} cancelLabel="Cancel" onCancel={() => { if (confirm === 'leave') { leaveReply.current?.(false); leaveReply.current = undefined } setConfirm(undefined) }} onConfirm={() => {
      const action = confirm; setConfirm(undefined)
      if (action === 'leave') { const reply = leaveReply.current; if (reply) void discard(reply) }
      else if (action === 'partial') requestFinish(true)
      else if (action === 'clear') { feedback.cancel(); void act(() => controller.clear()) }
      else void act(async () => { await controller.reload(); requestAnimationFrame(() => heading.current?.focus()) })
    }}><p>{confirm === 'leave' ? 'Leaving now will clear all your progress and you will have to restart.' : confirm === 'clear' ? 'This will clear all entered results and notes.' : confirm === 'partial' ? `${assessed.skipped} omitted sets will be marked skipped. ${assessed.recorded} recorded sets will be saved. Cancel keeps all input.` : 'Copy any input you need first. Load the latest saved version and discard your unpersisted edits.'}</p></ConfirmDialog>}
  </section>
}
function NoteDialog({ value, title, onDirty, onApply, onClose }: { value: string; title: string; onDirty: (value: boolean) => void; onApply: (value: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value)
  const close = () => { if (text === value || window.confirm('Discard unapplied note changes?')) onClose() }
  return <ConfirmDialog title={title} confirmLabel="Apply note" onCancel={close} onConfirm={() => onApply(text)}><TextareaField label="Note" maxLength={20000} value={text} onChange={(event) => { setText(event.target.value); onDirty(event.target.value !== value) }} /></ConfirmDialog>
}
function RestControl({ label, seconds, onStart }: { label: string; seconds?: number; onStart: () => Promise<void> }) {
  return <div className="rest-control"><button disabled={seconds === 0} aria-label={`REST ${label}`} onClick={() => void onStart()}>REST &middot; {seconds === undefined ? 'count up' : seconds === 0 ? '0 seconds \u2014 no timed rest' : restLabel(seconds)}</button></div>
}

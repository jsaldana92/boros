import { useTrainingScroll } from './use-training-scroll'
import { SessionActions } from './SessionActions'
import { IntervalSequence } from './IntervalSequence'
import { hasDraftProgress } from '../../schemas/session'
import { IntervalTimer } from './IntervalTimer'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { sessions } from '../../db/sessions'
import { executionActive, scopeHasProgress, advanceInterval, initialInterval, meaningfulInterval, partialInterval } from '../../schemas/interval-session'
import type { SessionDraft, CompletedSession } from '../../schemas/session'
import { useWorkspace } from '../../app/workspace-context'
import { useScreenNavigation } from '../../app/navigation-context'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { WorkoutActions, NoteDialog } from './WorkoutActions'
import { formatIntervalTime } from '../../schemas/interval-session'
import { trainingRuntime } from './training-runtime'

export function IntervalSession({ initial, onClose, onCompleted }: { initial: SessionDraft; onClose: () => void; onCompleted: (value: CompletedSession) => void }) {
  useTrainingScroll(initial.profileId, initial.id)
  const { sound, setDirty, registerLeaveGuard } = useWorkspace(), { rememberTraining } = useScreenNavigation()
  const [selectedMode, setSelectedMode] = useState(initial.interval?.mode ?? 'circuit')
  const [controller] = useState(() => trainingRuntime().intervalFor(initial)), [, render] = useState(0)
  const { record, error, busy, ready, feedback } = controller
  const setError = (message: string) => controller.setError(message)
  const setReady = (value: boolean) => controller.setReady(value)
  const heading = useRef<HTMLHeadingElement>(null)
  const [now, setNow] = useState(() => Date.now()), [notes, setNotes] = useState(controller.notes)
  const [confirm, setConfirm] = useState<{ title: string; action: () => void; text?: string; label?: string }>(), leaveReply = useRef<((value: boolean) => void) | undefined>(undefined)
  const [note, setNote] = useState(false), [noteDirty, setNoteDirty] = useState(false)
  const [saveCustom, setSaveCustom] = useState(false), [addLibrary, setAddLibrary] = useState(false), [name, setName] = useState('')
  const slot = useLiveQuery(() => sessions.timerSlot().catch(() => ({ profileId: '', draftId: '' })), [])
  const conflict = !!slot && slot.draftId !== initial.id
  const apply = (next: SessionDraft) => { controller.apply(next); setSelectedMode(next.interval?.mode ?? 'circuit') }
  const work = controller.work.bind(controller), command = controller.command.bind(controller)
  useEffect(() => {
    const unsubscribe = controller.subscribe(() => render(n => n + 1))
    heading.current?.focus()
    rememberTraining({ profileId: initial.profileId, draftId: initial.id })
    const ticker = setInterval(() => setNow(Date.now()), 250)
    return () => { unsubscribe(); clearInterval(ticker); setDirty(false); leaveReply.current?.(false) }
  }, [controller, initial.profileId, initial.id, rememberTraining, setDirty])
  const state = record.interval ?? initialInterval(record.day), display = ready && !error ? advanceInterval(state, now) : state
  const meaningful = hasDraftProgress({ ...record, interval: display, input: { ...record.input, notes } }) || noteDirty
  useEffect(() => { setDirty(meaningful || busy || !!error) }, [meaningful, busy, error, setDirty])
  const discard = async () => work(async () => { const c = controller.record; await sessions.discard(c.profileId, c.id, c.revision); feedback.cancel(); rememberTraining(); setDirty(false); onClose() })
  const hasCurrentInput = () => {
    const value = controller.record
    return hasDraftProgress({ ...value, interval: value.interval ? advanceInterval(value.interval, Date.now()) : undefined, input: { ...value.input, notes: controller.notes } }) || noteDirty
  }
  useEffect(() => registerLeaveGuard(async () => {
    // Navigation preserves the active controller, timer and committed draft.
    if (noteDirty) return new Promise<boolean>(resolve => {
      leaveReply.current = resolve
      setConfirm({ title: 'Leave pending edits?', text: 'Discard unapplied note changes?', label: 'Leave', action: () => { setNote(false); setNoteDirty(false); leaveReply.current = undefined; void controller.settle().then(resolve) } })
    })
    return controller.settle()
  }))
  const requestCancel = async () => {
    if (controller.retired) { rememberTraining(); setDirty(false); onClose(); return }
    if (!await controller.settle()) return
    if (hasCurrentInput() || error) setConfirm({ title: 'Leave workout?', text: 'This discards this unfinished session.', action: () => void discard() })
    else await discard()
  }
  const finish = () => void work(async () => { const c = controller.record; const saved = await sessions.complete(c.profileId, c.id, c.revision, { ...c.input, notes }, true, new Date().toISOString(), addLibrary ? { name } : undefined); feedback.cancel(); rememberTraining(); setDirty(false); onCompleted(saved) })
  const requestSave = async () => {
    if (!await command('pause')) return
    if (!meaningfulInterval(controller.record.interval)) { setError('Record some active time before saving.'); return }
    const next = () => controller.record.source?.kind === 'custom' ? setSaveCustom(true) : finish()
    if (partialInterval(controller.record.interval!)) setConfirm({ title: 'Save partial session?', text: 'Unfinished activities retain their actual time or are marked skipped.', action: next }); else next()
  }
  const active = executionActive(state), mode = (record.day.circuits?.length ?? 0) > 1 ? selectedMode : 'circuit'
  const start = (circuitId?: string, executionMode: 'circuit' | 'continuous' | 'rest' = mode) => {
    const run = (restart = false) => { feedback.update(controller.record.interval ?? initialInterval(controller.record.day), sound, Date.now(), document.visibilityState === 'visible'); feedback.unlock(sound); void work(async () => { const c = controller.record; apply(await sessions.startInterval(c.profileId, c.id, c.revision, executionMode, circuitId, restart, controller.notes)) }) }
    if (scopeHasProgress(state, executionMode, circuitId)) setConfirm({ title: 'Restart timer?', label: 'Start', text: `Restarting will clear the recorded interval progress for ${mode === 'continuous' ? 'this workout' : 'this circuit'}.`, action: () => run(true) }); else run()
  }
  const timer = <IntervalTimer state={display} disabled={!ready || busy || !!error} onAction={action => { feedback.cancel(); if (action === 'resume') feedback.unlock(sound); void command(action) }} />
  const closeConfirm = () => { setConfirm(undefined); leaveReply.current?.(false); leaveReply.current = undefined }
  return <section className="training-session interval-session" aria-label="Interval training session"><div className="training-heading"><h2 ref={heading} tabIndex={-1}>{record.day.name}</h2><WorkoutActions instructions={record.day.instructions} onNote={() => setNote(true)} noteDisabled={!ready || busy || !!record.finalizedAt} /></div>
    {!ready && !error && <p role="status">Loading timer...</p>}
    {(record.day.circuits?.length ?? 0) > 1 && <label className="check-label interval-mode"><input type="checkbox" checked={mode === 'continuous'} disabled={active || busy || !ready || !!error} onChange={event => { const mode = event.target.checked ? 'continuous' : 'circuit'; setSelectedMode(mode); void work(async () => { const c = controller.record; apply(await sessions.intervalMode(c.profileId, c.id, c.revision, mode)) }) }} />Continuous workout</label>}
    {mode === 'continuous' && <div className="interval-start">{active && state.execution?.mode === 'continuous' ? timer : <button disabled={!ready || busy || !!error || active || conflict} onClick={() => start()}>Start</button>}</div>}
    {record.day.circuits?.map((circuit, index) => <section key={circuit.id} className="training-exercise interval-circuit" aria-label={circuit.name}>{index > 0 && <hr className="circuit-divider" />}<h3>{circuit.name}</h3>
      {mode === 'circuit' && <div className="interval-start">{active && state.execution?.circuitId === circuit.id ? timer : <button disabled={!ready || busy || !!error || active || conflict} onClick={() => start(circuit.id)}>Start Circuit</button>}</div>}
      <IntervalSequence phases={state.phases.filter(p => p.circuitId === circuit.id)} activeId={active ? display.phaseId : undefined} />
    </section>)}
    {!!record.day.postWorkoutRestSeconds && <section className="interval-post-rest" aria-label="Post-Workout Rest"><hr /><h3>Post-Workout Rest</h3><p>{formatIntervalTime(record.day.postWorkoutRestSeconds)}</p><div className="interval-start">{active && state.execution?.mode === 'rest' ? timer : <button disabled={!ready || busy || !!error || active || conflict} onClick={() => start(undefined, 'rest')}>Start</button>}</div></section>}
    <p role="status">{error ? 'Timer stopped' : state.status === 'running' ? 'Running' : state.status === 'finished' ? state.execution?.mode === 'rest' ? 'Rest complete' : 'Ready to save' : state.status === 'paused' ? 'Paused' : 'Ready'}</p>
    {active && <button disabled={!ready || busy || !!error} onClick={() => { feedback.cancel(); void command('skip') }}>Skip phase</button>}
    {error && <p role="alert">{error} {!controller.retired && <button onClick={async () => { const ok = await work(async () => { apply(await sessions.getDraft(initial.profileId, initial.id)) }); if (ok) { feedback.reset(); const recovered = await command('recover', true); setReady(recovered) } }}>Reload saved timer</button>}</p>}
    <SessionActions disabled={busy} saveDisabled={busy || !ready || !!error} save={() => void requestSave()} cancel={() => void requestCancel()} clear={() => setConfirm({ title: 'Clear session?', text: 'This resets recorded time and notes.', action: () => void work(async () => { const c = controller.record; const next = await sessions.clear(c.profileId, c.id, c.revision); apply(next); setNotes(''); controller.setNotes(''); feedback.reset() }) })} />
    {note && <NoteDialog value={notes} title={record.day.name} onDirty={setNoteDirty} busy={busy} error={error} onClose={() => { setNote(false); setNoteDirty(false) }} onApply={value => {
      setNotes(value); controller.setNotes(value)
      // Persist the note without pausing or advancing the timer. Keep the dialog
      // and its text available if the write fails; serialized ticks use this note.
      void work(async () => { const c = controller.record; apply(await sessions.update(c.profileId, c.id, c.revision, { ...c.input, notes: value })); setNote(false); setNoteDirty(false) }, false, false)
    }} />}
    {saveCustom && <ActionDialog title="Save custom workout" onClose={() => setSaveCustom(false)} actions={<><button onClick={() => setSaveCustom(false)}>Cancel</button><button disabled={busy} onClick={finish}>Save session</button></>}><label className="check-label"><input type="checkbox" checked={addLibrary} onChange={e => setAddLibrary(e.target.checked)} />Save workout to library</label>{addLibrary && <Field label="Workout name" maxLength={120} value={name} onChange={e => setName(e.target.value)} />}{error && <p role="alert">{error}</p>}</ActionDialog>}
    {confirm && <ConfirmDialog title={confirm.title} confirmLabel={confirm.label ?? "Confirm"} busy={busy} onCancel={closeConfirm} onConfirm={() => { const action = confirm.action; setConfirm(undefined); action() }}><p>{confirm.text ?? 'Discard the affected pending input?'}</p></ConfirmDialog>}
  </section>
}

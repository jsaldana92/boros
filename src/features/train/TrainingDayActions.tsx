import { useRef, useState } from 'react'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { CalendarEvent } from '../../db/schedules'
import { weekly } from '../../db/weekly'
import { sessions } from '../../db/sessions'
import { runActions, type RunActionPreview } from '../../db/run-actions'
import type { Schedule } from '../../schemas/schedule'
import type { CompletedSession, SessionDraft } from '../../schemas/session'

export function TrainingDayActions({ profileId, event, run, displayDate, onClose, onOpened }: { profileId: string; event: CalendarEvent; run: Schedule; displayDate?: string; onClose: () => void; onOpened: (value: { draft?: SessionDraft; session?: CompletedSession }) => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [discard, setDiscard] = useState(false), [reset, setReset] = useState<RunActionPreview>(), lock = useRef(false)
  const act = async (work: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work() } catch (e) { setError((e as Error).message) } finally { lock.current = false; setBusy(false) } }
  const close = () => { if (!lock.current) onClose() }
  const marked = event.outcome && event.outcome.status !== 'pending'
  return <><ActionDialog title={event.day.name} onClose={close}>
    <p>{displayDate ?? (event.unscheduled ? `Week of ${event.ref.scheduledWeek}` : event.ref.scheduledDate)}</p>
    <div className="exercise-action-list">
      {event.session ? <button onClick={() => onOpened({ session: event.session })}>Review saved session</button> : run.closedAt ? <p>This run was left.</p> : marked ? <>
        <p>{event.outcome!.status === 'completed' ? 'Manually completed — no exercise results.' : 'Skipped.'}</p>
        <button disabled={busy} onClick={() => void act(async () => { await weekly.outcome(profileId, event.ref, run.revision, 'pending'); onClose() })}>Correct marker to Pending</button>
      </> : <>
        <button disabled={busy} onClick={() => void act(async () => onOpened(await sessions.openOccurrence(profileId, event.ref.scheduleId, event.ref.dayId, event.ref.scheduledDate, run.revision)))}>{event.draft ? 'Resume' : 'Start'}</button>
        <button disabled={busy || !!event.draft} onClick={() => void act(async () => { await weekly.outcome(profileId, event.ref, run.revision, 'skipped'); onClose() })}>Skip</button>
        <button disabled={busy || !!event.draft} onClick={() => void act(async () => { await weekly.outcome(profileId, event.ref, run.revision, 'completed'); onClose() })}>Mark as Complete</button>
        {event.draft && <button className="destructive" disabled={busy} onClick={() => setDiscard(true)}>Discard Progress</button>}
      </>}
      <button className="destructive" disabled={busy} onClick={() => void act(async () => setReset(await runActions.preview(profileId, run.id, run.revision, event.ref)))}>Reset</button>
    </div>{error && <p role="alert">{error}</p>}
  </ActionDialog>
    {discard && <ConfirmDialog title="Discard Progress?" confirmLabel="Discard Progress" destructive busy={busy} onCancel={() => setDiscard(false)} onConfirm={() => void act(async () => { await sessions.discard(profileId, event.draft!.id, event.draft!.revision); onClose() })}><p>Delete only this occurrence's draft, entered results, notes and timer. Previously completed sessions stay unchanged.</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
    {reset && <ConfirmDialog title="Reset this training day?" confirmLabel="Reset" destructive busy={busy} onCancel={() => setReset(undefined)} onConfirm={() => void act(async () => { await runActions.reset(reset); onClose() })}><p>Saved results for this occurrence will be deleted, along with its entered results, notes, draft, timer and completion or Skip marker. Other weeks, runs and measurements stay unchanged.</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
  </>
}

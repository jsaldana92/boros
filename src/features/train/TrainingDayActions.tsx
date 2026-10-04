import { useRef, useState } from 'react'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { CalendarEvent } from '../../db/schedules'
import { weekly } from '../../db/weekly'
import { sessions } from '../../db/sessions'
import type { Schedule } from '../../schemas/schedule'
import type { CompletedSession, SessionDraft } from '../../schemas/session'

export function TrainingDayActions({ profileId, event, run, onClose, onOpened }: { profileId: string; event: CalendarEvent; run: Schedule; onClose: () => void; onOpened: (value: { draft?: SessionDraft; session?: CompletedSession }) => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [discard, setDiscard] = useState(false), lock = useRef(false)
  const act = async (work: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work() } catch (e) { setError((e as Error).message) } finally { lock.current = false; setBusy(false) } }
  const close = () => { if (!lock.current) onClose() }
  const marked = event.outcome && event.outcome.status !== 'pending'
  return <><ActionDialog title={event.day.name} onClose={close}>
    <p>{event.unscheduled ? `Week of ${event.ref.scheduledWeek}` : event.ref.scheduledDate} · {event.ref.timeZone}</p>
    <div className="exercise-action-list">
      {event.session ? <button onClick={() => onOpened({ session: event.session })}>Review saved session</button> : marked ? <>
        <p>{event.outcome!.status === 'completed' ? 'Manually completed — no exercise results.' : 'Skipped.'}</p>
        <button disabled={busy} onClick={() => void act(async () => { await weekly.outcome(profileId, event.ref, run.revision, 'pending'); onClose() })}>Correct marker to Pending</button>
      </> : <>
        <button disabled={busy} onClick={() => void act(async () => onOpened(await sessions.openOccurrence(profileId, event.ref.scheduleId, event.ref.dayId, event.ref.scheduledDate)))}>{event.draft ? 'Resume draft' : 'Start'}</button>
        <button disabled={busy || !!event.draft} onClick={() => void act(async () => { await weekly.outcome(profileId, event.ref, run.revision, 'skipped'); onClose() })}>Skip</button>
        <button disabled={busy || !!event.draft} onClick={() => void act(async () => { await weekly.outcome(profileId, event.ref, run.revision, 'completed'); onClose() })}>Mark as Complete</button>
        {event.draft && <><p>Resume this draft, or discard it explicitly before choosing a different outcome.</p><button className="destructive" disabled={busy} onClick={() => setDiscard(true)}>Discard draft to change status</button></>}
      </>}
    </div>{error && <p role="alert">{error}</p>}
  </ActionDialog>
    {discard && <ConfirmDialog title="Discard this occurrence's draft?" confirmLabel="Discard draft" onCancel={() => setDiscard(false)} onConfirm={() => { setDiscard(false); void act(async () => { await weekly.discardDraft(profileId, event.draft!.id, event.draft!.revision); onClose() }) }}><p>Remove this unfinished draft's entered results, notes and timer. Saved sessions and other drafts stay unchanged. Reopen the day to choose Skip or Mark as Complete.</p></ConfirmDialog>}
  </>
}

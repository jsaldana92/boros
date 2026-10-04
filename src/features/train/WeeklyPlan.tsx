import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { schedules, type CalendarEvent } from '../../db/schedules'
import { weekly, type MovePreview } from '../../db/weekly'
import { addDays, localToday, monday, validDate, weekdays, weekday } from '../../lib/calendar-dates'
import { programWeek, revisionAt, type Schedule } from '../../schemas/schedule'
import type { Plan } from '../../schemas/plan'
import type { CompletedSession, SessionDraft } from '../../schemas/session'
import { dayStatus, weekLabel } from '../../lib/weekly-status'
import { useCurrentInstant } from '../../lib/use-current-instant'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { TrainingDayActions } from './TrainingDayActions'

export function WeeklyPlan({ plan, runs, onOpened }: { plan: Plan; runs: Schedule[]; onOpened: (value: { draft?: SessionDraft; session?: CompletedSession }) => void }) {
  const [runId, setRunId] = useState(runs[0]?.id ?? ''), [date, setDate] = useState<string>(), [picker, setPicker] = useState(false)
  const [action, setAction] = useState<{ event: CalendarEvent; run: Schedule }>(), [move, setMove] = useState<MovePreview>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false)
  const instant = useCurrentInstant(), run = runs.find((item) => item.id === runId) ?? runs[0]
  const week = date ?? (run ? monday(localToday(run.timeZone, instant)) : ''), end = week ? addDays(week, 6) : ''
  const loaded = useLiveQuery(async () => {
    if (!run) return undefined
    try { return { key: `${run.id}:${week}`, events: (await schedules.events(plan.profileId, week, end)).filter((event) => event.ref.scheduleId === run.id), error: '' } }
    catch (e) { return { key: `${run.id}:${week}`, events: [], error: (e as Error).message } }
  }, [plan.profileId, run?.id, week, end])
  const data = loaded?.key === `${run?.id}:${week}` ? loaded : undefined
  const reverse = useLiveQuery(async () => {
    if (!run) return false
    try { await weekly.previewMove(plan.profileId, run.id, run.revision, week, -1); return true } catch { return false }
  }, [plan.profileId, run?.id, run?.revision, week])
  const act = async (work: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work() } catch (e) { setError((e as Error).message) } finally { lock.current = false; setBusy(false) } }
  const shift = (offset: number) => { try { setDate(addDays(week, offset)); setError('') } catch (e) { setError((e as Error).message) } }
  if (!run) return <p role="status">Opening program…</p>
  const excluded = run.excludedWeeks?.includes(week), current = revisionAt(run, week)
  return <section aria-label="Program week">
    {plan.notes?.trim() && <p className="plain-text">{plan.notes}</p>}
    {runs.length > 1 && <label>Program context<select value={run.id} onChange={(e) => { setRunId(e.target.value); setDate(undefined) }}>{runs.map((item) => <option key={item.id} value={item.id}>{item.kind === 'unscheduled' ? 'Weekly program' : 'Calendar schedule'} · {item.startWeek} · {item.timeZone} · {item.id.slice(0, 8)}</option>)}</select></label>}
    <p className="muted">{run.kind === 'unscheduled' ? 'Weekly program · no assigned weekdays' : 'Calendar schedule'} · {run.timeZone} · Run {run.id.slice(0, 8)}</p>
    <div className="week-navigation"><button aria-label="Previous week" onClick={() => shift(-7)}><ChevronLeft aria-hidden="true" /></button><button className="week-range" aria-label={`Choose week: ${weekLabel(week)}`} onClick={() => setPicker(true)}>{weekLabel(week)}</button><button aria-label="Next week" onClick={() => shift(7)}><ChevronRight aria-hidden="true" /></button></div>
    {data?.error && <p role="alert">{data.error}</p>}
    {excluded ? <p>Excluded week — training was postponed. This is not a skipped day.</p> : current?.needsRepair ? <p>Program mapping needs repair. Review this run in Calendar.</p> : data && !data.events.length ? <p>No active training in this week.</p> : <p>Program week {programWeek(run, week)}</p>}
    <div className="training-day-cards">{data?.events.map((event) => {
      const status = dayStatus(event, instant), finished = status === 'Completed' || status === 'Skipped'
      return <button className={`training-day-card${finished ? ' outcome-card' : ''}`} key={event.ref.key} onClick={() => setAction({ event, run })}><strong>{event.day.name}</strong>{!event.unscheduled && <span>{weekdays[weekday(event.ref.scheduledDate)]}</span>}<span className={`day-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>{event.draft && <small>Draft in progress</small>}</button>
    })}</div>
    {!!data?.events.length && <div className="week-moves"><button disabled={busy} onClick={() => void act(async () => setMove(await weekly.previewMove(plan.profileId, run.id, run.revision, week, 1)))}>Move Training to Next Week</button>{reverse && <button disabled={busy} onClick={() => void act(async () => setMove(await weekly.previewMove(plan.profileId, run.id, run.revision, week, -1)))}>Move Training to Previous Week</button>}</div>}
    {error && <p role="alert">{error}</p>}
    {picker && <ActionDialog title="Choose week" onClose={() => setPicker(false)}><Field label="Date in week" type="date" value={week} onChange={(e) => { if (validDate(e.target.value)) { setDate(monday(e.target.value)); setPicker(false) } }} /></ActionDialog>}
    {action && <TrainingDayActions profileId={plan.profileId} {...action} onClose={() => setAction(undefined)} onOpened={(value) => { setAction(undefined); onOpened(value) }} />}
    {move && <ConfirmDialog title="Move program weeks?" confirmLabel={busy ? 'Moving…' : 'Confirm move'} onCancel={() => { if (!lock.current) setMove(undefined) }} onConfirm={() => void act(async () => { const result = await weekly.move(plan.profileId, move); setDate(addDays(move.week, move.direction * 7)); setMove(undefined); setRunId(result.id) })}><p>Run {run.id.slice(0, 8)} only. Move program week {programWeek(run, move.week)} and all remaining weeks from {move.week} to {addDays(move.week, move.direction * 7)}.</p><p>{move.direction === 1 ? `The week of ${move.week} becomes excluded.` : 'Reuse the free previous week.'} Revised end: {(move.next.durationChanges?.at(-1) ?? move.next).endDate ?? 'Unbounded'}.</p><p>Recorded sessions, outcomes and drafts must remain in place. Concurrent changes are checked again before saving.</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
  </section>
}

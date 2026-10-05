import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { schedules, type CalendarEvent } from '../../db/schedules'
import { weekly, type MovePreview } from '../../db/weekly'
import { addDays, localToday, monday, validDate, weekdays } from '../../lib/calendar-dates'
import { programSummary, trainingWeekRows } from '../../lib/program-display'
import { planSubtitle } from '../create/plan-subtitle'
import { programWeek, revisionAt, type Schedule } from '../../schemas/schedule'
import type { Plan } from '../../schemas/plan'
import type { CompletedSession, SessionDraft } from '../../schemas/session'
import { dayStatus, weekLabel } from '../../lib/weekly-status'
import { useCurrentInstant } from '../../lib/use-current-instant'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { TrainingDayActions } from './TrainingDayActions'
import { runActions, type RunActionPreview } from '../../db/run-actions'

export function WeeklyPlan({ plan, runs, runId, onOpened, onBack, onLeft, initialWeek }: { plan: Plan; runs: Schedule[]; runId: string; onOpened: (value: { draft?: SessionDraft; session?: CompletedSession }) => void; onBack: () => void; onLeft: () => void; initialWeek?: string }) {
  const [leaving, setLeaving] = useState<RunActionPreview>()
  const [date, setDate] = useState<string | undefined>(initialWeek), [picker, setPicker] = useState(false)
  const [action, setAction] = useState<{ event: CalendarEvent; run: Schedule }>(), [move, setMove] = useState<MovePreview>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false)
  const instant = useCurrentInstant(), run = runs.find((item) => item.id === runId)
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
  if (!run) return <><p>This plan instance is unavailable. Return to Plans to choose one.</p><button onClick={onBack}>Back to Plans</button></>
  const excluded = run.excludedWeeks?.includes(week), current = revisionAt(run, week)
  return <section aria-label="Program week">
    <p className="muted">{planSubtitle(programSummary(run, week))} · {run.kind === 'unscheduled' ? 'Unscheduled' : 'Scheduled'}</p>
    <div className="week-navigation"><button aria-label="Previous week" onClick={() => shift(-7)}><ChevronLeft aria-hidden="true" /></button><button className="week-range" aria-label={`Choose week: ${weekLabel(week)}`} onClick={() => setPicker(true)}>{weekLabel(week)}</button><button aria-label="Next week" onClick={() => shift(7)}><ChevronRight aria-hidden="true" /></button></div>
    {data?.error && <p role="alert">{data.error}</p>}
    {excluded ? <p>Excluded week — training was postponed. This is not a skipped day.</p> : current?.needsRepair ? <p>Program mapping needs repair. Review this run in Calendar.</p> : data && !data.events.length ? <p>No active training in this week.</p> : <p>Week {programWeek(run, week)}</p>}
    <div className="training-day-cards">{trainingWeekRows(run, week, data?.events ?? []).flatMap((row, index) => row.events.length ? row.events.map((event) => {
      const status = dayStatus(event, instant), finished = status === 'Completed' || status === 'Skipped'
      return <button className={`training-day-card${finished ? ' outcome-card' : ''}`} key={event.ref.key} onClick={() => setAction({ event, run })}><strong>{event.day.name}</strong><span>{weekdays[index]}</span><span className={`day-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>{event.draft && <small>Incomplete</small>}</button>
    }) : [<div className="rest-day-card" key={row.date}><strong>Rest day</strong><span>{weekdays[index]}</span></div>])}</div>
    {!!data?.events.length && <div className="week-moves"><button disabled={busy} onClick={() => void act(async () => setMove(await weekly.previewMove(plan.profileId, run.id, run.revision, week, 1)))}>Move Training to Next Week</button>{reverse && <button disabled={busy} onClick={() => void act(async () => setMove(await weekly.previewMove(plan.profileId, run.id, run.revision, week, -1)))}>Move Training to Previous Week</button>}</div>}
    <div className="plan-exit-actions"><button onClick={onBack}>Back to Plans</button><button className="destructive" disabled={busy} onClick={() => void act(async () => setLeaving(await runActions.preview(plan.profileId, run.id, run.revision)))}>Leave Plan</button></div>
    {leaving && <ConfirmDialog title="Ending a Plan?" confirmLabel="End" destructive busy={busy} onCancel={() => { setLeaving(undefined); setError('') }} onConfirm={() => void act(async () => { await runActions.leave(leaving); setLeaving(undefined); onLeft() })}>
      <p>Your saved progress will remain, but you cannot continue this plan. Adding it again starts from Week 1.</p>
      {error && <p role="alert">{error}</p>}
    </ConfirmDialog>}
    {error && <p role="alert">{error}</p>}
    {picker && <ActionDialog title="Choose week" onClose={() => setPicker(false)}><Field label="Date in week" type="date" value={week} onChange={(e) => { if (validDate(e.target.value)) { setDate(monday(e.target.value)); setPicker(false) } }} /></ActionDialog>}
    {action && <TrainingDayActions profileId={plan.profileId} {...action} onClose={() => setAction(undefined)} onOpened={(value) => { setAction(undefined); onOpened(value) }} />}
    {move && <ConfirmDialog title="Move program weeks?" confirmLabel={busy ? 'Moving…' : 'Confirm move'} onCancel={() => { if (!lock.current) setMove(undefined) }} onConfirm={() => void act(async () => { await weekly.move(plan.profileId, move); setDate(addDays(move.week, move.direction * 7)); setMove(undefined) })}><p>Move program week {programWeek(run, move.week)} and all remaining weeks from {move.week} to {addDays(move.week, move.direction * 7)}.</p><p>{move.direction === 1 ? `The week of ${move.week} becomes excluded.` : 'Reuse the free previous week.'} Revised end: {(move.next.durationChanges?.at(-1) ?? move.next).endDate ?? 'Unbounded'}.</p><p>Recorded sessions, outcomes and drafts must remain in place. Concurrent changes are checked again before saving.</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
  </section>
}

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, Menu } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { TrainingDayActions } from '../train/TrainingDayActions'
import { dayStatus } from '../../lib/weekly-status'
import { useWorkspace } from '../../app/workspace-context'
import { useScreenNavigation } from '../../app/navigation-context'
import { useCurrentInstant } from '../../lib/use-current-instant'
import { schedules, type CalendarEvent } from '../../db/schedules'
import { calendarActivity, type CalendarActivity } from '../../db/calendar-activity'
import { calendarColors } from '../../lib/calendar-colors'
import { sessions } from '../../db/sessions'
import { calendarAssignments, runLifecycle } from '../../lib/run-progress'
import { dateRange, addDays, browserZone, localToday, monthStart, monday, validDate, viewRange, weekdays, weekday, type CalendarView } from '../../lib/calendar-dates'
import { revisionAt, scheduleActiveOn, type Schedule } from '../../schemas/schedule'
import { Field } from '../../components/ui/Field'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { ScheduleEditor } from './ScheduleEditor'
import { AddPlans } from './AddPlans'
import { PlanRuns } from './PlanRuns'

const message = (error: unknown) => error instanceof Error ? error.message : 'Could not load Calendar. Try again.'
export function CalendarPage() {
  const { snapshot } = useWorkspace()
  return <CalendarWorkspace key={snapshot.profile.id} profileId={snapshot.profile.id} />
}
function CalendarWorkspace({ profileId }: { profileId: string }) {
  const { allowLeave, snapshot } = useWorkspace(), { openScreen } = useScreenNavigation(), instant = useCurrentInstant()
  const [dayAction, setDayAction] = useState<{ event: CalendarEvent; run: Schedule; displayDate: string }>()
  const [selection, setSelection] = useState<string>(), [view, setView] = useState<CalendarView>('month')
  const [destination, setDestination] = useState<'calendar' | 'current' | 'previous'>('calendar'), [menu, setMenu] = useState(false)
  const [editor, setEditor] = useState<{ schedule: Schedule } | { startWeek: string; zone: string }>(), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false)
  const returnPosition = useRef({ y: 0, trigger: null as HTMLElement | null }), editorPosition = useRef({ y: 0, trigger: null as HTMLElement | null }), pendingFocus = useRef<(() => void) | null>(null), lock = useRef(false)
  // Ordinary date/view updates retain mounted controls and never refocus a heading.
  useEffect(() => { pendingFocus.current?.(); pendingFocus.current = null }, [destination, editor])
  const library = useLiveQuery(async () => {
    try {
      const data = await schedules.library(profileId)
      return { data, colors: calendarColors(profileId, [...data.schedules.map((run) => run.planId), ...data.sessions.map((session) => session.sourcePlanId)]), error: '' }
    } catch (error) { return { error: message(error) } }
  }, [profileId, attempt])
  const data = library?.data, zone = snapshot.profile.timeZone ?? browserZone(), today = localToday(zone, instant), date = selection ?? today, range = viewRange(date, view)
  const colors = library?.colors ?? {}
  const result = useLiveQuery(async () => {
    try { return { key: `${range.start}/${range.end}`, events: await calendarActivity.events(profileId, range.start, range.end), error: '' } } catch (error) { return { error: message(error) } }
  }, [profileId, range.start, range.end, attempt])
  const events = result?.key === `${range.start}/${range.end}` ? result.events : undefined
  const assignments = calendarAssignments(data?.schedules ?? [], data?.sessions ?? [], instant), duplicates = new Set(assignments.filter((run) => assignments.some((other) => other.id !== run.id && other.planId === run.planId)).map((r) => r.planId))
  const focusHeading = () => { document.getElementById('calendar-heading')?.focus({ preventScroll: true }); window.scrollTo(0, 0) }
  const restore = (position: typeof returnPosition.current) => { (position.trigger?.isConnected ? position.trigger : document.getElementById(position.trigger?.id ?? '') ?? document.getElementById('calendar-heading'))?.focus({ preventScroll: true }); window.scrollTo(0, position.y) }
  const openRuns = (next: 'current' | 'previous') => { setMenu(false); setDestination(next); pendingFocus.current = focusHeading }
  const edit = (value: NonNullable<typeof editor>) => { editorPosition.current = { y: window.scrollY, trigger: document.activeElement as HTMLElement }; setEditor(value) }
  const closeEditor = () => { setEditor(undefined); pendingFocus.current = () => restore(editorPosition.current) }
  const returnCalendar = () => { setDestination('calendar'); pendingFocus.current = () => restore(returnPosition.current) }
  const openEvent = async (activity: CalendarActivity) => {
    if (activity.session) { openScreen('train', { profileId, sessionId: activity.session.id }); return }
    const event = activity.event
    if (!event) return
    if (event.outcome && event.outcome.status !== 'pending') { const run = data?.schedules.find((item) => item.id === event.ref.scheduleId); if (run) setDayAction({ event, run, displayDate: activity.date }); return }
    if (lock.current || !allowLeave()) return; lock.current = true; setBusy(true); setError('')
    try {
      const run = data?.schedules.find((item) => item.id === event.ref.scheduleId)
      if (!run) throw new Error('This plan run is unavailable. Reload Calendar and try again.')
      const opened = await sessions.openOccurrence(profileId, event.ref.scheduleId, event.ref.dayId, event.ref.scheduledDate, run.revision)
      openScreen('train', { profileId, draftId: opened.draft?.id, sessionId: opened.session?.id })
    } catch (error) { setError(message(error)) } finally { lock.current = false; setBusy(false) }
  }
  const shift = (direction: number) => { try { setSelection(view === 'month' ? monthStart(date, direction) : addDays(date, direction * (view === 'week' ? 7 : 1))); setError('') } catch (error) { setError(message(error)) } }
  const dates = dateRange(range.start, range.end)
  const renderDay = (day: string) => <section key={day} className={`calendar-day${view === 'month' && day.slice(0, 7) !== date.slice(0, 7) ? ' adjacent-month' : ''}${day === date ? ' selected-date' : ''}`} aria-label={day} aria-current={day === today ? 'date' : undefined}>
    <h3><time dateTime={day}>{weekdays[weekday(day)]} {day.slice(5)}</time>{day === today && ' · Today'}</h3>
    {events?.filter((activity) => activity.date === day).map((activity) => {
      const event = activity.event, status = activity.session ? activity.session.partial ? 'Incomplete' : 'Completed' : event?.outcome?.status === 'completed' ? 'Completed' : event?.draft ? 'Incomplete' : event ? dayStatus(event, instant) : 'Completed'
      return <button key={activity.id} style={{ '--plan-color': `var(--calendar-plan-${colors[activity.planId] ?? 0})` } as CSSProperties} className={`calendar-event${status === 'Completed' ? ' completed' : ''}`} disabled={busy} onClick={() => void openEvent(activity)}><span className="event-name">{activity.planName}</span><span className="event-day">{activity.day.name}</span><span className="status-pill">{status}</span></button>
    })}
    {data?.schedules.filter((run) => run.kind !== 'unscheduled' && weekday(day) === 0 && run.excludedWeeks?.includes(day)).map((run) => <p className="muted" key={run.id}>{run.revisions.at(-1)?.planName}: Excluded week</p>)}
    {data?.schedules.filter((run) => run.kind !== 'unscheduled' && scheduleActiveOn(run, day)).map((run) => { const revision = revisionAt(run, day); return revision?.needsRepair ? <p className="muted" key={run.id}>{revision.planName}: mapping needs repair</p> : revision && !revision.unscheduled && events && !events.some((activity) => activity.event?.ref.scheduleId === run.id && activity.date === day && !activity.event.unscheduled) ? <p className="muted" key={run.id}>{revision.planName}: Rest</p> : null })}
  </section>
  return <>
    <div className="calendar-heading"><h1 id="calendar-heading" tabIndex={-1}>{editor ? ('schedule' in editor ? 'Edit Plan' : 'Add Plan') : destination === 'calendar' ? 'Calendar' : destination === 'current' ? 'Current Plans' : 'Previous Plans'}</h1>{!editor && (destination === 'calendar' ? <button id="calendar-menu" aria-label="Calendar menu" onClick={(event) => { returnPosition.current = { y: window.scrollY, trigger: event.currentTarget }; setMenu(true) }}><Menu aria-hidden="true" /></button> : destination === 'current' ? <button onClick={returnCalendar}>Cancel</button> : null)}</div>
    {(result?.error || library?.error) && <p role="alert">Could not load Calendar. {result?.error || library?.error} <button onClick={() => setAttempt((value) => value + 1)}>Retry calendar</button></p>}
    {editor && ('schedule' in editor ? <ScheduleEditor profileId={profileId} schedule={editor.schedule} onCancel={closeEditor} onSaved={closeEditor} /> : <AddPlans profileId={profileId} plans={data?.plans ?? []} activePlanIds={new Set((data?.schedules ?? []).filter((run) => !runLifecycle(run, data?.sessions ?? [], instant).previous).map((run) => run.planId))} startWeek={editor.startWeek} zone={editor.zone} onCancel={closeEditor} onSaved={closeEditor} />)}
    {destination !== 'calendar' && <div hidden={!!editor}>{data ? <PlanRuns key={destination} profileId={profileId} runs={data.schedules} sessions={data.sessions} instant={instant} previous={destination === 'previous'} duplicateIds={duplicates} onEdit={(schedule) => edit({ schedule })} onCancel={returnCalendar} /> : <p role="status">Loading plans...</p>}</div>}
    {!editor && destination === 'calendar' && <>
      <div className="calendar-toolbar">
        <div className="segmented" aria-label="Calendar view">{(['day', 'week', 'month'] as const).map((item) => <button key={item} aria-pressed={view === item} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        <div className="actions"><button aria-label="Previous period" onClick={() => shift(-1)}><ArrowLeft aria-hidden="true" /></button><button onClick={() => setSelection(localToday(zone))}>Today</button><button aria-label="Next period" onClick={() => shift(1)}><ArrowRight aria-hidden="true" /></button></div>
        <button id="calendar-add" className="primary" disabled={!data?.plans.some((plan) => !plan.archivedAt)} onClick={() => { returnPosition.current = { y: window.scrollY, trigger: document.activeElement as HTMLElement }; edit({ startWeek: monday(date), zone }) }}>Add Plan</button>
        <Field label="Calendar date" type="date" value={date} onChange={(e) => { if (validDate(e.target.value)) setSelection(e.target.value) }} />
      </div>
      {!!duplicates.size && <p role="status">Some plans have multiple Calendar assignments. <button onClick={(event) => { returnPosition.current = { y: window.scrollY, trigger: event.currentTarget }; openRuns('current') }}>Review Current Plans</button></p>}
      <h2 className="calendar-range" aria-live="polite">{view === 'month' ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : `${range.start}${range.end !== range.start ? ` – ${range.end}` : ''}`}</h2>
      {!events && !result?.error && <p role="status">Loading calendar…</p>}
      {data && !data.schedules.some((run) => run.kind !== 'unscheduled') && <p>No Calendar assignments. Add a plan to begin.</p>}
      {view === 'month' ? <div className="calendar-month" aria-label="month calendar">{dates.filter((_, index) => index % 7 === 0).map((start, index) => <section className="calendar-week-section" key={start} aria-label={`Calendar Week ${index + 1}`}><h2>Week {index + 1}</h2><div className="calendar-grid calendar-week-dates" tabIndex={0} role="region" aria-label={`Dates in calendar week ${index + 1}`}>{dates.slice(index * 7, index * 7 + 7).map(renderDay)}</div></section>)}</div> : <div className={`calendar-grid calendar-view-${view}`} aria-label={`${view} calendar`}>{dates.map(renderDay)}</div>}
      {dayAction && <TrainingDayActions profileId={profileId} {...dayAction} onClose={() => setDayAction(undefined)} onOpened={(value) => { setDayAction(undefined); openScreen('train', { profileId, draftId: value.draft?.id, sessionId: value.session?.id }) }} />}
      {error && <p role="alert">{error}</p>}
    </>}
    {menu && <ActionDialog title="Calendar menu" onClose={() => setMenu(false)} actions={<button onClick={() => setMenu(false)}>Cancel</button>}><div className="stacked-actions"><button onClick={() => openRuns('current')}>Current Plans</button><button onClick={() => openRuns('previous')}>Previous Plans</button></div></ActionDialog>}
  </>
}

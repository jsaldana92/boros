import { TrainingDayActions } from '../train/TrainingDayActions'
import { dayStatus } from '../../lib/weekly-status'
import { createId } from '../../lib/browser-crypto.ts'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWorkspace } from '../../app/workspace-context'
import { useScreenNavigation } from '../../app/navigation-context'
import { useCurrentInstant } from '../../lib/use-current-instant'
import { schedules, type CalendarEvent, type ChangePreview } from '../../db/schedules'
import { sessions } from '../../db/sessions'
import { dateRange, addDays, browserZone, localToday, monday, monthStart, nextMonday, validDate, viewRange, weekdays, weekday, type CalendarView } from '../../lib/calendar-dates'
import { revisionAt, scheduleActiveOn, scheduleEnd, scheduleInputSchema, type Mapping, type Schedule, type ScheduleInput } from '../../schemas/schedule'
import type { Plan } from '../../schemas/plan'
import { Field } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

const message = (error: unknown) => error instanceof Error ? error.message : 'Could not save. Your input is kept.'
export function CalendarPage() {
  const { snapshot } = useWorkspace()
  return <CalendarWorkspace key={snapshot.profile.id} profileId={snapshot.profile.id} />
}
function CalendarWorkspace({ profileId }: { profileId: string }) {
  const { allowLeave, snapshot } = useWorkspace(), { openScreen } = useScreenNavigation()
  const instant = useCurrentInstant()
  const [dayAction, setDayAction] = useState<{ event: CalendarEvent; run: Schedule }>()
  const [selection, setSelection] = useState<{ date?: string }>({}), [view, setView] = useState<CalendarView>('month')
  const [editor, setEditor] = useState<{ plans: Plan[]; schedule?: Schedule; kind: 'create' | 'remap' | 'stop' | 'duration' }>()
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false)
  const library = useLiveQuery(async () => {
    try { return { data: await schedules.library(profileId), error: '' } }
    catch (error) { return { error: message(error) } }
  }, [profileId, attempt])
  const data = library?.data, zone = snapshot.profile.timeZone ?? browserZone(), today = localToday(zone, instant), date = selection.date ?? today
  const setDate = (date: string) => setSelection({ date })
  const range = viewRange(date, view)
  const result = useLiveQuery(async () => {
    try { return { events: await schedules.events(profileId, range.start, range.end), error: '' } }
    catch (error) { return { error: message(error) } }
  }, [profileId, range.start, range.end, attempt])
  const close = () => { if (allowLeave()) { setEditor(undefined); requestAnimationFrame(() => document.getElementById('calendar-heading')?.focus()) } }
  const openEvent = async (event: CalendarEvent) => {
    if (event.outcome && event.outcome.status !== 'pending') { const run = data?.schedules.find((item) => item.id === event.ref.scheduleId); if (run) setDayAction({ event, run }); return }
    if (busy || !allowLeave()) return; setBusy(true); setError('')
    try {
      const opened = await sessions.openOccurrence(profileId, event.ref.scheduleId, event.ref.dayId, event.ref.scheduledDate)
      openScreen('train', { profileId, draftId: opened.draft?.id, sessionId: opened.session?.id })
    } catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  const shift = (direction: number) => { try { setDate(view === 'month' ? monthStart(date, direction) : addDays(date, direction * (view === 'week' ? 7 : 1))); setError('') } catch (error) { setError(message(error)) } }
  return <><h1 id="calendar-heading" tabIndex={-1}>Calendar</h1>
    {editor ? <ScheduleEditor profileId={profileId} profileZone={zone} {...editor} onCancel={close} onSaved={(saved) => { setEditor(undefined); setSelection({ date: saved.startWeek }); requestAnimationFrame(() => document.getElementById('calendar-heading')?.focus()) }} /> : <>
      {!result && <p role="status">Loading calendar…</p>}
      {(result?.error || library?.error) && <p role="alert">Could not load Calendar. {result?.error || library?.error} <button onClick={() => setAttempt((value) => value + 1)}>Retry calendar</button></p>}
      <div className="calendar-toolbar"><div className="segmented" aria-label="Calendar view">{(['day', 'week', 'month'] as const).map((item) => <button key={item} aria-pressed={view === item} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        <div className="actions"><button aria-label="Previous period" onClick={() => shift(-1)}>Previous</button><button onClick={() => setDate(localToday(zone))}>Today</button><button aria-label="Next period" onClick={() => shift(1)}>Next</button></div>
        <div className="field-grid"><Field label="Calendar date" type="date" value={date} onChange={(e) => { if (validDate(e.target.value)) setDate(e.target.value) }} /></div>
      </div>
      <p>Today uses {zone}. Events keep their schedule’s local dates and time zone.</p>
      <h2 className="calendar-range" aria-live="polite">{view === 'month' ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : `${range.start}${range.end !== range.start ? ` – ${range.end}` : ''}`}</h2>
      {data && !data.schedules.length && <p>No schedules. Add an active plan to begin.</p>}
      {!!result?.events?.some((event) => event.unscheduled) && <section aria-label="Unassigned weekly training"><h2>Weekly programs without assigned weekdays</h2>{result.events.filter((event) => event.unscheduled).map((event) => <button className="calendar-event" key={event.ref.key} onClick={() => { const run = data?.schedules.find((item) => item.id === event.ref.scheduleId); if (run) setDayAction({ event, run }) }}><span>{event.planName} / {event.day.name}</span><span>Week of {event.ref.scheduledWeek} / {dayStatus(event, instant)} / {event.ref.timeZone} / Run {event.ref.scheduleId.slice(0, 8)}</span></button>)}</section>}
      <div className={`calendar-grid calendar-view-${view}`} aria-label={`${view} calendar`}>
        {dateRange(range.start, range.end).map((day) => <section key={day} className={`calendar-day${view === 'month' && day.slice(0, 7) !== date.slice(0, 7) ? ' adjacent-month' : ''}`} aria-label={day} aria-current={day === today ? 'date' : undefined}>
          <h3><time dateTime={day}>{weekdays[weekday(day)]} {day.slice(5)}</time>{day === today && ' · Today'}</h3>
          {result?.events?.filter((event) => !event.unscheduled && event.ref.scheduledDate === day).map((event) => <button key={event.ref.key} className={`calendar-event${event.session || event.outcome?.status === 'completed' ? ' completed' : ''}`} disabled={busy} onClick={() => void openEvent(event)}>
            <span className="event-name">{event.planName} / {event.day.name}</span><span>{event.session ? `✓ Completed${event.session.partial ? ' · Partial' : ''}` : event.draft ? 'In progress' : dayStatus(event, instant)}</span>
            <span>{event.ref.timeZone}</span>
            {(data?.schedules.length ?? 0) > 1 && <span>Schedule {event.ref.scheduleId.slice(0, 8)}</span>}
            {event.retained && <span>Kept original session</span>}
          </button>)}
          {data?.schedules.filter((item) => weekday(day) === 0 && item.excludedWeeks?.includes(day)).map((item) => <p className="muted" key={item.id}>{item.revisions.at(-1)!.planName}: Excluded week / Run {item.id.slice(0, 8)}</p>)}
          {data?.schedules.filter((item) => item.kind !== 'unscheduled' && scheduleActiveOn(item, day)).map((item) => {
            const revision = revisionAt(item, day)
            return revision?.needsRepair ? <p className="muted" key={item.id}>{revision.planName}: mapping needs repair</p> : revision && !revision.mapping.some((assignment) => assignment.weekday === weekday(day)) ? <p className="muted" key={item.id}>{revision.planName}: Rest</p> : null
          })}
        </section>)}
      </div>
      {data && <section aria-label="Schedules"><div className="actions"><button className="primary" disabled={!data.plans.some((plan) => !plan.archivedAt)} onClick={() => setEditor({ kind: 'create', plans: data.plans.filter((plan) => !plan.archivedAt) })}>Add Plan</button></div>
        {data.schedules.map((schedule) => <article className="exercise-card" key={schedule.id} aria-label={`Schedule ${schedule.revisions.at(-1)!.planName}`}>
          <h3>{schedule.revisions.at(-1)!.planName}</h3><p>{schedule.timeZone} · Started {schedule.startWeek} · Schedule {schedule.id.slice(0, 8)}</p>
          <p>{(schedule.durationChanges?.at(-1) ?? schedule).endDate ? `Ends ${(schedule.durationChanges?.at(-1) ?? schedule).endDate} · ${(schedule.durationChanges?.at(-1) ?? schedule).durationWeeks} weeks from the original start` : 'Legacy unbounded schedule'}</p>
          {schedule.stoppedFrom ? <p>Stopped from {schedule.stoppedFrom}. History and started sessions are kept.</p> : <>
            {schedule.revisions.at(-1)!.needsRepair && <p role="status">Plan days changed. Mapping needs repair from {schedule.revisions.at(-1)!.effectiveFrom}. Started sessions are kept.</p>}
            <div className="actions"><button onClick={() => setEditor({ kind: 'remap', schedule, plans: data.plans })}>Edit mapping / refresh plan</button><button onClick={() => setEditor({ kind: 'duration', schedule, plans: data.plans })}>Review plan duration</button><button onClick={() => setEditor({ kind: 'stop', schedule, plans: data.plans })}>Stop Scheduling</button></div>
          </>}
        </article>)}
      </section>}
      {dayAction && <TrainingDayActions profileId={profileId} {...dayAction} onClose={() => setDayAction(undefined)} onOpened={(value) => { setDayAction(undefined); openScreen('train', { profileId, draftId: value.draft?.id, sessionId: value.session?.id }) }} />}
      {error && <p role="alert">{error}</p>}
    </>}
  </>
}

function ScheduleEditor({ profileId, profileZone, plans, schedule, kind, onCancel, onSaved }: { profileId: string; profileZone: string; plans: Plan[]; schedule?: Schedule; kind: 'create' | 'remap' | 'stop' | 'duration'; onCancel: () => void; onSaved: (schedule: Schedule) => void }) {
  const { setDirty } = useWorkspace()
  const [planId, setPlanId] = useState(schedule?.planId ?? plans[0]?.id ?? '')
  const plan = plans.find((item) => item.id === planId), [zone] = useState(() => schedule?.timeZone ?? profileZone)
  const initialDate = kind === 'create' ? monday(localToday(zone)) : [nextMonday(localToday(zone)), schedule!.startWeek].sort().at(-1)!
  const [date, setDate] = useState(initialDate), [mapping, setMapping] = useState<Mapping>(() => plan?.days.map((day, index) => ({ dayId: day.id, weekday: schedule?.revisions.at(-1)?.mapping.find((item) => item.dayId === day.id)?.weekday ?? index })) ?? [])
  const [preview, setPreview] = useState<{ create?: ScheduleInput; change?: ChangePreview }>(), [keep, setKeep] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const lock = useRef(false), [creationId] = useState(() => createId()), heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus(); setDirty(true); return () => setDirty(false) }, [setDirty])
  const act = async (work: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work() } catch (error) { setError(message(error)) } finally { lock.current = false; setBusy(false) } }
  const prepare = () => act(async () => {
    if (!plan) throw new Error('Choose an available plan.')
    setKeep(false)
    if (kind === 'create') {
      const parsed = scheduleInputSchema.safeParse({ planId, planRevision: plan.revision, startWeek: date, timeZone: zone, mapping })
      if (!parsed.success) throw new Error(parsed.error.issues.map((item) => item.message).join(' '))
      scheduleEnd(date, plan.durationWeeks)
      setPreview({ create: parsed.data })
    } else setPreview({ change: await schedules.preview(profileId, { scheduleId: schedule!.id, revision: schedule!.revision, effectiveFrom: date, kind, mapping }) })
  })
  const commit = () => act(async () => {
    const result = preview!.create ? await schedules.create(profileId, preview!.create, creationId) : await schedules.commit(profileId, preview!.change!, keep)
    setDirty(false); onSaved(result)
  })
  return <section className="schedule-editor"><h2 ref={heading} tabIndex={-1}>{kind === 'create' ? 'Add Plan' : kind === 'stop' ? 'Stop Scheduling' : 'Edit schedule'}</h2>
    <p>{zone} · Weeks run Monday–Sunday.</p>
    <p>{kind === 'create' ? plan?.durationWeeks === undefined ? 'Legacy plan: repeats weekly until stopped. No duration was invented.' : `Repeats for ${plan.durationWeeks} calendar weeks from the selected Monday.` : 'Past dates and saved sessions stay unchanged. Started sessions keep their original dates and prescriptions.'}</p>
    {kind === 'duration' && <p>Apply the current plan duration from the effective Monday onward. The boundary stays anchored to {schedule?.startWeek}; earlier missed dates remain incomplete. Review the resulting end date before confirming.</p>}
    {kind === 'remap' && <p>This revision copies the current plan. Prescription changes take effect only from the selected Monday.</p>}
    <form onSubmit={(e) => { e.preventDefault(); void prepare() }}><fieldset disabled={busy}>
      <label htmlFor="schedule-plan">Schedule plan</label><select id="schedule-plan" disabled={kind !== 'create'} value={planId} onChange={(e) => { setPlanId(e.target.value); setMapping(plans.find((item) => item.id === e.target.value)!.days.map((day, index) => ({ dayId: day.id, weekday: index }))) }}>{plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <Field label={kind === 'create' ? 'Starting week (Monday)' : 'Effective from'} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      {(kind === 'create' || kind === 'remap') && plan?.days.map((day) => <div key={day.id}><label htmlFor={`mapping-${day.id}`}>{day.name} weekday</label><select id={`mapping-${day.id}`} value={mapping.find((item) => item.dayId === day.id)?.weekday ?? ''} onChange={(e) => setMapping(mapping.map((item) => item.dayId === day.id ? { ...item, weekday: Number(e.target.value) } : item))}>{weekdays.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></div>)}
      <div className="actions"><button type="button" onClick={onCancel}>Cancel</button><button id="preview-schedule" className="primary" type="submit">Preview schedule</button></div>
    </fieldset></form>
    {!preview && error && <p role="alert">{error}</p>}
    {preview && <ConfirmDialog title={kind === 'stop' ? 'Confirm stop scheduling' : 'Schedule preview'} confirmLabel={busy ? 'Saving…' : 'Confirm schedule'} onCancel={() => { if (!busy) { setPreview(undefined); setError(''); requestAnimationFrame(() => document.getElementById('preview-schedule')?.focus()) } }} onConfirm={() => { void commit() }}>
      <p>{plan?.name} · {zone}</p><p>{kind === 'stop' ? 'Stop from' : 'Effective from'} {date}.</p>
      {kind !== 'stop' && <p>Start week: {preview.create?.startWeek ?? preview.change?.startWeek}. End date (inclusive): {(preview.create ? scheduleEnd(preview.create.startWeek, plan?.durationWeeks) : preview.change?.endDate) ?? 'Unbounded'}. {kind === 'remap' && 'Saved schedule duration is unchanged.'}</p>}
      {kind === 'stop' ? <p>Future unstarted occurrences from this date disappear. Earlier dates, saved sessions, and already-started sessions remain.</p> : kind === 'duration' ? <p>Only the schedule duration changes. Mapping and prescriptions stay unchanged. Dates beyond the boundary disappear only from the effective date onward; started/completed sessions remain.</p> : <ul>{weekdays.map((name, index) => <li key={name}>{name}: {plan?.days.find((day) => mapping.some((item) => item.dayId === day.id && item.weekday === index))?.name ?? 'Rest'}</li>)}</ul>}
      {!!preview.change?.conflicts.length && <><p>These started sessions are affected:</p><ul>{preview.change.conflicts.map((item) => <li key={item.id}>{item.date}: {item.name}</li>)}</ul><label className="check-label"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />Keep these sessions on their original dates, with all entered data.</label></>}
      {error && <p role="alert">{error}</p>}
    </ConfirmDialog>}
  </section>
}

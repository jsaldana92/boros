import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { calendarRuns, type Reassignment } from '../../db/calendar-runs'
import { localToday } from '../../lib/calendar-dates'
import { revisionAt, type Schedule } from '../../schemas/schedule'
import { planSubtitle } from '../create/plan-subtitle'
import { selectedMapping, weekdayChoices } from './weekday-choices'
import { WeekdayFields } from './WeekdayFields'

export function ScheduleEditor({ profileId, schedule, onCancel, onSaved }: { profileId: string; schedule: Schedule; onCancel: () => void; onSaved: () => void }) {
  const { setDirty } = useWorkspace(), [source] = useState(() => revisionAt(schedule, localToday(schedule.timeZone)) ?? schedule.revisions.at(-1)!)
  const [choices, setChoices] = useState(() => weekdayChoices(schedule.kind === 'unscheduled' ? [] : source.mapping)), [baseline, setBaseline] = useState<Reassignment>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0), lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { document.getElementById('calendar-heading')?.focus({ preventScroll: true }); window.scrollTo(0, 0); return () => setDirty(false) }, [setDirty])
  useEffect(() => {
    let alive = true
    calendarRuns.beginEdit(profileId, schedule.id, schedule.revision).then((value) => { if (alive) { setBaseline(value); setError('') } }).catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [profileId, schedule.id, schedule.revision, attempt])
  const act = async (work: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work() } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your input is kept.') } finally { lock.current = false; setBusy(false) } }
  return <section className="schedule-editor"><h2>{source.planName}</h2><p className="muted">{planSubtitle({ days: source.days, durationWeeks: (schedule.durationChanges?.at(-1) ?? schedule).durationWeeks })}</p>
    <form onSubmit={(e) => { e.preventDefault(); if (!baseline) return; void act(async () => { await calendarRuns.edit({ ...baseline, mapping: selectedMapping(source.days, choices) }); if (mounted.current) { setDirty(false); onSaved() } }) }}><fieldset disabled={busy || !baseline}><WeekdayFields days={source.days} choices={choices} onChange={(value) => { setChoices(value); setDirty(true) }} /><div className="actions"><button type="button" onClick={() => { setDirty(false); onCancel() }}>Cancel</button><button id="save-schedule" className="primary" type="submit">Save</button></div></fieldset></form>
    {!baseline && !error && <p role="status">Loading assignments…</p>}
    {error && <p role="alert">{error}</p>}
    {!baseline && error && <div className="actions"><button onClick={() => setAttempt((value) => value + 1)}>Retry</button><button onClick={onCancel}>Cancel</button></div>}
  </section>
}

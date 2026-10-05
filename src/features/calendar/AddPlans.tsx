import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { calendarRuns, type StagedPlan } from '../../db/calendar-runs'
import { createId } from '../../lib/browser-crypto'
import { displayRunDate } from '../../lib/run-progress'
import { scheduleEnd } from '../../schemas/schedule'
import type { Plan } from '../../schemas/plan'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { PlanCard } from '../create/PlanCard'
import { planSubtitle } from '../create/plan-subtitle'
import { PlanBrowseControls } from '../create/PlanBrowseControls'
import { filterExercises, type LibrarySort } from '../create/library'
import { selectedMapping, weekdayChoices } from './weekday-choices'
import { WeekdayFields } from './WeekdayFields'
import { useListSpace } from './use-list-space'

const message = (error: unknown) => error instanceof Error ? error.message : 'Could not save. Your selections are kept.'
function ConfigurePlan({ plan, pending, startWeek, zone, onCancel, onSave }: { plan: Plan; pending?: StagedPlan; startWeek: string; zone: string; onCancel: () => void; onSave: (stage: StagedPlan) => void }) {
  const [choices, setChoices] = useState(() => weekdayChoices(pending?.input.mapping)), [error, setError] = useState('')
  return <ActionDialog title={plan.name} onClose={onCancel} actions={<><button onClick={onCancel}>Cancel</button><button className="primary" onClick={() => { try { const mapping = selectedMapping(plan.days, choices); scheduleEnd(startWeek, plan.durationWeeks); onSave({ id: pending?.id ?? createId(), input: { planId: plan.id, planRevision: plan.revision, startWeek, timeZone: zone, mapping } }) } catch (e) { setError(message(e)) } }}>Save</button></>}>
    <p className="muted">{planSubtitle(plan)}</p><p>Starts {displayRunDate(startWeek)}</p><WeekdayFields days={plan.days} choices={choices} onChange={setChoices} />{error && <p role="alert">{error}</p>}
  </ActionDialog>
}
export function AddPlans({ profileId, plans, activePlanIds, startWeek, zone, onCancel, onSaved }: { profileId: string; plans: Plan[]; activePlanIds: Set<string>; startWeek: string; zone: string; onCancel: () => void; onSaved: () => void }) {
  const { setDirty } = useWorkspace(), [pending, setPending] = useState<Record<string, { plan: Plan; stage: StagedPlan }>>({})
  const [editing, setEditing] = useState<Plan>(), [selected, setSelected] = useState<string>(), [search, setSearch] = useState(''), [sort, setSort] = useState<LibrarySort>('az'), [error, setError] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false)
  const mounted = useRef(true)
  const list = useListSpace()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setDirty(!!editing || !!Object.keys(pending).length); return () => setDirty(false) }, [editing, pending, setDirty])
  useEffect(() => { document.getElementById('calendar-heading')?.focus({ preventScroll: true }); window.scrollTo(0, 0) }, [])
  const candidates = [...plans.filter((p) => !pending[p.id] && !p.archivedAt && !activePlanIds.has(p.id)), ...Object.values(pending).map((p) => ({ ...p.plan, archivedAt: undefined }))]
  const visible = filterExercises(candidates.map((p) => ({ ...p, tagIds: [] })), search, sort, [], false)
  const save = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('')
    try { await calendarRuns.addBatch(profileId, Object.values(pending).map((p) => p.stage)); if (mounted.current) { setDirty(false); onSaved() } } catch (e) { if (mounted.current) setError(message(e)) } finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  return <section className="add-plans-page" aria-label="Add plans"><p className="muted">Page Save adds all selections to Calendar.<br />Starts {displayRunDate(startWeek)}</p>
    <fieldset disabled={busy}><PlanBrowseControls search={search} sort={sort} onSearch={setSearch} onSort={setSort} />
      <div ref={list} className="add-plan-list" aria-label="Available plans" tabIndex={0}>{visible.map((plan) => <PlanCard key={plan.id} plan={plan} onClick={() => { setError(''); if (pending[plan.id]) setSelected(plan.id); else setEditing(plan) }}>{pending[plan.id] && <span className="status-pill">Scheduled</span>}</PlanCard>)}{!visible.length && <p>{search ? 'No plans match this search.' : 'No eligible plans. Schedule active Non-Scheduled runs through Current Plans → Edit.'}</p>}</div>
      <div className="actions"><button onClick={() => { setDirty(false); onCancel() }}>Cancel</button><button className="primary" disabled={!Object.keys(pending).length} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button></div>
    </fieldset>{error && <p role="alert">{error}</p>}
    {selected && pending[selected] && <ActionDialog title={pending[selected].plan.name} onClose={() => setSelected(undefined)} actions={<button onClick={() => setSelected(undefined)}>Cancel</button>}><div className="stacked-actions"><button onClick={() => { setEditing(plans.find((p) => p.id === selected) ?? pending[selected].plan); setSelected(undefined) }}>Edit</button><button onClick={() => { setPending((old) => { const next = { ...old }; delete next[selected]; return next }); setSelected(undefined) }}>Leave</button></div></ActionDialog>}
    {editing && <ConfigurePlan key={editing.id} plan={editing} pending={pending[editing.id]?.stage} startWeek={startWeek} zone={zone} onCancel={() => setEditing(undefined)} onSave={(stage) => { setPending({ ...pending, [editing.id]: { plan: editing, stage } }); setEditing(undefined) }} />}
  </section>
}

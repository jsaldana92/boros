import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { progress } from '../../db/progress'
import { useWorkspace } from '../../app/workspace-context'
import { exerciseCounts, performanceStats, selectPerformances, type Performance, type ProgressItem } from '../../lib/progress-analytics'
import { displayNumber, fromKg, nameKey, type WeightUnit } from '../../schemas/profile'
import { LibraryExerciseCard } from '../create/LibraryExerciseCard'
import { useCurrentInstant } from '../../lib/use-current-instant'
import { PlanRuns } from '../calendar/PlanRuns'
import { LibraryFilters } from '../create/LibraryFilters'
import { filterExercises, type LibrarySort } from '../create/library'
import { BoundedGrid } from '../../components/ui/BoundedGrid'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { PointChart } from './PointChart'

type View = { planId?: string; itemKey?: string }
export function WorkoutProgress({ mainContent, mainOnly = false }: { mainContent: ReactNode; mainOnly?: boolean }) {
  const { snapshot } = useWorkspace(), profileId = snapshot.profile.id, instant = useCurrentInstant()
  const [view, setView] = useState<View>({}), [attempt, retry] = useState(0)
  const positions = useRef(new Map<string, { y: number; trigger: HTMLElement | null }>())
  const result = useLiveQuery(async () => { try { return { data: await progress.read(profileId), error: '' } } catch (e) { return { error: (e as Error).message } } }, [profileId, attempt])
  const navigate = (next: View, returning = false) => {
    positions.current.set(JSON.stringify(view), { y: window.scrollY, trigger: document.activeElement as HTMLElement })
    setView(next)
    requestAnimationFrame(() => {
      const previous = returning ? positions.current.get(JSON.stringify(next)) : undefined
      const fallback = document.getElementById(next.planId || next.itemKey ? 'analytics-heading' : 'progress-heading')
      ;(previous?.trigger?.isConnected ? previous.trigger : fallback)?.focus({ preventScroll: true }); window.scrollTo(0, previous?.y ?? 0)
    })
  }
  const data = result?.data, plan = data?.plans.find((p) => p.id === view.planId), item = (plan?.items ?? data?.items)?.find((p) => p.key === view.itemKey)
  useEffect(() => {
    if (data && ((view.planId && !plan) || (view.itemKey && !item))) {
      const frame = requestAnimationFrame(() => { setView({}); document.getElementById('progress-heading')?.focus() }); return () => cancelAnimationFrame(frame)
    }
  }, [data, view, plan, item])
  const main = !view.planId && !view.itemKey, unit = snapshot.profile.weightUnit, zone = snapshot.profile.timeZone ?? 'UTC'
  const planTags = [...new Set(plan?.items.flatMap((i) => i.tagIds) ?? [])].map((id) => ({ id, name: data?.tags.find((t) => nameKey(t.name) === id)?.name ?? id }))
  return <>
    {main && mainContent}
    {!result && <p role="status">Loading workout progress…</p>}
    {result?.error && <p role="alert">Could not load workout progress. {result.error} <button onClick={() => retry(attempt + 1)}>Retry workout progress</button></p>}
    {data && <>
      <div hidden={!main || mainOnly}>
        <section className="progress-section" aria-labelledby="plan-progress-heading"><h2 id="plan-progress-heading" tabIndex={-1}>Plans</h2><PlanRuns profileId={profileId} runs={data.runs} sessions={data.sessions} instant={instant} previous focusTargetId="plan-progress-heading" onOpen={(run) => navigate({ planId: run.id })} />
          {data.plans.some((p) => p.legacy) && <details className="progress-history"><summary>Legacy plan history</summary>{data.plans.filter((p) => p.legacy).map((p) => <button key={p.id} onClick={() => navigate({ planId: p.id })}>{p.name}</button>)}</details>}
        </section>
        <section className="progress-section" aria-labelledby="exercise-progress-heading"><h2 id="exercise-progress-heading">Exercises</h2><ItemBrowser items={data.items} tags={data.tags} onSelect={(itemKey) => navigate({ itemKey })} overall /></section>
      </div>
      {plan && <section hidden={!!item} className="progress-section progress-drilldown" aria-label="Plan analytics">
        <h2 id={!item ? 'analytics-heading' : undefined} tabIndex={-1}>{plan.name}</h2>
        <div className="analytics-metrics"><Metric label="Times Completed" value={plan.timesCompleted} /><Metric label="Exercises Completed" value={plan.exercisesCompleted} /><Metric label="Training Days Completed" value={plan.daysCompleted} /><Metric label="Training Days Skipped" value={plan.daysSkipped} /></div>
        <ItemBrowser key={plan.id} items={plan.items} tags={planTags} onSelect={(itemKey) => navigate({ planId: plan.id, itemKey })} />
        <div className="actions"><button onClick={() => navigate({}, true)}>Back</button></div>
      </section>}
      {item && <section className="progress-section progress-drilldown" aria-label="Exercise analytics"><h2 id="analytics-heading" tabIndex={-1}>{item.name}</h2><p>{plan ? `${plan.name} · ${item.context}` : 'Overall'}</p>
        <ExerciseStatistics key={`${plan?.id ?? ''}:${item.key}`} name={item.name} performances={selectPerformances(data, item.key, plan?.id)} counts={exerciseCounts(data, item.key, plan?.id)} unit={unit} zone={zone} overall={!plan} />
        <div className="actions"><button onClick={() => navigate(plan ? { planId: plan.id } : {}, true)}>Back</button></div>
      </section>}
    </>}
  </>
}
function ItemBrowser({ items, tags, onSelect, overall = false }: { items: ProgressItem[]; tags: { id: string; name: string }[]; onSelect: (key: string) => void; overall?: boolean }) {
  const [search, setSearch] = useState(''), [sort, setSort] = useState<LibrarySort>('az'), [filterTags, setFilterTags] = useState<string[]>([])
  const visible = filterExercises(items.map((i) => ({ ...i, id: i.key })), search, sort, filterTags, false)
  return <><LibraryFilters search={search} setSearch={setSearch} sort={sort} setSort={setSort} filterTags={filterTags} setFilterTags={setFilterTags} tags={tags} />
    {visible.length ? <BoundedGrid rows={3} label={overall ? 'Overall exercises' : 'Plan exercises'} className="workout-progress-grid">{visible.map((item) => <LibraryItemCard key={item.key} item={item} overall={overall} onSelect={onSelect} />)}</BoundedGrid> : <p>{search || filterTags.length ? 'No exercises match these filters.' : 'No exercises yet.'}</p>}
  </>
}
function Metric({ label, value, onClick }: { label: string; value: ReactNode; onClick?: () => void }) {
  return <div className="analytics-metric">{onClick ? <button className="metric-value" aria-label={`${label}: ${value}`} onClick={onClick}>{value}</button> : <strong className="metric-value">{value}</strong>}<span>{label}</span></div>
}
function ExerciseStatistics({ performances, counts, unit, zone, overall, name }: { performances: Performance[]; counts: { completed: number; skipped: number }; unit: WeightUnit; zone: string; overall: boolean; name: string }) {
  const stats = performanceStats(performances), [selection, setSelection] = useState<string>(), [detail, setDetail] = useState<{ id: string; reps: boolean; label: string }>()
  const selected = stats.sets.find((s) => s.id === selection) ?? stats.sets.at(-1), extreme = stats.sets.find((s) => s.id === detail?.id)
  const weight = (kg: number) => `${displayNumber(fromKg(kg, unit))} ${unit}`
  const date = (set: NonNullable<typeof extreme>) => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: set.performance.session.occurrence?.timeZone ?? zone }).format(new Date(set.performance.session.completedAt))
  const metrics = [['Weight Max', stats.maximum, false], ['Weight Min', stats.minimum, false], ['Reps Max', stats.repsMaximum, true], ['Reps Min', stats.repsMinimum, true]] as const
  return <div className="exercise-statistics"><div className="analytics-metrics"><Metric label="Times Completed" value={counts.completed} /><Metric label="Times Skipped" value={counts.skipped} />{metrics.map(([label, set, reps]) => <Metric key={label} label={label} value={set ? reps ? set.result.reps : weight(set.result.weightKg) : '—'} onClick={set ? () => setDetail({ id: set.id, reps, label }) : undefined} />)}</div>
    {(['Weight', 'Reps'] as const).map((kind) => <PointChart key={kind} title={`${name} recorded ${kind.toLowerCase()}`} unit={kind === 'Weight' ? unit : 'reps'} selectorLabel={`Select ${kind.toLowerCase()} set for ${name}`} selectedId={selected?.id} onSelect={setSelection} points={stats.sets.map((s) => ({ id: s.id, time: Date.parse(s.performance.session.completedAt), value: kind === 'Weight' ? fromKg(s.result.weightKg, unit) : s.result.reps, date: date(s), label: `${weight(s.result.weightKg)} × ${s.result.reps} reps · ${date(s)} · ${s.performance.session.planName} · ${s.performance.session.day.name} · Set ${s.index + 1}` }))} />)}
    {extreme && detail && <ActionDialog title={detail.label} hideTitle onClose={() => setDetail(undefined)} actions={<button onClick={() => setDetail(undefined)}>Close</button>}><p className="weight-detail-value">{detail.reps ? `${extreme.result.reps} reps` : weight(extreme.result.weightKg)}</p><p>{detail.reps ? weight(extreme.result.weightKg) : `${extreme.result.reps} reps`}</p><p>{date(extreme)}</p>{overall && <p>{extreme.performance.session.planName} · {extreme.performance.session.day.name}</p>}</ActionDialog>}
  </div>
}

function LibraryItemCard({ item, overall, onSelect }: { item: ProgressItem; overall: boolean; onSelect: (key: string) => void }) {
  return overall ? <LibraryExerciseCard name={item.name} createdAt={item.createdAt} onClick={() => onSelect(item.key)} /> : <button onClick={() => onSelect(item.key)}><strong>{item.name}</strong><small>{item.context}</small></button>
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { progress } from '../../db/progress'
import { useWorkspace } from '../../app/workspace-context'
import { performanceStats, selectPerformances, type Performance, type ProgressItem } from '../../lib/progress-analytics'
import { displayDateTime } from '../../lib/display-dates'
import { displayNumber, fromKg, type WeightUnit } from '../../schemas/profile'
import type { CompletedSession } from '../../schemas/session'
import { SessionReview } from '../train/SessionReview'
import { PointChart } from './PointChart'

const completionLabel = (session: CompletedSession, zone: string) => `${displayDateTime(session.completedAt, session.occurrence?.timeZone ?? zone)} · ${session.occurrence?.timeZone ?? zone}`
const performanceLabel = (p: Performance) => `${p.session.planName} / ${p.session.day.name} / Exercise ${p.occurrenceIndex + 1}${p.session.partial ? ' · Partial session' : ''}`
type View = { planId?: string; itemKey?: string; sessionId?: string }
export function WorkoutProgress() {
  const { snapshot } = useWorkspace(), profileId = snapshot.profile.id
  const [view, setView] = useState<View>({}), [attempt, retry] = useState(0), heading = useRef<HTMLHeadingElement>(null), carousel = useRef<HTMLDivElement>(null)
  const result = useLiveQuery(async () => { try { return { data: await progress.read(profileId), error: '' } } catch (error) { return { error: (error as Error).message } } }, [profileId, attempt])
  const navigate = (next: View) => { setView(next); requestAnimationFrame(() => heading.current?.focus()) }
  const data = result?.data, plan = data?.plans.find((p) => p.id === view.planId), item = (plan?.items ?? data?.items)?.find((p) => p.key === view.itemKey), session = data?.sessions.find((s) => s.id === view.sessionId)
  // Deletions/Clear/restore must not leave an obsolete selection or revive it later.
  useEffect(() => {
    if (data && ((view.planId && !plan) || (view.itemKey && !item) || (view.sessionId && !session))) {
      const frame = requestAnimationFrame(() => { setView({}); requestAnimationFrame(() => heading.current?.focus()) })
      return () => cancelAnimationFrame(frame)
    }
  }, [data, view, plan, item, session])
  const zone = snapshot.profile.timeZone ?? 'UTC', unit = snapshot.profile.weightUnit
  const back = () => navigate(view.sessionId ? { planId: view.planId, itemKey: view.itemKey } : view.itemKey ? { planId: view.planId } : {})
  if (!result) return <p role="status">Loading workout progress…</p>
  if (result.error || !data) return <p role="alert">Could not load workout progress. {result.error} <button onClick={() => retry(attempt + 1)}>Retry workout progress</button></p>
  const identities = data.items.filter((entry) => !entry.members).map((entry) => entry.key).sort()
  const colorFor = (key: string) => Math.max(0, identities.indexOf(key)) % 5
  if (view.planId || view.itemKey || view.sessionId) return <section className="progress-section progress-drilldown" aria-label="Workout progress details">
    <button onClick={back}>Back {view.sessionId ? 'to statistics' : view.itemKey && plan ? 'to plan progress' : 'to Progress'}</button>
    <h2 ref={heading} tabIndex={-1}>{session ? 'Saved session' : item?.name ?? plan?.name ?? 'Progress'}</h2>
    {session ? <SessionReview session={session} backLabel="Back to statistics" onClose={back} /> : item ? <>
      <p>{plan ? `Plan: ${plan.name}` : 'Across all plans'}</p>
      {item.members ? item.members.map((member, index) => <section className="superset-progress-member" key={`${member.key}:${index}`} aria-label={`Member ${index + 1}: ${member.name}`}><h3>Member {index + 1}: {member.name}</h3><ExerciseStatistics key={`${item.key}:${index}`} name={member.name} color={colorFor(member.key)} performances={selectPerformances(data, item.key, plan?.id, index)} unit={unit} zone={zone} onReview={(sessionId) => navigate({ ...view, sessionId })} /></section>) : <ExerciseStatistics key={item.key} name={item.name} color={colorFor(item.key)} performances={selectPerformances(data, item.key, plan?.id)} unit={unit} zone={zone} onReview={(sessionId) => navigate({ ...view, sessionId })} />}
    </> : plan && <>
      <div className="progress-counts"><p><strong>{plan.daysCompleted}</strong> Training days completed</p><p><strong>{plan.daysSkipped}</strong> Training days skipped</p><p><strong>{plan.manualCompletions}</strong> Manual completions (no results)</p><p><strong>{plan.exercisesCompleted}</strong> Exercise completions</p></div>
      <p className="muted">Completed days count fully completed sessions and days marked complete, once per occurrence. Partial sessions keep their recorded results. Each exercise performed with a recorded set counts once; superset members count separately.</p>
      <ItemGrid items={plan.items} onSelect={(itemKey) => navigate({ planId: plan.id, itemKey })} />
      <SessionList sessions={plan.sessions} zone={zone} onReview={(sessionId) => navigate({ planId: plan.id, sessionId })} />
    </>}
  </section>
  const scroll = (direction: number) => {
    const element = carousel.current
    if (!element) return
    const buttons = [...element.querySelectorAll('button')], current = buttons.findIndex((b) => b.getBoundingClientRect().left >= element.getBoundingClientRect().left - 2)
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, current + direction))]
    next?.focus(); next?.scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'smooth' })
  }
  return <>
    <section className="progress-section" aria-labelledby="plan-progress-heading"><h2 id="plan-progress-heading" ref={heading} tabIndex={-1}>Plans</h2>
      {!data.plans.length ? <p>No saved plans yet.</p> : <><div className="actions"><button aria-label="Previous plan card" onClick={() => scroll(-1)}>Previous</button><button aria-label="Next plan card" onClick={() => scroll(1)}>Next</button></div>
        <div className="progress-carousel" ref={carousel} aria-label="Plan progress cards">{data.plans.map((p) => <button key={p.id} onClick={() => navigate({ planId: p.id })}><strong>{p.name}</strong><small>{p.archived ? 'Archived · ' : p.historical ? 'Historical · ' : ''}{p.daysCompleted} training days completed</small></button>)}</div></>}
    </section>
    <section className="progress-section" aria-labelledby="workout-progress-heading"><h2 id="workout-progress-heading">Workouts</h2><ItemGrid items={data.items} onSelect={(itemKey) => navigate({ itemKey })} />
      <details className="progress-history"><summary>Saved sessions ({data.sessions.length})</summary><SessionList sessions={data.sessions} zone={zone} onReview={(sessionId) => navigate({ sessionId })} /></details>
    </section>
  </>
}
function ItemGrid({ items, onSelect }: { items: ProgressItem[]; onSelect: (key: string) => void }) {
  return items.length ? <div className="workout-progress-grid">{items.map((item) => <button key={item.key} onClick={() => onSelect(item.key)}><strong>{item.name}</strong><small>{item.context}</small></button>)}</div> : <p>No saved workouts yet.</p>
}
function SessionList({ sessions, zone, onReview }: { sessions: CompletedSession[]; zone: string; onReview: (id: string) => void }) {
  return <div className="progress-sessions">{[...sessions].reverse().map((s) => <article key={s.id}><p>{s.planName} / {s.day.name}<br />{completionLabel(s, zone)} · {s.partial ? 'Partial session' : 'Complete session'}</p><button onClick={() => onReview(s.id)}>Review session</button></article>)}</div>
}
function ExerciseStatistics({ performances, unit, zone, onReview, name, color }: { performances: Performance[]; unit: WeightUnit; zone: string; onReview: (id: string) => void; name: string; color: number }) {
  const stats = useMemo(() => performanceStats(performances), [performances]), [selection, setSelection] = useState<string>()
  const selected = stats.sets.find((s) => s.id === selection) ?? stats.sets.at(-1)
  const pair = (weight: number, reps: number) => `${displayNumber(fromKg(weight, unit))} ${unit} × ${reps} reps`
  const dates = useMemo(() => new Map(performances.map((p) => [p.session.id, completionLabel(p.session, zone)])), [performances, zone])
  const performance = (list: Performance[]) => list.map((p) => <div className="recorded-performance" key={p.id}><p>{dates.get(p.session.id)}<br />{performanceLabel(p)}</p><ul>{p.sets.map((s) => <li key={s.id}>Set {s.index + 1}: {pair(s.result.weightKg, s.result.reps)}</li>)}</ul></div>)
  if (!stats.sets.length) return <p>No recorded sets yet.</p>
  return <div className="exercise-statistics">
    <p>{performances.length} exercise completions · {stats.sets.length} recorded sets</p>
    <div className="performance-stats"><section aria-label="Starting performance"><h3>Starting performance</h3>{performance(stats.starting)}</section><section aria-label="Latest performance"><h3>Latest performance</h3>{performance(stats.latest)}</section>
      {([['Maximum', stats.maximum], ['Minimum', stats.minimum]] as const).map(([label, s]) => s && <section key={label} aria-label={`${label} recorded weight`}><h3>{label} recorded weight</h3><p>{pair(s.result.weightKg, s.result.reps)}<br />{dates.get(s.performance.session.id)}<br />{performanceLabel(s.performance)} · Set {s.index + 1}</p></section>)}
    </div>
    <p className="muted">Starting and latest include every recorded set in that session. Equal times use a stable saved order. Tied weights show the earliest set.</p>
    <PointChart title={`${name} recorded loads`} unit={unit} selectorLabel={`Select recorded set for ${name}`} selectedId={selected?.id} onSelect={setSelection} points={stats.sets.map((s) => ({ id: s.id, time: Date.parse(s.performance.session.completedAt), value: fromKg(s.result.weightKg, unit), color, date: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: '2-digit', timeZone: s.performance.session.occurrence?.timeZone ?? zone }).format(new Date(s.performance.session.completedAt)), label: `${pair(s.result.weightKg, s.result.reps)} · ${dates.get(s.performance.session.id)} · ${performanceLabel(s.performance)} · Set ${s.index + 1}` }))} />
    {selected && <button onClick={() => onReview(selected.performance.session.id)}>Review selected session</button>}
  </div>
}

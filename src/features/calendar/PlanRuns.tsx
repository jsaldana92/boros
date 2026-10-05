import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { nameKey } from '../../schemas/profile'
import { runActions, type RunActionPreview } from '../../db/run-actions'
import { displayRunDate, runLifecycle, type runProgress } from '../../lib/run-progress'
import type { Schedule } from '../../schemas/schedule'
import type { CompletedSession } from '../../schemas/session'
import { PlanCard } from '../create/PlanCard'
import { PlanBrowseControls } from '../create/PlanBrowseControls'
import type { LibrarySort } from '../create/library'
import { useListSpace } from './use-list-space'

export function RunIndicators({ progress }: { progress: ReturnType<typeof runProgress> }) {
  return <span className="run-indicators">{[['Plan', progress.resolved], ['Completed', progress.completed], ['Skipped', progress.skipped]].map(([label, value]) => {
    const count = Number(value), total = progress.total, percent = total && total > 0 ? Math.min(100, Math.round(count / total * 100)) : undefined
    return <span className="run-indicator" key={label} role="img" aria-label={`${label}: ${count}${total === undefined ? ', no fixed total' : ` of ${total} planned days`}${percent === undefined ? '' : `, ${percent}%`}`}>
      <span className="run-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="run-track" cx="50" cy="50" r="43" /><circle className={`run-fill run-fill-${String(label).toLowerCase()}`} cx="50" cy="50" r="43" pathLength="100" strokeDasharray={`${percent ?? 0} 100`} /></svg><span>{percent === undefined ? count : `${percent}%`}</span></span><span>{label}</span>
    </span>
  })}{progress.total === undefined && <span className="muted run-total">No fixed total</span>}{progress.total === 0 && <span className="muted run-total">No prescribed days</span>}</span>
}

export function PlanRuns({ profileId, runs, sessions, instant, previous, duplicateIds = new Set(), onEdit, onCancel, onOpen, focusTargetId = 'calendar-heading' }: { profileId: string; runs: Schedule[]; sessions: CompletedSession[]; instant: Date; previous: boolean; duplicateIds?: Set<string>; onOpen?: (run: Schedule) => void; focusTargetId?: string; onEdit?: (schedule: Schedule) => void; onCancel?: () => void }) {
  const [selectedId, setSelectedId] = useState<string>(), [confirmation, setConfirmation] = useState<{ kind: 'reset' | 'end' | 'delete'; preview: RunActionPreview }>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false)
  const [search, setSearch] = useState(''), [sort, setSort] = useState<LibrarySort>('newest'), [hidden, setHidden] = useState(false)
  const list = useListSpace()
  const focusAfterAction = useRef(false)
  useEffect(() => { if (!selectedId && focusAfterAction.current) { focusAfterAction.current = false; document.getElementById(focusTargetId)?.focus({ preventScroll: true }) } }, [selectedId, focusTargetId])
  const selected = runs.find((r) => r.id === selectedId)
  const shown = runs.filter((run) => runLifecycle(run, sessions, instant).previous === previous && (!previous || hidden || !run.hiddenAt) && nameKey(run.revisions.at(-1)?.planName ?? '').includes(nameKey(search))).sort((a, b) => { const alpha = nameKey(a.revisions.at(-1)?.planName ?? '').localeCompare(nameKey(b.revisions.at(-1)?.planName ?? '')) || a.id.localeCompare(b.id); return sort === 'az' ? alpha : sort === 'za' ? -alpha : (sort === 'newest' ? -1 : 1) * (a.createdAt ?? a.startWeek ?? '').localeCompare(b.createdAt ?? b.startWeek ?? '') || alpha })
  const shownIds = shown.map((r) => r.id).join(',')
  useEffect(() => {
    if (!previous || !list.current) return
    const element = list.current, cards = Array.from(element.children).slice(0, 5)
    const measure = () => { const first = cards[0]?.getBoundingClientRect(), last = cards.at(-1)?.getBoundingClientRect(); if (first && last && last.bottom > first.top) element.style.setProperty('--five-run-height', `${last.bottom - first.top + 8}px`) }
    const observer = new ResizeObserver(measure); cards.forEach((card) => observer.observe(card)); measure(); return () => observer.disconnect()
  }, [previous, shownIds, list])
  const act = async (work: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work() } catch (e) { setError(e instanceof Error ? e.message : 'Could not update this run. Try again.') } finally { lock.current = false; setBusy(false) } }
  const prepare = (kind: 'reset' | 'end' | 'delete') => void act(async () => setConfirmation({ kind, preview: await runActions.preview(profileId, selected!.id, selected!.revision) }))
  const close = () => { if (!busy) { setSelectedId(undefined); setError('') } }
  const finish = () => { focusAfterAction.current = true; setConfirmation(undefined); setSelectedId(undefined) }
  return <>{previous && <><PlanBrowseControls search={search} sort={sort} onSearch={setSearch} onSort={setSort} /><label className="check-label"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />Show hidden plans</label></>}{!shown.length && <p>{search ? 'No plans match this search.' : `No ${previous ? 'previous' : 'current'} plans.`}</p>}
    <div ref={list} className={previous ? 'previous-plan-list' : 'catalog-grid'} aria-label={previous ? 'Previous plan runs' : 'Current plan runs'} tabIndex={previous ? 0 : undefined}>{shown.map((run) => {
      const revision = run.revisions.at(-1), lifecycle = runLifecycle(run, sessions, instant)
      return <PlanCard key={run.id} label={`Run ${revision?.planName ?? 'Plan unavailable'}`} plan={{ name: revision?.planName ?? 'Plan unavailable', days: revision?.days ?? [], durationWeeks: (run.durationChanges?.at(-1) ?? run).durationWeeks }} onClick={() => { if (onOpen) onOpen(run); else { setSelectedId(run.id); setError('') } }} actions={onOpen && <button className="plan-card-actions" aria-label={`Actions for ${revision?.planName ?? 'Plan'}`} onClick={() => { setSelectedId(run.id); setError('') }}><MoreHorizontal aria-hidden="true" /></button>}>
        <span className="muted">{displayRunDate(run.startWeek)} - {previous ? displayRunDate(lifecycle.end) : 'On Going'}</span>
        <span className="status-pill">{run.kind === 'unscheduled' ? 'Non-Scheduled' : 'Scheduled'}</span>{run.hiddenAt && <span className="muted">Hidden</span>}
        {duplicateIds.has(run.planId) && !lifecycle.previous && <span>Multiple active instances — review this run</span>}
        <RunIndicators progress={lifecycle.progress} />
      </PlanCard>
    })}</div>
    {previous && onCancel && <div className="actions"><button onClick={onCancel}>Back</button></div>}
    {selected && <ActionDialog title={selected.revisions.at(-1)?.planName ?? 'Plan actions'} hideTitle onClose={close} actions={<button disabled={busy} onClick={close}>Cancel</button>}>
      <div className="stacked-actions">{previous ? <><button disabled={busy} onClick={() => void act(async () => { await runActions.setHidden(profileId, selected.id, selected.revision, !selected.hiddenAt); finish() })}>{selected.hiddenAt ? 'Unhide' : 'Hide'}</button><button className="destructive" disabled={busy} onClick={() => prepare('delete')}>Delete</button></> : <><button disabled={busy} onClick={() => { setSelectedId(undefined); onEdit?.(selected) }}>Edit</button><button disabled={busy} onClick={() => prepare('reset')}>Reset</button><button className="destructive" disabled={busy} onClick={() => prepare('end')}>End</button></>}</div>
      {!confirmation && error && <p role="alert">{error}</p>}
    </ActionDialog>}
    {confirmation && selected && <ConfirmDialog title={confirmation.kind === 'reset' ? 'Reset Plan?' : confirmation.kind === 'end' ? 'Ending a Plan?' : 'Delete Plan?'} confirmLabel={confirmation.kind === 'reset' ? 'Reset' : confirmation.kind === 'end' ? 'End' : 'Delete'} destructive busy={busy} onCancel={() => { setConfirmation(undefined); setError('') }} onConfirm={() => void act(async () => { if (confirmation.kind === 'reset') await runActions.resetRun(confirmation.preview); else if (confirmation.kind === 'end') await runActions.leave(confirmation.preview); else await runActions.deletePrevious(confirmation.preview); finish() })}>
      <p>{confirmation.kind === 'reset' ? 'Resetting this plan will erase all progress for this plan and restart you from the first week.' : confirmation.kind === 'end' ? 'Your saved progress will remain, but you cannot continue this plan. Adding it again starts from Week 1.' : 'Deleting this plan will delete all results associated with it. This cannot be undone.'}</p>
      {error && <p role="alert">{error}</p>}
    </ConfirmDialog>}
  </>
}

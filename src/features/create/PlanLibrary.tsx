import { displayDateTime } from '../../lib/display-dates'
import { createId } from '../../lib/browser-crypto.ts'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { plans } from '../../db/plans'
import { planToInput, trainingBlocks, type Plan, type PlanInput } from '../../schemas/plan'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PlanEditor } from './PlanEditor'
import { filterExercises, type LibrarySort } from './library'

export function PlanLibrary({ profileId, startNew, onEditing, hidden }: { profileId: string; startNew: number; onEditing: (value: boolean) => void; hidden: boolean }) {
  const [attempt, setAttempt] = useState(0)
  const result = useLiveQuery(async () => {
    try { return { data: await plans.library(profileId), error: '' } }
    catch (e) { return { data: undefined, error: (e as Error).message } }
  }, [profileId, attempt])
  const [editor, setEditor] = useState<{ key: string; original?: Plan; draft?: PlanInput } | undefined>()
  const [selected, setSelected] = useState<Plan>()
  const [archiveTarget, setArchiveTarget] = useState<Plan>()
  const [archived, setArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<LibrarySort>('az')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const previousStart = useRef(startNew)
  useEffect(() => {
    if (startNew !== previousStart.current) { previousStart.current = startNew; setEditor({ key: createId() }); setError(''); setStatus('') }
  }, [startNew])
  const open = (draft?: PlanInput, original?: Plan) => { trigger.current = document.activeElement as HTMLElement; setEditor({ key: createId(), draft, original }); setSelected(undefined); setError(''); setStatus(''); onEditing(true) }
  const close = () => { setEditor(undefined); onEditing(false); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : heading.current)?.focus()) }
  const toggleArchive = async (plan: Plan) => {
    setBusy(true); setError(''); setStatus('')
    try { await plans.setArchived(profileId, plan.id, plan.revision, !plan.archivedAt); setSelected(undefined); setStatus(plan.archivedAt ? 'Plan restored.' : 'Plan archived.'); requestAnimationFrame(() => heading.current?.focus()) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const data = result?.data
  const visible = filterExercises((data?.plans ?? []).map((plan) => ({ ...plan, tagIds: [] })), search, sort, [], archived)
  return <section hidden={hidden} aria-label="Plans">
    {editor && <PlanEditor key={editor.key} profileId={profileId} initial={editor.draft} original={editor.original} choices={data?.choices ?? []} tags={data?.tags ?? []} onClose={close} onSaved={(name) => { close(); setStatus(`Saved plan ${name}.`) }} />}
    <div hidden={!!editor} className="plan-library">
      <h2 className="library-heading" ref={heading} tabIndex={-1}>Plans</h2>
      {!result && <p role="status">Loading plans...</p>}
      {result?.error && <><p role="alert">Could not read plans. {result.error}</p><button onClick={() => setAttempt((value) => value + 1)}>Retry plans</button></>}
      {data && <><div className="field-grid"><label>Search<input aria-label="Search plans" type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label><label>Sort<select aria-label="Sort plans" value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)}><option value="az">A-Z</option><option value="za">Z-A</option><option value="newest">Newest added</option><option value="oldest">Oldest added</option></select></label></div>
        <label className="check-label"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Show archived plans</label>
        {!visible.length && <p>{search ? 'No plans match this search.' : archived ? 'No archived plans.' : 'No plans yet. Choose Create Plan to add one.'}</p>}
        {visible.map((plan) => <article className="plan-card" key={plan.id} aria-label={`Plan ${plan.name}`}><button className="catalog-card" onClick={() => { setError(''); setSelected(plan) }}><strong>{plan.name}</strong><span className="muted">{plan.days.length} training {plan.days.length === 1 ? 'day' : 'days'} · {7 - plan.days.length} rest {7 - plan.days.length === 1 ? 'day' : 'days'} · {plan.durationWeeks === undefined ? 'Legacy unbounded duration' : `${plan.durationWeeks} ${plan.durationWeeks === 1 ? 'week' : 'weeks'}`}</span></button></article>)}
      </>}
      <p role="status">{status}</p>{error && !selected && <p role="alert">{error}</p>}
    </div>
    {editor && result?.error && <p role="alert">Exercise sources could not be loaded. {result.error} <button onClick={() => setAttempt((value) => value + 1)}>Retry sources</button></p>}
    {selected && <ActionDialog title={selected.name} onClose={() => setSelected(undefined)}>
      <ol>{selected.days.map((day) => <li key={day.id}>{day.name}: {trainingBlocks(day).map((block) => block.group ? `Superset ${block.group.number} (${block.members.map((item) => item.prescription.name).join(' + ')})` : block.members[0].prescription.name).join(', ') || 'No exercises'}</li>)}</ol>
      <p className="muted">Added {displayDateTime(selected.createdAt)} / Updated {displayDateTime(selected.updatedAt)}</p>
      <div className="actions"><button disabled={busy} onClick={() => open(planToInput(selected), selected)}>Edit</button><button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { open(await plans.duplicateDraft(profileId, selected.id)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }}>Duplicate</button><button disabled={busy} onClick={() => selected.archivedAt ? void toggleArchive(selected) : (setSelected(undefined), setArchiveTarget(selected))}>{selected.archivedAt ? 'Restore' : 'Archive'}</button></div>{error && <p role="alert">{error}</p>}
    </ActionDialog>}
    {archiveTarget && <ConfirmDialog title="Archive plan?" confirmLabel="Archive" onCancel={() => setArchiveTarget(undefined)} onConfirm={() => { void toggleArchive(archiveTarget); setArchiveTarget(undefined) }}><p>{archiveTarget.name} will leave the active plan list. Its saved record and independent copies are kept.</p></ConfirmDialog>}
  </section>
}

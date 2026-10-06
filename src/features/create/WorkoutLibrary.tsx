import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { workouts } from '../../db/workouts'
import { workoutToInput, type Workout, type WorkoutInput } from '../../schemas/workout'
import { createId } from '../../lib/browser-crypto'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { WorkoutEditor } from './WorkoutEditor'
import { WorkoutCards } from './WorkoutPicker'
import { filterWorkouts } from './workout-filter'
import { SearchSort } from './SearchSort'
import type { LibrarySort } from './library'
import { DetailsActions, DetailsActionsButton } from './DetailsActions'
import { WorkoutSummary } from './PlanDetails'

export function WorkoutLibrary({ profileId, startNew, hidden, onEditing }: { profileId: string; startNew: number; hidden: boolean; onEditing: (value: boolean) => void }) {
  const [attempt, retry] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const result = useLiveQuery(async () => { try { return { records: await workouts.library(profileId) } } catch (e) { return { error: (e as Error).message } } }, [profileId, attempt])
  const [search, setSearch] = useState(''), [sort, setSort] = useState<LibrarySort>('az'), [archived, setArchived] = useState(false)
  const [selected, setSelected] = useState<Workout>(), [actions, setActions] = useState(false), [archive, setArchive] = useState<Workout>()
  const [editor, setEditor] = useState<{ key: string; initial?: WorkoutInput; original?: Workout }>()
  const trigger = useRef<HTMLElement | null>(null), opened = useRef(0)
  const open = useCallback((initial?: WorkoutInput, original?: Workout) => { setSelected(undefined); setActions(false); setError(''); setEditor({ key: createId(), initial, original }); onEditing(true) }, [onEditing])
  useEffect(() => { if (startNew && startNew !== opened.current) { opened.current = startNew; open() } }, [startNew, open])
  const close = () => { setEditor(undefined); onEditing(false); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : document.getElementById('create-workout'))?.focus()) }
  const act = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); try { await work() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  const toggle = (value: Workout) => act(async () => { await workouts.setArchived(profileId, value.id, value.revision, !value.archivedAt); setArchive(undefined); setSelected(undefined); setActions(false); document.getElementById('create-workout')?.focus() })
  return <section hidden={hidden} aria-label="Workouts">
    {editor ? <WorkoutEditor key={editor.key} initial={editor.initial} original={editor.original} profileId={profileId} onClose={close} onSaved={close} /> : <><h2 className="library-heading">Workouts</h2><SearchSort noun="workouts" search={search} sort={sort} onSearch={setSearch} onSort={setSort} />
      <label className="check-label"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />Show archived workouts</label>
      {!result && <p role="status">Loading workouts...</p>}{result?.error && <p role="alert">{result.error} <button onClick={() => retry(v => v + 1)}>Retry workouts</button></p>}
      {result?.records && <WorkoutCards records={filterWorkouts(result.records, search, sort, archived)} onChoose={value => { trigger.current = document.activeElement as HTMLElement; setError(''); setSelected(value) }} />}
      {result?.records && !filterWorkouts(result.records, search, sort, archived).length && <p>{search ? 'No workouts match this search.' : archived ? 'No archived workouts.' : 'No workouts yet.'}</p>}
    </>}
    {selected && <ActionDialog title={selected.name} onClose={() => setSelected(undefined)} headerActions={<DetailsActionsButton label="Workout actions" expanded={actions} onClick={() => setActions(true)} />}><WorkoutSummary day={selected} /></ActionDialog>}
    {selected && actions && <DetailsActions title="Workout actions" busy={busy} archived={!!selected.archivedAt} error={error} onClose={() => setActions(false)} onEdit={() => open(workoutToInput(selected), selected)} onDuplicate={() => void act(async () => open(await workouts.duplicateDraft(profileId, selected.id)))} onArchive={() => selected.archivedAt ? void toggle(selected) : (setArchive(selected), setActions(false))} />}
    {archive && <ConfirmDialog title="Archive workout?" confirmLabel="Archive" busy={busy} onCancel={() => setArchive(undefined)} onConfirm={() => void toggle(archive)}><p>{archive.name} will leave the active library. Its record and saved copies are kept.</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
  </section>
}

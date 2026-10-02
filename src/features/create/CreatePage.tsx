import { ImportPanel } from './ImportPanel'
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWorkspace } from '../../app/workspace-context'
import { exercises, exerciseToInput } from '../../db/exercises'
import type { Exercise, ExerciseInput } from '../../schemas/exercise'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PlanLibrary } from './PlanLibrary'
import { LibraryFilters } from './LibraryFilters'
import { ExerciseEditor } from './ExerciseEditor'
import { filterExercises, type LibrarySort } from './library'

export function CreatePage() {
  const { snapshot } = useWorkspace()
  return <CreateWorkspace key={snapshot.profile.id} profileId={snapshot.profile.id} />
}

function CreateWorkspace({ profileId }: { profileId: string }) {
  const [mode, setMode] = useState('library')
  const [startNew, setStartNew] = useState(0)
  const [importStatus, setImportStatus] = useState('')
  const closeImport = (message = '') => { setMode('library'); setImportStatus(message); requestAnimationFrame(() => document.getElementById('import-output-trigger')?.focus()) }
  return <><ExerciseLibrary profileId={profileId} planOpen={mode === 'plan' || mode === 'import'} onImport={() => { setImportStatus(''); setMode('import') }} onEditing={(value) => setMode(value ? 'exercise' : 'library')} onPlan={() => { setStartNew((value) => value + 1); setMode('plan') }} /><PlanLibrary profileId={profileId} startNew={startNew} onEditing={(value) => setMode(value ? 'plan' : 'library')} hidden={mode === 'exercise' || mode === 'import'} />{mode === 'import' && <ImportPanel profileId={profileId} onClose={closeImport} />}<p role="status">{importStatus}</p></>
}

function ExerciseLibrary({ profileId, planOpen, onPlan, onEditing, onImport }: { profileId: string; planOpen: boolean; onPlan: () => void; onEditing: (value: boolean) => void; onImport: () => void }) {
  const [attempt, setAttempt] = useState(0)
  const result = useLiveQuery(async () => {
    try { return { data: await exercises.library(profileId), error: '' } }
    catch (e) { return { data: undefined, error: (e as Error).message } }
  }, [profileId, attempt])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<LibrarySort>('az')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [archived, setArchived] = useState(false)
  const [editor, setEditor] = useState<{ key: string; original?: Exercise; draft?: ExerciseInput }>()
  const [archiveTarget, setArchiveTarget] = useState<Exercise>()
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const open = (draft?: ExerciseInput, original?: Exercise) => {
    trigger.current = document.activeElement as HTMLElement
    setError(''); setStatus(''); setEditor({ key: crypto.randomUUID(), draft, original }); onEditing(true)
  }
  const close = () => { setEditor(undefined); onEditing(false); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : createButton.current)?.focus()) }
  const toggleArchive = async (record: Exercise) => {
    setBusy(true); setError(''); setStatus('')
    try { await exercises.setArchived(profileId, record.id, record.revision, !record.archivedAt); setStatus(record.archivedAt ? 'Exercise restored.' : 'Exercise archived.'); requestAnimationFrame(() => createButton.current?.focus()) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const data = result?.data
  const visible = data ? filterExercises(data.exercises, search, sort, filterTags, archived) : []
  return <>
    <h1>Create</h1>
    {editor && <ExerciseEditor key={editor.key} profileId={profileId} initial={editor.draft} original={editor.original} tags={data?.tags ?? []} onClose={close} onSaved={(name) => { close(); setStatus(`Saved ${name}.`) }} />}
    <div hidden={!!editor || planOpen}>
      <div className="actions"><button className="primary" ref={createButton} disabled={!data || busy} onClick={() => open()}>Create Workout</button><button disabled={busy} onClick={onPlan}>Create Plan</button><button id="import-output-trigger" disabled={busy} onClick={onImport}>Import AI Output</button></div>
      <h2 className="library-heading">Exercise library</h2>
      {!result && <p role="status">Loading exercises...</p>}
      {result?.error && <><p role="alert">Could not read the library. {result.error}</p><button onClick={() => setAttempt((value) => value + 1)}>Retry library</button></>}
      {data && <>
        <LibraryFilters search={search} setSearch={setSearch} sort={sort} setSort={setSort} filterTags={filterTags} setFilterTags={setFilterTags} tags={data.tags.filter((tag) => !tag.archivedAt)} />
        <label className="check-label"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Show archived exercises</label>
        <p role="status">{status}</p>{error && <p role="alert">{error}</p>}
        <p className="muted">{visible.length} {archived ? 'archived' : 'active'} exercise{visible.length === 1 ? '' : 's'}</p>
        {!visible.length && <p>{search || filterTags.length ? 'No exercises match these filters.' : archived ? 'No archived exercises.' : 'No exercises yet. Choose Create Workout to add one.'}</p>}
        <div className="exercise-list">{visible.map((record) => <article key={record.id} className="exercise-card" aria-label={record.name}>
          <h3>{record.name}</h3><p className="muted">{record.sets.length} set{record.sets.length === 1 ? '' : 's'}</p>
          <div className="tag-list">{record.tagIds.map((id) => <span className="tag-chip" key={id}>{data.tags.find((tag) => tag.id === id)?.name ?? 'Unavailable tag'}</span>)}</div>
          <details><summary>View prescription</summary><ol>{record.sets.map((set, index) => <li key={index}>Set {index + 1}: {set.reps.min === set.reps.max ? set.reps.min : `${set.reps.min}–${set.reps.max}`} reps; {set.rir ? `${set.rir.min === set.rir.max ? set.rir.min : `${set.rir.min}–${set.rir.max}`} RIR` : 'RIR unspecified'}</li>)}</ol>
            <p>Rest between sets: {record.restBetweenSeconds === undefined ? 'unspecified' : `${record.restBetweenSeconds} seconds`}. Rest after exercise: {record.restAfterSeconds === undefined ? 'unspecified' : `${record.restAfterSeconds} seconds`}.</p>
            {record.instructions && <p className="plain-text">{record.instructions}</p>}{record.notes && <p className="plain-text">Notes: {record.notes}</p>}
            {record.tutorialUrl && <a className="tutorial-link" href={record.tutorialUrl} target="_blank" rel="noopener noreferrer">Open YouTube tutorial (new tab)</a>}
          </details>
          <p className="muted">Added {new Date(record.createdAt).toLocaleString()} · Updated {new Date(record.updatedAt).toLocaleString()}</p>
          <div className="actions"><button disabled={busy} onClick={() => open(exerciseToInput(record, data.tags), record)}>View / edit</button><button disabled={busy} onClick={async () => {
            setBusy(true); setError('')
            try { open(await exercises.duplicateDraft(profileId, record.id)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
          }}>Duplicate</button><button disabled={busy} onClick={() => record.archivedAt ? void toggleArchive(record) : setArchiveTarget(record)}>{record.archivedAt ? 'Restore' : 'Archive'}</button></div>
        </article>)}</div>
      </>}
    </div>
    {archiveTarget && <ConfirmDialog title="Archive exercise?" confirmLabel="Archive" onCancel={() => setArchiveTarget(undefined)} onConfirm={() => { void toggleArchive(archiveTarget); setArchiveTarget(undefined) }}><p>{archiveTarget.name} will leave the active library. Its record is kept and can be restored.</p></ConfirmDialog>}
  </>
}

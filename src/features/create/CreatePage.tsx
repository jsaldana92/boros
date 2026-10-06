import { WorkoutLibrary } from './WorkoutLibrary'
import { createId } from '../../lib/browser-crypto.ts'
import { ImportPanel } from './ImportPanel'
import { useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWorkspace } from '../../app/workspace-context'
import { exercises, exerciseToInput } from '../../db/exercises'
import type { Exercise, ExerciseInput } from '../../schemas/exercise'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { ExerciseDetails } from './ExerciseDetails'
import { PlanLibrary } from './PlanLibrary'
import { LibraryExerciseCard } from './LibraryExerciseCard'
import { LibraryFilters } from './LibraryFilters'
import { ExerciseEditor } from './ExerciseEditor'
import { filterExercises, type LibrarySort } from './library'

export function CreatePage() {
  const { snapshot } = useWorkspace()
  return <CreateWorkspace key={snapshot.profile.id} profileId={snapshot.profile.id} />
}

function CreateWorkspace({ profileId }: { profileId: string }) {
  const [mode, setMode] = useState('library')
  const [startWorkout, setStartWorkout] = useState(0)
  const [startNew, setStartNew] = useState(0)
  const [importStatus, setImportStatus] = useState('')
  const closeImport = (message = '') => { setMode('library'); setImportStatus(message); requestAnimationFrame(() => document.getElementById('import-output-trigger')?.focus()) }
  return <><ExerciseLibrary plans={<PlanLibrary profileId={profileId} startNew={startNew} onEditing={(value) => setMode(value ? 'plan' : 'library')} hidden={mode !== 'library' && mode !== 'plan'} />} workouts={<WorkoutLibrary profileId={profileId} startNew={startWorkout} onEditing={value => setMode(value ? 'workout' : 'library')} hidden={mode !== 'library' && mode !== 'workout'} />} onWorkout={() => { setStartWorkout(v => v + 1); setMode('workout') }} profileId={profileId} planOpen={mode === 'plan' || mode === 'import' || mode === 'workout'} onImport={() => { setImportStatus(''); setMode('import') }} onEditing={(value) => setMode(value ? 'exercise' : 'library')} onPlan={() => { setStartNew((value) => value + 1); setMode('plan') }} />{mode === 'import' && <ImportPanel profileId={profileId} onClose={closeImport} />}<p role="status">{importStatus}</p></>
}

function ExerciseLibrary({ plans, workouts, onWorkout, profileId, planOpen, onPlan, onEditing, onImport }: { plans: ReactNode; workouts: ReactNode; onWorkout: () => void; profileId: string; planOpen: boolean; onPlan: () => void; onEditing: (value: boolean) => void; onImport: () => void }) {
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
  const [selected, setSelected] = useState<Exercise>()
  const [archiveTarget, setArchiveTarget] = useState<Exercise>()
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const open = (draft?: ExerciseInput, original?: Exercise) => {
    if (!selected) trigger.current = document.activeElement as HTMLElement
    setError(''); setStatus(''); setSelected(undefined); setEditor({ key: createId(), draft, original }); onEditing(true)
  }
  const close = () => { setEditor(undefined); onEditing(false); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : createButton.current)?.focus()) }
  const toggleArchive = async (record: Exercise) => {
    setBusy(true); setError(''); setStatus('')
    try { await exercises.setArchived(profileId, record.id, record.revision, !record.archivedAt); setSelected(undefined); setStatus(record.archivedAt ? 'Exercise restored.' : 'Exercise archived.'); requestAnimationFrame(() => createButton.current?.focus()) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const data = result?.data
  const visible = data ? filterExercises(data.exercises, search, sort, filterTags, archived) : []
  return <>
    {!editor && !planOpen && <h1>Create</h1>}
    {editor && <ExerciseEditor key={editor.key} profileId={profileId} initial={editor.draft} original={editor.original} tags={data?.tags ?? []} onClose={close} onMerged={record => { close(); setSelected(record); setStatus(`Saved ${record.name}.`) }} onSaved={(name) => { close(); setStatus(`Saved ${name}.`) }} />}
    <div hidden={!!editor || planOpen}>
      <div className="create-carousel" aria-label="Create actions"><button aria-label="Create Plan" disabled={busy} onClick={onPlan}>Plan</button><button id="create-workout" aria-label="Create workout" onClick={onWorkout}>Workout</button><button aria-label="Create exercise" ref={createButton} disabled={!data || busy} onClick={() => open()}>Exercise</button></div><button className="imported-button" id="import-output-trigger" disabled={busy} onClick={onImport}>Imported</button>
    </div>
    {plans}
    {workouts}
    <div hidden={!!editor || planOpen}>
      <h2 className="library-heading">Exercises</h2>
      {!result && <p role="status">Loading exercises...</p>}
      {result?.error && <><p role="alert">Could not read the library. {result.error}</p><button onClick={() => setAttempt((value) => value + 1)}>Retry library</button></>}
      {data && <>
        <LibraryFilters search={search} setSearch={setSearch} sort={sort} setSort={setSort} filterTags={filterTags} setFilterTags={setFilterTags} tags={data.tags} />
        <label className="check-label"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Show archived exercises</label>
        <p role="status">{status}</p>{error && <p role="alert">{error}</p>}
        <p className="muted">{visible.length} {archived ? 'archived' : 'active'} exercise{visible.length === 1 ? '' : 's'}</p>
        {!visible.length && <p>{search || filterTags.length ? 'No exercises match these filters.' : archived ? 'No archived exercises.' : 'No exercises yet. Choose Create exercise to add one.'}</p>}
        <div className="exercise-list" role="region" aria-label="Exercise catalog">{visible.map((record) => <article key={record.id} className="exercise-card" aria-label={record.name}><LibraryExerciseCard name={record.name} createdAt={record.createdAt} onClick={(event) => { trigger.current = event.currentTarget; setError(''); setSelected(record) }} /></article>)}</div>
      </>}
    </div>
    {selected && <ExerciseDetails exercise={selected} tags={data ? exerciseToInput(selected, data.tags).tagNames : []} busy={busy} error={error} onClose={() => setSelected(undefined)}
      onEdit={() => data && open(exerciseToInput(selected, data.tags), selected)}
      onDuplicate={() => { setBusy(true); setError(''); void exercises.duplicateDraft(profileId, selected.id).then((draft) => open(draft)).catch((e: Error) => setError(e.message)).finally(() => setBusy(false)) }}
      onArchive={() => selected.archivedAt ? void toggleArchive(selected) : (setSelected(undefined), setArchiveTarget(selected))} />}
    {archiveTarget && <ConfirmDialog title="Archive exercise?" confirmLabel="Archive" onCancel={() => { setArchiveTarget(undefined); requestAnimationFrame(() => trigger.current?.focus()) }} onConfirm={() => { void toggleArchive(archiveTarget); setArchiveTarget(undefined) }}><p>{archiveTarget.name} will leave the active library. Its record is kept and can be restored.</p></ConfirmDialog>}
  </>
}

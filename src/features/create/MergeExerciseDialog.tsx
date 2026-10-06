import { useEffect, useRef, useState } from 'react'
import { ArrowBigDown } from 'lucide-react'
import { createId } from '../../lib/browser-crypto'
import { exercises, exerciseToInput } from '../../db/exercises'
import { nameKey } from '../../schemas/profile'
import type { Exercise, ExerciseInput, Tag } from '../../schemas/exercise'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { ExercisePicker } from './ExercisePicker'

export function MergeExerciseDialog({ profileId, edited, input, onClose, onSaved }: { profileId: string; edited: Exercise; input: ExerciseInput; onClose: () => void; onSaved: (record: Exercise) => void }) {
  const [library, setLibrary] = useState<{ exercises: Exercise[]; tags: Tag[] }>()
  const [selectedId, setSelected] = useState<string>(), [confirm, setConfirm] = useState(false), [switched, setSwitched] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const locked = useRef(false), operation = useRef(createId())
  useEffect(() => { let alive = true; exercises.library(profileId).then(value => { if (alive) setLibrary(value) }).catch((e: Error) => { if (alive) setError(e.message) }); return () => { alive = false } }, [profileId])
  const eligible = library?.exercises.filter(e => e.id !== edited.id && !e.archivedAt && !e.mergedIntoId) ?? []
  const selected = eligible.find(e => e.id === selectedId)
  const source = switched ? { ...edited, name: input.name } : selected, destination = switched ? selected : { ...edited, name: input.name }
  const commit = async () => {
    if (locked.current || !selected || !source) return
    locked.current = true; setBusy(true); setError('')
    try { onSaved(await exercises.merge(profileId, { id: edited.id, revision: edited.revision, input }, selected, source.id, operation.current)) }
    catch (e) { setError((e as Error).message) }
    finally { locked.current = false; setBusy(false) }
  }
  return <><ActionDialog title="Merge exercise" onClose={() => { if (!busy) onClose() }} actions={<><button disabled={busy} onClick={onClose}>Cancel</button><button disabled={!selected || busy} onClick={() => { setError(''); setConfirm(true) }}>Merge</button></>}>
    {!library && !error && <p role="status">Loading exercises...</p>}
    {library && <ExercisePicker choices={eligible.map(record => { const prescription = exerciseToInput(record, library.tags); return { id: record.id, nameKey: record.nameKey, createdAt: record.createdAt, tagIds: prescription.tagNames.map(nameKey), label: record.name, prescription, source: { kind: 'exercise' as const, id: record.id } } })} remaining={1} onChoose={() => {}} onClose={onClose} single={{ selected: selectedId, onSelect: id => { setSelected(id); setSwitched(false); operation.current = createId() } }} />}
    {!confirm && error && <p role="alert">{error}</p>}
  </ActionDialog>{confirm && selected && <ConfirmDialog title="Merging Exercises?" confirmLabel="Merge" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void commit()}>
    <p>Merging these two exercises will combine both into only one.</p>
    <div className="merge-direction"><strong>Merge: {source?.name}</strong><ArrowBigDown aria-hidden="true" size={44} strokeWidth={3} /><strong>Into: {destination?.name}</strong><button disabled={busy} onClick={() => { setSwitched(value => !value); operation.current = createId() }}>Switch</button></div>
    {error && <p role="alert">{error}</p>}
  </ConfirmDialog>}</>
}

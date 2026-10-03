import { WorkoutProgress } from './WorkoutProgress'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWorkspace } from '../../app/workspace-context'
import { measurements, measurementRevision } from '../../db/measurements'
import { displayNumber, fromKg, type Measurement } from '../../schemas/profile'
import { measurementDateLabel } from '../../lib/measurement-dates'
import { WeightChart } from './WeightChart'
import { MeasurementEditor } from './MeasurementEditor'
import { SavedPhoto } from './ProgressPhoto'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

export function ProgressPage() {
  const { snapshot } = useWorkspace()
  return <ProgressWorkspace key={snapshot.profile.id} />
}
function ProgressWorkspace() {
  const { snapshot, allowLeave } = useWorkspace(), profileId = snapshot.profile.id, unit = snapshot.profile.weightUnit
  const [editor, setEditor] = useState<{ initial?: Measurement }>(), [remove, setRemove] = useState<Measurement>(), [photo, setPhoto] = useState<Measurement>()
  const [selectedId, setSelectedId] = useState<string>()
  const [status, setStatus] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false), lock = useRef(false)
  const deleted = useRef(false)
  // Passive effects run after the dialog's cleanup has restored its trigger.
  // On deletion that trigger may disappear with the live query, so use the heading.
  useEffect(() => { if (!remove && deleted.current) { deleted.current = false; document.getElementById('progress-heading')?.focus() } }, [remove])
  const result = useLiveQuery(async () => {
    try { return { entries: await measurements.list(profileId), error: '' } }
    catch (error) { return { error: (error as Error).message } }
  }, [profileId, attempt])
  const selected = result?.entries?.find((entry) => entry.id === selectedId) ?? result?.entries?.at(-1)
  const focus = () => requestAnimationFrame(() => document.getElementById('progress-heading')?.focus())
  const cancel = () => { if (allowLeave()) { setEditor(undefined); focus() } }
  const deleteEntry = async () => {
    if (lock.current || !remove) return
    lock.current = true; setBusy(true); setError('')
    try { await measurements.remove(profileId, remove.id, measurementRevision(remove)); deleted.current = true; setRemove(undefined); setStatus('Measurement deleted.') }
    catch (error) { setError((error as Error).message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <><h1 id="progress-heading" tabIndex={-1}>Progress</h1>
    <section className="progress-section" aria-labelledby="body-weight-heading"><h2 id="body-weight-heading">Body weight</h2>
    <p className="current-weight" role="status">{snapshot.measurement ? `Current weight: ${displayNumber(fromKg(snapshot.measurement.weightKg, unit))} ${unit}` : 'No recorded weight.'}</p>
    {editor ? <MeasurementEditor profileId={profileId} preferredUnit={unit} initial={editor.initial} onClose={cancel} onSaved={() => { setEditor(undefined); setStatus('Measurement saved.'); focus() }} /> : <>
      <button className="primary" onClick={() => { setEditor({}); setStatus(''); setError('') }}>Add measurement</button><p role="status">{status}</p>
      {!result && <p role="status">Loading measurements…</p>}
      {result?.error && <p role="alert">Could not load measurements. {result.error} <button onClick={() => setAttempt((value) => value + 1)}>Retry progress</button></p>}
      {result?.entries && <WeightChart entries={result.entries} unit={unit} selectedId={selected?.id} onSelect={setSelectedId} />}
      {selected && <article className="measurement-card" aria-label="Selected measurement">
        <h3>{displayNumber(fromKg(selected.weightKg, unit))} {unit}</h3><p>Measured: <time dateTime={selected.measuredAt}>{measurementDateLabel(selected)}</time></p>
        <div className="actions"><button onClick={() => { setEditor({ initial: selected }); setStatus(''); setError('') }}>Edit measurement</button>{selected.photoId && <button onClick={() => setPhoto(selected)}>View progress photo</button>}<button onClick={() => { setRemove(selected); setError('') }}>Delete measurement</button></div>
      </article>}
    </>}
    </section>
    {!editor && <WorkoutProgress />}
    {remove && <ConfirmDialog title="Delete measurement?" confirmLabel={busy ? 'Deleting…' : 'Delete entry and its photo'} onCancel={() => { if (!busy) { setRemove(undefined); setError('') } }} onConfirm={() => void deleteEntry()}><p>Delete {displayNumber(fromKg(remove.weightKg, unit))} {unit}, measured {measurementDateLabel(remove)}? This removes the whole entry and its unshared photo. Photos used by another entry or an avatar remain. Current weight will be recalculated from the remaining measurements.</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
    {photo && <ConfirmDialog title="Progress photo" confirmLabel="Close photo" onCancel={() => setPhoto(undefined)} onConfirm={() => setPhoto(undefined)}><p>{measurementDateLabel(photo)}</p><SavedPhoto profileId={profileId} entryId={photo.id} /></ConfirmDialog>}
  </>
}

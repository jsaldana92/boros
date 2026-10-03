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
  const [status, setStatus] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false), lock = useRef(false)
  const deleted = useRef(false)
  // Passive effects run after the dialog's cleanup has restored its trigger.
  // On deletion that trigger may disappear with the live query, so use the heading.
  useEffect(() => { if (!remove && deleted.current) { deleted.current = false; document.getElementById('progress-heading')?.focus() } }, [remove])
  const result = useLiveQuery(async () => {
    try { return { entries: await measurements.list(profileId), error: '' } }
    catch (error) { return { error: (error as Error).message } }
  }, [profileId, attempt])
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
    <p className="current-weight" role="status">{snapshot.measurement ? `Current weight: ${displayNumber(fromKg(snapshot.measurement.weightKg, unit))} ${unit}` : 'No recorded weight.'}</p>
    {editor ? <MeasurementEditor profileId={profileId} preferredUnit={unit} initial={editor.initial} onClose={cancel} onSaved={() => { setEditor(undefined); setStatus('Measurement saved.'); focus() }} /> : <>
      <button className="primary" onClick={() => { setEditor({}); setStatus(''); setError('') }}>Add measurement</button><p role="status">{status}</p>
      {!result && <p role="status">Loading measurements…</p>}
      {result?.error && <p role="alert">Could not load measurements. {result.error} <button onClick={() => setAttempt((value) => value + 1)}>Retry progress</button></p>}
      {result?.entries && <><WeightChart entries={result.entries} unit={unit} /><h2>Measurement history</h2><p className="muted">Oldest to newest by measured time. Current weight comes from the latest measurement.</p>
        {!result.entries.length && <p>No measurements yet. Add your first weight.</p>}
        {result.entries.map((entry) => <article className="exercise-card measurement-card" key={entry.id} aria-label={`${displayNumber(fromKg(entry.weightKg, unit))} ${unit}, ${measurementDateLabel(entry)}`}>
          <h3>{displayNumber(fromKg(entry.weightKg, unit))} {unit}</h3><p>Measured: <time dateTime={entry.measuredAt}>{measurementDateLabel(entry)}</time></p>
          <details><summary>Exact values and record details</summary><p>Weight: {fromKg(entry.weightKg, unit)} {unit} · Canonical: {entry.weightKg} kg</p><p>Measured instant (UTC): {entry.measuredAt}<br />Created: {entry.loggedAt}<br />Updated: {entry.updatedAt ?? entry.loggedAt}<br />Entry ID: {entry.id}</p></details>
          <div className="actions"><button onClick={() => { setEditor({ initial: entry }); setStatus(''); setError('') }}>Edit measurement</button>{entry.photoId && <button onClick={() => setPhoto(entry)}>View progress photo</button>}<button onClick={() => { setRemove(entry); setError('') }}>Delete measurement</button></div>
        </article>)}
      </>}
    </>}
    {remove && <ConfirmDialog title="Delete measurement?" confirmLabel={busy ? 'Deleting…' : 'Delete entry and its photo'} onCancel={() => { if (!busy) { setRemove(undefined); setError('') } }} onConfirm={() => void deleteEntry()}><p>Delete {displayNumber(fromKg(remove.weightKg, unit))} {unit}, measured {measurementDateLabel(remove)}? This removes the whole entry and its unshared photo. Photos used by another entry or an avatar remain. Current weight will be recalculated from the remaining measurements.</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
    {photo && <ConfirmDialog title="Progress photo" confirmLabel="Close photo" onCancel={() => setPhoto(undefined)} onConfirm={() => setPhoto(undefined)}><p>{measurementDateLabel(photo)}</p><SavedPhoto profileId={profileId} entryId={photo.id} /></ConfirmDialog>}
  </>
}

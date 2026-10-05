import { useEffect, useRef, useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWorkspace } from '../../app/workspace-context'
import { measurements, measurementRevision } from '../../db/measurements'
import { displayNumber, fromKg, type Measurement } from '../../schemas/profile'
import { filterMeasurements, measurementDateLabel, type MeasurementFilter } from '../../lib/measurement-dates'
import { WeightChart, type GraphPosition } from './WeightChart'
import { MeasurementEditor } from './MeasurementEditor'
import { SavedPhoto } from './ProgressPhoto'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { WorkoutProgress } from './WorkoutProgress'

export function ProgressPage() {
  const { snapshot } = useWorkspace()
  return <ProgressWorkspace key={snapshot.profile.id} />
}
function ProgressWorkspace() {
  const { snapshot, allowLeave } = useWorkspace(), [logging, setLogging] = useState(false)
  const [filter, setFilter] = useState<MeasurementFilter>({ start: '', end: '' }), scrollPosition = useRef<number>(undefined)
  const position = useMemo(() => ({ read: () => scrollPosition.current, write: (value: number | undefined) => { scrollPosition.current = value } }), [])
  const close = () => { setLogging(false); requestAnimationFrame(() => document.getElementById('log-weight')?.focus()) }
  return <><h1 id="progress-heading" tabIndex={-1}>Progress</h1><WorkoutProgress mainOnly={logging} mainContent={logging ? <MeasurementEditor profileId={snapshot.profile.id} preferredUnit={snapshot.profile.weightUnit} onClose={() => { if (allowLeave()) close() }} onSaved={close} /> : <BodyWeight filter={filter} setFilter={setFilter} position={position} onLog={() => setLogging(true)} />} /></>
}
function BodyWeight({ filter, setFilter, position, onLog }: { filter: MeasurementFilter; setFilter: (value: MeasurementFilter) => void; position: GraphPosition; onLog: () => void }) {
  const { snapshot } = useWorkspace(), profileId = snapshot.profile.id, unit = snapshot.profile.weightUnit
  const [selection, setSelection] = useState<string>(), [edit, setEdit] = useState<Measurement>(), [remove, setRemove] = useState<Measurement>(), [filterOpen, setFilterOpen] = useState(false)
  const [error, setError] = useState(''), [attempt, retry] = useState(0), [busy, setBusy] = useState(false), lock = useRef(false), deleted = useRef(false)
  const result = useLiveQuery(async () => { try { return { entries: await measurements.list(profileId), error: '' } } catch (e) { return { error: (e as Error).message } } }, [profileId, attempt])
  const selected = result?.entries?.find((entry) => entry.id === selection), current = snapshot.measurement
  useEffect(() => { if (!remove && deleted.current) { deleted.current = false; document.getElementById('body-weight-heading')?.focus() } }, [remove])
  const deleteEntry = async () => {
    if (lock.current || !remove) return
    lock.current = true; setBusy(true); setError('')
    try { await measurements.remove(profileId, remove.id, measurementRevision(remove)); deleted.current = true; setRemove(undefined); setSelection(undefined) }
    catch (e) { setError((e as Error).message) } finally { lock.current = false; setBusy(false) }
  }
  return <section className="progress-section" aria-labelledby="body-weight-heading">
    <div className="body-weight-heading"><h2 id="body-weight-heading" tabIndex={-1}>Body weight</h2><button id="log-weight" onClick={onLog}>Log Weight</button></div>
    <div className="current-weight" role="status">{current ? <><strong>{displayNumber(fromKg(current.weightKg, unit))} {unit}</strong><time dateTime={current.measuredAt}>{measurementDateLabel(current)}</time></> : <p>No recorded weight.</p>}</div>
    <button onClick={() => setFilterOpen(true)} aria-label={filter.start || filter.end ? 'Filter, active' : 'Filter'}>Filter</button>
    {!result && <p role="status">Loading measurements…</p>}{result?.error && <p role="alert">Could not load measurements. {result.error} <button onClick={() => retry(attempt + 1)}>Retry progress</button></p>}
    {result?.entries && <WeightChart key={`${filter.start}/${filter.end}`} entries={filterMeasurements(result.entries, filter)} unit={unit} position={position} filtered={!!(filter.start || filter.end)} onSelect={(id) => { setSelection(id); setError('') }} />}
    {filterOpen && <WeightFilter current={filter} onClose={() => setFilterOpen(false)} onApply={(next) => { position.write(undefined); setFilter(next); setFilterOpen(false) }} />}
    {selected && <ActionDialog title="Weight details" hideTitle onClose={() => setSelection(undefined)} actions={<><button onClick={() => setSelection(undefined)}>Close</button><button onClick={() => setEdit(selected)}>Edit</button><button onClick={() => { setRemove(selected); setError('') }}>Delete</button></>}><p className="weight-detail-value">{displayNumber(fromKg(selected.weightKg, unit))} {unit}</p><p>{measurementDateLabel(selected)}</p>{selected.photoId && <SavedPhoto profileId={profileId} entryId={selected.id} />}</ActionDialog>}
    {edit && <MeasurementEditor profileId={profileId} preferredUnit={unit} initial={edit} onClose={() => setEdit(undefined)} onSaved={() => setEdit(undefined)} />}
    {remove && <ConfirmDialog title="Delete Weight?" confirmLabel="Delete" destructive busy={busy} onCancel={() => { setRemove(undefined); setError('') }} onConfirm={() => void deleteEntry()}><p>Once deleted you cannot recover this stored weight.</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
  </section>
}
function WeightFilter({ current, onClose, onApply }: { current: MeasurementFilter; onClose: () => void; onApply: (value: MeasurementFilter) => void }) {
  const [value, setValue] = useState(current), [error, setError] = useState('')
  return <ActionDialog title="Filter" onClose={onClose} actions={<><button onClick={onClose}>Cancel</button><button onClick={() => onApply({ start: '', end: '' })}>Clear</button><button className="primary" onClick={() => { try { filterMeasurements([], value); onApply(value) } catch (e) { setError((e as Error).message) } }}>Apply</button></>}><Field label="Start date" type="date" value={value.start} onChange={(e) => setValue({ ...value, start: e.target.value })} /><Field label="End date" type="date" value={value.end} onChange={(e) => setValue({ ...value, end: e.target.value })} />{error && <p role="alert">{error}</p>}</ActionDialog>
}

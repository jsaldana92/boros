import { ChartDateFilter } from './ChartDateFilter'
import { useEffect, useRef, useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWorkspace } from '../../app/workspace-context'
import { measurements, measurementRevision, type MeasurementMetric } from '../../db/measurements'
import { displayNumber, fromKg, type Measurement } from '../../schemas/profile'
import { filterMeasurements, measurementDateLabel, type MeasurementFilter } from '../../lib/measurement-dates'
import { WeightChart, type GraphPosition } from './WeightChart'
import { MeasurementEditor } from './MeasurementEditor'
import { SavedPhoto } from './ProgressPhoto'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { WorkoutProgress } from './WorkoutProgress'

export function ProgressPage() {
  const { snapshot } = useWorkspace()
  return <ProgressWorkspace key={snapshot.profile.id} />
}
function ProgressWorkspace() {
  const { snapshot } = useWorkspace(), [logging, setLogging] = useState(false)
  const [filters, setFilters] = useState<Record<MeasurementMetric,MeasurementFilter>>({ weightKg: {start:'',end:''}, bodyFatPercentage: {start:'',end:''} })
  const scrollPositions = useRef<Partial<Record<MeasurementMetric,number>>>({})
  const positions = useMemo(() => Object.fromEntries((['weightKg','bodyFatPercentage'] as const).map(metric => [metric, {read: () => scrollPositions.current[metric], write: (value: number | undefined) => { scrollPositions.current[metric] = value }}])) as Record<MeasurementMetric,GraphPosition>, [])
  return <><h1 id="progress-heading" tabIndex={-1}>Progress</h1><WorkoutProgress mainContent={<>{(['weightKg','bodyFatPercentage'] as const).map(metric => <BodyMetric key={metric} metric={metric} filter={filters[metric]} setFilter={value => setFilters(current => ({...current,[metric]:value}))} position={positions[metric]} onLog={() => setLogging(true)} />)}</>} />
    {logging && <MeasurementEditor profileId={snapshot.profile.id} preferredUnit={snapshot.profile.weightUnit} onClose={() => setLogging(false)} onSaved={() => setLogging(false)} />}</>
}

function BodyMetric({ metric, filter, setFilter, position, onLog }: { metric: MeasurementMetric; filter: MeasurementFilter; setFilter: (value: MeasurementFilter) => void; position: GraphPosition; onLog: () => void }) {
  const { snapshot } = useWorkspace(), profileId = snapshot.profile.id, unit = snapshot.profile.weightUnit
  const [selection, setSelection] = useState<string>(), [edit, setEdit] = useState<Measurement>(), [remove, setRemove] = useState<Measurement>(), [filterOpen, setFilterOpen] = useState(false)
  const [error, setError] = useState(''), [attempt, retry] = useState(0), [busy, setBusy] = useState(false), lock = useRef(false), deleted = useRef(false)
  const result = useLiveQuery(async () => { try { return { entries: await measurements.list(profileId), error: '' } } catch (e) { return { error: (e as Error).message } } }, [profileId, attempt])
  const entries = result?.entries?.filter(entry => entry[metric] !== undefined), selected = entries?.find(entry => entry.id === selection), current = entries?.at(-1)
  const weight = metric === 'weightKg', headingId = weight ? 'body-weight-heading' : 'body-fat-heading', title = weight ? 'Body weight' : 'Body fat'
  const value = (entry: Measurement) => weight ? `${displayNumber(fromKg(entry.weightKg!, unit))} ${unit}` : `${entry.bodyFatPercentage}%`
  useEffect(() => { if (!remove && deleted.current) { deleted.current = false; document.getElementById(headingId)?.focus() } }, [remove, headingId])
  const deleteEntry = async () => {
    if (lock.current || !remove) return
    lock.current = true; setBusy(true); setError('')
    try { await measurements.remove(profileId, remove.id, measurementRevision(remove), metric); deleted.current = true; setRemove(undefined); setSelection(undefined) }
    catch (e) { setError((e as Error).message) } finally { lock.current = false; setBusy(false) }
  }
  return <section className="progress-section" aria-labelledby={headingId}>
    <div className="body-weight-heading"><h2 id={headingId} tabIndex={-1}>{title}</h2>{weight && <button id="log-measurements" onClick={onLog}>Log Measurements</button>}</div>
    <div className={weight ? "current-weight" : "current-body-fat"} role="status">{current ? <><strong>{value(current)}</strong><time dateTime={current.measuredAt}>{measurementDateLabel(current)}</time></> : <p>No recorded {weight ? 'weight' : 'body fat'}.</p>}</div>
    <button onClick={() => setFilterOpen(true)} aria-label={filter.start || filter.end ? 'Filter, active' : 'Filter'}>Filter</button>
    {!result && <p role="status">Loading measurements…</p>}{result?.error && <p role="alert">Could not load measurements. {result.error} <button onClick={() => retry(attempt + 1)}>Retry progress</button></p>}
    {entries && <WeightChart metric={metric} key={`${filter.start}/${filter.end}`} entries={filterMeasurements(entries, filter)} unit={unit} position={position} filtered={!!(filter.start || filter.end)} onSelect={(id) => { setSelection(id); setError('') }} />}
    {filterOpen && <ChartDateFilter current={filter} onClose={() => setFilterOpen(false)} onApply={(next) => { position.write(undefined); setFilter(next); setFilterOpen(false) }} />}
    {selected && <ActionDialog title={weight ? "Weight details" : "Body fat details"} hideTitle onClose={() => setSelection(undefined)} actions={<><button onClick={() => setSelection(undefined)}>Close</button><button onClick={() => setEdit(selected)}>Edit</button><button onClick={() => { setRemove(selected); setError('') }}>Delete</button></>}><p className="weight-detail-value">{value(selected)}</p><p>{measurementDateLabel(selected)}</p>{selected.photoId && <SavedPhoto profileId={profileId} entryId={selected.id} />}</ActionDialog>}
    {edit && <MeasurementEditor profileId={profileId} preferredUnit={unit} initial={edit} onClose={() => setEdit(undefined)} onSaved={() => setEdit(undefined)} />}
    {remove && <ConfirmDialog title={weight ? "Delete Weight?" : "Delete Body Fat?"} confirmLabel="Delete" destructive busy={busy} onCancel={() => { setRemove(undefined); setError('') }} onConfirm={() => void deleteEntry()}><p>{weight ? 'Once deleted you cannot recover this stored weight.' : 'Once deleted you cannot recover this stored body-fat measurement.'}</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
  </section>
}

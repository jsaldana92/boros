import { useState } from 'react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { filterMeasurements, type MeasurementFilter } from '../../lib/measurement-dates'
export function ChartDateFilter({ current, onClose, onApply }: { current: MeasurementFilter; onClose: () => void; onApply: (value: MeasurementFilter) => void }) {
  const [value, setValue] = useState(current), [error, setError] = useState('')
  return <ActionDialog title="Filter" onClose={onClose} actions={<><button onClick={onClose}>Cancel</button><button onClick={() => onApply({ start: '', end: '' })}>Clear</button><button className="primary" onClick={() => { try { filterMeasurements([], value); onApply(value) } catch (e) { setError((e as Error).message) } }}>Apply</button></>}><Field label="Start date" type="date" value={value.start} onChange={(e) => setValue({ ...value, start: e.target.value })} /><Field label="End date" type="date" value={value.end} onChange={(e) => setValue({ ...value, end: e.target.value })} />{error && <p role="alert">{error}</p>}</ActionDialog>
}

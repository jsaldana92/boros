import { displayNumber, fromKg, type Measurement, type WeightUnit } from '../../schemas/profile'
import { measurementDateLabel } from '../../lib/measurement-dates'
import { PointChart } from './PointChart'

export function WeightChart({ entries, unit, selectedId, onSelect }: { entries: Measurement[]; unit: WeightUnit; selectedId?: string; onSelect: (id: string) => void }) {
  if (!entries.length) return <p>No measurements to chart.</p>
  return <PointChart connect title="Body weight over time" unit={unit} selectedId={selectedId} onSelect={onSelect} selectorLabel="Select measurement" points={entries.map((entry) => ({
    id: entry.id, time: Date.parse(entry.measuredAt), value: fromKg(entry.weightKg, unit),
    date: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: '2-digit', timeZone: entry.timeZone ?? 'UTC' }).format(new Date(entry.measuredAt)),
    label: `${displayNumber(fromKg(entry.weightKg, unit))} ${unit} · ${measurementDateLabel(entry)}${entry.photoId ? ' · Photo' : ''}`,
  }))} />
}

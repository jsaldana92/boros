import { displayNumber, fromKg, type Measurement, type WeightUnit } from '../../schemas/profile'
import { measurementDate, measurementDateLabel } from '../../lib/measurement-dates'
import { ScrollableChart, type GraphPosition } from './ScrollableChart'
export type { GraphPosition } from './ScrollableChart'
export function WeightChart({ entries, unit, onSelect, position, filtered }: { entries: Measurement[]; unit: WeightUnit; onSelect: (id: string) => void; position: GraphPosition; filtered: boolean }) {
  if (!entries.length) return <p>No measurements to chart.</p>
  return <ScrollableChart points={entries.map((entry, index) => ({ id: entry.id, time: Date.parse(entry.measuredAt), value: fromKg(entry.weightKg, unit), date: measurementDate(entry), label: `${displayNumber(fromKg(entry.weightKg, unit))} ${unit} \u00b7 ${measurementDateLabel(entry)} \u00b7 measurement ${index + 1}` }))} unit={unit} label="Body weight measurements in chronological record order, equally spaced records, not elapsed time" pointsLabel="Measurement points" onSelect={onSelect} position={position} filtered={filtered} connect />
}

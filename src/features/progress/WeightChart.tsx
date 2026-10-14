import type { MeasurementMetric } from '../../db/measurements'
import { displayNumber, fromKg, type Measurement, type WeightUnit } from '../../schemas/profile'
import { measurementDate, measurementDateLabel } from '../../lib/measurement-dates'
import { ScrollableChart, type GraphPosition } from './ScrollableChart'
export type { GraphPosition } from './ScrollableChart'
export function WeightChart({ metric = 'weightKg', entries, unit, onSelect, position, filtered }: { metric?: MeasurementMetric; entries: Measurement[]; unit: WeightUnit; onSelect: (id: string) => void; position: GraphPosition; filtered: boolean }) {
  const weight = metric === 'weightKg', value = (entry: Measurement) => weight ? fromKg(entry.weightKg!, unit) : entry.bodyFatPercentage!, graphUnit = weight ? unit : '%'
  if (!entries.length) return <p>No measurements to chart.</p>
  return <ScrollableChart points={entries.map((entry, index) => ({ id: entry.id, time: Date.parse(entry.measuredAt), value: value(entry), date: measurementDate(entry), label: `${displayNumber(value(entry))}${weight ? ` ${unit}` : `%`} \u00b7 ${measurementDateLabel(entry)} \u00b7 measurement ${index + 1}` }))} unit={graphUnit} label={`${weight ? "Body weight" : "Body fat"} measurements in chronological record order, equally spaced records, not elapsed time`} pointsLabel={weight ? "Measurement points" : "Body fat measurement points"} onSelect={onSelect} position={position} filtered={filtered} connect />
}

import { useId } from 'react'
import { displayNumber, fromKg, type Measurement, type WeightUnit } from '../../schemas/profile'
import { measurementDateLabel } from '../../lib/measurement-dates'

export function WeightChart({ entries, unit }: { entries: Measurement[]; unit: WeightUnit }) {
  const id = useId()
  if (!entries.length) return <p>No measurements to chart.</p>
  const values = entries.map((entry) => fromKg(entry.weightKg, unit)), times = entries.map((entry) => Date.parse(entry.measuredAt))
  const min = values.reduce((a, b) => Math.min(a, b)), max = values.reduce((a, b) => Math.max(a, b)), first = times[0], last = times.at(-1)!
  const padding = min === max ? Math.max(1, min * .05) : 0, lower = Math.max(0, min - padding), upper = max + padding, span = upper - lower
  const points = entries.map((entry, index) => ({ entry, x: last === first ? 320 : 65 + (times[index] - first) / (last - first) * 530, y: 165 - (values[index] - lower) / span * 110 }))
  return <figure className="weight-chart" aria-labelledby={`${id}-caption`}>
    <figcaption id={`${id}-caption`}>Weight over time ({unit}) · {entries.length} measurement{entries.length === 1 ? '' : 's'}</figcaption>
    <svg viewBox="0 0 650 230" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>Weight history in {unit}</title><desc id={`${id}-desc`}>Points use measured timestamps, including repeated dates. Exact dates and values are listed in Measurement history below. Lines only connect recorded values.</desc>
      <path d="M65 35 V180 H595" fill="none" stroke="currentColor" />
      {points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="var(--focus)" strokeWidth="2" />}
      {points.map(({ entry, x, y }) => <circle key={entry.id} cx={x} cy={y} r="5" fill="var(--text)"><title>{measurementDateLabel(entry)}: {fromKg(entry.weightKg, unit)} {unit}</title></circle>)}
    </svg>
    <div className="chart-dates"><span>{(entries[0].measuredLocal ?? entries[0].measuredAt).slice(0, 10)}</span><span>{(entries.at(-1)!.measuredLocal ?? entries.at(-1)!.measuredAt).slice(0, 10)}</span></div>
    <p className="muted">Vertical scale: {displayNumber(lower)}–{displayNumber(upper)} {unit}.</p>
    <p className="muted">{entries.length === 1 ? 'One recorded point.' : 'Spacing follows elapsed measurement time.'} Coincident points may overlap; every entry remains in the history below.</p>
  </figure>
}

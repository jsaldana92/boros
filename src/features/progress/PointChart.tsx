import { useId } from 'react'
import { ScrollableChart, type PlotPoint } from './ScrollableChart'
export type ChartPoint = PlotPoint
export function PointChart({ points, unit, title, selectorLabel, selectedId, onSelect, connect = false, filtered = false }: { points: ChartPoint[]; unit: string; title: string; selectorLabel: string; selectedId?: string; onSelect: (id: string) => void; connect?: boolean; filtered?: boolean }) {
  const id = useId(), selected = Math.max(0, points.findIndex(p => p.id === selectedId))
  if (!points.length) return <p>No recorded sets to chart.</p>
  return <figure className="point-chart" aria-labelledby={`${id}-caption`}>
    <figcaption id={`${id}-caption`}>{title} ({unit}) &middot; {points.length} recorded sets</figcaption>
    <ScrollableChart points={points} unit={unit} label={title} pointsLabel={`${title} points`} onSelect={onSelect} filtered={filtered} connect={connect} />
    <label htmlFor={`${id}-points`}>{selectorLabel}</label><select id={`${id}-points`} value={points[selected]?.id} onChange={event => onSelect(event.target.value)}>{points.map((point, i) => <option key={point.id} value={point.id}>{i + 1}. {point.label}</option>)}</select>
    <div className="actions chart-actions"><button disabled={selected === 0} onClick={() => onSelect(points[selected - 1].id)}>Previous point</button><button disabled={selected === points.length - 1} onClick={() => onSelect(points[selected + 1].id)}>Next point</button></div>
  </figure>
}

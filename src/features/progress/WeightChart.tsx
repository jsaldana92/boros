import { useLayoutEffect, useRef, useState } from 'react'
import { displayNumber, fromKg, type Measurement, type WeightUnit } from '../../schemas/profile'
import { measurementDate, measurementDateLabel } from '../../lib/measurement-dates'
import { chartScale } from '../../lib/chart-scale'

export interface GraphPosition { read: () => number | undefined; write: (value: number | undefined) => void }
export function WeightChart({ entries, unit, onSelect, position, filtered }: { entries: Measurement[]; unit: WeightUnit; onSelect: (id: string) => void; position: GraphPosition; filtered: boolean }) {
  const scroll = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0), initialized = useRef(false)
  useLayoutEffect(() => {
    if (!entries.length || !scroll.current) return
    const element = scroll.current, observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element); setWidth(element.clientWidth); return () => observer.disconnect()
  }, [entries.length])
  const slot = Math.max(44, width / Math.min(10, Math.max(1, entries.length))), plotWidth = Math.max(width, entries.length * slot)
  useLayoutEffect(() => {
    if (!width || !scroll.current || !entries.length || initialized.current) return
    const nearest = entries.reduce((best, entry, index) => Math.abs(Date.parse(entry.measuredAt) - Date.now()) < Math.abs(Date.parse(entries[best].measuredAt) - Date.now()) ? index : best, 0)
    scroll.current.scrollLeft = position.read() ?? (filtered ? 0 : Math.max(0, (nearest + .5) * slot - width * .75))
    position.write(scroll.current.scrollLeft); initialized.current = true
  }, [width, slot, entries, filtered, position])
  if (!entries.length) return <p>No measurements to chart.</p>
  const values = entries.map((e) => fromKg(e.weightKg, unit)), scale = chartScale(values), points = entries.map((entry, index) => ({ entry, x: (index + .5) * slot, y: scale.y(values[index]) }))
  return <figure className="weight-chart" aria-label="Body weight measurements in chronological record order, equally spaced records, not elapsed time">
    <svg className="weight-axis" width="76" height="300" aria-label={`Weight in ${unit}`} role="img"><text className="axis-label" transform="translate(14 125) rotate(-90)" textAnchor="middle">{unit}</text>{scale.ticks.map((tick, index) => <text key={index} className="axis-label" x="70" y={tick.y + 4} textAnchor="end">{Number(tick.value.toFixed(1))}</text>)}</svg>
    <div className="weight-plot-scroll" ref={scroll} onScroll={(e) => { position.write(e.currentTarget.scrollLeft) }} role="group" aria-label="Measurement points" tabIndex={0}>
      <div className="weight-plot" style={{ width: plotWidth, height: 300 }}>
        <svg width={plotWidth} height="300" aria-hidden="true">{scale.ticks.map((tick, index) => <path key={index} d={`M0 ${tick.y} H${plotWidth}`} stroke="var(--border)" />)}<polyline points={points.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="var(--chart-0)" strokeWidth="2" />{points.map(({ entry, x }) => <text key={entry.id} className="axis-label date-tick" x={x} y="244" textAnchor="end" transform={`rotate(-45 ${x} 244)`}>{measurementDate(entry)}</text>)}</svg>
        {points.map(({ entry, x, y }, index) => <button key={entry.id} className="weight-point" style={{ left: x - 22, top: y - 22 }} aria-label={`${displayNumber(values[index])} ${unit} · ${measurementDateLabel(entry)} · measurement ${index + 1}`} onClick={() => onSelect(entry.id)} onKeyDown={(event) => {
          const offset = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0
          if (offset || event.key === 'Home' || event.key === 'End') { event.preventDefault(); const controls = scroll.current?.querySelectorAll<HTMLButtonElement>('.weight-point'); controls?.[event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, index + offset))]?.focus({ preventScroll: false }) }
        }}><span aria-hidden="true" /></button>)}
      </div>
    </div>
  </figure>
}

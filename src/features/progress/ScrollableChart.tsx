import { useLayoutEffect, useRef, useState } from 'react'
import { chartScale } from '../../lib/chart-scale'
export interface GraphPosition { read: () => number | undefined; write: (value: number | undefined) => void }
export interface PlotPoint { id: string; time: number; value: number; date: string; label: string; color?: number }
export function ScrollableChart({ points, unit, label, pointsLabel, onSelect, position, filtered = false, connect = false }: { points: PlotPoint[]; unit: string; label: string; pointsLabel: string; onSelect: (id: string) => void; position?: GraphPosition; filtered?: boolean; connect?: boolean }) {
  const scroll = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0), initialized = useRef(false)
  useLayoutEffect(() => {
    if (!points.length || !scroll.current) return
    const element = scroll.current, observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element); setWidth(element.clientWidth); return () => observer.disconnect()
  }, [points.length])
  const slot = Math.max(44, width / Math.min(10, Math.max(1, points.length))), plotWidth = Math.max(width, points.length * slot)
  useLayoutEffect(() => {
    if (!width || !scroll.current || !points.length || initialized.current) return
    const nearest = points.reduce((best, point, index) => Math.abs(point.time - Date.now()) < Math.abs(points[best].time - Date.now()) ? index : best, 0)
    scroll.current.scrollLeft = position?.read() ?? (filtered ? 0 : Math.max(0, (nearest + .5) * slot - width * .75))
    position?.write(scroll.current.scrollLeft); initialized.current = true
  }, [width, slot, points, filtered, position])
  if (!points.length) return <p>No entries to chart.</p>
  const scale = chartScale(points.map(p => p.value)), placed = points.map((point, index) => ({ point, x: (index + .5) * slot, y: scale.y(point.value) }))
  return <div className="weight-chart" aria-label={label}>
    <svg className="weight-axis" width="76" height="300" aria-label={unit} role="img"><text className="axis-label" transform="translate(14 125) rotate(-90)" textAnchor="middle">{unit}</text>{scale.ticks.map((tick, index) => <text key={index} className="axis-label" x="70" y={tick.y + 4} textAnchor="end">{Number(tick.value.toFixed(2))}</text>)}</svg>
    <div className="weight-plot-scroll" ref={scroll} onScroll={e => position?.write(e.currentTarget.scrollLeft)} role="group" aria-label={pointsLabel} tabIndex={0}>
      <div className="weight-plot" style={{ width: plotWidth, height: 300 }}>
        <svg width={plotWidth} height="300" aria-hidden="true">{scale.ticks.map((tick, index) => <path key={index} d={`M0 ${tick.y} H${plotWidth}`} stroke="var(--border)" />)}{connect && <polyline points={placed.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="var(--chart-0)" strokeWidth="2" />}{placed.map(({ point, x }) => <text key={point.id} className="axis-label date-tick" x={x} y="244" textAnchor="end" transform={`rotate(-45 ${x} 244)`}>{point.date}</text>)}</svg>
        {placed.map(({ point, x, y }, index) => <button key={point.id} className="weight-point" style={{ left: x - 22, top: y - 22 }} aria-label={point.label} onClick={() => onSelect(point.id)} onKeyDown={event => {
          const offset = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0
          if (offset || event.key === 'Home' || event.key === 'End') { event.preventDefault(); const controls = scroll.current?.querySelectorAll<HTMLButtonElement>('.weight-point'); controls?.[event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, index + offset))]?.focus({ preventScroll: false }) }
        }}><span aria-hidden="true" style={{ background: `var(--chart-${point.color ?? 0})` }} /></button>)}
      </div>
    </div>
  </div>
}

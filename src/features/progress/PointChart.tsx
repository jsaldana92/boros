import { useEffect, useId, useRef, useState } from 'react'

export interface ChartPoint { id: string; time: number; value: number; label: string; date: string; color?: number }
export function PointChart({ points, unit, title, selectorLabel, selectedId, onSelect, connect = false }: {
  points: ChartPoint[]; unit: string; title: string; selectorLabel: string; selectedId?: string; onSelect: (id: string) => void; connect?: boolean
}) {
  const id = useId(), container = useRef<HTMLElement>(null), [width, setWidth] = useState(650)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, entry.contentRect.width)))
    observer.observe(element); return () => observer.disconnect()
  }, [])
  const selected = Math.max(0, points.findIndex((p) => p.id === selectedId))
  if (!points.length) return <p>No recorded sets to chart.</p>
  const min = points.reduce((value, p) => Math.min(value, p.value), Infinity), max = points.reduce((value, p) => Math.max(value, p.value), -Infinity)
  const pad = max === min ? Math.max(1, max * .05) : (max - min) * .1, lower = Math.max(0, min - pad), upper = max + pad
  const first = points[0].time, last = points.at(-1)!.time, left = 70, right = width - 18, top = 35, bottom = 205
  const positions = points.map((point) => ({ point, x: first === last ? (left + right) / 2 : left + (point.time - first) / (last - first) * (right - left), y: bottom - (point.value - lower) / (upper - lower) * (bottom - top) }))
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].filter((index, n, array) => n === 0 || points[index].time !== points[array[n - 1]].time)
  const step = (offset: number) => onSelect(points[Math.max(0, Math.min(points.length - 1, selected + offset))].id)
  return <figure ref={container} className="point-chart" aria-labelledby={`${id}-caption`}>
    <figcaption id={`${id}-caption`}>{title} ({unit}) · {points.length} {connect ? 'measurements' : 'recorded sets'}</figcaption>
    <svg viewBox={`0 0 ${width} 295`} role="group" tabIndex={0} aria-label={`${title}. Use arrow keys to select points, Home for first, End for last.`} aria-describedby={`${id}-selection`} onKeyDown={(event) => {
      if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        if (event.key === 'Home') onSelect(points[0].id)
        else if (event.key === 'End') onSelect(points.at(-1)!.id)
        else step(['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1)
      }
    }}>
      <text x={left} y="17" className="axis-label">{unit}</text>
      {[0, 1, 2, 3, 4].map((n) => { const y = bottom - n / 4 * (bottom - top), value = lower + n / 4 * (upper - lower); return <g key={n} aria-hidden="true"><path d={`M${left} ${y} H${right}`} stroke="var(--border)" /><text className="axis-label" x={left - 8} y={y + 4} textAnchor="end">{value >= 100000 ? value.toExponential(1) : Number(value.toFixed(2))}</text></g> })}
      {ticks.map((i) => <text key={i} aria-hidden="true" className="axis-label date-tick" x={positions[i].x} y={bottom + 22} textAnchor="end" transform={`rotate(-40 ${positions[i].x} ${bottom + 22})`}>{points[i].date}</text>)}
      {connect && <polyline points={positions.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="var(--chart-0)" strokeWidth="2" />}
      {positions.map(({ point, x, y }) => <circle key={point.id} cx={x} cy={y} r={point.id === selectedId ? 8 : 5.5} fill={`var(--chart-${point.color ?? 0})`} stroke={point.id === selectedId ? 'var(--text)' : 'var(--bg)'} strokeWidth={point.id === selectedId ? 2.5 : 1} role="button" tabIndex={-1} aria-label={point.label} onClick={() => onSelect(point.id)}><title>{point.label}</title></circle>)}
    </svg>
    <label htmlFor={`${id}-points`}>{selectorLabel}</label>
    <select id={`${id}-points`} value={points[selected]?.id} onChange={(event) => onSelect(event.target.value)}>{points.map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {p.label}</option>)}</select>
    <div className="actions chart-actions"><button disabled={selected === 0} onClick={() => step(-1)}>Previous point</button><button disabled={selected === points.length - 1} onClick={() => step(1)}>Next point</button></div>
    <p id={`${id}-selection`} role="status">{points[selected]?.label}</p>
  </figure>
}

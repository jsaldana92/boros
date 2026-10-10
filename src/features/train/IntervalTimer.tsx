import { useEffect, useId, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { intervalDisplay, formatIntervalTime, type IntervalState } from '../../schemas/interval-session'
export function IntervalTimer({ state, disabled, onAction }: { state: IntervalState; disabled: boolean; onAction: (action: 'pause' | 'resume' | 'stop') => void }) {
  const main = useRef<HTMLDivElement>(null), [sticky, setSticky] = useState(false), [open, setOpen] = useState(false)
  const view = intervalDisplay(state), running = state.status === 'running'
  const summaryId = useId()
  useEffect(() => {
    const check = () => {
      if (!main.current) return
      const top = window.visualViewport?.offsetTop ?? 0, box = main.current.getBoundingClientRect()
      const focused = document.activeElement instanceof HTMLElement && document.activeElement.matches('input,textarea,select') ? document.activeElement.getBoundingClientRect() : undefined
      const bottom = top + (window.visualViewport?.height ?? window.innerHeight)
      // A rest timer lives after the circuits; keep its controls reachable when
      // scrolling back up to those results as well as past the timer itself.
      setSticky((box.bottom <= top || box.top >= bottom) && !(focused && focused.top < top + 80))
    }
    check(); window.addEventListener('scroll', check, { passive: true }); window.addEventListener('resize', check); window.visualViewport?.addEventListener('resize', check); document.addEventListener('focusin', check); document.addEventListener('focusout', check)
    return () => { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); window.visualViewport?.removeEventListener('resize', check); document.removeEventListener('focusin', check); document.removeEventListener('focusout', check) }
  }, [])
  const ring = <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" className="timer-track" /><circle cx="60" cy="60" r="54" pathLength="1" className="timer-progress" strokeDasharray={`${view.progress} 1`} transform="rotate(-90 60 60)" /></svg>
  const time = <><strong>{formatIntervalTime(view.remaining)}</strong><small>/ {formatIntervalTime(view.duration)}</small></>
  const controls = <div className="actions interval-timer-actions"><button disabled={disabled} onClick={() => onAction(running ? 'pause' : 'resume')}>{running ? 'Pause' : 'Start'}</button><button disabled={disabled} onClick={() => { onAction('stop'); setOpen(false) }}>Stop</button></div>
  const face = <><div className="timer-circle interval-circle">{ring}<span role="timer" aria-live="off">{time}</span></div><h3>{view.title}</h3>{view.next && <p>Next: {view.next}</p>}{controls}</>
  return <><div ref={main} className="interval-timer-main">{face}</div>{sticky && <div className="interval-sticky" aria-label="Sticky Interval timer"><button className="interval-sticky-main" onClick={() => setOpen(true)} aria-label="Open timer" aria-describedby={summaryId}>{ring}<span className="interval-sticky-time"><strong>{formatIntervalTime(view.remaining)}</strong><small>/ {formatIntervalTime(view.scopeTotal)}</small></span><span id={summaryId} className="interval-sticky-title" title={view.title}>{view.title}</span></button><button className="interval-play" disabled={disabled} aria-label={running ? 'Pause timer' : 'Resume timer'} onClick={() => onAction(running ? 'pause' : 'resume')}>{running ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button></div>}{open && <ActionDialog title="Timer" className="interval-timer-dialog" onClose={() => setOpen(false)} actions={<button onClick={() => setOpen(false)}>Close</button>}>{face}</ActionDialog>}</>
}

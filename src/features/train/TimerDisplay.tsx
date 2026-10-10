import { trainingRuntime } from './training-runtime'
import { useEffect, useState } from 'react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { preparationRemaining, timerElapsed, timerRemaining, type RestTimer } from '../../schemas/session'
import type { TimerFeedback } from './timer-feedback'

export function TimerDisplay({ timer, disabled, onAction, feedback, sound }: { timer: RestTimer; disabled: boolean; onAction: (action: 'stop' | 'reset' | 'pause' | 'resume') => void; feedback: TimerFeedback; sound: boolean }) {
  const [, tick] = useState(0), [open, setOpen] = useState(() => trainingRuntime().takeTimerPopup())
  useEffect(() => { const update = () => tick(value => value + 1); const interval = setInterval(update, 250); document.addEventListener('visibilitychange', update); return () => { clearInterval(interval); document.removeEventListener('visibilitychange', update) } }, [])
  const preparation = preparationRemaining(timer), countup = timer.mode === 'countup', left = preparation || (countup ? timerElapsed(timer) : timerRemaining(timer))
  const fraction = preparation ? 1 - preparation / 5 : timer.mode === 'countup' ? undefined : Math.max(0, Math.min(1, 1 - left / timer.durationSeconds))
  const time = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
  const ring = <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" className="timer-track" />{fraction !== undefined && <circle cx="60" cy="60" r="54" pathLength="1" className="timer-progress" strokeDasharray={`${fraction} 1`} transform="rotate(-90 60 60)" />}</svg>
  const legacy = timer.position ? null : timer.label.match(/^(.*): (?:after (?:set|round) (\d+)|(between exercises|after group))$/)
  const label = legacy?.[1] ?? timer.label, position = timer.position ?? (legacy ? legacy[2] ? `Set ${legacy[2]}` : 'Post-Exercise' : undefined)
  return <section className="rest-timer" aria-label="Rest timer"><button className="timer-compact" onClick={() => setOpen(true)} aria-label={countup || left ? `Rest ${time}` : 'Rest finished'}>{countup || left ? <>{ring}<span>{time}</span></> : 'Rest finished'}</button>{open && <ActionDialog title="Rest Timer" className="rest-timer-dialog" onClose={() => setOpen(false)} actions={<div className="timer-actions"><button disabled={disabled || !countup && !preparation && !left} onClick={() => { feedback.cancel(); onAction(timer.pausedAt ? 'resume' : 'pause') }}>{timer.pausedAt ? 'Start' : 'Pause'}</button><button disabled={disabled} onClick={() => { feedback.cancel(); onAction('stop') }}>Stop</button><button className="timer-reset" disabled={disabled} onClick={() => { feedback.cancel(); if (!countup) feedback.unlock(sound); onAction('reset') }}>Reset</button><button className="timer-close" onClick={() => setOpen(false)}>Close</button></div>}>
    <p>{label}</p>{!!preparation && <p>Get ready</p>}{position && <p>{position}</p>}<div className="timer-circle">{ring}<span role="timer" aria-live="off">{countup || left ? time : 'Rest finished'}</span></div>
  </ActionDialog>}</section>
}

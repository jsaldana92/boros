import { useEffect, useRef, useState } from 'react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { sessions } from '../../db/sessions'
import { timerRemaining, type RestTimer } from '../../schemas/session'
import type { TimerFeedback } from './timer-feedback'
import { restLabel } from '../../lib/rest-duration'

export function TimerDisplay({ timer, disabled, onAction, feedback, sound }: { timer: RestTimer; disabled: boolean; onAction: (action: 'stop' | 'reset') => void; feedback: TimerFeedback; sound: boolean }) {
  const [, tick] = useState(0), [open, setOpen] = useState(true), observedRunning = useRef(timerRemaining(timer) > 0)
  useEffect(() => { const update = () => tick((value) => value + 1); const interval = setInterval(update, 250); document.addEventListener('visibilitychange', update); return () => { clearInterval(interval); document.removeEventListener('visibilitychange', update); feedback.cancel() } }, [feedback])
  const left = timerRemaining(timer), fraction = Math.min(1, left / timer.durationSeconds)
  useEffect(() => {
    if (left === 0 && observedRunning.current) { observedRunning.current = false; void feedback.complete(timer.token, sound, () => sessions.claimTimer(timer.profileId, timer.draftId, timer.token)) }
  }, [left, timer.token, timer.profileId, timer.draftId, feedback, sound])
  return <section className="rest-timer" aria-label="Rest timer"><button onClick={() => setOpen(true)}>{left ? `Rest: ${restLabel(left)}` : 'Rest finished'}</button>{open && <ActionDialog title="Rest timer" onClose={() => setOpen(false)}>
    <p>{timer.label}</p><div className="timer-circle"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" className="timer-track" /><circle cx="60" cy="60" r="54" pathLength="1" className="timer-progress" strokeDasharray={`${fraction} 1`} transform="rotate(-90 60 60)" /></svg><span role="timer" aria-live="off">{left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Rest finished'}</span></div>
    <div className="actions"><button disabled={disabled} onClick={() => { feedback.cancel(); onAction('stop') }}>Stop</button><button disabled={disabled} onClick={() => { feedback.unlock(sound); onAction('reset') }}>Reset</button></div>
  </ActionDialog>}</section>
}

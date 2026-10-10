import { DraftController } from './draft-controller.ts'
import { IntervalController } from './interval-controller.ts'
import { TimerFeedback } from './timer-feedback.ts'
import { IntervalFeedback } from './interval-feedback.ts'
import { alertAudio } from './audio-runtime.ts'
import { TimerWakeLock } from './wake-lock.ts'
import { sessions } from '../../db/sessions.ts'
import type { RestTimer, SessionDraft } from '../../schemas/session.ts'

class TrainingRuntime {
  private strength?: DraftController
  private interval?: IntervalController
  private owner?: string
  private timer?: RestTimer
  private soundedToken?: string
  private openTimer = false
  private sound = false
  private visible = true
  private lastTick = Date.now()
  private wake = new TimerWakeLock(typeof navigator !== 'undefined' && navigator.wakeLock ? () => navigator.wakeLock.request('screen') : undefined)
  readonly feedback = new TimerFeedback(() => alertAudio('rest-complete.mp3'), ms => navigator.vibrate?.(ms), message => { this.error = message; this.emit() })
  error = ''
  private listeners = new Set<() => void>()
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit() { this.listeners.forEach(fn => fn()) }
  constructor() {
    window.setInterval(() => this.tick(), 250)
    document.addEventListener('visibilitychange', () => {
      this.visible = document.visibilityState === 'visible'; this.lastTick = 0
      this.feedback.cancel(); this.interval?.visibilityChanged()
      if (!this.visible) this.interval?.tick(false, false)
      void this.wake.update(false, this.visible)
    })
  }
  sync(owner: string | undefined, timer: RestTimer | undefined, sound: boolean) {
    if (this.owner && this.owner !== owner) { this.feedback.cancel(); this.interval?.retire(); this.strength?.retire(); this.soundedToken = undefined }
    this.owner = owner; this.timer = timer
    if (!sound && this.sound) { this.feedback.cancel(); this.interval?.feedback.cancel() }
    this.sound = sound
    this.interval?.setEnvironment(sound, this.visible)
  }
  strengthFor(initial: SessionDraft) {
    if (this.strength?.record.id !== initial.id || this.strength.record.profileId !== initial.profileId) this.strength = new DraftController(initial)
    return this.strength
  }
  intervalFor(initial: SessionDraft) {
    if (this.interval?.record.id !== initial.id || this.interval.record.profileId !== initial.profileId) {
      this.interval?.dispose()
      this.interval = new IntervalController(initial, new IntervalFeedback({ start: alertAudio('circuit-start.mp3'), warning: alertAudio('circuit-5s-warning.mp3'), end: alertAudio('circuit-end.mp3'), complete: alertAudio('rest-complete.mp3') }, window.speechSynthesis))
      this.interval.setEnvironment(this.sound, this.visible)
      void this.interval.recover()
    }
    return this.interval
  }
  setSound(sound: boolean) { this.sound = sound; this.interval?.setEnvironment(sound, this.visible); this.feedback.cancel(); this.interval?.feedback.cancel(); if (sound) { this.feedback.unlock(true); this.interval?.feedback.unlock(true) } }
  unlock(sound: boolean) { this.error = ''; this.feedback.unlock(sound); this.emit() }
  requestTimerPopup() { this.openTimer = true }
  ownTimer(timer?: RestTimer) { this.timer = timer; this.soundedToken = timer?.token }
  takeTimerPopup() { const open = this.openTimer; this.openTimer = false; return open }
  private tick() {
    const now = Date.now(), fresh = this.visible && now - this.lastTick <= 1500; this.lastTick = now
    this.interval?.tick(this.sound, this.visible)
    const timer = this.timer
    if (timer && !timer.pausedAt && timer.mode !== 'countup' && !timer.alertedAt && Date.parse(timer.endAt) <= now && (this.soundedToken === timer.token || now - Date.parse(timer.endAt) >= 1500)) {
      // A restored/observer/overdue token is consumed without replaying old cues.
      const audible = fresh && now - Date.parse(timer.endAt) < 1500 && this.soundedToken === timer.token
      void this.feedback.complete(timer.token, this.sound && audible, () => sessions.claimTimer(timer.profileId, timer.draftId, timer.token), audible)
    }
    const running = !!(timer && timer.token === this.soundedToken && !timer.pausedAt && (timer.mode === 'countup' || Date.parse(timer.endAt) > now)) || !!(this.interval?.ready && !this.interval.error && this.interval.record.interval?.status === 'running')
    void this.wake.update(running, this.visible)
  }
}
let instance: TrainingRuntime | undefined
export const trainingRuntime = () => instance ??= new TrainingRuntime()

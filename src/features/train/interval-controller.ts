import { sessions, type sessionService } from '../../db/sessions.ts'
import type { SessionDraft } from '../../schemas/session.ts'
import { IntervalFeedback } from './interval-feedback.ts'

// One controller per stable draft in this document. No screen/popup owns the
// checkpoint queue, media controller, recovery, or execution lifetime.
export class IntervalController {
  record: SessionDraft
  notes: string
  ready = false
  error = ''
  busy = false
  retired = false
  private pending?: Promise<boolean>
  private recovery?: Promise<boolean>
  private disposed = false
  private mute = false
  private suppress = false
  private sound = false
  private visible = true
  private listeners = new Set<() => void>()
  readonly feedback: IntervalFeedback
  private service: ReturnType<typeof sessionService>
  constructor(initial: SessionDraft, feedback: IntervalFeedback, service: ReturnType<typeof sessionService> = sessions) { this.record = initial; this.notes = initial.input.notes; this.feedback = feedback; this.service = service }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit() { this.listeners.forEach(fn => fn()) }
  setError(message: string) { this.error = message; this.emit() }
  setReady(value: boolean) { this.ready = value; this.emit() }
  setNotes(value: string) { this.notes = value; this.emit() }
  setEnvironment(sound: boolean, visible: boolean) { this.sound = sound; this.visible = visible }
  apply(next: SessionDraft) {
    this.record = next
    // Deliver a committed boundary immediately. Waiting for the next poll can
    // make a cue stale behind a busy IndexedDB/UI task even in the foreground.
    if (next.interval) this.feedback.update(next.interval, this.sound && !this.error && !this.mute && !this.suppress, Date.now(), this.visible)
    this.emit()
  }
  work(callback: () => Promise<void>, background = false, clearError = true): Promise<boolean> {
    // Foreground actions reserve the queue with busy before notifying listeners.
    // A reentrant timer poll must not slip in before pending is assigned.
    if (this.disposed || this.busy || background && this.pending) return Promise.resolve(false)
    const previous = this.pending
    if (!background) { this.busy = true; if (clearError) this.error = ''; this.emit() }
    const task = (async () => {
      if (previous && !await previous) return false
      if (this.disposed) return false
      try { await callback(); return true }
      catch (error) { this.feedback.cancel(); this.error = (error as Error).message; return false }
    })()
    this.pending = task
    void task.finally(() => { if (this.pending === task) this.pending = undefined; if (!background) this.busy = false; this.emit() })
    return task
  }
  async command(action: 'resume' | 'pause' | 'recover' | 'skip' | 'tick' | 'stop', recoverOwnership = false) {
    if (action !== 'tick') { this.mute = true; this.feedback.cancel() }
    const ok = await this.work(async () => { const c = this.record; this.apply(await this.service.intervalAction(c.profileId, c.id, c.revision, action, this.notes, recoverOwnership)) }, action === 'tick')
    if (action !== 'tick') this.mute = false
    return ok
  }
  recover() { return this.recovery ??= this.command('recover').then(ok => { this.ready = ok; this.emit(); return ok }) }
  async reload() {
    const ok = await this.work(async () => this.apply(await this.service.getDraft(this.record.profileId, this.record.id)))
    if (ok) { this.feedback.reset(); this.ready = await this.command('recover', true); this.emit() }
  }
  async settle() { return this.retired || !this.pending || await this.pending }
  visibilityChanged() { this.suppress = true; this.feedback.cancel(); if (this.record.interval) this.feedback.update(this.record.interval, false, Date.now(), false) }
  tick(sound: boolean, visible: boolean) {
    if (this.disposed) return
    this.sound = sound; this.visible = visible
    if (this.ready && !this.error && this.record.interval?.status === 'running') void this.command('tick').then(ok => {
      if (ok && this.suppress && this.record.interval) { this.feedback.update(this.record.interval, false, Date.now(), visible); this.suppress = false }
    })
    if (this.record.interval) this.feedback.update(this.record.interval, sound && !this.error && !this.mute && !this.suppress, Date.now(), visible)
  }
  dispose() { this.disposed = true; this.feedback.cancel(); this.emit() }
  retire() { this.retired = true; this.error = 'This workout was saved or removed in another tab. Your input is kept.'; this.dispose() }
}

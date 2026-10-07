import { appendSessionExercises, appendSessionSets, type SessionSnapshot } from '../../schemas/session-structure.ts'
import type { PrescriptionChoice } from '../../db/plans.ts'
import type { WeightUnit } from '../../schemas/profile.ts'
import { sessions, type sessionService } from '../../db/sessions.ts'
import type { SessionDraft, SessionInput } from '../../schemas/session.ts'

// Owns a single immutable profile/draft identity. All writes run in order.
export class DraftController {
  record: SessionDraft
  snapshot: SessionSnapshot
  input: SessionInput
  status: 'saved' | 'pending' | 'saving' | 'failed' = 'saved'
  error = ''
  busy = false
  discarded = false
  private service: ReturnType<typeof sessionService>
  private listeners = new Set<() => void>()
  private tail: Promise<unknown> = Promise.resolve()
  private timeout?: ReturnType<typeof setTimeout>
  private sequence = 0
  private persisted = 0
  private disposed = false
  constructor(record: SessionDraft, service = sessions) { this.record = record; this.snapshot = { day: structuredClone(record.day), structure: structuredClone(record.structure) }; this.input = structuredClone(record.input); this.service = service }
  activate() { this.disposed = false; if (this.status === 'pending') this.schedule() }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit() { this.listeners.forEach((listener) => listener()) }
  private schedule() { clearTimeout(this.timeout); this.timeout = setTimeout(() => { void this.flush().catch(() => {}) }, 400) }
  change(input: SessionInput) {
    if (this.busy || this.disposed || this.record.finalizedAt) return
    this.input = input; this.sequence++; this.status = 'pending'; this.error = ''; this.emit(); this.schedule()
  }
  private enqueue<T>(work: () => Promise<T>) {
    const task = this.tail.catch(() => {}).then(work); this.tail = task; return task
  }
  flush() {
    clearTimeout(this.timeout)
    return this.enqueue(() => this.persist())
  }
  private async persist() {
    if (this.disposed || this.record.finalizedAt) return this.record
    if (this.persisted === this.sequence) { this.status = 'saved'; this.error = ''; this.emit(); return this.record }
    const sequence = this.sequence, input = structuredClone(this.input), snapshot = structuredClone(this.snapshot)
    this.status = 'saving'; this.emit()
    try {
      this.record = await this.service.update(this.record.profileId, this.record.id, this.record.revision, input, snapshot)
      this.persisted = sequence; this.status = sequence === this.sequence ? 'saved' : 'pending'; this.error = ''
      if (sequence !== this.sequence && !this.busy && !this.disposed) this.schedule()
      return this.record
    } catch (error) { this.status = 'failed'; this.error = (error as Error).message; throw error }
    finally { this.emit() }
  }
  private command<T>(work: () => Promise<T>) {
    if (this.busy || this.disposed) return Promise.reject(new Error('A session action is already in progress.'))
    this.busy = true; clearTimeout(this.timeout); this.emit()
    return this.enqueue(async () => {
      try { const result = await work(); this.error = ''; return result }
      catch (error) { this.error = (error as Error).message; this.status = 'failed'; throw error }
      finally { this.busy = false; if (this.persisted !== this.sequence && this.status === 'pending' && !this.disposed) this.schedule(); this.emit() }
    })
  }
  addSets(blockId: string, unit: WeightUnit) {
    if (this.busy || this.disposed || this.record.finalizedAt) return
    const amended = appendSessionSets(this.snapshot, this.input, blockId, unit)
    this.snapshot = { day: amended.day, structure: amended.structure }; this.change(amended.input)
  }
  addExercises(choices: PrescriptionChoice[], unit: WeightUnit) {
    if (this.busy || this.disposed || this.record.finalizedAt) return
    const amended = appendSessionExercises(this.snapshot, this.input, choices, unit)
    this.snapshot = { day: amended.day, structure: amended.structure }; this.change(amended.input)
  }
  replaceExercise(occurrenceId: string, exerciseId: string, revision: number) {
    return this.command(async () => {
      await this.persist()
      this.record = await this.service.replaceExercise(this.record.profileId, this.record.id, this.record.revision, occurrenceId, exerciseId, revision)
      this.snapshot = { day: structuredClone(this.record.day), structure: structuredClone(this.record.structure) }
      this.input = structuredClone(this.record.input); this.sequence++; this.persisted = this.sequence; this.status = 'saved'; return this.record
    })
  }
  clear() {
    return this.command(async () => {
      await this.persist()
      this.record = await this.service.clear(this.record.profileId, this.record.id, this.record.revision)
      this.input = structuredClone(this.record.input); this.sequence++; this.persisted = this.sequence; this.status = 'saved'; return this.record
    })
  }
  prepareSettings() {
    // Lock input synchronously until the flush resolves. A later keystroke must
    // not become pending between the captured write and the route unmount.
    return this.command(() => this.persist())
  }
  discard() {
    // Wait behind a running write, cancel debounce/queued future writes, then
    // delete by the latest committed revision. Failure keeps recoverable input.
    return this.command(async () => {
      await this.service.discard(this.record.profileId, this.record.id, this.record.revision)
      this.disposed = true; this.discarded = true; clearTimeout(this.timeout); this.persisted = this.sequence; this.status = 'saved'
    })
  }
  complete(allowPartial: boolean, library?: { name: string }) {
    const completedAt = new Date().toISOString()
    return this.command(async () => {
      await this.persist()
      const result = await this.service.complete(this.record.profileId, this.record.id, this.record.revision, this.input, allowPartial, completedAt, library)
      this.record = { ...this.record, finalizedAt: result.completedAt }; this.persisted = this.sequence; this.status = 'saved'; return result
    })
  }
  reload() {
    return this.command(async () => {
      this.record = await this.service.getDraft(this.record.profileId, this.record.id)
      this.snapshot = { day: structuredClone(this.record.day), structure: structuredClone(this.record.structure) }
      this.input = structuredClone(this.record.input); this.sequence++; this.persisted = this.sequence; this.status = 'saved'; return this.record
    })
  }
  startTimer(exerciseId: string, setIndex: number, seconds?: number) {
    return this.command(async () => { await this.persist(); return this.service.startTimer(this.record.profileId, this.record.id, this.record.revision, exerciseId, setIndex, seconds) })
  }
  startGroupTimer(groupId: string, round: number, seconds?: number) {
    return this.command(async () => { await this.persist(); return this.service.startGroupTimer(this.record.profileId, this.record.id, this.record.revision, groupId, round, seconds) })
  }
  changeTimer(token: string, action: 'stop' | 'reset') {
    return this.command(() => this.service.changeTimer(this.record.profileId, this.record.id, token, action))
  }
  dispose() { this.disposed = true; clearTimeout(this.timeout); this.listeners.clear() }
}

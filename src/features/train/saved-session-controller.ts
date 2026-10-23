import { savedSessions, type savedSessionService, type SavedSessionEdit, type SessionReplacement } from '../../db/saved-sessions.ts'
import { blankSession, type SessionDraft, type SessionInput } from '../../schemas/session.ts'
import { appendSessionExercises, appendSessionSets, type SessionSnapshot } from '../../schemas/session-structure.ts'
import type { PrescriptionChoice } from '../../db/plans.ts'
import type { WeightUnit } from '../../schemas/profile.ts'

// Memory-only editing, never registered in the live training runtime. Only Save
// writes completed results; Cancel/Clear cannot overwrite or create a workout.
export class SavedSessionController {
  record: SessionDraft
  snapshot: SessionSnapshot
  input: SessionInput
  status: 'saved' | 'failed' = 'saved'
  error = ''
  busy = false
  retired = false
  discarded = false
  timerToken?: string
  private edit: SavedSessionEdit
  private service: ReturnType<typeof savedSessionService>
  private replacements: SessionReplacement[] = []
  private listeners = new Set<() => void>()
  constructor(edit: SavedSessionEdit, service = savedSessions) {
    this.edit = structuredClone(edit); this.record = structuredClone(edit.draft); this.input = structuredClone(edit.draft.input)
    this.snapshot = { day: structuredClone(edit.session.day), structure: structuredClone(edit.session.structure) }; this.service = service; this.timerToken = edit.timerToken
  }
  get dirty() { return JSON.stringify(this.input) !== JSON.stringify(this.edit.draft.input) || JSON.stringify(this.snapshot) !== JSON.stringify({day:this.edit.session.day,structure:this.edit.session.structure}) }
  activate() {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit() { this.listeners.forEach(listener => listener()) }
  change(input: SessionInput) { if (this.busy || this.discarded) return; this.input = input; this.error = ''; this.status = 'saved'; this.emit() }
  private async command<T>(work: () => Promise<T>) {
    if (this.busy || this.discarded) throw new Error('A session action is already in progress.')
    this.busy = true; this.emit()
    try { const result = await work(); this.error = ''; this.status = 'saved'; return result }
    catch (e) { this.error = (e as Error).message; this.status = 'failed'; throw e }
    finally { this.busy = false; this.emit() }
  }
  addSets(blockId: string, unit: WeightUnit) { if (this.busy) return; const next = appendSessionSets(this.snapshot, this.input, blockId, unit); this.snapshot = {day:next.day,structure:next.structure}; this.change(next.input) }
  addExercises(choices: PrescriptionChoice[], unit: WeightUnit) { if (this.busy) return; const next = appendSessionExercises(this.snapshot, this.input, choices, unit); this.snapshot = {day:next.day,structure:next.structure}; this.change(next.input) }
  replaceExercise(occurrenceId: string, exerciseId: string, revision: number) { return this.command(async () => {
    const request = {occurrenceId,exerciseId,revision}, next = await this.service.replace(this.record.profileId,{...this.snapshot,input:this.input},request,this.input.exercises[0]?.sets[0]?.unit ?? 'kg')
    this.snapshot = {day:next.day,structure:next.structure}; this.input = next.input; this.replacements = [...this.replacements.filter(r=>r.occurrenceId!==occurrenceId),request]
  }) }
  clear() { return this.command(async () => {
    await this.service.stopTimer(this.record.profileId,this.record.id,this.timerToken); this.timerToken = undefined
    this.input = blankSession(this.snapshot.day,this.input.exercises[0]?.sets[0]?.unit ?? 'kg')
    this.input.noteEdited = true; this.input.exercises.forEach(e=>{ e.noteEdited = true })
  }) }
  discard() { return this.command(async () => { await this.service.stopTimer(this.record.profileId,this.record.id,this.timerToken); this.timerToken = undefined; this.discarded = true }) }
  complete(allowPartial: boolean, _library?: {name:string;confirmedSimilar?:string}) { return this.command(async () => {
    const result = await this.service.save(this.edit,this.snapshot,this.input,this.replacements,allowPartial,this.timerToken)
    this.timerToken = undefined; this.record.finalizedAt = result.completedAt; return result
  }) }
  flush() { return Promise.resolve(this.record) }
  prepareSettings() { return Promise.resolve(this.record) }
  reload() { return this.command(async () => {
    const latest = await this.service.load(this.record.profileId,this.record.id)
    this.edit = structuredClone(latest); this.record = latest.draft; this.input = structuredClone(latest.draft.input); this.snapshot = {day:structuredClone(latest.session.day),structure:structuredClone(latest.session.structure)}; this.replacements = []; this.timerToken = latest.timerToken
    return this.record
  }) }
  timer() { return this.service.timer(this.record.profileId,this.record.id,this.timerToken) }
  startTimer(blockId: string, index: number, seconds?: number) { return this.startRest(blockId,index,false,seconds) }
  startGroupTimer(blockId: string, index: number, seconds?: number) { return this.startRest(blockId,index,true,seconds) }
  private startRest(block: string, index: number, group: boolean, seconds?: number) { return this.command(async () => { const timer = await this.service.startTimer(this.edit,this.snapshot,block,index,group,seconds); this.timerToken=timer?.token; return timer }) }
  changeTimer(token: string, action: 'stop' | 'reset' | 'pause' | 'resume') { return this.command(async () => { const timer = await this.service.changeTimer(this.record.profileId,this.record.id,token,action); this.timerToken=timer?.token }) }
}

import { isRepeatCircuit } from './circuit.ts'
import { intervalPhases as v2Phases } from './interval-session-v2.ts'
import { z } from 'zod'
import type { TrainingDay } from './plan.ts'
import * as legacy from './interval-legacy.ts'

const identity = (p: { kind: string; circuitId: string; set?: number; round?: number; repetition?: number; exerciseId?: string }) => p.repetition !== undefined && !['preparation', 'workout-rest'].includes(p.kind) ? `${p.circuitId}:repeat:${p.repetition}:${p.exerciseId ? p.exerciseId + ':' : ''}${p.kind}` : p.kind === 'active' || p.kind === 'recovery' ? `${p.circuitId}:${p.set}:${p.round}:${p.exerciseId}:${p.kind}` : p.kind === 'set-rest' ? `${p.circuitId}:${p.set}:set-rest` : `${p.circuitId}:${p.kind}`
export const intervalPhaseSchema = legacy.intervalPhaseSchema.innerType().extend({ kind: z.enum(['preparation', 'active', 'recovery', 'set-rest', 'circuit-rest', 'workout-rest']), set: z.number().int().positive().optional(), round: z.number().int().positive().optional(), repetition: z.number().int().min(0).max(10).optional() }).strict().superRefine((p, ctx) => {
  if (p.repetition !== undefined ? p.set !== undefined || p.round !== undefined || p.kind === 'set-rest' : !p.set || !p.round) ctx.addIssue({ code: 'custom', message: 'Use a repetition identity or the original legacy indexes.' })
  const activity = p.kind === 'active' || p.kind === 'recovery'
  if (activity !== !!p.exerciseId || activity !== !!p.exerciseName || !activity && p.templateId || p.kind === 'active' && !p.durationSeconds || p.id !== identity(p) || p.kind === 'preparation' && ![5, 10].includes(p.durationSeconds)) ctx.addIssue({ code: 'custom', message: 'Invalid phase identity or duration.' })
})
export const intervalResultSchema = legacy.intervalResultSchema.innerType().extend({ phase: intervalPhaseSchema }).strict().refine(r => r.phase.kind !== 'preparation' && r.elapsedMs <= r.phase.durationSeconds * 1000 && (r.status !== 'completed' || r.elapsedMs === r.phase.durationSeconds * 1000) && (r.status !== 'skipped' || r.elapsedMs === 0), 'Recorded time must agree with its phase.')
export const cueSchema = z.object({ key: z.string(), kind: z.enum(['start', 'warning', 'end', 'rest', 'complete']), phaseId: z.string(), at: z.string().datetime() }).strict()
const executionSchema = z.object({ id: z.string().uuid(), mode: z.enum(['circuit', 'continuous', 'rest']), circuitId: z.string().uuid().optional(), phaseIds: z.array(z.string()).min(1).max(40001), owner: z.string().uuid().optional(), cues: z.array(cueSchema).max(80002) }).strict()
const spokenRest = (p?: IntervalPhase) => !!p && p.durationSeconds > 0 && ['recovery', 'set-rest', 'circuit-rest', 'workout-rest'].includes(p.kind)
export const intervalStateSchema = legacy.intervalStateSchema.innerType().extend({
  engineVersion: z.union([z.literal(2), z.literal(3)]).optional(), mode: z.enum(['circuit', 'continuous']).optional(), execution: executionSchema.optional(),
  phases: z.array(intervalPhaseSchema).max(40001), results: z.array(intervalResultSchema).max(40000), status: z.enum(['ready', 'running', 'paused', 'stopped', 'finished']),
}).strict().superRefine((s, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (!s.engineVersion) { const parsed = legacy.intervalStateSchema.safeParse(s); if (!parsed.success) parsed.error.issues.forEach(i => ctx.addIssue(i)); return }
  const ids = s.phases.map(p => p.id), done = s.results.map(r => r.phase.id), phase = s.phases.find(p => p.id === s.phaseId)
  if (new Set(ids).size !== ids.length || new Set(done).size !== done.length) fail('Phase identities must be unique.')
  if ((s.status === 'running') !== !!s.anchorAt || (s.status === 'running' || s.status === 'paused') && (!s.execution || !phase) || s.phaseId && !phase || s.elapsedMs > (phase?.durationSeconds ?? 0) * 1000) fail('Invalid execution position.')
  if (s.phases.filter(p => p.kind === 'preparation').length > 1) fail('Use one preparation phase.')
  if (s.execution) {
    const e = s.execution
    if (s.phases.filter(p => e.phaseIds.includes(p.id)).map(p => p.id).join() !== e.phaseIds.join()) fail('Execution phases must retain prescription order.')
    if ((s.status === 'running' || s.status === 'paused') && e.mode !== 'rest' && (s.mode !== e.mode || s.results.some(r => r.phase.id === s.phaseId))) fail('The active execution must agree with its mode and pending position.')
    if (new Set(e.phaseIds).size !== e.phaseIds.length || e.phaseIds.some(id => !ids.includes(id)) || s.phaseId && !e.phaseIds.includes(s.phaseId) || (e.mode === 'circuit') !== !!e.circuitId || e.mode === 'circuit' && e.phaseIds.some(id => { const p = s.phases.find(p => p.id === id)!; return p.kind !== 'preparation' && (p.circuitId !== e.circuitId || p.kind === 'workout-rest') })) fail('Invalid execution scope.')
    if (e.mode === 'rest' && (![1, 2].includes(e.phaseIds.length) || e.phaseIds.length === 2 && s.phases.find(p => p.id === e.phaseIds[0])?.kind !== 'preparation' || s.phases.find(p => p.id === e.phaseIds.at(-1))?.kind !== 'workout-rest' || !s.phases.find(p => p.id === e.phaseIds.at(-1))?.durationSeconds)) fail('Independent rest must contain preparation and a positive workout rest only.')
    if (new Set(e.cues.map(c => c.key)).size !== e.cues.length || e.cues.some(c => !e.phaseIds.includes(c.phaseId) || c.key !== `${e.id}:${c.phaseId}:${c.kind}` || (c.kind === 'rest' ? !spokenRest(s.phases.find(p => p.id === c.phaseId)) : c.kind === 'complete' ? s.phases.find(p => p.id === c.phaseId)?.kind !== 'workout-rest' : s.phases.find(p => p.id === c.phaseId)?.kind !== 'active'))) fail('Invalid cue ledger.')
  }
  if (s.results.some(r => !ids.includes(r.phase.id) || JSON.stringify(r.phase) !== JSON.stringify(s.phases.find(p => p.id === r.phase.id)))) fail('Recorded phase snapshot does not match.')
})
export type IntervalState = z.infer<typeof intervalStateSchema>
export type IntervalPhase = z.infer<typeof intervalPhaseSchema>
export type IntervalResult = z.infer<typeof intervalResultSchema>
export type IntervalCue = z.infer<typeof cueSchema>
export type ExecutionMode = 'circuit' | 'continuous' | 'rest'
export function intervalPhases(day: TrainingDay): IntervalPhase[] {
  if (day.trainingType !== 'interval') throw new Error('Choose an Interval workout.')
  const phases: IntervalPhase[] = []
  for (const circuit of day.circuits ?? []) {
    if (!isRepeatCircuit(circuit)) {
      // Retain old phase identities/rest placement in started snapshots, including
      // when a pending edit appends a newly modeled circuit.
      phases.push(...v2Phases({ ...day, circuits: [circuit], postWorkoutRestSeconds: 0 } as import('./plan-v9.ts').TrainingDay))
      continue
    }
    for (let repetition = 0; repetition <= circuit.repeat; repetition++) {
      const base = { circuitId: circuit.id, circuitName: circuit.name, repetition }
      for (const id of circuit.exerciseIds) {
        const exercise = day.exercises.find(e => e.id === id)
        if (!exercise || exercise.prescription.trainingType !== 'interval') throw new Error('The circuit has an incompatible or missing exercise.')
        for (const kind of ['active', 'recovery'] as const) {
          const value = { ...base, kind, exerciseId: id, exerciseName: exercise.prescription.name, templateId: exercise.templateId ?? (exercise.source?.kind === 'exercise' ? exercise.source.id : exercise.source?.libraryId), durationSeconds: kind === 'active' ? exercise.prescription.activeSeconds : exercise.prescription.recoverySeconds }
          phases.push({ ...value, id: identity(value) })
        }
      }
      const rest = { ...base, kind: 'circuit-rest' as const, durationSeconds: circuit.restAfterCircuitSeconds }
      phases.push({ ...rest, id: identity(rest) })
    }
  }
  if (day.postWorkoutRestSeconds) phases.push({ id: `${day.id}:workout-rest`, kind: 'workout-rest', circuitId: day.id, circuitName: day.name, ...(day.circuits?.some(c => !isRepeatCircuit(c)) ? { set: 1, round: 1 } : { repetition: 0 }), durationSeconds: day.postWorkoutRestSeconds })
  return phases
}
const preparation = (day: TrainingDay): IntervalPhase => ({ id: `${day.id}:preparation`, kind: 'preparation', circuitId: day.id, circuitName: day.name, repetition: 0, durationSeconds: 10 })
export function initialInterval(day: TrainingDay): IntervalState {
  return { engineVersion: day.circuits?.some(c => !isRepeatCircuit(c)) ? 2 : 3, mode: 'circuit', phases: [preparation(day), ...intervalPhases(day)], status: 'ready', elapsedMs: 0, results: [] }
}
export const executionActive = (s?: IntervalState) => !!s && (s.status === 'running' || s.status === 'paused')
export function upgradeInterval(s: IntervalState, day: TrainingDay): IntervalState {
  if (s.engineVersion) return structuredClone(s)
  const state: IntervalState = { ...structuredClone(s), engineVersion: 2, mode: 'circuit', phases: [preparation(day), ...s.phases, ...intervalPhases(day).filter(p => !s.phases.some(old => old.id === p.id))] }
  // Preserve old performed snapshots and cursor; an old whole-workout execution
  // remains that scope until explicitly stopped, without adding preparation.
  if (s.status === 'running' || s.status === 'paused') {
    const mode = (day.circuits?.length ?? 0) > 1 ? 'continuous' : 'circuit'
    state.execution = { id: day.id, mode, ...(mode === 'circuit' ? { circuitId: day.circuits![0].id } : {}), phaseIds: s.phases.map(p => p.id), cues: [] }; state.mode = mode
  } else { state.phaseId = undefined; state.status = s.status === 'ready' ? 'ready' : 'finished' }
  return state
}
export function scopeHasProgress(s: IntervalState, mode: ExecutionMode, circuitId?: string) {
  if (mode === 'rest') return false
  return s.results.some(r => mode === 'continuous' || r.phase.circuitId === circuitId) || !!s.elapsedMs && (mode === 'continuous' || s.phases.find(p => p.id === s.phaseId)?.circuitId === circuitId)
}
export function startInterval(input: IntervalState, day: TrainingDay, mode: ExecutionMode, circuitId: string | undefined, id: string, owner: string, restart = false, now = Date.now()): IntervalState {
  if (executionActive(input)) throw new Error('Stop the current timer first.')
  if (mode === 'continuous' && (day.circuits?.length ?? 0) < 2) throw new Error('Start the circuit individually.')
  if (mode === 'circuit' && !day.circuits?.some(c => c.id === circuitId)) throw new Error('Choose a circuit.')
  if (mode === 'rest' && !day.postWorkoutRestSeconds) throw new Error('No post-workout rest is configured.')
  if (!restart && scopeHasProgress(input, mode, circuitId)) throw new Error('Confirm restarting this timer.')
  const state = upgradeInterval(input, day), fresh = [preparation(day), ...intervalPhases(day)]
  if (mode === 'rest') {
    // Rest has its own execution/checkpoint, never exercise actuals. Keep every
    // prior result and prescription (including a continuous rest result) intact.
    state.phases = [...state.phases.filter(p => p.kind === 'preparation'), ...state.phases.filter(p => p.kind !== 'preparation')]
    const phases = state.phases.filter(p => p.kind === 'workout-rest')
    state.execution = { id, mode, phaseIds: phases.map(p => p.id), owner, cues: [] }
    cue(state, 'rest', phases[0], now)
    state.phaseId = phases[0].id; state.status = 'running'; state.elapsedMs = 0; state.anchorAt = new Date(now).toISOString(); state.phaseStartedAt = state.anchorAt
    return state
  }
  const affected = (p: IntervalPhase) => mode === 'continuous' || p.kind === 'preparation' || p.circuitId === circuitId
  state.phases = [...state.phases.filter(p => !affected(p)), ...fresh.filter(affected)]
  const phases = fresh.filter(p => affected(p) && p.durationSeconds > 0)
  if (!phases.some(p => p.kind === 'active')) throw new Error('Add an exercise before starting.')
  state.results = state.results.filter(r => !affected(r.phase))
  state.mode = mode; state.execution = { id, mode, ...(mode === 'circuit' ? { circuitId } : {}), phaseIds: phases.map(p => p.id), owner, cues: [] }
  state.phaseId = phases[0].id; state.status = 'running'; state.elapsedMs = 0; state.anchorAt = new Date(now).toISOString(); state.phaseStartedAt = state.anchorAt
  return state
}
function record(state: IntervalState, phase: IntervalPhase, elapsedMs: number, status: IntervalResult['status'], at: string, finalizing = false) {
  if (phase.kind === 'preparation' || state.execution?.mode === 'rest' && !finalizing) return
  const result: IntervalResult = { phase: structuredClone(phase), elapsedMs, status, ...(state.phaseStartedAt ? { startedAt: state.phaseStartedAt } : {}), endedAt: at }
  const index = state.results.findIndex(r => r.phase.id === phase.id)
  if (index < 0) state.results.push(result); else state.results[index] = result
}
function cue(state: IntervalState, kind: IntervalCue['kind'], p: IntervalPhase, at: number) {
  const e = state.execution!, key = `${e.id}:${p.id}:${kind}`
  if (!e.cues.some(c => c.key === key)) e.cues.push({ key, kind, phaseId: p.id, at: new Date(at).toISOString() })
}
export function advanceInterval(input: IntervalState, now = Date.now()): IntervalState {
  if (!input.engineVersion) return legacy.advanceInterval(input as legacy.IntervalState, now)
  const state = structuredClone(input)
  if (state.status !== 'running' || !state.execution) return state
  let elapsed = state.elapsedMs + Math.max(0, now - Date.parse(state.anchorAt!)), index = state.execution.phaseIds.indexOf(state.phaseId!)
  while (index < state.execution.phaseIds.length) {
    const phase = state.phases.find(p => p.id === state.execution!.phaseIds[index])!, duration = phase.durationSeconds * 1000
    const began = now - elapsed
    if (phase.kind === 'active' && duration > 5000 && elapsed >= duration - 5000) cue(state, 'warning', phase, began + duration - 5000)
    if (elapsed < duration) break
    const endedAt = new Date(began + duration).toISOString()
    record(state, phase, duration, 'completed', endedAt)
    if (phase.kind === 'active') cue(state, 'end', phase, began + duration)
    if (phase.kind === 'workout-rest') cue(state, 'complete', phase, began + duration)
    elapsed -= duration; index++; state.phaseStartedAt = endedAt
    const next = state.phases.find(p => p.id === state.execution!.phaseIds[index])
    if (next?.kind === 'active') cue(state, 'start', next, began + duration)
    else if (spokenRest(next)) cue(state, 'rest', next!, began + duration)
  }
  state.phaseId = state.execution.phaseIds[index]; state.elapsedMs = state.phaseId ? elapsed : 0
  state.status = state.phaseId ? 'running' : 'finished'; state.anchorAt = state.phaseId ? new Date(now).toISOString() : undefined
  return state
}
export function intervalCommand(input: IntervalState, action: 'resume' | 'pause' | 'recover' | 'skip' | 'finish' | 'stop', now = Date.now()): IntervalState {
  if (action === 'stop') {
    const state = structuredClone(input), execution = state.execution
    if (execution?.mode !== 'rest') state.results = execution ? state.results.filter(r => execution.mode === 'circuit' && r.phase.circuitId !== execution.circuitId) : []
    state.phaseId = undefined; state.execution = undefined; state.status = 'ready'; state.elapsedMs = 0; state.anchorAt = undefined; state.phaseStartedAt = undefined
    return state
  }
  if (!input.engineVersion) return legacy.intervalCommand(input as legacy.IntervalState, action, now)
  const state = action === 'recover' ? structuredClone(input) : advanceInterval(input, now), at = new Date(now).toISOString()
  if (action === 'resume') {
    if (state.status !== 'paused' || !state.phaseId || !state.execution) throw new Error('Start a new timer or resume its paused execution.')
    state.status = 'running'; state.anchorAt = at
    const phase = state.phases.find(p => p.id === state.phaseId)!
    if (!state.phaseStartedAt && phase.kind === 'active') cue(state, 'start', phase, now)
    else if (!state.phaseStartedAt && spokenRest(phase)) cue(state, 'rest', phase, now)
    state.phaseStartedAt ??= at; return state
  }
  if (action === 'pause' || action === 'recover') {
    if (state.status === 'running') state.status = 'paused'
    state.anchorAt = undefined; return state
  }
  const phase = state.phases.find(p => p.id === state.phaseId)
  if (phase && (state.elapsedMs || action === 'skip')) record(state, phase, state.elapsedMs, state.elapsedMs ? 'partial' : 'skipped', at)
  if (action === 'skip' && state.execution && phase) {
    const next = state.execution.phaseIds[state.execution.phaseIds.indexOf(phase.id) + 1]
    state.phaseId = next; state.status = next ? 'paused' : 'finished'
  } else { state.phaseId = undefined; state.status = action === 'finish' ? 'finished' : 'stopped' }
  state.elapsedMs = 0; state.anchorAt = undefined; state.phaseStartedAt = undefined
  if (action === 'finish') for (const p of state.phases) if (p.kind !== 'preparation' && p.durationSeconds > 0 && !state.results.some(r => r.phase.id === p.id)) record(state, p, 0, 'skipped', at, true)
  return state
}
export const meaningfulInterval = (s?: IntervalState) => !!s && (s.results.some(r => r.phase.kind === 'active' && r.elapsedMs > 0) || s.phases.find(p => p.id === s.phaseId)?.kind === 'active' && s.elapsedMs > 0)
export const partialInterval = (s: IntervalState) => !s.engineVersion ? legacy.partialInterval(s as legacy.IntervalState) : s.phases.filter(p => p.kind === 'active').some(p => !s.results.some(r => r.phase.id === p.id && r.status === 'completed'))
export const formatIntervalTime = (seconds: number) => { const value = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` }
export const phaseTitle = (p?: IntervalPhase) => p?.kind === 'active' ? p.exerciseName! : p?.kind === 'preparation' ? 'Warm Up' : p?.kind === 'workout-rest' ? 'Post-Workout Rest' : 'Rest'
export function intervalDisplay(s: IntervalState) {
  const phase = s.phases.find(p => p.id === s.phaseId), ids = s.execution?.phaseIds ?? s.phases.map(p => p.id), at = ids.indexOf(s.phaseId!)
  const next = s.phases.find(p => p.id === ids.slice(at + 1).find(id => s.phases.find(p => p.id === id)!.durationSeconds > 0))
  const core = phase && ['active', 'recovery', 'set-rest'].includes(phase.kind)
  const block = phase ? s.phases.filter(p => ids.includes(p.id) && (core ? p.circuitId === phase.circuitId && p.repetition === phase.repetition && ['active', 'recovery', 'set-rest'].includes(p.kind) : p.id === phase.id)) : []
  const duration = block.reduce((n, p) => n + p.durationSeconds, 0), elapsed = block.reduce((n, p) => n + (p.id === phase?.id ? s.elapsedMs : ids.indexOf(p.id) < at ? p.durationSeconds * 1000 : 0), 0)
  return { phase, title: phaseTitle(phase), next: next ? phaseTitle(next) : s.execution?.mode === 'rest' ? 'Rest Complete!' : s.execution?.mode === 'circuit' ? 'Circuit Complete!' : 'Workout Complete!', remaining: Math.max(0, (phase?.durationSeconds ?? 0) - s.elapsedMs / 1000), duration, progress: duration ? Math.max(0, Math.min(1, elapsed / (duration * 1000))) : 0, total: ids.reduce((n, id) => n + s.phases.find(p => p.id === id)!.durationSeconds, 0), scopeTotal: s.phases.filter(p => ids.includes(p.id) && p.kind !== 'preparation').reduce((n, p) => n + p.durationSeconds, 0) }
}

import { z } from 'zod'
import type { TrainingDay } from './plan-v9.ts'

export const intervalPhaseSchema = z.object({
  id: z.string().min(1), kind: z.enum(['active', 'recovery', 'set-rest', 'circuit-rest']),
  circuitId: z.string().uuid(), circuitName: z.string().max(120), exerciseId: z.string().uuid().optional(), exerciseName: z.string().max(120).optional(), templateId: z.string().uuid().optional(),
  set: z.number().int().positive(), round: z.number().int().positive(), durationSeconds: z.number().int().min(0).max(86400),
}).strict().superRefine((p, ctx) => {
  const activity = p.kind === 'active' || p.kind === 'recovery'
  if (activity !== !!p.exerciseId || activity !== !!p.exerciseName || !activity && p.templateId || p.kind === 'active' && !p.durationSeconds) ctx.addIssue({ code: 'custom', message: 'Activity phases need an exercise; active duration must be positive.' })
  const identity = activity ? `${p.circuitId}:${p.set}:${p.round}:${p.exerciseId}:${p.kind}` : p.kind === 'set-rest' ? `${p.circuitId}:${p.set}:set-rest` : `${p.circuitId}:circuit-rest`
  if (p.id !== identity) ctx.addIssue({ code: 'custom', path: ['id'], message: 'Phase identity must match its circuit, set, round and exercise.' })
})
export const intervalResultSchema = z.object({ phase: intervalPhaseSchema, elapsedMs: z.number().finite().nonnegative(), status: z.enum(['completed', 'partial', 'skipped']), startedAt: z.string().datetime().optional(), endedAt: z.string().datetime(), notes: z.string().max(20000).optional() }).strict().refine(r => r.elapsedMs <= r.phase.durationSeconds * 1000 && (r.status !== 'completed' || r.elapsedMs === r.phase.durationSeconds * 1000) && (r.status !== 'skipped' || r.elapsedMs === 0), 'Recorded time must agree with the phase status and prescription.')
export const intervalStateSchema = z.object({
  phases: z.array(intervalPhaseSchema).max(40000), phaseId: z.string().optional(), status: z.enum(['ready', 'running', 'paused', 'finished']),
  elapsedMs: z.number().finite().nonnegative(), anchorAt: z.string().datetime().optional(), phaseStartedAt: z.string().datetime().optional(),
  results: z.array(intervalResultSchema).max(40000),
}).strict().superRefine((s, ctx) => {
  const ids = s.phases.map(p => p.id), done = s.results.map(r => r.phase.id), at = s.phaseId ? ids.indexOf(s.phaseId) : ids.length
  if (new Set(ids).size !== ids.length || new Set(done).size !== done.length || at < 0 || done.join() !== ids.slice(0, at).join()) ctx.addIssue({ code: 'custom', message: 'Interval phases/results must have unique ordered identities.' })
  if ((s.status === 'finished') !== !s.phaseId || (s.status === 'running') !== !!s.anchorAt) ctx.addIssue({ code: 'custom', message: 'Interval running/finished state is inconsistent.' })
  if (s.phaseId && s.elapsedMs > (s.phases[at]?.durationSeconds ?? 0) * 1000) ctx.addIssue({ code: 'custom', path: ['elapsedMs'], message: 'Elapsed time exceeds this phase.' })
  s.results.forEach((r, i) => { if (JSON.stringify(r.phase) !== JSON.stringify(s.phases[i])) ctx.addIssue({ code: 'custom', path: ['results', i], message: 'Result prescription must match its execution phase.' }) })
})
export type IntervalPhase = z.infer<typeof intervalPhaseSchema>
export type IntervalResult = z.infer<typeof intervalResultSchema>
export type IntervalState = z.infer<typeof intervalStateSchema>

export function intervalPhases(day: TrainingDay): IntervalPhase[] {
  if (day.trainingType !== 'interval') throw new Error('Choose an Interval workout.')
  const phases: IntervalPhase[] = []
  for (const [index, circuit] of (day.circuits ?? []).entries()) for (let set = 1; set <= circuit.sets; set++) {
    for (let round = 1; round <= circuit.roundsPerSet; round++) for (const id of circuit.exerciseIds) {
      const e = day.exercises.find(e => e.id === id)
      if (!e || e.prescription.trainingType !== 'interval') throw new Error('The circuit has an incompatible or missing exercise.')
      for (const kind of ['active', 'recovery'] as const) phases.push({ id: `${circuit.id}:${set}:${round}:${e.id}:${kind}`, kind, circuitId: circuit.id, circuitName: circuit.name, exerciseId: e.id, exerciseName: e.prescription.name, templateId: e.templateId ?? (e.source?.kind === 'exercise' ? e.source.id : e.source?.libraryId), set, round, durationSeconds: kind === 'active' ? e.prescription.activeSeconds : e.prescription.recoverySeconds })
    }
    if (set < circuit.sets) phases.push({ id: `${circuit.id}:${set}:set-rest`, kind: 'set-rest', circuitId: circuit.id, circuitName: circuit.name, set, round: circuit.roundsPerSet, durationSeconds: circuit.restBetweenSetsSeconds })
    else if (index < day.circuits!.length - 1) phases.push({ id: `${circuit.id}:circuit-rest`, kind: 'circuit-rest', circuitId: circuit.id, circuitName: circuit.name, set, round: circuit.roundsPerSet, durationSeconds: circuit.restAfterCircuitSeconds })
  }
  return phases
}
export function initialInterval(day: TrainingDay): IntervalState {
  const phases = intervalPhases(day)
  return { phases, phaseId: phases[0]?.id, status: phases.length ? 'ready' : 'finished', elapsedMs: 0, results: [] }
}
export function advanceInterval(input: IntervalState, now = Date.now()): IntervalState {
  if (input.status !== 'running') return structuredClone(input)
  const state = structuredClone(input)
  let elapsed = state.elapsedMs + Math.max(0, now - Date.parse(state.anchorAt!)), index = state.phases.findIndex(p => p.id === state.phaseId)
  while (index < state.phases.length) {
    const phase = state.phases[index], duration = phase.durationSeconds * 1000
    if (elapsed < duration) break
    const endedAt = new Date(now - elapsed + duration).toISOString()
    state.results.push({ phase: structuredClone(phase), elapsedMs: duration, status: 'completed', startedAt: state.phaseStartedAt ?? new Date(now - elapsed).toISOString(), endedAt })
    elapsed -= duration; index++; state.phaseStartedAt = endedAt
  }
  state.phaseId = state.phases[index]?.id; state.elapsedMs = state.phaseId ? elapsed : 0
  state.status = state.phaseId ? 'running' : 'finished'; state.anchorAt = state.phaseId ? new Date(now).toISOString() : undefined
  return state
}
export function intervalCommand(input: IntervalState, action: 'resume' | 'pause' | 'recover' | 'skip' | 'finish', now = Date.now()): IntervalState {
  let state = action === 'recover' ? structuredClone(input) : advanceInterval(input, now)
  const at = new Date(now).toISOString()
  if (action === 'resume' && state.phaseId) { state.status = 'running'; state.anchorAt = at; state.phaseStartedAt ??= at; return advanceInterval(state, now) }
  if (action === 'skip' || action === 'finish') {
    const index = state.phases.findIndex(p => p.id === state.phaseId)
    const skipped = index < 0 ? [] : action === 'skip' ? state.phases.slice(index, index + 1) : state.phases.slice(index)
    skipped.forEach((phase, i) => state.results.push({ phase: structuredClone(phase), elapsedMs: i ? 0 : state.elapsedMs, status: !i && state.elapsedMs > 0 ? 'partial' : 'skipped', ...(!i && state.phaseStartedAt ? { startedAt: state.phaseStartedAt } : {}), endedAt: at }))
    state.phaseId = action === 'skip' ? state.phases[index + 1]?.id : undefined; state.elapsedMs = 0; state.phaseStartedAt = undefined
  }
  state.status = state.phaseId ? 'paused' : 'finished'; state.anchorAt = undefined
  return state
}
export const meaningfulInterval = (state?: IntervalState) => !!state && (state.results.some(r => r.phase.kind === 'active' && r.elapsedMs > 0) || state.phases.find(p => p.id === state.phaseId)?.kind === 'active' && state.elapsedMs > 0)
export const partialInterval = (state: IntervalState) => state.status !== 'finished' || state.results.some(r => r.status !== 'completed')

import type { IntervalPhase } from '../../schemas/interval-session'
import { ordinal } from '../../lib/ordinal'

// Presentation of the compiled prescription, never a second repetition engine.
export function IntervalSequence({ phases, activeId }: { phases: IntervalPhase[]; activeId?: string }) {
  const blocks: IntervalPhase[][] = []
  for (const phase of phases.filter(p => p.kind !== 'preparation' && p.kind !== 'workout-rest')) {
    const previous = blocks.at(-1)?.[0]
    if (!previous || phase.repetition !== previous.repetition || phase.set !== previous.set || phase.round !== previous.round) blocks.push([])
    blocks.at(-1)!.push(phase)
  }
  return <>{blocks.map((block, index) => <section className="interval-execution" key={block[0].id}>{blocks.length > 1 && <h4>{ordinal(index + 1)}</h4>}{block.map((phase, n) => {
    if (phase.kind === 'recovery') return null
    if (phase.kind !== 'active') return phase.durationSeconds > 0 ? <p className="interval-occurrence interval-circuit-rest" key={phase.id} aria-current={activeId === phase.id ? 'step' : undefined}>Rest: {phase.durationSeconds}s</p> : null
    const recovery = block[n + 1]?.kind === 'recovery' ? block[n + 1] : undefined
    return <div className="interval-occurrence" key={phase.id} aria-current={activeId === phase.id || activeId === recovery?.id ? 'step' : undefined}><h4>{phase.exerciseName}</h4><p className="interval-target">{phase.durationSeconds}s active - {recovery?.durationSeconds ?? 0}s rest</p></div>
  })}</section>)}</>
}

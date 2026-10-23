import { createId } from './browser-crypto.ts'
import { trainingBlocks } from '../schemas/plan.ts'
import { sessionRounds, type SessionSnapshot } from '../schemas/session-structure.ts'
import { timerEnd, type RestTimer } from '../schemas/session.ts'

export function sessionRest(profileId: string, draftId: string, snapshot: SessionSnapshot, blockId: string, index: number, group = false, manualSeconds?: number): RestTimer | undefined {
  if (!group && snapshot.day.exercises.find(e => e.id === blockId)?.groupId) throw new Error('Use the superset round rest, not a member rest.')
  const block = trainingBlocks(snapshot.day).find(b => b.id === blockId)
  if (!block || !!block.group !== group || !Number.isInteger(index)) throw new Error('This rest position is unavailable.')
  const rounds = sessionRounds(block.members, snapshot.structure), member = block.members[0]
  const count = group ? rounds.length : member.prescription.sets.length
  if (index < 0 || index >= count) throw new Error('This rest position is unavailable.')
  const after = index === count - 1
  const seconds = (block.group ? after ? block.group.restAfterGroupSeconds : block.group.restBetweenRoundsSeconds : after ? member.prescription.restAfterSeconds : member.prescription.restBetweenSeconds) ?? manualSeconds
  if (seconds === 0) return undefined
  const first = rounds[index][0], round = snapshot.structure?.exercises.find(e => e.id === first.member.id)?.sets[first.index].round ?? index + 1
  const startedAt = new Date().toISOString()
  return { id: 'active', token: createId(), profileId, draftId,
    ...(group ? { groupId: blockId } : { exerciseId: blockId }), label: block.group ? `Superset ${block.group.number}` : member.prescription.name,
    position: after ? 'Post-Exercise' : `Set ${group ? round : index + 1}`,
    ...(seconds === undefined ? { mode: 'countup', startedAt } : { mode: 'countdown', durationSeconds: seconds, endAt: timerEnd(seconds, Date.parse(startedAt)) }) }
}

export function changedRest(timer: RestTimer, action: 'stop' | 'reset' | 'pause' | 'resume'): RestTimer | undefined {
  if (action === 'stop') return undefined
  if (action === 'pause') {
    if (timer.mode !== 'countup' && !timer.pausedAt && Date.parse(timer.endAt) <= Date.now()) throw new Error('This timer finished.')
    return { ...timer, pausedAt: timer.pausedAt ?? new Date().toISOString() }
  }
  if (action === 'resume' && timer.pausedAt) {
    const delta = Date.now() - Date.parse(timer.pausedAt), shift = (at: string) => new Date(Date.parse(at) + delta).toISOString()
    return { ...timer, pausedAt: undefined, ...(timer.preparationEndAt ? { preparationEndAt: shift(timer.preparationEndAt) } : {}), ...(timer.mode === 'countup' ? { startedAt: shift(timer.startedAt) } : { endAt: shift(timer.endAt) }) }
  }
  if (action === 'reset') {
    const startedAt = new Date().toISOString()
    return { ...timer, token: createId(), alertedAt: undefined, pausedAt: undefined, preparationEndAt: undefined, ...(timer.mode === 'countup' ? { startedAt } : { endAt: timerEnd(timer.durationSeconds, Date.parse(startedAt)) }) }
  }
  return timer
}

import type { BorosDatabase } from './database.ts'
import { createId } from '../lib/browser-crypto.ts'
import { executionActive, type IntervalState } from '../schemas/interval-session.ts'
let client: string | undefined
export const timerClient = () => client ??= createId()
// Called within the same read/write transaction as the start. Scanning the
// existing committed drafts shares one slot with the existing rest-timer store.
export async function assertTimerAvailable(database: BorosDatabase, ownDraft?: string, ownRestToken?: string) {
  const rest = await database.restTimers.get('active')
  if (rest && rest.token !== ownRestToken && (rest.pausedAt || rest.mode === 'countup' || Date.parse(rest.endAt) > Date.now())) throw new Error('Stop the current timer first.')
  const drafts = await database.drafts.toArray()
  if (drafts.some(d => d.id !== ownDraft && !d.finalizedAt && executionActive(d.interval) && (!d.interval?.engineVersion || !!d.interval.execution?.owner))) throw new Error('Stop the current timer first.')
}
export function assertIntervalOwner(state: IntervalState, recover = false) {
  if (executionActive(state) && state.execution?.owner && state.execution.owner !== timerClient() && !recover) throw new Error('This timer belongs to another tab. Reload the saved timer to recover it paused.')
}

import type { BorosDatabase } from './database.ts'
import { closedRunDraftIds } from '../lib/closed-runs.ts'

// Caller owns a transaction covering schedules/drafts/sessions/restTimers.
export async function repairClosedRunDrafts(database: BorosDatabase, profileId: string) {
  const runs = await database.schedules.where('profileId').equals(profileId).toArray()
  if (!runs.some((run) => run.closedAt)) return 0
  const drafts = await database.drafts.where('profileId').equals(profileId).toArray()
  const sessions = await database.sessions.where('profileId').equals(profileId).toArray()
  const ids = closedRunDraftIds(runs, drafts, sessions)
  await database.drafts.bulkDelete(ids.map((id) => [profileId, id]))
  const timer = await database.restTimers.get('active')
  if (timer?.profileId === profileId && ids.includes(timer.draftId)) await database.restTimers.delete('active')
  return ids.length
}

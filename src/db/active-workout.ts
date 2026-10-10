import { db, type BorosDatabase } from './database.ts'
import { hasResumableDraft, type SessionDraft } from '../schemas/session.ts'

export interface ActiveWorkout { id: 'active'; profileId: string; draftId: string }
export const workoutConflict = 'Finish or cancel the active workout first.'
// Call inside the same transaction as the draft mutation. This is workspace-wide,
// independent of the selected profile, screen, timer slot and browser tab.
export async function currentWorkout(database: BorosDatabase) {
  const active = await database.activeWorkouts.get('active')
  if (!active) return undefined
  const draft = await database.drafts.get([active.profileId, active.draftId])
  return draft && !draft.finalizedAt ? active : undefined
}
export async function claimWorkout(database: BorosDatabase, draft: SessionDraft) {
  const active = await currentWorkout(database)
  if (active && (active.profileId !== draft.profileId || active.draftId !== draft.id)) throw new Error(workoutConflict)
  if (draft.finalizedAt) throw new Error('This workout is already saved.')
  if (!active) await database.activeWorkouts.put({ id: 'active', profileId: draft.profileId, draftId: draft.id })
}
export async function releaseWorkout(database: BorosDatabase, profileId: string, draftIds: string[]) {
  const active = await database.activeWorkouts.get('active')
  if (active?.profileId === profileId && draftIds.includes(active.draftId)) await database.activeWorkouts.delete('active')
}
// Only migration/restore/init adopt a legacy checkpoint. Never delete other drafts.
export async function reconcileWorkout(database: BorosDatabase) {
  const active = await currentWorkout(database)
  if (active) return active
  await database.activeWorkouts.delete('active')
  const rest = await database.restTimers.get('active')
  const drafts = (await database.drafts.toArray()).filter(d => !d.finalizedAt && (rest?.profileId === d.profileId && rest.draftId === d.id || hasResumableDraft(d) || d.interval?.status === 'running' || d.interval?.status === 'paused'))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
  for (const draft of drafts) {
    if (!await database.profiles.get(draft.profileId)) continue
    if (draft.occurrence && (await database.schedules.get([draft.profileId, draft.occurrence.scheduleId]))?.closedAt) continue
    await claimWorkout(database, draft); return { id: 'active' as const, profileId: draft.profileId, draftId: draft.id }
  }
}
export const activeWorkouts = {
  current: () => db.transaction('r', [db.activeWorkouts, db.drafts], () => currentWorkout(db)),
}

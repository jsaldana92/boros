import type { BorosDatabase } from './database.ts'
import type { Schedule } from '../schemas/schedule.ts'
import type { CompletedSession } from '../schemas/session.ts'
import { runLifecycle } from '../lib/run-progress.ts'

export const activePlanRuns = (runs: Schedule[], sessions: CompletedSession[], instant = new Date()) => runs.filter((run) => !runLifecycle(run, sessions, instant).previous)

// Compatibility selection metadata is updated inside the activation transaction.
// Screens derive activity from the instances, so old missing links need no rewrite.
export async function linkActivePlan(database: BorosDatabase, profileId: string, planId: string) {
  const profile = await database.profiles.get(profileId)
  if (!profile) throw new Error('This profile is unavailable.')
  if (profile.selectedPlanIds?.includes(planId)) return profile
  const next = { ...profile, selectedPlanIds: [...(profile.selectedPlanIds ?? []), planId], revision: profile.revision + 1, updatedAt: new Date().toISOString() }
  await database.profiles.put(next); return next
}

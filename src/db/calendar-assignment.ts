import type { BorosDatabase } from './database.ts'
import type { Schedule } from '../schemas/schedule.ts'
import { runLifecycle } from '../lib/run-progress.ts'
import { activePlanRuns } from './active-plans.ts'

// Called inside the caller's read/write transaction. IndexedDB serializes these
// checks and inserts across tabs; historical/imported duplicates remain valid.
export async function assertCalendarAssignment(database: BorosDatabase, candidate: Schedule) {
  const sessions = await database.sessions.where('profileId').equals(candidate.profileId).toArray()
  if (runLifecycle(candidate, sessions).previous) return
  const siblings = await database.schedules.where('[profileId+planId]').equals([candidate.profileId, candidate.planId]).toArray()
  if (activePlanRuns(siblings, sessions).some((run) => run.id !== candidate.id)) throw new Error('This plan already has an active instance. Manage it in Current Plans. Your input is kept.')
}

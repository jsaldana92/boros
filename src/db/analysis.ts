import { db, type BorosDatabase } from './database.ts'
import { browserZone } from '../lib/calendar-dates.ts'

// A single readonly transaction; deliberately excludes photo blobs and templates.
export async function captureAnalysis(profileId: string, database: BorosDatabase = db) {
  return database.transaction('r', [database.profiles, database.sessions, database.drafts, database.schedules, database.exercises, database.workouts, database.deletedSources], async () => {
    const profile = await database.profiles.get(profileId)
    if (!profile) throw new Error('This profile is unavailable. Reopen Settings.')
    return {
      profile, timeZone: browserZone(),
      sessions: await database.sessions.where('profileId').equals(profileId).toArray(),
      drafts: (await database.drafts.where('profileId').equals(profileId).toArray()).filter(d => !!d.finalizedAt),
      schedules: await database.schedules.where('profileId').equals(profileId).toArray(),
      workoutIdentities: [...await database.workouts.where('profileId').equals(profileId).toArray(), ...(await database.deletedSources.where('profileId').equals(profileId).toArray()).filter(t=>t.kind==='workout')].map(w=>({id:w.id,profileId:w.profileId,mergedIntoId:w.mergedIntoId})),
      identities: [...await database.exercises.where('profileId').equals(profileId).toArray(), ...(await database.deletedSources.where('profileId').equals(profileId).toArray()).filter(t=>t.kind==='exercise')].map(e => ({ id: e.id, profileId: e.profileId, mergedIntoId: e.mergedIntoId })),
    }
  })
}
export type AnalysisSnapshot = Awaited<ReturnType<typeof captureAnalysis>>

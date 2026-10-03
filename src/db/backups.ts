import { db, type BorosDatabase } from './database.ts'
import type { ProfileSnapshot } from '../schemas/backup.ts'

export async function captureProfile(profileId: string, database: BorosDatabase = db): Promise<ProfileSnapshot> {
  // No hashing, Blob reads, worker messages or other non-IDB awaits in this transaction.
  return database.transaction('r', [database.profiles, database.tags, database.exercises, database.plans, database.schedules, database.drafts, database.sessions, database.measurements, database.photos], async () => {
    const profile = await database.profiles.get(profileId)
    if (!profile) throw new Error('The selected profile no longer exists. Select an available profile and retry the export.')
    const [tags, exercises, plans, schedules, drafts, sessions, measurements, photos] = await Promise.all([
      database.tags.where('profileId').equals(profileId).toArray(), database.exercises.where('profileId').equals(profileId).toArray(), database.plans.where('profileId').equals(profileId).toArray(), database.schedules.where('profileId').equals(profileId).toArray(), database.drafts.where('profileId').equals(profileId).toArray(), database.sessions.where('profileId').equals(profileId).toArray(), database.measurements.where('profileId').equals(profileId).toArray(), database.photos.where('profileId').equals(profileId).toArray(),
    ])
    return { databaseVersion: database.verno, capturedAt: new Date().toISOString(), profile, tags, exercises, plans, schedules, drafts, sessions, measurements, photos }
  })
}

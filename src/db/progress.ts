import { db, type BorosDatabase } from './database.ts'
import { deriveProgress } from '../lib/progress-analytics.ts'

export function progressService(database: BorosDatabase) {
  return { async read(profileId: string) {
    return database.transaction('r', [database.profiles, database.plans, database.exercises, database.sessions, database.schedules, database.tags, database.drafts, database.deletedSources], async () => {
      if (!await database.profiles.get(profileId)) throw new Error('This profile is unavailable. Reopen your workspace in Settings.')
      const [plans, exercises, sessions, schedules] = await Promise.all([database.plans.where('profileId').equals(profileId).toArray(), database.exercises.where('profileId').equals(profileId).toArray(), database.sessions.where('profileId').equals(profileId).toArray(), database.schedules.where('profileId').equals(profileId).toArray()])
      const [tags, drafts] = await Promise.all([database.tags.where('profileId').equals(profileId).toArray(), database.drafts.where('profileId').equals(profileId).toArray()])
      return { ...deriveProgress(profileId, plans, exercises, sessions, schedules, drafts.filter((d) => d.finalizedAt), await database.deletedSources.where('profileId').equals(profileId).toArray()), tags }
    })
  } }
}
export const progress = progressService(db)

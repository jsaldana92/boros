import type { BorosDatabase } from './database.ts'
import { materializeTemplates } from '../lib/template-ownership.ts'

export async function repairProfileTemplates(database: BorosDatabase, profileId: string) {
  return database.transaction('rw', database.profiles, database.plans, database.exercises, database.tags, database.deletedSources, async () => {
    if (!await database.profiles.get(profileId)) throw new Error('This profile is unavailable. No templates were repaired.')
    const [plans, exercises, tags, deletedSources] = await Promise.all([database.plans.where('profileId').equals(profileId).toArray(), database.exercises.where('profileId').equals(profileId).toArray(), database.tags.where('profileId').equals(profileId).toArray(), database.deletedSources.where('profileId').equals(profileId).toArray()])
    const repaired = materializeTemplates(profileId, { plans, exercises, tags, deletedSources }, new Date().toISOString())
    if (repaired.addedTags.length) await database.tags.bulkAdd(repaired.addedTags)
    if (repaired.addedExercises.length) await database.exercises.bulkAdd(repaired.addedExercises)
    if (repaired.changedPlans.length) await database.plans.bulkPut(repaired.changedPlans)
    return { templates: repaired.addedExercises.length, plans: repaired.changedPlans.length }
  })
}

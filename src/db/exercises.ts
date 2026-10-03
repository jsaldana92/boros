import { createId } from '../lib/browser-crypto.ts'
import { z } from 'zod'
import { resolveTags } from './tags.ts'
import { db, type BorosDatabase } from './database.ts'
import { exerciseInputSchema, type Exercise, type ExerciseInput, type Tag } from '../schemas/exercise.ts'
import { nameKey } from '../schemas/profile.ts'

export function exerciseService(database: BorosDatabase) {
  const tables = [database.profiles, database.exercises, database.tags]
  const owner = async (profileId: string) => {
    if (!await database.profiles.get(profileId)) throw new Error('This profile is unavailable. Nothing was saved.')
  }
  const get = async (profileId: string, id: string) => {
    const record = await database.exercises.get([profileId, id])
    if (!record) throw new Error('This exercise is unavailable in this profile.')
    return record
  }
  const checkRevision = (record: Exercise, revision: number) => {
    if (record.revision !== revision) throw new Error('This exercise changed in another tab. Your input is kept. Reload the saved exercise before trying again.')
  }
  const checkName = async (profileId: string, name: string, ownId?: string) => {
    const record = await database.exercises.where('[profileId+activeNameKey]').equals([profileId, nameKey(name)]).first()
    if (record && record.id !== ownId) throw new Error('An active exercise with this name already exists. Choose a different name.')
  }
  return {
    get,
    async library(profileId: string) {
      return database.transaction('r', tables, async () => {
        await owner(profileId)
        return { exercises: await database.exercises.where('profileId').equals(profileId).toArray(), tags: await database.tags.where('profileId').equals(profileId).toArray() }
      })
    },
    async save(profileId: string, raw: ExerciseInput, existing?: { id: string; revision: number }, creationId?: string) {
      const input = exerciseInputSchema.parse(raw)
      if (creationId) { z.string().uuid().parse(creationId); if (existing) throw new Error('A creation ID cannot overwrite an existing exercise.') }
      return database.transaction('rw', tables, async () => {
        await owner(profileId)
        if (creationId) { const committed = await database.exercises.get([profileId, creationId]); if (committed) return committed }
        const old = existing ? await get(profileId, existing.id) : undefined
        if (old) checkRevision(old, existing!.revision)
        if (!old?.archivedAt) await checkName(profileId, input.name, old?.id)
        const now = new Date().toISOString()
        const tagIds = await resolveTags(database, profileId, input.tagNames, now)
        const { tagNames: _tagNames, ...fields } = input
        const result: Exercise = { ...fields, profileId, id: old?.id ?? creationId ?? createId(), nameKey: nameKey(input.name), activeNameKey: old?.archivedAt ? undefined : nameKey(input.name), tagIds, archivedAt: old?.archivedAt, createdAt: old?.createdAt ?? now, updatedAt: now, revision: (old?.revision ?? 0) + 1 }
        await database.exercises.put(result)
        return result
      })
    },
    async setArchived(profileId: string, id: string, revision: number, archived: boolean) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId)
        const record = await get(profileId, id)
        checkRevision(record, revision)
        if (!archived) await checkName(profileId, record.name, id)
        const now = new Date().toISOString()
        const result = { ...record, archivedAt: archived ? now : undefined, activeNameKey: archived ? undefined : record.nameKey, revision: record.revision + 1, updatedAt: now }
        await database.exercises.put(result)
        return result
      })
    },
    async duplicateDraft(profileId: string, id: string): Promise<ExerciseInput> {
      const { exercises, tags } = await this.library(profileId)
      const original = exercises.find((record) => record.id === id)
      if (!original) throw new Error('This exercise is unavailable in this profile.')
      const names = new Set(exercises.filter((record) => !record.archivedAt).map((record) => record.nameKey))
      let suffix = 1, name = `${original.name.slice(0, 100)} (copy)`
      while (names.has(nameKey(name))) name = `${original.name.slice(0, 100)} (copy ${++suffix})`
      return exerciseToInput({ ...original, name }, tags)
    },
  }
}
export function exerciseToInput(record: Exercise, tags: Tag[]): ExerciseInput {
  return { name: record.name, sets: structuredClone(record.sets), restBetweenSeconds: record.restBetweenSeconds, restAfterSeconds: record.restAfterSeconds, instructions: record.instructions, notes: record.notes, tutorialUrl: record.tutorialUrl, tagNames: record.tagIds.map((id) => tags.find((tag) => tag.id === id && tag.profileId === record.profileId)?.name).filter((name): name is string => name !== undefined) }
}
export const exercises = exerciseService(db)

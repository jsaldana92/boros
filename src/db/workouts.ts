import { db, type BorosDatabase } from './database.ts'
import { nameKey } from '../schemas/profile.ts'
import { duplicateDay } from '../schemas/plan.ts'
import { workoutInputSchema, workoutToInput, type Workout, type WorkoutInput } from '../schemas/workout.ts'
import { exerciseService } from './exercises.ts'
import { templateReference } from '../lib/template-ownership.ts'

export function workoutService(database: BorosDatabase) {
  const tables = [database.profiles, database.workouts, database.exercises, database.tags]
  const owner = async (profileId: string) => { if (!await database.profiles.get(profileId)) throw new Error('This profile is unavailable. Nothing was saved.') }
  const get = async (profileId: string, id: string) => { const value = await database.workouts.get([profileId, id]); if (!value) throw new Error('This workout is unavailable in this profile.'); return value }
  const checkName = async (profileId: string, name: string, ownId?: string) => { const other = await database.workouts.where('[profileId+activeNameKey]').equals([profileId, nameKey(name)]).first(); if (other && other.id !== ownId) throw new Error('An active workout with this name already exists. Choose a different name.') }
  const checkRevision = (value: Workout, revision: number) => { if (value.revision !== revision) throw new Error('This workout changed in another tab. Your input is kept. Cancel and reopen after copying any changes you need.') }
  return {
    get,
    async library(profileId: string) { return database.transaction('r', tables, async () => { await owner(profileId); return database.workouts.where('profileId').equals(profileId).toArray() }) },
    async save(profileId: string, raw: WorkoutInput, existing?: { id: string; revision: number }, importing = false) {
      const input = workoutInputSchema.parse(raw)
      return database.transaction('rw', tables, async () => {
        await owner(profileId)
        const old = existing ? await get(profileId, existing.id) : undefined
        if (old) checkRevision(old, existing!.revision)
        if (!old?.archivedAt) await checkName(profileId, input.name, old?.id)
        if (!old && await database.workouts.get([profileId, input.id])) throw new Error('This workout was already saved. Reopen it before editing.')
        // Imported snapshots resolve explicit exercise ownership transactionally;
        // matching names reuse defaults without overwriting their prescriptions.
        for (const item of input.exercises) {
          const ref = templateReference(item)
          const template = ref ? await database.exercises.get([profileId, ref]) : undefined
          if (ref && !template) throw new Error('A source exercise is unavailable in this profile.')
          if (importing && !template) {
            const match = await database.exercises.where('[profileId+activeNameKey]').equals([profileId, nameKey(item.prescription.name)]).first()
            const linked = match ?? await exerciseService(database).save(profileId, item.prescription)
            item.source = { kind: 'exercise', id: linked.id }; item.templateId = linked.id
          }
        }
        const now = new Date().toISOString(), value: Workout = { ...input, id: old?.id ?? input.id, profileId, nameKey: nameKey(input.name), activeNameKey: old?.archivedAt ? undefined : nameKey(input.name), archivedAt: old?.archivedAt, revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? now, updatedAt: now }
        await database.workouts.put(value); return value
      })
    },
    async setArchived(profileId: string, id: string, revision: number, archived: boolean) {
      return database.transaction('rw', tables, async () => { await owner(profileId); const old = await get(profileId, id); checkRevision(old, revision); if (!archived) await checkName(profileId, old.name, id); const now = new Date().toISOString(), value = { ...old, archivedAt: archived ? now : undefined, activeNameKey: archived ? undefined : old.nameKey, revision: old.revision + 1, updatedAt: now }; await database.workouts.put(value); return value })
    },
    async duplicateDraft(profileId: string, id: string): Promise<WorkoutInput> {
      const source = await get(profileId, id), all = await this.library(profileId), keys = new Set(all.filter(w => !w.archivedAt).map(w => w.nameKey))
      let n = 1, name = `${source.name.slice(0, 100)} (copy)`
      while (keys.has(nameKey(name))) name = `${source.name.slice(0, 100)} (copy ${++n})`
      return { ...duplicateDay(workoutToInput(source)), name }
    },
  }
}
export const workouts = workoutService(db)

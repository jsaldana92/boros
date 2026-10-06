import { createId } from '../lib/browser-crypto.ts'
import { z } from 'zod'
import { resolveTags } from './tags.ts'
import { db, type BorosDatabase } from './database.ts'
import { exerciseToInput } from './exercises.ts'
import { nameKey } from '../schemas/profile.ts'
import { duplicateStructure, planInputSchema, planToInput, type ExerciseSource, type Plan, type PlanInput } from '../schemas/plan.ts'
import type { ExerciseInput } from '../schemas/exercise.ts'
import { appendRevision } from '../schemas/schedule.ts'
import { localToday, nextMonday } from '../lib/calendar-dates.ts'

export interface PrescriptionChoice {
  id: string; nameKey: string; createdAt: string; tagIds: string[]
  label: string; prescription: ExerciseInput; source: ExerciseSource
}
export function planService(database: BorosDatabase) {
  const tables = [database.profiles, database.plans, database.tags, database.schedules]
  const owner = async (profileId: string) => { if (!await database.profiles.get(profileId)) throw new Error('This profile is unavailable. Nothing was saved.') }
  const get = async (profileId: string, id: string) => {
    const plan = await database.plans.get([profileId, id])
    if (!plan) throw new Error('This plan is unavailable in this profile.')
    return plan
  }
  const checkRevision = (plan: Plan, revision: number) => {
    if (plan.revision !== revision) throw new Error('This plan changed in another tab. Your input is kept. Cancel the editor and reopen the saved plan after copying any changes you need.')
  }
  const checkName = async (profileId: string, name: string, ownId?: string) => {
    const record = await database.plans.where('[profileId+activeNameKey]').equals([profileId, nameKey(name)]).first()
    if (record && record.id !== ownId) throw new Error('An active plan with this name already exists. Choose a different name; rename an archived plan before restoring it.')
  }
  return {
    get,
    async library(profileId: string) {
      return database.transaction('r', [...tables, database.exercises], async () => {
        await owner(profileId)
        const plans = await database.plans.where('profileId').equals(profileId).toArray()
        const tags = await database.tags.where('profileId').equals(profileId).toArray()
        const library = await database.exercises.where('profileId').equals(profileId).toArray()
        const choices: PrescriptionChoice[] = []
        for (const exercise of library.filter((item) => !item.archivedAt)) {
          const prescription = exerciseToInput(exercise, tags)
          choices.push({ id: `exercise:${exercise.id}`, nameKey: exercise.nameKey, createdAt: exercise.createdAt, tagIds: prescription.tagNames.map(nameKey), label: `Library: ${exercise.name}`, prescription, source: { kind: 'exercise', id: exercise.id } })
        }
        return { plans, choices, tags, exercises: library }
      })
    },
    async save(profileId: string, raw: PlanInput, existing?: { id: string; revision: number }, creationId?: string) {
      const input = planInputSchema.parse(raw)
      if (creationId) { z.string().uuid().parse(creationId); if (existing) throw new Error('A creation ID cannot overwrite an existing plan.') }
      return database.transaction('rw', tables, async () => {
        await owner(profileId)
        if (creationId) { const committed = await database.plans.get([profileId, creationId]); if (committed) return committed }
        const old = existing ? await get(profileId, existing.id) : undefined
        if ((!old || old.durationWeeks !== undefined) && input.durationWeeks === undefined) throw new Error('Enter a positive whole duration in weeks. Existing finite plans cannot silently become unbounded.')
        if (old) checkRevision(old, existing!.revision)
        if (!old?.archivedAt) await checkName(profileId, input.name, old?.id)
        const now = new Date().toISOString()
        if (creationId) await resolveTags(database, profileId, input.days.flatMap((day) => day.exercises.flatMap((exercise) => exercise.prescription.tagNames)), now)
        const result: Plan = { ...input, profileId, id: old?.id ?? creationId ?? createId(), nameKey: nameKey(input.name), activeNameKey: old?.archivedAt ? undefined : nameKey(input.name), archivedAt: old?.archivedAt, revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? now, updatedAt: now }
        await database.plans.put(result)
        if (old && (JSON.stringify(old.weeks) !== JSON.stringify(result.weeks) || old.days.length !== result.days.length || old.days.some((day) => !result.days.some((next) => next.id === day.id)))) {
          const schedules = await database.schedules.where('[profileId+planId]').equals([profileId, result.id]).toArray()
          for (const schedule of schedules.filter((item) => !item.stoppedFrom)) {
            const last = schedule.revisions.at(-1)!
            const cutoff = nextMonday(localToday(schedule.timeZone)), effectiveFrom = cutoff > schedule.startWeek ? cutoff : schedule.startWeek
            // Preserve past/missed dates, suspend affected future dates until remapped.
            await database.schedules.put({ ...schedule, revision: schedule.revision + 1, updatedAt: now, revisions: appendRevision(schedule, { ...last, id: createId(), effectiveFrom, effectiveUntil: undefined, createdAt: now, needsRepair: true }) })
          }
        }
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
        await database.plans.put(result)
        return result
      })
    },
    async duplicateDraft(profileId: string, id: string): Promise<PlanInput> {
      const { plans } = await this.library(profileId)
      const original = plans.find((plan) => plan.id === id)
      if (!original) throw new Error('This plan is unavailable in this profile.')
      const names = new Set(plans.filter((plan) => !plan.archivedAt).map((plan) => plan.nameKey))
      let suffix = 1, name = `${original.name.slice(0, 100)} (copy)`
      while (names.has(nameKey(name))) name = `${original.name.slice(0, 100)} (copy ${++suffix})`
      return { ...planToInput(original), name, ...duplicateStructure(original) }
    },
  }
}
export const plans = planService(db)

import { createId } from './browser-crypto.ts'
import { exerciseInputSchema, type Exercise, type Tag } from '../schemas/exercise.ts'
import { type Plan, type PlanExercise } from '../schemas/plan.ts'
import { nameKey } from '../schemas/profile.ts'

export const templateReference = (item: PlanExercise) => item.templateId ?? (item.source?.kind === 'exercise' ? item.source.id : item.source?.libraryId)

// A pure compatibility transformation. Call inside an owner-checked transaction,
// or on a validated restore preview, never from a render/live query. Historical
// provenance is deliberately independent from the new defaults reference.
export function materializeTemplates(profileId: string, records: { plans: Plan[]; exercises: Exercise[]; tags: Tag[] }, at: string, importing = false) {
  const exercises = structuredClone(records.exercises), tags = structuredClone(records.tags), plans = structuredClone(records.plans)
  const addedExercises: Exercise[] = [], addedTags: Tag[] = [], changedPlans: Plan[] = []
  if ([...plans, ...exercises, ...tags].some((item) => item.profileId !== profileId)) throw new Error('Template repair cannot cross profile ownership.')
  const byId = new Map(exercises.map((item) => [item.id, item])), active = new Map<string, Exercise>(), tagKeys = new Map(tags.map((tag) => [tag.nameKey, tag]))
  for (const item of exercises.filter((e) => !e.archivedAt && !e.mergedIntoId)) {
    const key = nameKey(item.name)
    if (active.has(key)) throw new Error(`Ambiguous exercise name "${item.name}". Resolve the conflicting library identities before repairing plans.`)
    active.set(key, item)
  }
  const createdArchived = new Map<string, Exercise>()
  // Current active defaults first; oldest plan, then stable ID, day/occurrence order.
  for (const plan of [...plans].sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    let changed = false
    for (const day of plan.days) for (const item of day.exercises) {
      const ref = templateReference(item)
      if (ref && byId.has(ref)) continue // explicit valid identity wins over a renamed snapshot
      const input = exerciseInputSchema.parse(item.prescription), key = nameKey(input.name)
      let template = active.get(key) ?? (plan.archivedAt ? createdArchived.get(key) : undefined)
      if (ref && template && template.id !== ref) throw new Error(`Ambiguous template reference for "${input.name}": missing ID ${ref} conflicts with an existing library name. Nothing was repaired. Restore under a separate profile or resolve the source records first.`)
      if (!template) {
        // Occurrence IDs are already locally generated UUIDs. Reusing the first
        // occurrence UUID in the separate template keyspace makes legacy restore
        // repair deterministic, including a repeated merge of the same old ZIP.
        const id = ref ?? item.id
        if (byId.has(id)) throw new Error(`Ambiguous template identity for "${input.name}". Nothing was repaired.`)
        const tagIds = input.tagNames.map((name) => {
          const normalized = nameKey(name)
          let tag = tagKeys.get(normalized)
          if (tag?.archivedAt && importing) throw new Error(`Tag "${name}" is archived. Choose another tag.`)
          if (!tag) { tag = { id: createId(), profileId, name, nameKey: normalized, createdAt: at, updatedAt: at }; tags.push(tag); addedTags.push(tag); tagKeys.set(normalized, tag) }
          return tag.id
        })
        const { tagNames: _names, ...prescription } = input
        template = { ...prescription, id, profileId, nameKey: key, activeNameKey: plan.archivedAt ? undefined : key, archivedAt: plan.archivedAt, tagIds: [...new Set(tagIds)], revision: 1, createdAt: at, updatedAt: at }
        exercises.push(template); addedExercises.push(template); byId.set(id, template)
        if (plan.archivedAt) createdArchived.set(key, template); else active.set(key, template)
      }
      if (!importing && ref) continue // materialized the already-recorded identity; the plan itself needs no rewrite
      if (importing) item.source = { kind: 'exercise', id: template.id }
      else item.templateId = template.id // preserve source, prescription, occurrence ID and all historical keys
      changed = true
    }
    if (changed) { if (!importing) plan.revision++; changedPlans.push(plan) } // invalidate stale editors; retain timestamps
  }
  return { plans, exercises, tags, addedExercises, addedTags, changedPlans }
}

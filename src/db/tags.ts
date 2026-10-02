import type { BorosDatabase } from './database.ts'
import { nameKey } from '../schemas/profile.ts'

// Called only inside the artifact's owner-checked read/write transaction.
export async function resolveTags(database: BorosDatabase, profileId: string, names: string[], now: string) {
  const ids: string[] = []
  for (const name of names) {
    const key = nameKey(name)
    let tag = await database.tags.where('[profileId+nameKey]').equals([profileId, key]).first()
    if (tag?.archivedAt) throw new Error(`Tag "${name}" is archived. Choose another tag.`)
    if (!tag) { tag = { id: crypto.randomUUID(), profileId, name, nameKey: key, createdAt: now, updatedAt: now }; await database.tags.add(tag) }
    if (!ids.includes(tag.id)) ids.push(tag.id)
  }
  return ids
}

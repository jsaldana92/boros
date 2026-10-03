import { z } from 'zod'
import { db, type BorosDatabase } from './database.ts'
import { measurementSchema, photoSchema, type Measurement, type PreparedPhoto } from '../schemas/profile.ts'
import { measurementInstant, validateTimeContext } from '../lib/measurement-dates.ts'
import { removeUnusedPhoto } from './photos.ts'

export const measurementRevision = (entry: Measurement) => entry.revision ?? 1
// Same timestamp: IndexedDB's secondary index orders by primary key, so the
// greatest ID wins within a profile. Preserve that existing deterministic rule.
export const latestMeasurement = (database: BorosDatabase, profileId: string) => database.measurements.where('[profileId+measuredAt]').between([profileId, ''], [profileId, '\uffff']).last()

// Reused inside the profile save transaction. Profile save already bumps its revision.
export async function appendSettingsWeight(database: BorosDatabase, profileId: string, weightKg: number) {
  const last = await latestMeasurement(database, profileId)
  if (last && Math.abs(last.weightKg - weightKg) < 0.000001) return
  const now = new Date().toISOString(), date = new Date(Math.max(Date.now(), last ? Date.parse(last.measuredAt) + 1 : 0))
  // Preserve the exact instant even during the second half of a DST fold.
  const measurement = measurementSchema.parse({ weightKg, ...measurementInstant(date) })
  await database.measurements.add({ ...measurement, profileId, id: crypto.randomUUID(), loggedAt: now, updatedAt: now, revision: 1 })
}
export function measurementService(database: BorosDatabase) {
  const tables = [database.profiles, database.measurements, database.photos]
  const owner = async (profileId: string) => { const profile = await database.profiles.get(profileId); if (!profile) throw new Error('This profile is unavailable. Nothing was saved.'); return profile }
  const get = async (profileId: string, id: string) => { const value = await database.measurements.get([profileId, id]); if (!value) throw new Error('This measurement is unavailable in this profile.'); return value }
  const check = (entry: Measurement, expected: number) => { if (measurementRevision(entry) !== expected) throw new Error('This measurement changed in another tab. Your input is kept. Copy needed changes, then cancel and reopen the saved entry.') }
  return {
    get,
    latest: (profileId: string) => latestMeasurement(database, profileId),
    async list(profileId: string) { await owner(profileId); return database.measurements.where('[profileId+measuredAt]').between([profileId, ''], [profileId, '\uffff']).toArray() },
    async photo(profileId: string, entryId: string) {
      return database.transaction('r', tables, async () => {
        await owner(profileId); const entry = await get(profileId, entryId)
        if (!entry.photoId) return undefined
        const photo = await database.photos.get([profileId, entry.photoId]); if (!photo) throw new Error('The saved photo is unavailable. The measurement is still kept.')
        return photo
      })
    },
    async save(profileId: string, id: string, expectedRevision: number | undefined, raw: z.infer<typeof measurementSchema>, photo: PreparedPhoto | null | undefined, mutationId: string) {
      z.string().uuid().parse(id); z.string().uuid().parse(mutationId)
      const parsed = measurementSchema.parse(raw), input = { ...parsed, measuredAt: new Date(parsed.measuredAt).toISOString() }; validateTimeContext(input); if (photo) photoSchema.parse(photo)
      return database.transaction('rw', tables, async () => {
        const profile = await owner(profileId), old = await database.measurements.get([profileId, id])
        if (old?.lastMutationId === mutationId) return old
        if (expectedRevision === undefined && old) throw new Error('This measurement already exists. Reopen it before editing.')
        if (expectedRevision !== undefined) { if (!old) throw new Error('This measurement was deleted. Your input is kept.'); check(old, expectedRevision) }
        const now = new Date().toISOString(), photoId = photo === undefined ? old?.photoId : photo === null ? undefined : crypto.randomUUID()
        const result: Measurement = { ...input, profileId, id, photoId, loggedAt: old?.loggedAt ?? now, updatedAt: now, revision: old ? measurementRevision(old) + 1 : 1, lastMutationId: mutationId }
        if (photo) await database.photos.add({ ...photo, id: photoId!, profileId, role: 'progress', createdAt: now })
        await database.measurements.put(result)
        await database.profiles.put({ ...profile, revision: profile.revision + 1, updatedAt: now })
        if (old?.photoId !== photoId) await removeUnusedPhoto(database, profileId, old?.photoId)
        return result
      })
    },
    async remove(profileId: string, id: string, expectedRevision: number) {
      return database.transaction('rw', tables, async () => {
        const profile = await owner(profileId), old = await database.measurements.get([profileId, id])
        if (!old) return
        check(old, expectedRevision)
        await database.measurements.delete([profileId, id])
        await removeUnusedPhoto(database, profileId, old.photoId)
        await database.profiles.put({ ...profile, revision: profile.revision + 1, updatedAt: new Date().toISOString() })
      })
    },
  }
}
export const measurements = measurementService(db)

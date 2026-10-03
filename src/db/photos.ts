import type { BorosDatabase } from './database.ts'

// Call inside a transaction containing profiles, measurements, and photos.
// References, not the asset's original role, decide whether it is still needed.
export async function removeUnusedPhoto(database: BorosDatabase, profileId: string, id?: string) {
  if (!id) return
  if ((await database.profiles.get(profileId))?.photoId === id) return
  if (await database.measurements.where('profileId').equals(profileId).filter((entry) => entry.photoId === id).count()) return
  await database.photos.delete([profileId, id])
}

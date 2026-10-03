import type { BackupData, BackupManifest } from '../../schemas/backup.ts'
import type { PhotoAsset } from '../../schemas/profile.ts'

export const RESTORE_LIMITS = Object.freeze({ compressed: 64 * 1024 * 1024, expanded: 128 * 1024 * 1024, entries: 4096, entry: 32 * 1024 * 1024, manifest: 2 * 1024 * 1024, asset: 5 * 1024 * 1024 })
export interface ValidatedBackup { data: BackupData; manifest: BackupManifest; photos: PhotoAsset[] }
export async function decodeBackupPhoto(photo: PhotoAsset) {
  const bitmap = await createImageBitmap(photo.blob)
  try { if (bitmap.width !== photo.width || bitmap.height !== photo.height) throw new Error(`Photo dimensions do not match: ${photo.id}`) } finally { bitmap.close() }
}

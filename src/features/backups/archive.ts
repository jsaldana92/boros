import JSZip from 'jszip'
import { BACKUP_VERSION, SNAPSHOT_POLICY, manifestSchema, recordCounts, validateBackupData, type BackupData, type BackupManifest, type ProfileSnapshot } from '../../schemas/backup.ts'
import { csvTables } from './csv.ts'
import { sha256 } from './integrity.ts'
export { sha256 } from './integrity.ts'

export const exclusions = ['Other profiles and their records/assets', 'Browser-wide appearance, sound and storage-notice preference and active-profile selection', 'Navigation/sessionStorage, unsaved editor forms, unapplied notes and pending/failed autosaves', 'Active rest timers, interval/tick state and object URLs', 'Credentials, environment/configuration files and machine paths', 'Generated calendar occurrences (reconstruct from schedules and retained session identities)']
const encode = (value: string) => new TextEncoder().encode(value)
export function backupFilename(name: string, exportedAt: string) {
  const safe = name.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'profile'
  return `Boros-${safe}-${exportedAt.replace(/[:.]/g, '-')}.zip`
}
// For archives just generated here; not an untrusted-upload validator or restore API.
export async function validateGeneratedArchive(bytes: Uint8Array, expected: BackupManifest, canonicalText: string, progress: (message: string) => void = () => {}) {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const actual: BackupManifest = JSON.parse(await zip.file('manifest.json')!.async('string')); manifestSchema.parse(actual)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Generated manifest did not match the snapshot.')
  const paths = Object.keys(zip.files).sort(), expectedPaths = ['manifest.json', ...actual.inventory.map((item) => item.path)].sort()
  if (new Set(expectedPaths).size !== expectedPaths.length || JSON.stringify(paths) !== JSON.stringify(expectedPaths)) throw new Error('Generated file inventory did not match the manifest.')
  for (const [index, item] of actual.inventory.entries()) {
    progress(`Validating archive files ${index + 1}/${actual.inventory.length}`)
    const content = await zip.file(item.path)!.async('uint8array')
    if (content.byteLength !== item.bytes || await sha256(content) !== item.sha256) throw new Error(`Generated file failed checksum: ${item.path}`)
  }
  const text = await zip.file('data.json')!.async('string')
  if (text !== canonicalText) throw new Error('Generated canonical data did not match the snapshot.')
  const data: BackupData = JSON.parse(text); validateBackupData(data)
  if (JSON.stringify(recordCounts(data)) !== JSON.stringify(actual.counts)) throw new Error('Generated record counts did not match the snapshot.')
  return actual
}
export async function generateBackup(snapshot: ProfileSnapshot, appVersion: string, progress: (message: string) => void = () => {}) {
  progress('Validating saved records and references')
  if (![5, 6, 7].includes(snapshot.databaseVersion)) throw new Error('This database version is not supported by backup schema 13. Update Boros before exporting.')
  const { databaseVersion: _databaseVersion, capturedAt: _capturedAt, photos, ...records } = snapshot
  const data: BackupData = { format: 'boros-profile-backup', backupSchemaVersion: BACKUP_VERSION, ...records, deletedSources: records.deletedSources ?? [], workouts: records.workouts ?? [], assets: photos.map(({ blob, ...asset }) => ({ ...asset, mediaType: blob.type as 'image/jpeg' | 'image/png' | 'image/webp', bytes: blob.size, path: `photos/${asset.id}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1]}` })) }
  validateBackupData(data)
  const canonicalText = JSON.stringify(data, null, 2), payload = new Map<string, { bytes: Uint8Array; mediaType: string }>()
  payload.set('data.json', { bytes: encode(canonicalText), mediaType: 'application/json' })
  progress('Preparing readable CSV tables')
  const tables = csvTables(data)
  for (const table of tables) payload.set(table.path, { bytes: encode(table.text), mediaType: 'text/csv; charset=utf-8' })
  for (const [index, photo] of photos.entries()) {
    progress(`Reading photo bytes ${index + 1}/${photos.length}`)
    payload.set(data.assets[index].path, { bytes: new Uint8Array(await photo.blob.arrayBuffer()), mediaType: photo.blob.type })
  }
  const inventory: BackupManifest['inventory'] = []
  for (const [path, file] of payload) { progress(`Hashing payload ${inventory.length + 1}/${payload.size}`); inventory.push({ path, bytes: file.bytes.byteLength, mediaType: file.mediaType, sha256: await sha256(file.bytes) }) }
  const manifest: BackupManifest = {
    format: 'boros-profile-backup', backupSchemaVersion: BACKUP_VERSION, databaseSchemaVersion: 7, app: { name: 'boros', version: appVersion }, exportedAt: new Date().toISOString(), snapshotAt: snapshot.capturedAt,
    profile: { id: data.profile.id, name: data.profile.name, kind: data.profile.kind }, snapshotPolicy: SNAPSHOT_POLICY,
    counts: recordCounts(data), csvRows: Object.fromEntries(tables.map((item) => [item.path, item.rows])),
    authoritative: ['data.json', 'manifest.json', 'photos/'], checksum: 'SHA-256 of every payload file as uncompressed bytes; manifest.json is excluded. Integrity only, not authenticity.', exclusions,
    inventory, assets: data.assets.map((asset) => ({ ...asset, sha256: inventory.find((item) => item.path === asset.path)!.sha256 })),
  }
  manifestSchema.parse(manifest)
  const zip = new JSZip()
  for (const [path, file] of payload) zip.file(path, file.bytes, { createFolders: false, compression: path.startsWith('photos/') ? 'STORE' : 'DEFLATE', date: new Date(manifest.exportedAt) })
  zip.file('manifest.json', JSON.stringify(manifest, null, 2), { createFolders: false, date: new Date(manifest.exportedAt) })
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } }, ({ percent }) => progress(`Compressing archive: ${Math.floor(percent)}%`))
  await validateGeneratedArchive(bytes, manifest, canonicalText, progress)
  return { bytes, filename: backupFilename(data.profile.name, manifest.exportedAt), manifest }
}

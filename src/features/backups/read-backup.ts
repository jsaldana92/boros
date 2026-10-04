import JSZip from 'jszip'
import Papa from 'papaparse'
import { manifestSchema, recordCounts, validateBackupData, type BackupData, type BackupManifest } from '../../schemas/backup.ts'
import type { PhotoAsset } from '../../schemas/profile.ts'
import { sha256 } from './integrity.ts'
import { RESTORE_LIMITS, decodeBackupPhoto, type ValidatedBackup } from './restore-format.ts'
export { RESTORE_LIMITS, decodeBackupPhoto, type ValidatedBackup } from './restore-format.ts'
import { csvTables } from './csv.ts'
import { validateRestoreRecords } from './restore-records.ts'

const decoder = new TextDecoder('utf-8', { fatal: true })
const fail = (message: string): never => { throw new Error(message) }
const limitFor = (path: string) => path === 'manifest.json' ? RESTORE_LIMITS.manifest : path.startsWith('photos/') ? RESTORE_LIMITS.asset : RESTORE_LIMITS.entry

// Inspect raw directory AND local names before JSZip can sanitize paths or collapse
// duplicate entries. Only the classic, single-disk ZIP subset emitted by Boros is accepted.
export function inspectZip(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > RESTORE_LIMITS.compressed) fail('Choose a Boros ZIP up to 64 MiB.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at: number) => view.getUint16(at, true), u32 = (at: number) => view.getUint32(at, true)
  let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557) && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)) end--
  if (end < 0 || end < bytes.length - 65557) fail('Invalid ZIP directory. Choose an original Boros export.')
  const count = u16(end + 10), offset = u32(end + 16), size = u32(end + 12)
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || count === 65535 || offset + size !== end) fail('Unsupported ZIP layout (ZIP64, split or damaged archive). Choose an original Boros export.')
  if (!count || count > RESTORE_LIMITS.entries) fail('Archive exceeds the 4,096 entry limit.')
  let cursor = offset, expanded = 0, localEnd = 0
  const entries: { path: string; bytes: number; crc: number }[] = [], seen = new Set<string>()
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) fail('Invalid ZIP entry directory.')
    const flags = u16(cursor + 8), method = u16(cursor + 10), crc = u32(cursor + 16), compressed = u32(cursor + 20), length = u32(cursor + 24)
    const nameLength = u16(cursor + 28), extra = u16(cursor + 30), comment = u16(cursor + 32), local = u32(cursor + 42)
    if (cursor + 46 + nameLength + extra + comment > end) fail('Truncated ZIP directory.')
    const path = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)), normalized = path.normalize('NFKC').toLowerCase()
    if (seen.has(normalized)) fail(`Duplicate or ambiguous ZIP path: ${path}`)
    seen.add(normalized)
    if (!/^(?:manifest\.json|data\.json|csv\/[a-z_]+\.csv|photos\/[0-9a-f-]{36}\.(?:jpg|png|webp))$/.test(path)) fail(`Unsafe or unsupported ZIP path: ${path}`)
    if (extra || flags & ~0x800 || ![0, 8].includes(method) || u16(cursor + 34) || (u32(cursor + 38) & 0x10) || ((u32(cursor + 38) >>> 16) & 0xf000) === 0xa000) fail('Unsupported ZIP entry features. Use the original Boros ZIP, without repackaging it.')
    if (length > limitFor(path) || (expanded += length) > RESTORE_LIMITS.expanded) fail(`Expanded archive size limit exceeded: ${path}`)
    if (local !== localEnd || local + 30 > offset || u32(local) !== 0x04034b50) fail('Overlapping, hidden or invalid ZIP local entries.')
    const localNameLength = u16(local + 26), localExtra = u16(local + 28), start = local + 30 + localNameLength + localExtra
    if (localExtra || start + compressed > offset || u16(local + 6) !== flags || u16(local + 8) !== method || u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== length || decoder.decode(bytes.subarray(local + 30, start)) !== path) fail('ZIP local entry disagrees with its directory.')
    localEnd = start + compressed; entries.push({ path, bytes: length, crc }); cursor += 46 + nameLength + extra + comment
  }
  if (cursor !== end || localEnd !== offset) fail('ZIP contains unlisted data.')
  return entries
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => { let c = index; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
async function boundedRead(file: JSZip.JSZipObject, limit: number, consume: (length: number) => void) {
  // JSZip's public types omit this documented ZipObject API.
  const stream = (file as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array')
  return new Promise<{ bytes: Uint8Array; crc: number }>((resolve, reject) => {
    const chunks: Uint8Array[] = []; let length = 0, crc = 0xffffffff, stopped = false
    stream.on('data', (chunk) => {
      if (stopped) return
      try {
        length += chunk.length; if (length > limit) fail(`Actual decompressed size limit exceeded: ${file.name}`)
        consume(chunk.length); chunks.push(chunk)
        for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
      } catch (error) { stopped = true; stream.pause(); reject(error) }
    }).on('error', reject).on('end', () => {
      if (stopped) return
      const bytes = new Uint8Array(length); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      resolve({ bytes, crc: (crc ^ 0xffffffff) >>> 0 })
    }).resume()
  })
}

export async function readBackup(bytes: Uint8Array, progress: (message: string) => void = () => {}, decodePhoto = decodeBackupPhoto): Promise<ValidatedBackup> {
  progress('Checking ZIP paths and limits')
  const directory = inspectZip(bytes), zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false })
  if (Object.keys(zip.files).length !== directory.length) fail('ZIP entries are ambiguous.')
  const payload = new Map<string, Uint8Array>(); let expanded = 0
  for (const entry of directory) {
    progress(`Validating file ${payload.size + 1}/${directory.length}`)
    const file = zip.file(entry.path); if (!file) fail(`Missing ZIP entry: ${entry.path}`)
    const result = await boundedRead(file!, limitFor(entry.path), (length) => { expanded += length; if (expanded > RESTORE_LIMITS.expanded) fail('Actual decompressed archive exceeds 128 MiB.') })
    if (result.bytes.length !== entry.bytes || result.crc !== entry.crc) fail(`ZIP size or CRC mismatch: ${entry.path}`)
    payload.set(entry.path, result.bytes)
  }
  const json = (path: string) => { const value = payload.get(path); if (!value) fail(`Missing ${path}. Choose a Boros backup ZIP, not an AI import.`); try { return JSON.parse(decoder.decode(value)) } catch { return fail(`Invalid JSON in ${path}.`) } }
  const manifest = json('manifest.json') as BackupManifest, data = json('data.json') as BackupData
  for (const record of [manifest, data]) if (![1, 2, 3, 4].includes(record?.backupSchemaVersion) || record?.format !== 'boros-profile-backup') fail('Unsupported backup version or format. Update Boros to a version supporting this file, or choose a schema 1, 2, 3 or 4 Boros export.')
  if (manifest.backupSchemaVersion !== data.backupSchemaVersion) fail('Manifest and data backup versions disagree.')
  if (manifest.databaseSchemaVersion !== 5) fail('Unsupported database schema in backup. Update Boros or choose a database v5 export.')
  const validated = manifestSchema.safeParse(manifest)
  if (!validated.success) { const issue = validated.error.issues[0]; fail(`Invalid manifest ${issue.path.join('.')}: ${issue.message}`) }
  const inventory = new Map(manifest.inventory.map((item) => [item.path, item]))
  if (inventory.size !== manifest.inventory.length || inventory.size + 1 !== payload.size || inventory.has('manifest.json')) fail('Manifest inventory is ambiguous or incomplete.')
  for (const item of inventory.values()) {
    const content = payload.get(item.path)
    if (!content || content.length !== item.bytes || await sha256(content) !== item.sha256) fail(`Missing file, size or checksum failure: ${item.path}`)
  }
  validateBackupData(data); validateRestoreRecords(data)
  const counts = recordCounts(data)
  if (JSON.stringify(Object.keys(manifest.counts).sort()) !== JSON.stringify(Object.keys(counts).sort()) || Object.entries(counts).some(([key, count]) => manifest.counts[key] !== count)) fail('Manifest record counts disagree with canonical data.')
  if (manifest.profile.id !== data.profile.id || manifest.profile.name !== data.profile.name || manifest.profile.kind !== data.profile.kind) fail('Manifest profile disagrees with canonical data.')
  const tables = csvTables(data), expectedPaths = ['data.json', ...tables.map((item) => item.path), ...data.assets.map((item) => item.path)].sort()
  if (JSON.stringify([...inventory.keys()].sort()) !== JSON.stringify(expectedPaths)) fail('Archive file inventory does not match the supported contract.')
  if (Object.keys(manifest.csvRows).length !== tables.length || tables.some((table) => manifest.csvRows[table.path] !== table.rows)) fail('CSV row counts disagree with canonical data.')
  for (const table of tables) {
    const parsed = Papa.parse(decoder.decode(payload.get(table.path)!), { header: true })
    if (parsed.errors.length || parsed.data.length !== manifest.csvRows[table.path]) fail(`Invalid CSV structure or row count: ${table.path}`)
  }
  // CSVs are integrity-checked but never used to reconstruct records.
  if (manifest.assets.length !== data.assets.length) fail('Asset inventory disagrees with canonical data.')
  const photos: PhotoAsset[] = []
  for (const asset of data.assets) {
    const listed = manifest.assets.find((item) => item.id === asset.id), entry = inventory.get(asset.path)
    if (!listed || !entry || Object.entries(asset).some(([key, value]) => listed[key as keyof typeof listed] !== value) || listed.sha256 !== entry.sha256 || entry.bytes !== asset.bytes || entry.mediaType !== asset.mediaType) fail(`Photo inventory mismatch: ${asset.id}`)
    const { path, bytes: _bytes, mediaType, ...metadata } = asset
    const content = payload.get(path)!, signature = [...content.subarray(0, 12)]
    const supported = mediaType === 'image/png' ? signature.slice(0, 8).join() === '137,80,78,71,13,10,26,10' : mediaType === 'image/jpeg' ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255 : decoder.decode(content.subarray(0, 4)) === 'RIFF' && decoder.decode(content.subarray(8, 12)) === 'WEBP'
    if (!supported) fail(`Photo type does not match its bytes: ${asset.id}`)
    const photo = { ...metadata, blob: new Blob([new Uint8Array(content).buffer], { type: mediaType }) }
    progress(`Decoding photo ${photos.length + 1}/${data.assets.length}`); await decodePhoto(photo); photos.push(photo)
  }
  // Only after original archive integrity, v1 field/reference checks, CSVs and
  // original assets pass. Never add a duration/group or mutate the source ZIP.
  const compatible = data.backupSchemaVersion !== 4 ? { ...structuredClone(data), backupSchemaVersion: 4 as const } : data
  validateBackupData(compatible)
  return { data: compatible, manifest, photos }
}

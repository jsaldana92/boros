import { generateBackup } from './archive.ts'
import type { ProfileSnapshot } from '../../schemas/backup.ts'

self.onmessage = async (event: MessageEvent<{ snapshot: ProfileSnapshot; appVersion: string }>) => {
  try {
    const result = await generateBackup(event.data.snapshot, event.data.appVersion, (message) => self.postMessage({ kind: 'progress', message }))
    self.postMessage({ kind: 'ready', filename: result.filename, blob: new Blob([new Uint8Array(result.bytes).buffer], { type: 'application/zip' }) })
  } catch (error) { self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : 'Archive preparation failed.' }) }
}

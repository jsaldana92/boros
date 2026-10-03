import { readBackup } from './read-backup.ts'

self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try {
    const backup = await readBackup(event.data, (message) => self.postMessage({ kind: 'progress', message }))
    self.postMessage({ kind: 'ready', backup })
  } catch (error) { self.postMessage({ kind: 'error', message: (error as Error).message }) }
}

import { expect, test } from '@playwright/test'

test('native IndexedDB supports a Blob round trip independently of Boros services', async ({ page }) => {
  await page.goto('./')
  const result = await page.evaluate(async () => {
    const name = `boros-test-engine-${crypto.randomUUID()}`
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name, 1)
      r.onupgradeneeded = () => r.result.createObjectStore('probe')
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('probe', 'readwrite')
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)
        tx.objectStore('probe').put(new Blob(['local bytes'], { type: 'image/png' }), 'asset')
      })
      const blob = await new Promise<Blob>((resolve, reject) => {
        const r = db.transaction('probe').objectStore('probe').get('asset')
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error)
      })
      return { text: await blob.text(), type: blob.type }
    } catch (error) { return { error: `${(error as Error).name}: ${(error as Error).message}` } }
    finally { db.close(); indexedDB.deleteDatabase(name) }
  })
  // This is intentionally not skipped on Windows WebKit: its Blob storage
  // failure is a tracked verification blocker, not a passing photo check.
  expect(result).toEqual({ text: 'local bytes', type: 'image/png' })
})

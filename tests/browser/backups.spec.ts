import { confirmDownload } from './settings-actions'
import { closeTimer } from './train-actions'
import 'fake-indexeddb/auto'
import { expect, test, type Page, type Download } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { BorosDatabase } from '../../src/db/database'
import { representativeProfile, strangeText } from '../fixtures/backup-profile'

test.setTimeout(90000)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function seed(page: Page) {
  const database = new BorosDatabase(`boros-test-browser-export-${crypto.randomUUID()}`)
  try {
    const fixture = await representativeProfile(database)
    const stores = await Promise.all(database.tables.map(async (table) => ({ name: table.name, records: await Promise.all((await table.toArray()).map(async (record) => record.blob ? { ...record, blob: undefined, image: { type: record.blob.type, bytes: Array.from(new Uint8Array(await record.blob.arrayBuffer())) } } : record)) })))
    await page.goto('./'); await button(page, 'Settings').click(); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible(); const notice = button(page, 'Understood'); if (await notice.isVisible()) await notice.click()
    await page.evaluate(async (stores) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(stores.map((store) => store.name), 'readwrite')
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = (event) => reject((event.target as IDBRequest).error ?? tx.error)
        for (const store of stores) for (const item of store.records) { const { image, ...record } = item; if (image) record.blob = new Blob([new Uint8Array(image.bytes)], { type: image.type }); if (store.name === 'settings') record.noticeAccepted = true; tx.objectStore(store.name).put(record) }
      }); db.close()
    }, stores)
    await page.reload(); await expect(page.getByLabel('Active profile')).toHaveValue(fixture.id)
    return fixture
  } finally { await database.delete() }
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result) })
    const names = [...db.objectStoreNames], tx = db.transaction(names, 'readonly')
    const stores = await Promise.all(names.map((name) => new Promise<{ name: string; records: Record<string, unknown>[] }>((resolve) => { const request = tx.objectStore(name).getAll(); request.onsuccess = () => resolve({ name, records: request.result }) })))
    db.close(); return Promise.all(stores.map(async (store) => ({ ...store, records: await Promise.all(store.records.map(async (record) => record.blob instanceof Blob ? { ...record, blob: { type: record.blob.type, bytes: Array.from(new Uint8Array(await record.blob.arrayBuffer())) } } : record)) })))
  })
}
async function archive(download: Download) {
  expect(download.suggestedFilename()).toMatch(/^Boros-.+-\d{4}-.*\.zip$/); expect(download.suggestedFilename()).not.toMatch(/[\\/:*?"<>|]/)
  const zip = await JSZip.loadAsync(await readFile((await download.path())!), { checkCRC32: true })
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')), data = JSON.parse(await zip.file('data.json')!.async('string'))
  expect(Object.keys(zip.files).sort()).toEqual(['manifest.json', ...manifest.inventory.map((item) => item.path)].sort())
  for (const item of manifest.inventory) { const bytes = await zip.file(item.path)!.async('uint8array'); expect(bytes.byteLength).toBe(item.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256) }
  return { zip, manifest, data }
}
async function download(page: Page) { const ready = page.waitForEvent('download', { timeout: 15000 }); await confirmDownload(page); return archive(await ready) }

test('Settings downloads complete isolated archives with truthful feedback, unchanged records, two profiles and both themes', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
  const fixture = await seed(page), before = await records(page), address = page.url()
  const { zip, data, manifest } = await download(page)
  await expect(page.getByText('Download started for', { exact: false })).toContainText('cannot confirm that the file was saved')
  expect(data.profile.id).toBe(fixture.id); expect(manifest.counts).toEqual({ profiles: 1, tags: 2, exercises: 2, plans: 1, schedules: 1, drafts: 3, sessions: 2, measurements: 3, assets: 2, outcomes: 0, excludedWeeks: 0 })
  expect(data.exercises.find((e) => e.id === fixture.exercise.id).instructions).toBe(strangeText)
  for (const store of before.filter((s) => !['profiles', 'settings', 'photos', 'restTimers'].includes(s.name))) expect(data[store.name]).toEqual(store.records.filter((r) => r.profileId === fixture.id))
  for (const asset of data.assets) { const source = before.find((s) => s.name === 'photos')!.records.find((r) => r.id === asset.id)!; expect(Array.from(await zip.file(asset.path)!.async('uint8array'))).toEqual((source.blob as { bytes: number[] }).bytes) }
  expect(await records(page)).toEqual(before); expect(page.url()).toBe(address)
  await button(page, 'Download').focus(); await page.screenshot({ path: testInfo.outputPath('export-dark.png'), fullPage: true })
  await button(page, 'Light').click(); await page.getByLabel('Active profile').selectOption(fixture.otherId)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const second = await download(page); expect(second.data.profile.id).toBe(fixture.otherId); expect(second.data.plans).toHaveLength(0); expect(JSON.stringify(second.data)).not.toContain(fixture.id)
  await page.setViewportSize({ width: 320, height: 720 }); await page.addStyleTag({ content: 'html { font-size: 24px; }' }); await button(page, 'Download').focus()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const box = await button(page, 'Download').boundingBox(), nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y)
  await page.screenshot({ path: testInfo.outputPath('export-light-large-text.png'), fullPage: true }); expect(errors).toEqual([])
})

test('saved-data acknowledgement, unsaved Settings edits, missing assets and worker failures never claim a successful download', async ({ page }) => {
  const fixture = await seed(page); let downloads = 0; page.on('download', () => downloads++)
  await button(page, 'Download').click(); await expect(page.getByRole('dialog', { name: 'Downloading data' })).toContainText('The resulting ZIP file is not password protected.'); await button(page, 'Cancel').click(); expect(downloads).toBe(0)
  await page.locator('input[name="name"]').fill('Unsaved name'); await confirmDownload(page); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('unsaved Settings edits'); await button(page, 'Cancel').click()
  page.once('dialog', (dialog) => dialog.accept()); await button(page, 'Reload saved profile').click()
  await page.evaluate(async ({ id, entry }) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result) })
    await new Promise<void>((resolve) => { const tx = db.transaction('measurements', 'readwrite'); tx.oncomplete = () => resolve(); const store = tx.objectStore('measurements'), request = store.get([id, entry.id]); request.onsuccess = () => store.put({ ...request.result, photoId: crypto.randomUUID() }) }); db.close()
  }, fixture)
  const before = await records(page); await confirmDownload(page); await expect(page.getByRole('alert')).toContainText('requires missing photo'); await expect(page.getByRole('alert')).toContainText('No download was started'); expect(await records(page)).toEqual(before)
  await page.evaluate(() => { window.Worker = class { constructor() { throw new Error('Simulated worker failure') } } as unknown as typeof Worker })
  await confirmDownload(page); await expect(page.getByRole('alert')).toContainText('Simulated worker failure'); expect(downloads).toBe(0)
})

test('duplicate clicks, cancel, profile switching and navigation cannot retarget a delayed export; download URLs are revoked', async ({ page }) => {
  const fixture = await seed(page)
  await page.evaluate(() => {
    const Original = window.Worker; (window as unknown as { releaseExport: () => void }).releaseExport = () => {}
    window.Worker = class extends Original {
      postMessage(...args: Parameters<Worker['postMessage']>) { (window as unknown as { releaseExport: () => void }).releaseExport = () => super.postMessage(...args) }
    }
  })
  let downloads = 0; page.on('download', () => downloads++)
  await button(page, 'Download').click(); await button(page, 'I understand (Download)').evaluate((element) => { element.click(); element.click() })
  await expect(button(page, 'Preparing export…')).toBeDisabled(); await button(page, 'Cancel export').click(); await expect(page.getByText('Export canceled.', { exact: false })).toBeVisible()
  await confirmDownload(page); await expect(button(page, 'Preparing export…')).toBeDisabled(); await page.getByLabel('Active profile').selectOption(fixture.otherId)
  await expect(page.locator('input[name=name]')).toHaveValue('Other private profile'); await page.evaluate(() => (window as unknown as { releaseExport: () => void }).releaseExport())
  await confirmDownload(page); await expect(button(page, 'Preparing export…')).toBeDisabled(); await button(page, 'Train').click(); await button(page, 'Settings').click(); expect(downloads).toBe(0)
  await page.reload(); await page.clock.install()
  await page.evaluate(() => { const create = URL.createObjectURL, revoke = URL.revokeObjectURL, tracked = { created: [] as string[], revoked: [] as string[] }; (window as unknown as { tracked: typeof tracked }).tracked = tracked; URL.createObjectURL = (blob) => { const url = create(blob); if (blob instanceof Blob && blob.type === 'application/zip') tracked.created.push(url); return url }; URL.revokeObjectURL = (url) => { tracked.revoked.push(url); revoke(url) } })
  const result = await download(page); expect(result.data.profile.id).toBe(fixture.otherId); await page.clock.fastForward(61000)
  expect(await page.evaluate(() => { const tracked = (window as unknown as { tracked: { created: string[]; revoked: string[] } }).tracked; return tracked.created.length === 1 && tracked.created.every((url) => tracked.revoked.includes(url)) })).toBe(true)
})

test('another tab with a failed training autosave is explicitly excluded while persisted draft input is exported', async ({ page, context }) => {
  const fixture = await seed(page), other = await context.newPage(); await other.goto('./'); await button(other, 'Train').click(); await other.getByRole('button', { name: /^Resume Plan 雪 \/ Day 3/ }).click()
  await closeTimer(other)
  await other.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts') throw new DOMException('Pending data not saved', 'QuotaExceededError'); return original.apply(this, args) } })
  await other.getByLabel('=Range 雪 set 1 Weight (lb)', { exact: true }).fill('999'); await expect(other.getByRole('alert')).toContainText('Pending data not saved')
  await expect(page.getByText('Only committed records are included.', { exact: false })).toHaveCount(0)
  const result = await download(page), draft = result.data.drafts.find((d) => d.id === fixture.savedDraft.id)
  expect(draft.input.exercises[0].sets[0].load).toBe('12.'); expect(result.manifest.snapshotPolicy).toContain('pending/failed autosaves'); await expect(other.getByLabel('=Range 雪 set 1 Weight (lb)', { exact: true })).toHaveValue('999')
})

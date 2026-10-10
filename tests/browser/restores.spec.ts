import { runPage } from './calendar-actions'
import { waitForDraft, closeTimer } from './train-actions'
import 'fake-indexeddb/auto'
import { expect, test, type Page } from './strength-test'
import JSZip from 'jszip'
import { BorosDatabase } from '../../src/db/database'
import { captureProfile } from '../../src/db/backups'
import { generateBackup, sha256 } from '../../src/features/backups/archive'
import { representativeProfile } from '../fixtures/backup-profile'

test.setTimeout(90000)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function fixture(page: Page, seed = true) {
  const db = new BorosDatabase(`boros-test-browser-restore-${crypto.randomUUID()}`)
  try {
    const f = await representativeProfile(db), source = await captureProfile(f.id, db)
    const addLog = (label: string) => {
      const draft = structuredClone(source.drafts.find((d) => d.finalizedAt)!), session = structuredClone(source.sessions.find((s) => s.id === draft.id)!), id = crypto.randomUUID()
      for (const record of [draft, session]) { record.id = id; delete record.occurrence; delete record.occurrenceKey }
      draft.input.notes = label; session.notes = label; session.draftId = id
      return { draft, session }
    }
    const importedLog = addLog('Only in imported history'), localLog = addLog('Only in device history')
    source.drafts.push(importedLog.draft); source.sessions.push(importedLog.session)
    source.drafts.find((d) => !d.finalizedAt)!.input.notes = 'Imported draft notes'
    source.profile.age = null; source.profile.heightCm = null
    const bytes = (await generateBackup(source, 'test')).bytes
    await db.drafts.put(localLog.draft); await db.sessions.put(localLog.session)
    await db.drafts.update([f.id, f.savedDraft.id], { input: { ...f.savedDraft.input, notes: 'Device draft notes' } })
    const stores = await Promise.all(db.tables.map(async (table) => ({ name: table.name, records: await Promise.all((await table.toArray()).map(async (record) => record.blob ? { ...record, blob: undefined, image: { type: record.blob.type, bytes: [...new Uint8Array(await record.blob.arrayBuffer())] } } : record)) })))
    await page.goto('./'); await button(page, 'Settings').click(); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible(); if (await button(page, 'Understood').isVisible()) await button(page, 'Understood').click()
    if (seed) {
      await page.evaluate(async (stores) => {
        const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result) })
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(stores.map((s) => s.name), 'readwrite'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = (event) => reject((event.target as IDBRequest).error ?? tx.error)
          for (const store of stores) for (const item of store.records) { const { image, ...record } = item; if (image) record.blob = new Blob([new Uint8Array(image.bytes)], { type: image.type }); if (store.name === 'settings') record.noticeAccepted = true; tx.objectStore(store.name).put(record) }
        }); db.close()
      }, stores)
      await page.reload(); await expect(page.getByLabel('Active profile')).toHaveValue(f.id)
    }
    return { ...f, bytes: Buffer.from(bytes), importedLog: importedLog.session.id, localLog: localLog.session.id }
  } finally { await db.delete() }
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('boros'); req.onsuccess = () => resolve(req.result) }), names = [...db.objectStoreNames], tx = db.transaction(names, 'readonly')
    const tables = await Promise.all(names.map((name) => new Promise<{ name: string; records: Record<string, any>[] }>((resolve) => { const req = tx.objectStore(name).getAll(); req.onsuccess = () => resolve({ name, records: req.result }) }))); db.close()
    return Promise.all(tables.map(async (table) => ({ ...table, records: await Promise.all(table.records.map(async (r) => r.blob ? { ...r, blob: { type: r.blob.type, bytes: [...new Uint8Array(await r.blob.arrayBuffer())] } } : r)) })))
  })
}
const scoped = (tables: Awaited<ReturnType<typeof records>>, id: string) => tables.filter((t) => t.name !== 'settings').map((t) => ({ name: t.name, records: t.records.filter((r) => r.profileId === id || t.name === 'profiles' && r.id === id) }))
const table = (tables: Awaited<ReturnType<typeof records>>, name: string) => tables.find((t) => t.name === name)!.records
async function upload(page: Page, bytes: Buffer) { await page.getByLabel('Backup ZIP', { exact: true }).setInputFiles({ name: 'Boros-fixture.zip', mimeType: 'application/zip', buffer: bytes }); await expect(page.getByRole('heading', { name: /^Validated backup:/ })).toBeVisible({ timeout: 20000 }) }
async function preview(page: Page, choice?: string) { if (choice) await page.getByLabel('Import choice').selectOption(choice); await button(page, 'Preview import').click(); await expect(page.getByRole('region', { name: 'Restore preview' })).toBeVisible() }
async function confirm(page: Page) { await page.getByRole('checkbox', { name: /^I confirm/ }).check(); await button(page, 'Confirm and save').evaluate((element) => { element.click(); element.click() }); await expect(page.getByText(/Changes are saved locally\./)).toBeVisible(); return page.getByLabel('Active profile').inputValue() }

test('new profile and rename restore recover photos, null fields, saved drafts/history/schedules and survive reload in both themes', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message))
  const f = await fixture(page, false), before = await records(page), url = page.url()
  await upload(page, f.bytes); await expect(page.getByText('No name match.', { exact: false })).toBeVisible(); await preview(page)
  expect(await records(page)).toEqual(before)
  await expect(page.getByRole('heading', { name: /^Import under a new name:/ })).toBeFocused()
  await page.setViewportSize({ width: 320, height: 740 }); await button(page, 'Confirm and save').focus()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('restore-preview-dark.png'), fullPage: true })
  const id = await confirm(page); expect(id).not.toBe(f.id); await expect(page.locator('.avatar img').first()).toBeVisible()
  await expect(page.getByLabel('Age (optional)')).toHaveValue(''); await expect(page.getByLabel('Height (feet)')).toHaveValue('')
  await page.reload(); await expect(page.getByLabel('Active profile')).toHaveValue(id)
  await button(page, 'Train').click(); await expect(page.getByRole('region',{name:'Training session',exact:true})).toBeVisible(); await waitForDraft(page)
  await expect(page.getByRole('textbox', { name: /set 1 Weight/ }).first()).toHaveValue('12.')
  await page.reload(); await button(page, 'Calendar').click(); await runPage(page); await page.getByRole('article', { name: /^Run/ }).first().getByRole('button').click(); await expect(page.getByRole('dialog')).not.toContainText('America/New_York'); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await button(page, 'Progress').click(); await page.locator('.weight-point').first().click(); await expect(page.getByRole('dialog').getByRole('img')).toBeVisible(); await button(page, 'Close').click()
  await button(page, 'Settings').click(); await button(page, 'Light').click(); await upload(page, f.bytes)
  await page.getByLabel('Import choice').selectOption('new'); await page.getByLabel('Imported profile name').fill('Renamed copy'); await preview(page)
  await page.addStyleTag({ content: 'html { font-size: 24px; }' }); await button(page, 'Confirm and save').focus(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const box = await button(page, 'Confirm and save').boundingBox(), nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y)
  await page.screenshot({ path: testInfo.outputPath('restore-preview-light-large-text.png'), fullPage: true }); const renamed = await confirm(page)
  expect(renamed).not.toBe(id); const after = await records(page); expect(table(after, 'profiles')).toHaveLength(3); expect(table(after, 'sessions').filter((s) => s.profileId === renamed)).toHaveLength(3); expect(page.url()).toBe(url); expect(errors).toEqual([])
})

for (const choice of ['device', 'import', 'replace']) test(`${choice} choice shows matching scope and whole-family consequences without touching the other profile`, async ({ page }) => {
  const f = await fixture(page), before = await records(page), other = scoped(before, f.otherId)
  await upload(page, f.bytes); await expect(page.getByLabel('Import choice').locator('option')).toHaveText(['Replace this profile', 'Merge — prefer this device', 'Merge — prefer imported file', 'Import under a new name'])
  await preview(page, choice); await expect(page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'sessions', exact: true }) })).toContainText('3')
  await button(page, 'Confirm and save').click(); await expect(page.getByRole('alert')).toContainText('Confirm the reviewed'); expect(await records(page)).toEqual(before)
  await button(page, 'Cancel').click(); expect(await records(page)).toEqual(before)
  await upload(page, f.bytes); await preview(page, choice); const id = await confirm(page), after = await records(page)
  expect(id).not.toBe(f.id); expect(scoped(after, f.otherId)).toEqual(other)
  const logs = table(after, 'sessions').filter((s) => s.profileId === id)
  expect(logs.some((s) => s.id === f.localLog)).toBe(choice === 'device'); expect(logs.some((s) => s.id === f.importedLog)).toBe(choice !== 'device')
  expect(table(after, 'drafts').find((d) => d.profileId === id && d.id === f.savedDraft.id)!.input.notes).toBe(choice === 'device' ? 'Device draft notes' : 'Imported draft notes')
  await page.reload(); await expect(page.getByLabel('Active profile')).toHaveValue(id); expect(scoped(await records(page), f.otherId)).toEqual(other)
})

test('clear cancellation and confirmation, failure rollback and stale preview recovery are explicit', async ({ page }) => {
  const f = await fixture(page), original = await records(page), other = scoped(original, f.otherId)
  await button(page, 'Clear data').click(); await expect(page.getByRole('region', { name: 'Restore preview' })).toContainText('Download data above'); await button(page, 'Cancel').click(); expect(await records(page)).toEqual(original)
  await upload(page, f.bytes); await preview(page, 'replace')
  await page.evaluate(async (f) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('boros'); req.onsuccess = () => resolve(req.result) })
    await new Promise<void>((resolve) => { const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts'), req = store.get([f.id, f.savedDraft.id]); req.onsuccess = () => store.put({ ...req.result, revision: req.result.revision + 1 }); tx.oncomplete = () => resolve() }); db.close()
  }, f)
  await page.getByRole('checkbox', { name: /^I confirm/ }).check(); await button(page, 'Confirm and save').click(); await expect(page.getByRole('alert')).toContainText('changed after preview'); await expect(button(page, 'Preview import')).toBeVisible()
  await preview(page); const changed = await records(page)
  await page.evaluate(() => { const original = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function (...args) { if (this.name === 'photos') throw new DOMException('Simulated quota failure', 'QuotaExceededError'); return original.apply(this, args) } })
  await page.getByRole('checkbox', { name: /^I confirm/ }).check(); await button(page, 'Confirm and save').click(); await expect(page.getByRole('alert')).toContainText('quota failure'); expect(await records(page)).toEqual(changed)
  await button(page, 'Cancel').click(); await page.reload(); await button(page, 'Clear data').click(); const id = await confirm(page), after = await records(page)
  expect(table(after, 'profiles').find((p) => p.id === id)!.name).toBe(table(original, 'profiles').find((p) => p.id === f.id)!.name)
  for (const name of ['drafts', 'sessions', 'photos', 'measurements', 'exercises', 'plans', 'tags', 'schedules']) expect(table(after, name).filter((r) => r.profileId === id)).toHaveLength(0)
  expect(scoped(after, f.otherId)).toEqual(other); await page.reload(); await expect(page.getByLabel('Active profile')).toHaveValue(id); await button(page, 'Train').click(); await expect(page.getByText('No active plan(s) selected.')).toBeVisible()
})

test('invalid ZIP and failed image decoding remain recoverable; cancel/navigation/profile-switch abandon temporary uploads', async ({ page }) => {
  const f = await fixture(page), before = await records(page)
  await page.getByLabel('Backup ZIP').setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from('not zip') }); await expect(page.getByRole('alert')).toContainText('Invalid ZIP'); expect(await records(page)).toEqual(before)
  const zip = await JSZip.loadAsync(f.bytes), manifest = JSON.parse(await zip.file('manifest.json')!.async('string')); manifest.backupSchemaVersion = 119; zip.file('manifest.json', JSON.stringify(manifest))
  await page.getByLabel('Backup ZIP').setInputFiles({ name: 'future.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) }); await expect(page.getByRole('alert')).toContainText('Update Boros')
  manifest.backupSchemaVersion = 18
  const data = JSON.parse(await zip.file('data.json')!.async('string')); data.assets[0].width = 2; manifest.assets.find((a) => a.id === data.assets[0].id).width = 2
  const payload = new TextEncoder().encode(JSON.stringify(data)), entry = manifest.inventory.find((i) => i.path === 'data.json'); entry.bytes = payload.length; entry.sha256 = await sha256(payload)
  zip.file('data.json', payload); zip.file('manifest.json', JSON.stringify(manifest))
  await page.getByLabel('Backup ZIP').setInputFiles({ name: 'bad-photo.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) }); await expect(page.getByRole('alert')).toContainText('Photo dimensions'); expect(await records(page)).toEqual(before)
  await upload(page, f.bytes); await button(page, 'Cancel').click(); expect(await records(page)).toEqual(before)
  await page.evaluate(() => { const Original = window.Worker; window.Worker = class extends Original { postMessage() {} } })
  await page.getByLabel('Backup ZIP').setInputFiles({ name: 'slow.zip', mimeType: 'application/zip', buffer: f.bytes }); await button(page, 'Cancel preparation').click(); expect(await records(page)).toEqual(before)
  await page.getByLabel('Backup ZIP').setInputFiles({ name: 'slow.zip', mimeType: 'application/zip', buffer: f.bytes }); await button(page, 'Train').click(); await button(page, 'Settings').click(); await expect(page.getByRole('heading', { name: /^Validated backup:/ })).toHaveCount(0)
  await page.getByLabel('Backup ZIP').setInputFiles({ name: 'slow.zip', mimeType: 'application/zip', buffer: f.bytes }); await page.getByLabel('Active profile').selectOption(f.otherId); await expect(page.getByRole('heading', { name: /^Validated backup:/ })).toHaveCount(0)
  expect(scoped(await records(page), f.id)).toEqual(scoped(before, f.id))
})

test('a replaced workspace keeps a second-tab editor input and rejects its delayed autosave', async ({ page, context }) => {
  const f = await fixture(page), peer = await context.newPage(); await peer.goto(page.url()); await button(peer, 'Train').click(); await expect(peer.getByRole('region',{name:'Training session',exact:true})).toBeVisible()
  await closeTimer(peer)
  await peer.evaluate(() => { const native = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts') throw new DOMException('Held autosave', 'QuotaExceededError'); return native.apply(this, args) } })
  const load = peer.getByRole('textbox', { name: /set 1 Weight/ }).first(); await load.fill('999'); await expect(peer.getByRole('alert').filter({ hasText: 'Held autosave' })).toBeVisible()
  await upload(page, f.bytes); await preview(page, 'replace'); const id = await confirm(page)
  await expect(peer.getByText('This workspace is unavailable or was restored/cleared in another tab.', { exact: false })).toBeVisible(); await expect(load).toHaveValue('999')
  await button(peer, 'Retry draft save').click(); await expect(peer.getByText('This workout was saved or removed in another tab. Your input is kept.', { exact: true })).toBeVisible(); await expect(load).toHaveValue('999')
  const after = await records(page); expect(table(after, 'drafts').find((d) => d.profileId === id && d.id === f.savedDraft.id)!.input.exercises[0].sets[0].load).toBe('12.')
  peer.once('dialog', (dialog) => dialog.accept()); await button(peer, 'Reopen workspace').click(); await expect(peer.getByText('This workspace is unavailable', { exact: false })).toHaveCount(0)
  await peer.close()
})

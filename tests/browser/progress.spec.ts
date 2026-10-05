import { createNamedProfile } from './settings-actions'
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(90000)
const b = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const points = (page: Page) => page.locator('.weight-point')
async function open(page: Page) { await page.goto('./'); if (await b(page, 'Understood').isVisible()) await b(page, 'Understood').click(); await b(page, 'Progress').click(); await expect(b(page, 'Log Weight')).toBeVisible() }
async function photo(page: Page, width = 8) {
  const data = await page.evaluate((width) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 8; canvas.getContext('2d')!.fillRect(0, 0, width, 8); return canvas.toDataURL('image/png').split(',')[1] }, width)
  return { name: 'progress.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') }
}
async function add(page: Page, weight: string, date: string, withPhoto = false) {
  await page.clock.setFixedTime(new Date(date)); await b(page, 'Log Weight').click(); await page.getByLabel('Weight (kg)', { exact: true }).fill(weight)
  if (withPhoto) { await page.getByLabel('Progress photo (optional)', { exact: true }).setInputFiles(await photo(page)); await expect(page.getByAltText('Selected progress photo preview')).toBeVisible() }
  await page.locator('.measurement-editor').getByRole('button', { name: 'Log Weight', exact: true }).click(); await expect(page.locator('.measurement-editor')).toHaveCount(0)
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result) })
    const weights = await new Promise<any[]>((resolve) => { const request = db.transaction('measurements').objectStore('measurements').getAll(); request.onsuccess = () => resolve(request.result) })
    const photos = await new Promise<number>((resolve) => { const request = db.transaction('photos').objectStore('photos').count(); request.onsuccess = () => resolve(request.result) }); db.close(); return { weights, photos }
  })
}
async function edit(page: Page, index: number) { await points(page).nth(index).click(); await b(page, 'Edit').click(); await expect(page.getByRole('dialog', { name: 'Update Weight' })).toBeVisible() }

test('automatic device dates, repeated-date point access, filters, fixed axis and preserved scrolling', async ({ page, context }, info) => {
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' })
  await open(page); await add(page, '70', '2025-01-04T04:30:00Z', true); await add(page, '72', '2025-01-01T15:00:00Z'); await add(page, '71', '2025-01-03T17:00:00Z')
  await expect(points(page)).toHaveCount(3); await expect(page.locator('.current-weight')).toContainText('70 kg'); await expect(page.locator('.current-weight')).toContainText('2025-01-03 · 23:30')
  const original = await records(page); expect(original.weights.find((w) => w.weightKg === 70).timeZone).toBe('America/New_York')
  expect(await points(page).nth(1).getAttribute('style')).not.toBe(await points(page).nth(2).getAttribute('style'))
  await points(page).first().focus(); await page.keyboard.press('End'); await expect(points(page).last()).toBeFocused(); await page.keyboard.press('Enter')
  await expect(page.getByAltText('Saved progress photo')).toBeVisible(); await expect(page.getByRole('dialog')).not.toContainText('America/New_York'); await page.keyboard.press('Escape'); await expect(points(page).last()).toBeFocused()
  await b(page, 'Filter').click(); await page.getByLabel('Start date', { exact: true }).fill('2025-01-03'); await page.getByLabel('End date', { exact: true }).fill('2025-01-01'); await b(page, 'Apply').click(); await expect(page.getByRole('alert')).toContainText('End date'); await page.getByLabel('End date', { exact: true }).fill('2025-01-03'); await b(page, 'Apply').click(); await expect(points(page)).toHaveCount(2); await expect(page.locator('.current-weight')).toContainText('70 kg')
  await b(page, 'Filter, active').click(); await page.getByLabel('Start date', { exact: true }).fill('2025-01-04'); await b(page, 'Cancel').click(); await expect(points(page)).toHaveCount(2)
  await b(page, 'Filter, active').click(); await page.getByLabel('End date', { exact: true }).fill(''); await page.getByLabel('Start date', { exact: true }).fill('2025-01-04'); await b(page, 'Apply').click(); await expect(points(page)).toHaveCount(0); await expect(page.getByText('No measurements to chart.')).toBeVisible()
  await b(page, 'Filter, active').click(); await b(page, 'Clear').click(); await expect(points(page)).toHaveCount(3); expect(await records(page)).toEqual(original)
  // Add a long isolated history without dropping/aggregating any points.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result) }), profile: any = await new Promise(resolve => { const r = db.transaction('profiles').objectStore('profiles').getAll(); r.onsuccess = () => resolve(r.result[0]) })
    await new Promise<void>(resolve => { const tx = db.transaction('measurements', 'readwrite'); for (let i = 1; i <= 25; i++) { const date = `2025-02-${String(i).padStart(2, '0')}T12:00:00.000Z`; tx.objectStore('measurements').put({ id: crypto.randomUUID(), profileId: profile.id, weightKg: 70, measuredAt: date, loggedAt: date }) } tx.oncomplete = () => resolve() }); db.close()
  })
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z')); await page.reload(); await expect(points(page)).toHaveCount(28)
  const scroll = page.locator('.weight-plot-scroll'); await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  const axisBox = () => page.locator('.weight-axis').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height } })
  const axis = await axisBox(), ticks = await page.locator('.weight-axis').textContent()
  await scroll.evaluate(el => { el.scrollLeft = 0 }); await points(page).first().click(); await b(page, 'Close').click(); expect(await scroll.evaluate(el => el.scrollLeft)).toBe(0); expect(await axisBox()).toEqual(axis); expect(await page.locator('.weight-axis').textContent()).toBe(ticks)
  await page.screenshot({ path: info.outputPath('weight-slots-dark.png'), fullPage: true }); await b(page, 'Settings').click(); await b(page, 'Light').click(); await b(page, 'Progress').click(); await page.screenshot({ path: info.outputPath('weight-slots-light.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('layered weight edit/delete, invalid and canceled photos, atomic failures, exact timestamp, unit and Settings synchronization', async ({ page }) => {
  await open(page); await add(page, '70', '2025-01-01T12:00:00Z', true); await add(page, '72', '2025-01-02T12:00:00Z'); const before = await records(page)
  await edit(page, 0); await page.getByLabel('Weight (kg)', { exact: true }).fill('69'); await page.getByLabel('Upload new photo').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('invalid') }); await expect(page.getByRole('alert')).toContainText('not a readable image')
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Weight details' })).toBeVisible(); await expect(b(page, 'Edit')).toBeFocused(); expect(await records(page)).toEqual(before)
  await b(page, 'Edit').click(); await page.getByLabel('Upload new photo').setInputFiles(await photo(page)); await page.getByLabel('Weight (kg)', { exact: true }).fill('0'); await b(page, 'Update').click(); await expect(page.getByText('Enter a weight greater than', { exact: false })).toBeVisible(); await page.getByLabel('Weight (kg)', { exact: true }).fill('68')
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).restoreWrite = () => { IDBObjectStore.prototype.put = original }; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'measurements') throw new DOMException('Test disk full', 'QuotaExceededError'); return original.apply(this, args) } })
  await b(page, 'Update').click(); await expect(page.getByRole('alert')).toContainText('Test disk full'); await expect(page.getByLabel('Weight (kg)', { exact: true })).toHaveValue('68'); expect(await records(page)).toEqual(before)
  await page.evaluate(() => (window as any).restoreWrite()); await b(page, 'Update').click(); await expect(page.getByRole('dialog', { name: 'Update Weight' })).toHaveCount(0); await expect(page.getByRole('dialog')).toContainText('68 kg'); await b(page, 'Close').click()
  const after = await records(page); expect(after.photos).toBe(1); expect(after.weights.find(w => w.weightKg === 68).measuredAt).toBe('2025-01-01T12:00:00.000Z'); await expect(page.locator('.current-weight')).toContainText('72 kg')
  await b(page, 'Settings').click(); await expect(page.getByLabel('Weight (kg, optional)', { exact: true })).toHaveValue('72'); await page.getByRole('combobox', { name: 'Weight unit', exact: true }).selectOption('lb'); await b(page, 'Save profile').click(); await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible(); await b(page, 'Progress').click(); await points(page).first().click(); await b(page, 'Edit').click(); await b(page, 'Update').click(); await expect(page.getByRole('dialog', { name: 'Update Weight' })).toHaveCount(0); expect((await records(page)).weights.find(w => w.weightKg === 68).weightKg).toBe(68)
  await b(page, 'Delete').click(); const popup = page.getByRole('dialog', { name: 'Delete Weight?' }); await expect(popup.locator('p')).toHaveText('Once deleted you cannot recover this stored weight.'); await page.keyboard.press('Escape'); await expect(b(page, 'Delete')).toBeFocused(); await b(page, 'Delete').click(); await popup.getByRole('button', { name: 'Delete', exact: true }).click(); await expect(points(page)).toHaveCount(1); expect((await records(page)).photos).toBe(0); await expect(page.getByRole('heading', { name: 'Body weight' })).toBeFocused()
})

test('two tabs reject stale updates, retain input and preserve active profile isolation', async ({ page, context }) => {
  await open(page); await add(page, '70', '2025-01-01T12:00:00Z'); const other = await context.newPage(); await open(other)
  await edit(page, 0); await edit(other, 0); await page.getByLabel('Weight (kg)', { exact: true }).fill('65'); await other.getByLabel('Weight (kg)', { exact: true }).fill('66'); await b(other, 'Update').click(); await expect(other.getByRole('dialog', { name: 'Update Weight' })).toHaveCount(0)
  await b(page, 'Update').click(); await expect(page.getByRole('alert')).toContainText('changed in another tab'); await expect(page.getByLabel('Weight (kg)', { exact: true })).toHaveValue('65'); await page.keyboard.press('Escape'); await b(page, 'Close').click()
  await b(page, 'Settings').click(); await expect(page.getByLabel('Weight (kg, optional)', { exact: true })).toHaveValue('66'); await createNamedProfile(page, 'Second progress'); await b(page, 'Progress').click(); await expect(points(page)).toHaveCount(0); await add(page, '55', '2025-01-02T12:00:00Z')
  await b(page, 'Settings').click(); await page.getByRole('combobox', { name: 'Active profile', exact: true }).selectOption({ label: 'Guest' }); await b(page, 'Progress').click(); await expect(points(page)).toHaveCount(1); await expect(page.locator('.current-weight')).toContainText('66 kg'); await other.close()
})

test('submission time survives retry and double submit, photo URLs clean up, unload warnings and narrow enlarged form', async ({ page, context }, info) => {
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' }); await open(page)
  await page.evaluate(() => { const active = new Set<string>(), create = URL.createObjectURL, revoke = URL.revokeObjectURL; (window as any).activePhotos = active; URL.createObjectURL = blob => { const url = create(blob); active.add(url); return url }; URL.revokeObjectURL = url => { active.delete(url); revoke(url) } })
  await page.clock.setFixedTime(new Date('2025-11-02T05:30:00Z')); await b(page, 'Log Weight').click(); await page.getByLabel('Weight (kg)', { exact: true }).fill('73'); await page.getByLabel('Progress photo (optional)', { exact: true }).setInputFiles(await photo(page)); await expect(page.getByAltText('Selected progress photo preview')).toBeVisible(); await expect(page.getByLabel('Measurement date/time')).toHaveCount(0)
  await page.clock.setFixedTime(new Date('2025-11-02T06:30:00Z'))
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).restoreWrite = () => { IDBObjectStore.prototype.put = original }; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'measurements') { (window as any).attemptedTime = (args[0] as any).measuredAt; throw new DOMException('Retry test', 'QuotaExceededError') } return original.apply(this, args) } })
  await b(page, 'Log Weight').click(); await expect(page.getByRole('alert')).toContainText('Retry test'); expect(await records(page)).toEqual({ weights: [], photos: 0 }); expect(await page.evaluate(() => (window as any).attemptedTime)).toBe('2025-11-02T06:30:00.000Z')
  page.once('dialog', d => d.dismiss()); await b(page, 'Settings').click(); await expect(page.getByRole('heading', { name: 'Log Weight' })).toBeVisible()
  const warning = page.waitForEvent('dialog'); await page.evaluate(() => { setTimeout(() => location.reload(), 0) }); const dialog = await warning; expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss()
  await page.clock.setFixedTime(new Date('2025-11-02T07:30:00Z')); await page.evaluate(() => { (window as any).restoreWrite(); document.documentElement.style.fontSize = '24px' }); await page.setViewportSize({ width: 320, height: 844 }); await b(page, 'Log Weight').focus(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('log-weight-large-text.png'), fullPage: true })
  await page.locator('.measurement-editor form').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await expect(points(page)).toHaveCount(1)
  const saved = await records(page); expect(saved.weights[0].measuredAt).toBe('2025-11-02T06:30:00.000Z'); expect(saved.weights[0].offsetMinutes).toBe(300); expect(saved.photos).toBe(1)
  await expect.poll(() => page.evaluate(() => (window as any).activePhotos.size)).toBe(0)
})

import { expect, test, type Page } from '@playwright/test'

test.setTimeout(90000)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cards = (page: Page) => page.locator('.measurement-card')
async function open(page: Page) {
  await page.goto('./'); await button(page, 'Progress').click(); await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible()
  const notice = button(page, 'Understood'); if (await notice.isVisible()) await notice.click()
}
async function photo(page: Page, width = 8) {
  const data = await page.evaluate((width) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 8; canvas.getContext('2d')!.fillRect(0, 0, width, 8); return canvas.toDataURL('image/png').split(',')[1] }, width)
  return { name: 'progress.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') }
}
async function add(page: Page, weight: string, date: string, withPhoto = false) {
  await button(page, 'Add measurement').click(); await page.getByLabel('Weight (kg)', { exact: true }).fill(weight); await page.getByLabel('Measurement date/time', { exact: true }).fill(date)
  if (withPhoto) { await page.getByLabel('Progress photo (optional)', { exact: true }).setInputFiles(await photo(page)); await expect(page.getByAltText('Selected progress photo preview')).toBeVisible() }
  await button(page, 'Save measurement').click(); await expect(page.getByText('Measurement saved.', { exact: true })).toBeVisible()
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result) })
    const weights = await new Promise<{ id: string; weightKg: number; measuredAt: string; photoId?: string }[]>((resolve) => { const request = db.transaction('measurements').objectStore('measurements').getAll(); request.onsuccess = () => resolve(request.result) })
    const photos = await new Promise<number>((resolve) => { const request = db.transaction('photos').objectStore('photos').count(); request.onsuccess = () => resolve(request.result) }); db.close(); return { weights, photos }
  })
}

test('out-of-order history/chart, local dates/photo reload, units, correction/deletion and two-profile isolation', async ({ page, context }, testInfo) => {
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' })
  await open(page); const address = page.url(); await expect(page.getByText('No measurements to chart.')).toBeVisible()
  await add(page, '70', '2025-01-03T23:30', true); await expect(page.getByText('One recorded point.', { exact: false })).toBeVisible()
  await add(page, '72', '2025-01-01T10:00'); await add(page, '71', '2025-01-03T12:00')
  await expect(cards(page).getByRole('heading')).toHaveText(['72 kg', '71 kg', '70 kg']); await expect(page.locator('.current-weight')).toHaveText('Current weight: 70 kg')
  await page.screenshot({ path: testInfo.outputPath('progress-dark.png'), fullPage: true })
  expect((await records(page)).weights.find((item) => item.weightKg === 70)!.measuredAt).toBe('2025-01-04T04:30:00.000Z')
  await page.reload(); await expect(cards(page)).toHaveCount(3); await expect(page.locator('.progress-photo')).toHaveCount(0)
  await button(page, 'View progress photo').click(); await expect(page.getByAltText('Saved progress photo')).toBeVisible(); await page.keyboard.press('Escape'); await expect(button(page, 'View progress photo')).toBeFocused()
  await button(page, 'Settings').click(); await expect(page.getByLabel('Weight (kg, optional)', { exact: true })).toHaveValue('70'); await expect(page.getByLabel('Default avatar').first()).toBeVisible()
  await page.getByRole('combobox', { name: 'Weight unit', exact: true }).selectOption('lb'); await button(page, 'Save profile').click(); await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible(); await button(page, 'Light').click(); await button(page, 'Progress').click()
  const before = await records(page); expect(before.weights).toHaveLength(3); expect(before.weights.map((entry) => entry.weightKg).sort()).toEqual([70, 71, 72])
  await cards(page).last().getByRole('button', { name: 'Edit measurement', exact: true }).click(); await page.getByLabel('Progress photo (optional)', { exact: true }).setInputFiles(await photo(page)); await button(page, 'Save measurement').click(); await expect(page.getByText('Measurement saved.', { exact: true })).toBeVisible()
  expect((await records(page)).weights.map(({ id, weightKg, measuredAt }) => ({ id, weightKg, measuredAt }))).toEqual(before.weights.map(({ id, weightKg, measuredAt }) => ({ id, weightKg, measuredAt })))
  expect((await records(page)).photos).toBe(1)
  await cards(page).last().getByRole('button', { name: 'Edit measurement', exact: true }).click(); await page.getByLabel('Weight (lb)', { exact: true }).fill('150'); await button(page, 'Save measurement').click(); await expect(page.locator('.current-weight')).toHaveText('Current weight: 150 lb')
  await page.screenshot({ path: testInfo.outputPath('progress-light.png'), fullPage: true })
  await cards(page).last().getByRole('button', { name: 'Delete measurement', exact: true }).click(); await button(page, 'Delete entry and its photo').click(); await expect(cards(page)).toHaveCount(2); expect((await records(page)).photos).toBe(0)
  await button(page, 'Settings').click(); await expect(page.getByLabel('Weight (lb, optional)', { exact: true })).toHaveValue(String(Number((71 / .45359237).toFixed(6))))
  await page.getByLabel('New profile name', { exact: true }).fill('Second progress'); await button(page, 'Create profile').click(); await button(page, 'Progress').click(); await expect(cards(page)).toHaveCount(0)
  await add(page, '55', '2025-01-04T10:00', true); await expect(cards(page)).toHaveCount(1)
  await button(page, 'Settings').click(); await page.getByRole('combobox', { name: 'Active profile', exact: true }).selectOption({ label: 'Guest' }); await button(page, 'Progress').click(); await expect(cards(page)).toHaveCount(2); await expect(button(page, 'View progress photo')).toHaveCount(0)
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' }); await page.reload(); await expect(cards(page).last()).toContainText('2025-01-03 12:00 · America/New_York')
  expect(page.url()).toBe(address)
})

test('failed writes keep weight/photo; validation, photo removal and entry deletion confirmations preserve data and focus', async ({ page }, testInfo) => {
  await open(page); await add(page, '70', '2025-02-01T12:00', true)
  await button(page, 'Edit measurement').click(); await page.getByLabel('Progress photo (optional)', { exact: true }).setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') }); await expect(page.getByRole('alert')).toContainText('not a readable image'); await expect(page.getByAltText('Saved progress photo')).toBeVisible()
  await page.getByLabel('Progress photo (optional)', { exact: true }).setInputFiles(await photo(page, 4097)); await expect(page.getByRole('alert')).toBeVisible(); expect((await records(page)).photos).toBe(1)
  await button(page, 'Remove progress photo').click(); await page.keyboard.press('Escape'); await expect(button(page, 'Remove progress photo')).toBeFocused(); await expect(page.getByAltText('Saved progress photo')).toBeVisible()
  await button(page, 'Remove progress photo').click(); await button(page, 'Remove photo from entry').click(); await expect(page.getByText('Photo removal is pending.', { exact: false })).toBeVisible(); await expect(button(page, 'Save measurement')).toBeFocused()
  await page.getByLabel('Weight (kg)', { exact: true }).fill('0'); await button(page, 'Save measurement').click(); await expect(page.getByText('Enter a weight greater than', { exact: false })).toBeVisible()
  await page.getByLabel('Weight (kg)', { exact: true }).fill('69')
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as unknown as { restore: () => void }).restore = () => { IDBObjectStore.prototype.put = original }; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'measurements') throw new DOMException('Simulated measurement disk full', 'QuotaExceededError'); return original.apply(this, args) } })
  await button(page, 'Save measurement').click(); await expect(page.getByRole('alert')).toContainText('Simulated measurement disk full'); await expect(page.getByLabel('Weight (kg)', { exact: true })).toHaveValue('69'); expect((await records(page)).photos).toBe(1)
  page.once('dialog', (dialog) => dialog.dismiss()); await button(page, 'Settings').click(); await expect(page.getByRole('heading', { name: 'Edit measurement' })).toBeVisible()
  const unload = page.waitForEvent('dialog'); await page.evaluate(() => { setTimeout(() => location.reload(), 0) }); const warning = await unload; expect(warning.type()).toBe('beforeunload'); await warning.dismiss()
  await page.evaluate(() => (window as unknown as { restore: () => void }).restore())
  if (testInfo.project.name.includes('phone')) await page.setViewportSize({ width: 320, height: 720 })
  await button(page, 'Save measurement').focus(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const saveBox = await button(page, 'Save measurement').boundingBox(), navBox = await page.getByRole('navigation').boundingBox(); expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(navBox!.y)
  await page.locator('.measurement-editor form').evaluate((form) => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  await expect(page.getByText('Measurement saved.', { exact: true })).toBeVisible(); expect((await records(page)).photos).toBe(0); expect((await records(page)).weights).toHaveLength(1)
  await button(page, 'Delete measurement').click(); await page.keyboard.press('Escape'); await expect(button(page, 'Delete measurement')).toBeFocused(); await expect(cards(page)).toHaveCount(1)
  await button(page, 'Delete measurement').click(); await button(page, 'Delete entry and its photo').click(); await expect(cards(page)).toHaveCount(0); await expect(page.getByText('No measurements to chart.')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeFocused()
})

test('second-tab measurements update Settings, reject stale unrelated profile edits and preserve stale Progress input', async ({ page, context }) => {
  await open(page); await add(page, '70', '2025-01-01T12:00')
  const other = await context.newPage(); await other.goto('./'); await button(other, 'Settings').click(); await other.locator('input[name="name"]').fill('Keep this name')
  await button(page, 'Edit measurement').click(); await page.getByLabel('Weight (kg)', { exact: true }).fill('68'); await button(page, 'Save measurement').click(); await expect(page.getByText('Measurement saved.', { exact: true })).toBeVisible()
  await expect(other.getByLabel('Weight (kg, optional)', { exact: true })).toHaveValue('68'); await button(other, 'Save profile').click(); await expect(other.getByRole('alert')).toContainText('changed in another tab'); await expect(other.locator('input[name="name"]')).toHaveValue('Keep this name')
  other.once('dialog', (dialog) => dialog.accept()); await button(other, 'Reload saved profile').click(); await other.getByLabel('Weight (kg, optional)', { exact: true }).fill('67'); await button(other, 'Save profile').click(); await expect(other.getByText('Profile saved.', { exact: true })).toBeVisible()
  await expect(cards(page)).toHaveCount(2); await expect(page.locator('.current-weight')).toHaveText('Current weight: 67 kg')
  await cards(page).first().getByRole('button', { name: 'Edit measurement', exact: true }).click(); await page.getByLabel('Weight (kg)', { exact: true }).fill('65')
  await button(other, 'Progress').click(); await cards(other).first().getByRole('button', { name: 'Edit measurement', exact: true }).click(); await other.getByLabel('Weight (kg)', { exact: true }).fill('66'); await button(other, 'Save measurement').click(); await expect(other.getByText('Measurement saved.', { exact: true })).toBeVisible()
  await button(page, 'Save measurement').click(); await expect(page.getByRole('alert')).toContainText('changed in another tab'); await expect(page.getByLabel('Weight (kg)', { exact: true })).toHaveValue('65')
  await other.close()
})

test('pending photo/write recovery, object URL cleanup, delayed processing ownership and enlarged text', async ({ page }, testInfo) => {
  await open(page)
  await page.evaluate(() => {
    const active = new Set<string>(), create = URL.createObjectURL, revoke = URL.revokeObjectURL
    ;(window as unknown as { activePhotos: Set<string> }).activePhotos = active
    URL.createObjectURL = (blob) => { const url = create(blob); active.add(url); return url }
    URL.revokeObjectURL = (url) => { active.delete(url); revoke(url) }
  })
  await button(page, 'Add measurement').click(); await page.getByLabel('Weight (kg)', { exact: true }).fill('73'); await page.getByLabel('Progress photo (optional)', { exact: true }).setInputFiles(await photo(page)); await expect(page.getByAltText('Selected progress photo preview')).toBeVisible()
  await button(page, 'View larger photo').click(); await expect(page.getByRole('dialog').getByRole('img')).toBeVisible(); await page.keyboard.press('Escape'); await expect(button(page, 'View larger photo')).toBeFocused()
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as unknown as { restore: () => void }).restore = () => { IDBObjectStore.prototype.put = original }; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'measurements') throw new DOMException('Photo save failed', 'QuotaExceededError'); return original.apply(this, args) } })
  await button(page, 'Save measurement').click(); await expect(page.getByRole('alert')).toContainText('Photo save failed'); await expect(page.getByAltText('Selected progress photo preview')).toBeVisible(); expect(await records(page)).toEqual({ weights: [], photos: 0 })
  await page.evaluate(() => { (window as unknown as { restore: () => void }).restore(); document.documentElement.style.fontSize = '24px' }); await page.setViewportSize({ width: 320, height: 844 })
  await button(page, 'Save measurement').focus(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('progress-editor-large-text.png'), fullPage: true })
  await button(page, 'Save measurement').click(); await expect(page.getByText('Measurement saved.', { exact: true })).toBeVisible(); expect((await records(page)).photos).toBe(1)
  await expect.poll(() => page.evaluate(() => (window as unknown as { activePhotos: Set<string> }).activePhotos.size)).toBe(0)
  await button(page, 'Add measurement').click(); await page.getByLabel('Weight (kg)', { exact: true }).fill('74')
  await page.evaluate(() => {
    const original = window.createImageBitmap
    window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => new Promise<ImageBitmap>((resolve, reject) => {
      ;(window as unknown as { finishPhoto: () => void }).finishPhoto = () => { void original(...args).then(resolve, reject) }
    })) as typeof createImageBitmap
  })
  await page.getByLabel('Progress photo (optional)', { exact: true }).setInputFiles(await photo(page))
  page.once('dialog', (dialog) => dialog.accept()); await button(page, 'Settings').click(); await page.getByLabel('New profile name', { exact: true }).fill('Image isolation'); await button(page, 'Create profile').click()
  await page.evaluate(() => (window as unknown as { finishPhoto: () => void }).finishPhoto())
  await button(page, 'Progress').click(); await expect(cards(page)).toHaveCount(0); await expect(page.getByText('No recorded weight.', { exact: true })).toBeVisible(); expect((await records(page)).weights).toHaveLength(1); expect((await records(page)).photos).toBe(1)
})

test('default repeated-hour timestamp stays exact; explicit date corrections reject DST gaps and reorder current weight', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' })
  await page.clock.setFixedTime(new Date('2025-11-02T06:30:00.000Z')); await open(page)
  await button(page, 'Add measurement').click(); await page.getByLabel('Weight (kg)', { exact: true }).fill('70'); await button(page, 'Save measurement').click(); await expect(cards(page)).toHaveCount(1)
  const original = (await records(page)).weights[0]; expect(original.measuredAt).toBe('2025-11-02T06:30:00.000Z')
  await add(page, '72', '2025-01-01T12:00')
  await cards(page).last().getByRole('button', { name: 'Edit measurement', exact: true }).click(); await page.getByRole('checkbox', { name: 'Change measurement date/time' }).check()
  await page.getByLabel('Measurement date/time', { exact: true }).fill('2025-03-09T02:30'); await button(page, 'Save measurement').click(); await expect(page.getByText('This local time is invalid', { exact: false })).toBeVisible()
  await page.getByLabel('Measurement date/time', { exact: true }).fill('2024-12-31T12:00'); await button(page, 'Save measurement').click(); await expect(page.locator('.current-weight')).toHaveText('Current weight: 72 kg')
  expect((await records(page)).weights.find((entry) => entry.id === original.id)!.measuredAt).toBe('2024-12-31T17:00:00.000Z')
})

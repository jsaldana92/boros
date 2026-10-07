import { createNamedProfile } from './settings-actions'
import { cardAction, occurrenceAction } from './create-actions'
import { expect, test, type Page } from '@playwright/test'
import { planFixture, workoutFixture } from '../fixtures/interchange'

test.setTimeout(90000)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const card = (page: Page, name: string) => page.getByRole('article', { name: `Plan ${name}`, exact: true })
async function open(page: Page) {
  await page.goto('./'); await button(page, 'Create').click()
  const notice = button(page, 'Understood'); if (await notice.isVisible()) await notice.click()
  await button(page, 'Import').click()
}
async function preview(page: Page, value: unknown, fenced = false) {
  const json = JSON.stringify(value)
  await page.getByLabel('AI output JSON', { exact: true }).fill(fenced ? `\`\`\`json\n${json}\n\`\`\`` : json)
  await button(page, 'Validate and preview').click()
  await expect(page.getByText('Draft.', { exact: false })).toBeVisible()
  if (await page.getByLabel('Duration (weeks)', { exact: true }).isVisible()) await page.getByLabel('Duration (weeks)', { exact: true }).fill('2')
}
async function counts(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const names = Array.from(database.objectStoreNames)
    const tx = database.transaction(names, 'readonly')
    const result = await Promise.all(names.map((name) => new Promise<[string, number]>((resolve, reject) => { const request = tx.objectStore(name).count(); request.onsuccess = () => resolve([name, request.result]); request.onerror = () => reject(request.error) })))
    database.close(); return Object.fromEntries(result)
  })
}
async function cancelPreview(page: Page) {
  await button(page, 'Cancel').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(button(page, 'Validate and preview')).toBeFocused()
}

test('both formatting options copy valid examples; clipboard failure selects the visible fallback', async ({ page }) => {
  await open(page); const before = await counts(page)
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text } } }) })
  for (const kind of ['plan', 'workout']) {
    await page.getByLabel('Formatting instructions for', { exact: true }).selectOption(kind)
    await button(page, 'Copy').click()
    await expect(page.getByText('Formatting instructions copied.', { exact: true })).toBeVisible()
    const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied)
    expect(copied).toEqual(await page.getByLabel('Formatting instructions', { exact: true }).inputValue())
    expect(JSON.parse(copied.slice(copied.indexOf('\n{') + 1)).kind).toBe(kind)
  }
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied') } } }) })
  await button(page, 'Copy').click()
  await expect(page.getByText('Clipboard unavailable. Select the instructions and copy them manually.')).toBeVisible()
  const text = page.getByLabel('Formatting instructions', { exact: true })
  await expect(text).toBeFocused()
  expect(await text.evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toEqual((await text.inputValue()).length)
  expect(await counts(page)).toEqual(before)
})

test('invalid input and canceled previews write nothing; dirty navigation/unload preserves pasted text and address', async ({ page }) => {
  await open(page); const before = await counts(page), address = page.url()
  const invalid = planFixture(); invalid.plan.days[1].exercises[0].sets[2].reps.max = 1
  const text = JSON.stringify(invalid)
  await page.getByLabel('AI output JSON', { exact: true }).fill(text); await button(page, 'Validate and preview').click()
  await expect(page.getByRole('alert')).toContainText('plan.days[1].exercises[0].sets[2].reps.max')
  await expect(page.getByRole('alert')).toBeFocused()
  await expect(page.getByLabel('AI output JSON', { exact: true })).toHaveValue(text)
  for (const plan of [true, false]) {
    await preview(page, plan ? planFixture() : workoutFixture())
    await button(page, 'Settings').click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByText('Draft.', { exact: false })).toBeVisible()
  if (await page.getByLabel('Duration (weeks)', { exact: true }).isVisible()) await page.getByLabel('Duration (weeks)', { exact: true }).fill('2')
    await cancelPreview(page, plan)
    expect(await counts(page)).toEqual(before)
  }
  await button(page, 'Train').click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByLabel('AI output JSON', { exact: true })).toHaveValue(JSON.stringify(workoutFixture()))
  const unload = page.waitForEvent('dialog')
  await page.evaluate(() => { setTimeout(() => window.location.reload(), 0) })
  const dialog = await unload; expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss()
  await expect(page).toHaveURL(address)
  await button(page, 'Close').click(); await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(button(page, 'Import')).toBeFocused()
  expect(await counts(page)).toEqual(before)
})

test('four-day plan preview edits save independently and reopen in the manual editor and source picker', async ({ page }, testInfo) => {
  await open(page); const address = page.url(), external: string[] = []
  page.on('request', (request) => { if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(new URL(request.url()).hostname)) external.push(request.url()) })
  await preview(page, planFixture(), true)
  expect((await counts(page)).plans).toBe(0); expect((await counts(page)).tags).toBe(0)
  await page.getByLabel('Plan name', { exact: true }).fill('Imported edited plan')
  await page.getByLabel('Workout 1 name', { exact: true }).fill('Upper 肩')
  await occurrenceAction(page, page.locator('.plan-day').first(), 'Edit')
  await expect(page.getByLabel('Set 1 RIR minimum', { exact: true })).toHaveValue('0')
  await expect(page.getByLabel('Set 2 RIR minimum', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Set 3 Reps maximum', { exact: true })).toHaveValue('12')
  await expect(page.getByLabel('Rest between sets (optional) seconds', { exact: true })).toHaveValue('0')
  await expect(page.getByLabel('Rest after exercise (optional) seconds', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Instructions (optional)', { exact: true })).toHaveValue(workoutFixture().workout.instructions)
  await page.getByLabel('Notes (optional)', { exact: true }).fill('Edited preview note')
  await page.getByLabel('Set 1 Reps minimum', { exact: true }).fill('6')
  await page.locator('.exercise-editor button[type=submit]').click(); await button(page, 'Save plan').click()
  await expect(card(page, 'Imported edited plan')).toBeVisible()
  expect((await counts(page)).exercises).toBe(1); expect((await counts(page)).tags).toBe(2)
  await page.reload(); await cardAction(page, card(page, 'Imported edited plan'), 'Edit')
  await expect(page.getByLabel('Workout 1 name', { exact: true })).toHaveValue('Upper 肩')
  await expect(page.locator('.plan-day')).toHaveCount(4)
  await occurrenceAction(page, page.locator('.plan-day').first(), 'Edit')
  await expect(page.getByLabel('Notes (optional)', { exact: true })).toHaveValue('Edited preview note')
  await expect(page.getByLabel('Set 1 Reps minimum', { exact: true })).toHaveValue('6')
  await button(page, 'Cancel').click(); await button(page, 'Cancel').click()
  await button(page, 'Create Plan').click(); await page.locator('.plan-day').first().getByRole('button', { name: 'Add exercise', exact: true }).click()
  await button(page, 'Add Élévation 肩').click()
  await page.getByLabel('Plan name', { exact: true }).fill('Manual copy'); await page.getByLabel('Duration (weeks)', { exact: true }).fill('2'); await button(page, 'Save plan').click()
  await expect(card(page, 'Manual copy')).toBeVisible()
  expect(external).toEqual([]); expect(await page.evaluate(() => 'importExecuted' in window)).toBe(false)
  await expect(page.locator('main img')).toHaveCount(0); await expect(page).toHaveURL(address)
  await page.screenshot({ path: testInfo.outputPath('imported-plan-library.png'), fullPage: true })
})

test('standalone imports use the library editor; duplicate names require rename and remain profile bound', async ({ page, context }) => {
  await open(page); await preview(page, workoutFixture()); await button(page, 'Save').click()
  const exercise = page.getByRole('article', { name: 'Élévation 肩', exact: true })
  await expect(exercise).toBeVisible(); await page.reload()
  await cardAction(page, exercise, 'Edit')
  await expect(page.getByLabel('Instructions (optional)', { exact: true })).toHaveValue(workoutFixture().workout.instructions)
  await button(page, 'Cancel').click()
  await button(page, 'Import').click(); await preview(page, workoutFixture()); await button(page, 'Save').click()
  await expect(page.getByRole('alert')).toContainText('already exists')
  await page.getByLabel('Exercise name', { exact: true }).fill('Guest renamed import')
  const other = await context.newPage(); await other.goto('./'); await button(other, 'Settings').click()
  await createNamedProfile(other, 'Other')
  await expect(other.locator('input[name="name"]')).toHaveValue('Other'); await button(other, 'Create').click()
  await expect(other.getByRole('article')).toHaveCount(0)
  await button(page, 'Save').click(); await expect(page.getByRole('article', { name: 'Guest renamed import', exact: true })).toBeVisible()
  await expect(other.getByRole('article')).toHaveCount(0)
  await button(other, 'Settings').click(); await other.getByLabel('Active profile').selectOption({ label: 'Guest' }); await button(other, 'Create').click()
  await expect(other.getByRole('article', { name: 'Guest renamed import', exact: true })).toBeVisible()
  expect((await counts(page)).exercises).toBe(2)
})

test('failed import saves retain edits and roll back tags; rapid retry saves once with reachable light-theme controls', async ({ page }, testInfo) => {
  await open(page); await button(page, 'Close').click(); await button(page, 'Settings').click(); await button(page, 'Light').click(); await button(page, 'Create').click(); await button(page, 'Import').click()
  await preview(page, planFixture()); await page.getByLabel('Plan name', { exact: true }).fill('Recoverable import')
  const before = await counts(page)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    ;(window as unknown as { restoreWrite: () => void }).restoreWrite = () => { IDBObjectStore.prototype.put = original }
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'plans') throw new DOMException('Simulated import disk full', 'QuotaExceededError'); return original.apply(this, args) }
  })
  await button(page, 'Save plan').click(); await expect(page.getByRole('alert')).toContainText('Simulated import disk full')
  await expect(page.getByLabel('Plan name', { exact: true })).toHaveValue('Recoverable import')
  expect(await counts(page)).toEqual(before)
  await page.setViewportSize({ width: 320, height: 720 }); await button(page, 'Save plan').focus()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const saveBox = await button(page, 'Save plan').boundingBox(), navBox = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox()
  expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(navBox!.y)
  await page.screenshot({ path: testInfo.outputPath('import-preview-light-320.png'), fullPage: true })
  await page.evaluate(() => (window as unknown as { restoreWrite: () => void }).restoreWrite())
  await page.locator('.plan-editor form').evaluate((form) => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  await expect(card(page, 'Recoverable import')).toBeVisible(); await page.reload()
  await expect(card(page, 'Recoverable import')).toHaveCount(1)
  expect((await counts(page)).plans).toBe(1); expect((await counts(page)).tags).toBe(2)
})

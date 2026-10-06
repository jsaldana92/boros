import { createNamedProfile } from './settings-actions'
import { waitForDraft, startWeekly, closeTimer } from './train-actions'
import { cardAction, occurrenceAction } from './create-actions'
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(90000)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const input = (page: Page, name: string) => page.getByLabel(name, { exact: true })
const fixture = () => ({ schemaVersion: 1, kind: 'plan', plan: { name: 'Training plan', trainingDaysPerWeek: 1, days: [{ name: 'Upper', exercises: [
  { name: 'Press', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 0, max: 0 } }, { reps: { min: 10, max: 10 }, rir: null }], restBetweenSetsSeconds: 60, restAfterExerciseSeconds: 120, instructions: '<b>Plain instructions</b>\nSecond line', youtubeUrl: 'https://youtu.be/abcdefghijk', tags: ['Hidden tag'] },
  { name: 'Row', sets: [{ reps: { min: 8, max: 12 } }, { reps: { min: 12, max: 12 } }], tags: ['Back'] },
] }] } })
async function open(page: Page) {
  await page.goto('./'); await button(page, 'Create').click()
  const notice = button(page, 'Understood'); if (await notice.isVisible()) await notice.click()
  await button(page, 'Import AI Output').click(); await input(page, 'AI output JSON').fill(JSON.stringify(fixture()))
  await button(page, 'Validate and preview').click(); await input(page, 'Duration (weeks)').fill('2'); await button(page, 'Save plan').click()
  await expect(page.getByRole('article', { name: 'Plan Training plan', exact: true })).toBeVisible()
  await startWeekly(page, 'Training plan', 'Upper')
}
async function saved(page: Page) { await waitForDraft(page) }
async function resume(page: Page) { await page.getByRole('button', { name: new RegExp("^Resume Training plan / Upper") }).click() }
async function fillSet(page: Page, exercise = 'Press', set = 1, load = '0') {
  await input(page, `${exercise} set ${set} Weight (kg)`).fill(load); await input(page, `${exercise} set ${set} Repetitions`).fill('5')
}
async function note(page: Page, name: string, value: string) { await button(page, name).click(); await input(page, 'Note').fill(value); await button(page, 'Apply note').click() }
async function recordCounts(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result) })
    const result = await Promise.all(['drafts', 'sessions'].map((store) => new Promise<number>((resolve) => { const request = db.transaction(store).objectStore(store).count(); request.onsuccess = () => resolve(request.result) })))
    db.close(); return result
  })
}

test('complete workout: notes, information, positioned rests, timestamp timer/reload, Save and immutable history', async ({ page }, testInfo) => {
  await open(page); const address = page.url()
  await expect(page.getByText('Hidden tag', { exact: true })).toHaveCount(0)
  await expect(page.getByText('<b>Plain instructions</b>', { exact: false })).toHaveCount(0)
  await page.route('https://www.youtube.com/embed/**', r => r.fulfill({ contentType: 'text/html', body: '<button>Simulated player</button>' })); await button(page, 'Information for Press').click(); await expect(page.getByRole('dialog')).toContainText('<b>Plain instructions</b>')
  await expect(page.locator('iframe')).toHaveAttribute('src', /youtube.com\/embed\/abcdefghijk/); await button(page, 'Close').click()
  await note(page, 'Session Note', 'Session\nplain <b>note</b>'); await note(page, 'Note for Press', 'Exercise note')
  await fillSet(page); await input(page, 'Press set 1 Actual RIR (optional)').fill('0'); await saved(page)
  await page.clock.install()
  await button(page, 'REST Press after set 1').click(); await expect(page.getByRole('timer')).toContainText('1:00')
  await closeTimer(page); await button(page, 'REST Press between exercises').click(); await expect(page.getByRole('timer')).toContainText('2:00')
  const readTimer = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try { return await new Promise<{ token: string; endAt: string }>((resolve, reject) => { const request = db.transaction('restTimers').objectStore('restTimers').get('active'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) } finally { db.close() }
  })
  const beforeReload = await readTimer()
  await page.reload(); await resume(page); await expect(input(page, 'Press set 1 Weight (kg)')).toHaveValue('0'); await expect(input(page, 'Press set 1 Actual RIR (optional)')).toHaveValue('0')
  expect(await readTimer()).toEqual(beforeReload)
  await expect(page.getByRole('timer')).toHaveText(/^(?:02:00|01:[0-5]\d)$/)
  const remaining = await page.getByRole('timer').evaluate((element, endAt) => {
    const [minutes, seconds] = element.textContent!.split(':').map(Number)
    return { displayed: minutes * 60 + seconds, expected: Math.max(0, Math.ceil((Date.parse(endAt) - Date.now()) / 1000)) }
  }, beforeReload.endAt)
  expect(Math.abs(remaining.displayed - remaining.expected)).toBeLessThanOrEqual(1)
  await page.clock.fastForward(130000); await expect(page.getByRole('timer')).toHaveText('Rest finished')
  await button(page, 'Reset').click(); await expect(page.getByRole('timer')).toContainText('2:00'); await button(page, 'Stop').click(); await expect(page.getByRole('region', { name: 'Rest timer', exact: true })).toHaveCount(0)
  await button(page, 'REST Row after set 1').click(); await expect(page.getByRole('timer')).toHaveText('00:00'); await button(page, 'Stop').click(); await expect(page.getByRole('region', { name: 'Rest timer', exact: true })).toHaveCount(0)
  await fillSet(page, 'Press', 2, '20'); await fillSet(page, 'Row', 1, '30'); await fillSet(page, 'Row', 2, '40')
  await page.setViewportSize({ width: 320, height: 720 }); await input(page, 'Row set 2 Actual RIR (optional)').focus()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const box = await input(page, 'Row set 2 Actual RIR (optional)').boundingBox(), actions = await page.locator('.session-actions').boundingBox(), nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(actions!.y); expect(actions!.y + actions!.height).toBeLessThanOrEqual(nav!.y)
  await page.screenshot({ path: testInfo.outputPath('train-dark-320.png'), fullPage: true })
  await button(page, 'Save').click(); await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('Complete session')
  await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('0 kg · 5 reps · 0 actual RIR')
  await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('Exercise note')
  expect(await recordCounts(page)).toEqual([1, 1]); await expect(page).toHaveURL(address)
  await button(page, 'Create').click(); const plan = page.getByRole('article', { name: 'Plan Training plan', exact: true })
  await cardAction(page, plan, 'Edit'); await occurrenceAction(page, page.locator('.plan-day').first(), 'Edit')
  await input(page, 'Exercise name').fill('Changed source'); await page.locator('.exercise-editor button[type=submit]').click(); await button(page, 'Save plan').click()
  await cardAction(page, plan, 'Archive'); await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click()
  await button(page, 'Train').click(); await page.getByRole('button', { name: /^Saved sessions/ }).click(); await button(page, 'Review session').click(); await expect(page.getByRole('heading', { name: 'Press', exact: true })).toBeVisible(); await expect(page.getByText('Changed source', { exact: true })).toHaveCount(0)
})

test('cancel Clear and partial Save preserve input; explicit skips and Clear affect only this draft', async ({ page }) => {
  await open(page); await fillSet(page); await note(page, 'Session Note', 'Keep on cancel'); await saved(page)
  await button(page, 'Clear').click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(input(page, 'Press set 1 Weight (kg)')).toHaveValue('0')
  await button(page, 'Save').click(); await expect(page.getByRole('dialog')).toContainText('3 omitted sets'); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await input(page, 'Row set 1 Weight (kg)').fill('-1'); await button(page, 'Save').click(); await expect(page.getByRole('alert')).toContainText('Correct invalid')
  await input(page, 'Skip Row set 1').check(); await button(page, 'Save').click(); await button(page, 'Save partial session').click()
  await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('Partial session'); await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('Skipped')
  await button(page, 'Back to training days').click(); await button(page, 'Next week').click(); await expect(page.locator('.training-day-card')).toContainText('Pending'); await page.locator('.training-day-card').click(); await button(page, 'Start').click(); await fillSet(page); await note(page, 'Note for Press', 'Remove me'); await saved(page)
  await button(page, 'REST Press after set 1').click(); await closeTimer(page); await input(page, 'Press set 2 Repetitions').fill('9')
  await button(page, 'Clear').click(); await page.getByRole('dialog').getByRole('button', { name: 'Clear', exact: true }).click(); await saved(page)
  await expect(input(page, 'Press set 1 Weight (kg)')).toHaveValue(''); await expect(input(page, 'Press set 2 Repetitions')).toHaveValue(''); await expect(page.getByRole('region', { name: 'Rest timer' })).toHaveCount(0)
  await button(page, 'Note for Press').click(); await expect(input(page, 'Note')).toHaveValue(''); await button(page, 'Apply note').click(); await saved(page)
  await page.reload(); await expect(page.getByRole('region', { name: 'Unfinished sessions' })).toHaveCount(0); await startWeekly(page, 'Training plan', 'Upper'); await expect(input(page, 'Press set 2 Repetitions')).toHaveValue(''); expect(await recordCounts(page)).toEqual([2, 1])
})

test('failed autosave and completion preserve input; pending Save commits once; unapplied notes guard unload', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    ;(window as unknown as { restoreWrite: () => void }).restoreWrite = () => { IDBObjectStore.prototype.put = original }
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts') throw new DOMException('Simulated draft quota', 'QuotaExceededError'); return original.apply(this, args) }
  })
  await fillSet(page); await expect(page.getByText('Draft not saved. Your input is kept.')).toBeVisible(); await expect(input(page, 'Press set 1 Weight (kg)')).toHaveValue('0')
  await button(page, 'Settings').click(); await expect(page.getByRole('alert').first()).toContainText('Simulated draft quota'); await expect(input(page, 'Press set 1 Weight (kg)')).toHaveValue('0')
  await page.evaluate(() => (window as unknown as { restoreWrite: () => void }).restoreWrite()); await button(page, 'Retry draft save').click(); await saved(page)
  await button(page, 'Session Note').click(); await input(page, 'Note').fill('Unapplied')
  const unload = page.waitForEvent('dialog'); await page.evaluate(() => { setTimeout(() => window.location.reload(), 0) }); const warning = await unload; expect(warning.type()).toBe('beforeunload'); await warning.dismiss()
  await expect(input(page, 'Note')).toHaveValue('Unapplied'); await button(page, 'Apply note').click()
  for (const [name, s] of [['Press', 2], ['Row', 1], ['Row', 2]] as const) await fillSet(page, name, s)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add
    ;(window as unknown as { restoreCompletion: () => void }).restoreCompletion = () => { IDBObjectStore.prototype.add = original }
    IDBObjectStore.prototype.add = function (...args) { if (this.name === 'sessions') throw new DOMException('Simulated session quota', 'QuotaExceededError'); return original.apply(this, args) }
  })
  await button(page, 'Save').click(); await expect(page.getByRole('alert').first()).toContainText('Simulated session quota'); expect(await recordCounts(page)).toEqual([1, 0])
  await page.evaluate(() => (window as unknown as { restoreCompletion: () => void }).restoreCompletion())
  await button(page, 'Save').evaluate((node: HTMLButtonElement) => { node.click(); node.click() })
  await expect(page.getByRole('region', { name: 'Saved session details' })).toBeVisible(); expect(await recordCounts(page)).toEqual([1, 1])
})

test('profile switching and unit changes recover canonical loads; light theme and archived-source draft resume', async ({ page }, testInfo) => {
  await open(page); await fillSet(page, 'Press', 1, '45.359237'); await saved(page); await button(page, 'REST Press after set 1').click()
  await closeTimer(page); await saved(page); await page.reload(); await button(page, 'Settings').click(); await button(page, 'Light').click()
  await page.getByRole('combobox', { name: 'Weight unit', exact: true }).selectOption('lb'); await button(page, 'Save profile').click(); await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  await createNamedProfile(page, 'Other'); await expect(page.locator('input[name="name"]')).toHaveValue('Other'); await button(page, 'Train').click()
  await expect(page.getByText('No active plan(s) selected.')).toBeVisible(); await expect(page.getByRole('button', { name: new RegExp("^Resume Training plan / Upper") })).toHaveCount(0); await expect(page.getByRole('region', { name: 'Rest timer' })).toHaveCount(0)
  await button(page, 'Settings').click(); await page.getByRole('combobox', { name: 'Active profile', exact: true }).selectOption({ label: 'Guest' }); await button(page, 'Train').click(); await resume(page)
  await expect(input(page, 'Press set 1 Weight (lb)')).toHaveValue('100'); await expect(page.getByRole('region', { name: 'Rest timer' })).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('train-light.png'), fullPage: true })
  await closeTimer(page); await page.reload(); await button(page, 'Create').click(); const card = page.getByRole('article', { name: 'Plan Training plan', exact: true })
  await cardAction(page, card, 'Edit'); await occurrenceAction(page, page.locator('.plan-day').first(), 'Edit'); await input(page, 'Exercise name').fill('Changed source'); await page.locator('.exercise-editor button[type=submit]').click(); await button(page, 'Save plan').click()
  await cardAction(page, card, 'Archive'); await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click()
  await button(page, 'Train').click(); await resume(page); await expect(input(page, 'Press set 1 Weight (lb)')).toHaveValue('100')
  await closeTimer(page); await button(page, 'Save').click(); await button(page, 'Save partial session').click(); await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('45.359237 kg')
})

test('stale tabs cannot overwrite drafts; reload conflict recovery and completion use one log', async ({ page, context }) => {
  await open(page); await input(page, 'Press set 1 Actual RIR (optional)').fill('0'); await saved(page); const other = await context.newPage(); await other.goto('./'); await resume(other)
  await fillSet(page); await saved(page); await fillSet(other, 'Press', 1, '50')
  await expect(other.getByRole('alert')).toContainText('another tab'); await expect(input(other, 'Press set 1 Weight (kg)')).toHaveValue('50')
  await button(other, 'Reload saved draft').click(); await button(other, 'Reload draft').click(); await expect(input(other, 'Press set 1 Weight (kg)')).toHaveValue('0')
  await button(page, 'Save').click(); await button(page, 'Save partial session').click()
  await button(other, 'Save').click(); await button(other, 'Save partial session').click(); await expect(other.getByRole('region', { name: 'Saved session details' })).toBeVisible()
  expect(await recordCounts(page)).toEqual([1, 1])
})

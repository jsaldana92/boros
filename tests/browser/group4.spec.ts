import { cardAction } from './create-actions'
import 'fake-indexeddb/auto'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { BorosDatabase } from '../../src/db/database'
import { progressFixture } from '../fixtures/progress'

test.setTimeout(120000)
const b = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const weights = (page: Page) => page.getByRole('combobox', { name: 'Select measurement', exact: true })
const selection = (page: Page, name: string) => page.locator('.workout-progress-grid button').filter({ has: page.getByText(name, { exact: true }) })
async function seed(page: Page) {
  const db = new BorosDatabase(`boros-test-group4-browser-${crypto.randomUUID()}`)
  try {
    const fixture = await progressFixture(db), stores = await Promise.all(db.tables.map(async (table) => ({ name: table.name, values: await table.toArray() })))
    await page.goto('./'); await b(page, 'Progress').click(); if (await b(page, 'Understood').isVisible()) await b(page, 'Understood').click()
    await page.evaluate(async (stores) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      await new Promise<void>((resolve, reject) => { const tx = db.transaction(stores.map((s) => s.name), 'readwrite'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); for (const store of stores) for (const value of store.values) tx.objectStore(store.name).put(store.name === 'settings' ? { ...value, noticeAccepted: true } : value) }); db.close()
    }, stores)
    await page.reload(); await expect(weights(page).locator('option')).toHaveCount(3)
    return fixture
  } finally { await db.delete() }
}

test('graph selection, overlap keyboard access, correction/deletion, theme and Settings synchronization', async ({ page }, info) => {
  await seed(page); const address = page.url(), chart = page.getByRole('group', { name: /^Body weight over time/ })
  await expect(page.getByRole('heading', { name: 'Measurement history', exact: true })).toHaveCount(0)
  await expect(page.getByText(/Canonical:|Vertical scale:|Exact values and record details/)).toHaveCount(0)
  await expect(chart.locator('.date-tick').first()).toHaveAttribute('transform', /rotate\(-40/)
  await expect(chart.locator('.axis-label')).toHaveCount(8)
  await expect(chart.locator('circle')).toHaveCount(3)
  expect(await chart.locator('circle').nth(1).getAttribute('cx')).toBe(await chart.locator('circle').nth(2).getAttribute('cx'))
  expect(await chart.locator('circle').nth(1).getAttribute('cy')).toBe(await chart.locator('circle').nth(2).getAttribute('cy'))
  await chart.focus(); await page.keyboard.press('Home'); await expect(weights(page)).toHaveValue(await weights(page).locator('option').first().getAttribute('value') as string)
  await page.keyboard.press('ArrowRight'); const middle = await weights(page).inputValue(); await page.keyboard.press('End'); expect(await weights(page).inputValue()).not.toBe(middle)
  await b(page, 'Edit measurement').click(); await page.getByLabel('Weight (kg)', { exact: true }).fill('69'); await b(page, 'Save measurement').click(); await expect(page.locator('.current-weight')).toHaveText('Current weight: 69 kg')
  await b(page, 'Settings').click(); await expect(page.getByLabel('Weight (kg, optional)', { exact: true })).toHaveValue('69'); await b(page, 'Light').click(); await b(page, 'Progress').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); await b(page, 'Delete measurement').click(); await page.keyboard.press('Escape'); await expect(b(page, 'Delete measurement')).toBeFocused()
  await b(page, 'Delete measurement').click(); await b(page, 'Delete entry and its photo').click(); await expect(weights(page).locator('option')).toHaveCount(2); await expect(page.locator('.current-weight')).toHaveText('Current weight: 70 kg')
  await page.screenshot({ path: info.outputPath('group4-body-light.png'), fullPage: true }); expect(page.url()).toBe(address)
  await weights(page).selectOption({ index: 0 }); await b(page, 'Delete measurement').click(); await b(page, 'Delete entry and its photo').click()
  await expect(chart.locator('circle')).toHaveCount(1); expect(Number(await chart.locator('circle').getAttribute('cx'))).toBeGreaterThan(0)
  await b(page, 'Add measurement').click(); await page.getByLabel('Weight (kg)', { exact: true }).fill('70'); await page.getByLabel('Measurement date/time', { exact: true }).fill('2025-01-04T12:00'); await b(page, 'Save measurement').click()
  await expect(chart.locator('circle')).toHaveCount(2); expect(await chart.locator('circle').first().getAttribute('cy')).toBe(await chart.locator('circle').last().getAttribute('cy'))
  await expect(chart).not.toContainText('NaN'); expect(new Set(await chart.locator('g .axis-label').allTextContents()).size).toBe(5)
})

test('plan carousel, plan/all scopes, historical supersets, actual set selection and saved notes', async ({ page }, info) => {
  await seed(page); const address = page.url()
  await expect(page.locator('.workout-progress-grid')).toHaveCSS('grid-template-columns', /\S+ \S+ \S+/)
  await b(page, 'Next plan card').click(); await expect(page.locator('.progress-carousel button').last()).toBeFocused()
  await b(page, 'Previous plan card').click(); await page.keyboard.press('Enter'); await expect(page.getByRole('heading', { name: 'Alpha', exact: true })).toBeFocused()
  await expect(page.locator('.progress-counts')).toContainText('2 Training days completed'); await expect(page.locator('.progress-counts')).toContainText('7 Exercise completions')
  await selection(page, 'Renamed press').click(); await expect(page.getByRole('region', { name: 'Maximum recorded weight', exact: true })).toContainText('45.359237 kg × 7 reps')
  await expect(page.getByRole('region', { name: 'Starting performance', exact: true })).toContainText('0 kg × 5 reps')
  await expect(page.getByRole('region', { name: 'Starting performance', exact: true }).locator('.recorded-performance')).toHaveCount(2)
  await b(page, 'Back to plan progress').click(); await b(page, 'Back to Progress').click(); await selection(page, 'Renamed press').click()
  await expect(page.getByRole('region', { name: 'Maximum recorded weight', exact: true })).toContainText('61 kg × 7 reps')
  const sets = page.getByRole('combobox', { name: 'Select recorded set for Renamed press', exact: true }); await expect(sets.locator('option')).toHaveCount(14)
  await sets.selectOption({ index: 0 }); await b(page, 'Review selected session').click(); await expect(page.getByRole('region', { name: 'Saved session details', exact: true })).toContainText('Saved session note'); await expect(page.getByRole('region', { name: 'Saved session details', exact: true })).toContainText('Occurrence 2 note')
  await b(page, 'Back to statistics').first().click(); await b(page, 'Back to Progress').click()
  await selection(page, 'Superset · Renamed press + Row').click(); await expect(page.locator('.superset-progress-member')).toHaveCount(2)
  const first = page.getByRole('region', { name: 'Member 1: Renamed press', exact: true }), second = page.getByRole('region', { name: 'Member 2: Row', exact: true })
  expect(await first.locator('circle').first().getAttribute('fill')).not.toBe(await second.locator('circle').first().getAttribute('fill'))
  await expect(first).toContainText('3 recorded sets'); await expect(second).toContainText('2 recorded sets')
  await expect(first.getByRole('region', { name: 'Maximum recorded weight' })).toContainText('61 kg'); await expect(second.getByRole('region', { name: 'Maximum recorded weight' })).toContainText('70 kg')
  await page.screenshot({ path: info.outputPath('group4-members-dark.png'), fullPage: true })
  await b(page, 'Back to Progress').click(); await selection(page, 'Superset · Renamed press + Press').click(); await expect(page.getByRole('region', { name: 'Member 2: Press', exact: true })).toContainText('80 kg')
  await b(page, 'Back to Progress').click(); await b(page, 'Settings').click(); await page.getByRole('combobox', { name: 'Active profile', exact: true }).selectOption({ label: 'Other history' }); await b(page, 'Progress').click()
  await expect(selection(page, 'Renamed press')).toHaveCount(0); await selection(page, 'Private exercise').click(); await expect(page.locator('.exercise-statistics')).toContainText('999 kg')
  await page.reload(); await expect(selection(page, 'Private exercise')).toBeVisible(); await expect(page.locator('.progress-drilldown')).toHaveCount(0); expect(page.url()).toBe(address)
})

test('live archive/restore retains history; backup replacement retires an open Progress selection', async ({ page, context }) => {
  await seed(page); const other = await context.newPage(); await other.goto('./'); await b(other, 'Create').click()
  await selection(page, 'Renamed press').click(); await expect(page.locator('.exercise-statistics')).toContainText('14 recorded sets')
  const beta = other.getByRole('article', { name: 'Plan Beta', exact: true })
  // Beta starts archived; the plan manager's archive control is independent of the exercise library.
  await other.getByRole('checkbox', { name: 'Show archived plans', exact: true }).check(); await cardAction(other, beta, 'Restore')
  await expect(page.locator('.exercise-statistics')).toContainText('14 recorded sets')
  await b(page, 'Back to Progress').click(); await expect(page.locator('.progress-carousel button').filter({ hasText: 'Beta' })).not.toContainText('Archived')
  await other.getByRole('checkbox', { name: 'Show archived plans', exact: true }).uncheck(); await cardAction(other, beta, 'Archive'); await other.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.locator('.progress-carousel button').filter({ hasText: 'Beta' })).toContainText('Archived')
  await selection(page, 'Renamed press').click(); await b(other, 'Settings').click(); await other.getByRole('checkbox', { name: 'I understand this exports saved data only.' }).check()
  const ready = other.waitForEvent('download'); await b(other, 'Download data').click(); const buffer = await readFile((await (await ready).path())!)
  await other.getByLabel('Backup ZIP', { exact: true }).setInputFiles({ name: 'replace.zip', mimeType: 'application/zip', buffer }); await expect(other.getByRole('heading', { name: /^Validated backup:/ })).toBeVisible()
  await other.getByRole('combobox', { name: 'Import choice', exact: true }).selectOption('replace'); await b(other, 'Preview import').click(); await other.getByRole('checkbox', { name: /^I confirm/ }).check(); await b(other, 'Confirm and save').click()
  await expect(page.locator('.exercise-statistics')).toHaveCount(0); await page.reload(); await selection(page, 'Renamed press').click(); await expect(page.locator('.exercise-statistics')).toContainText('14 recorded sets')
  await other.close()
})

test('export/restore preserves analytics, Clear invalidates an open view, large text and navigation clearance', async ({ page, context }, info) => {
  await seed(page); await b(page, 'Settings').click(); await page.getByRole('checkbox', { name: 'I understand this exports saved data only.' }).check()
  const download = page.waitForEvent('download'); await b(page, 'Download data').click(); const buffer = await readFile((await (await download).path())!)
  await page.getByLabel('Backup ZIP', { exact: true }).setInputFiles({ name: 'group4.zip', mimeType: 'application/zip', buffer })
  await expect(page.getByRole('heading', { name: /^Validated backup:/ })).toBeVisible(); await page.getByRole('combobox', { name: 'Import choice', exact: true }).selectOption('new'); await page.getByLabel('Imported profile name', { exact: true }).fill('Progress restored')
  await b(page, 'Preview import').click(); await page.getByRole('checkbox', { name: /^I confirm/ }).check(); await b(page, 'Confirm and save').click(); await expect(page.getByText(/Changes are saved locally\./)).toBeVisible(); await page.reload()
  await b(page, 'Progress').click(); await expect(weights(page).locator('option')).toHaveCount(3); await selection(page, 'Renamed press').click(); await expect(page.locator('.exercise-statistics')).toContainText('14 recorded sets')
  await expect(page.getByRole('region', { name: 'Maximum recorded weight' })).toContainText('61 kg')
  await b(page, 'Review selected session').focus(); const action = await b(page, 'Review selected session').boundingBox(), nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox(); expect(action!.y + action!.height).toBeLessThanOrEqual(nav!.y)
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px' }); await page.setViewportSize({ width: 320, height: 844 }); await b(page, 'Back to Progress').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('group4-large-text.png'), fullPage: true }); await selection(page, 'Renamed press').click()
  const other = await context.newPage(); await other.goto('./'); await b(other, 'Settings').click(); await b(other, 'Clear data').click()
  await other.getByRole('checkbox', { name: /^I confirm/ }).check(); await b(other, 'Confirm and save').click()
  await expect(page.locator('.exercise-statistics')).toHaveCount(0); await expect(page.getByRole('alert').filter({ hasText: /unavailable|replaced|changed/ }).first()).toBeVisible()
  await other.close()
})

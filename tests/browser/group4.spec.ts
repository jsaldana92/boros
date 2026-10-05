import { confirmDownload } from './settings-actions'
import 'fake-indexeddb/auto'
import { planService } from '../../src/db/plans'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { BorosDatabase } from '../../src/db/database'
import { scheduleService } from '../../src/db/schedules'
import { occurrences } from '../../src/schemas/schedule'
import { addDays } from '../../src/lib/calendar-dates'
import { progressFixture } from '../fixtures/progress'
import { runPage } from './calendar-actions'

test.setTimeout(120000)
const b = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const selection = (page: Page, name: string) => page.getByRole('region', { name: 'Overall exercises' }).getByRole('button').filter({ has: page.getByText(name, { exact: true }) })
async function seed(page: Page) {
  const db = new BorosDatabase(`boros-test-progress-browser-${crypto.randomUUID()}`)
  try {
    const fixture = await progressFixture(db)
    // Historical instance fixtures retain the original frozen session/draft days.
    for (const plan of [fixture.alpha, fixture.beta]) {
      const stored = (await db.plans.get([fixture.id, plan.id]))!
      if (stored.archivedAt) await planService(db).setArchived(fixture.id, stored.id, stored.revision, false)
      const run = await scheduleService(db).create(fixture.id, { planId: plan.id, planRevision: (await db.plans.get([fixture.id, plan.id]))!.revision, startWeek: '2024-12-30', timeZone: 'UTC', mapping: [{ dayId: plan.days[0].id, weekday: 0 }] })
      const logs = (await db.sessions.where('profileId').equals(fixture.id).toArray()).filter(s => s.sourcePlanId === plan.id).sort((a, b) => a.completedAt.localeCompare(b.completedAt))
      for (const [index, log] of logs.entries()) {
        const week = addDays(run.startWeek, index * 7), ref = occurrences(run, week, addDays(week, 6))[0].ref
        await db.sessions.update([fixture.id, log.id], { occurrence: ref, occurrenceKey: ref.key })
        await db.drafts.update([fixture.id, log.draftId], { occurrence: ref, occurrenceKey: ref.key })
      }
    }
    const stores = await Promise.all(db.tables.map(async table => ({ name: table.name, values: await table.toArray() })))
    await page.goto('./'); if (await b(page, 'Understood').isVisible()) await b(page, 'Understood').click()
    await page.evaluate(async stores => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      await new Promise<void>((resolve, reject) => { const tx = db.transaction(stores.map(s => s.name), 'readwrite'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); for (const store of stores) for (const value of store.values) tx.objectStore(store.name).put(store.name === 'settings' ? { ...value, noticeAccepted: true } : value) }); db.close()
    }, stores)
    await page.reload(); await b(page, 'Progress').click(); await expect(page.locator('.weight-point')).toHaveCount(3)
  } finally { await db.delete() }
}

test('instance/Overall metrics, repeated and superset occurrences, paired actual-date extrema, filter and Back restoration', async ({ page }, info) => {
  await seed(page); const address = page.url()
  await expect(selection(page, 'Renamed press')).toHaveCount(1); await expect(selection(page, 'Renamed press')).toContainText(/Added: \d{2}\/\d{2}\/\d{4}/)
  await expect(page.getByText('Saved sessions', { exact: false })).toHaveCount(0)
  await page.evaluate(() => { (window as any).photoReads = 0; const get = IDBObjectStore.prototype.get; IDBObjectStore.prototype.get = function (...args) { if (this.name === 'photos') (window as any).photoReads++; return get.apply(this, args) } })
  const main = page.getByRole('region', { name: 'Exercises', exact: true }); await main.getByLabel('Search exercises', { exact: true }).fill('Renamed'); await selection(page, 'Renamed press').click()
  await expect(page.getByRole('heading', { name: 'Body weight' })).toHaveCount(0); await expect(page.getByText('Overall', { exact: true })).toBeVisible()
  await expect(page.locator('.analytics-metrics')).toContainText('5Times Completed'); await expect(b(page, 'Weight Max: 61 kg')).toBeVisible(); await b(page, 'Weight Min: 0 kg').click()
  let popup = page.getByRole('dialog'); await expect(popup).toContainText('0 kg'); await expect(popup).toContainText('5 reps'); await expect(popup).toContainText('Alpha · Strength'); await expect(popup).toContainText('Jan 1, 2025'); await page.keyboard.press('Escape')
  await b(page, 'Reps Max: 7').click(); await expect(page.getByRole('dialog')).toContainText('45.359237 kg'); await b(page, 'Close').click(); await b(page, 'Back').click()
  await expect(main.getByLabel('Search exercises', { exact: true })).toHaveValue('Renamed'); await expect(selection(page, 'Renamed press')).toBeFocused()
  await page.getByRole('article', { name: 'Run Alpha', exact: true }).locator('.catalog-card').click(); await expect(page.locator('.analytics-metrics')).toContainText('0Times Completed'); await expect(page.locator('.analytics-metrics')).toContainText('6Exercises Completed')
  const grid = page.getByRole('region', { name: 'Plan exercises' }); await expect(grid.getByRole('button')).toHaveCount(6)
  const presses = grid.getByRole('button').filter({ has: page.getByText('Press', { exact: true }) }); expect(await presses.count()).toBeGreaterThan(1)
  await page.getByRole('region', { name: 'Plan analytics' }).getByLabel('Search exercises', { exact: true }).fill('Press'); await presses.first().click(); await expect(page.getByText('Alpha · Strength', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Body weight' })).toHaveCount(0)
  const max = page.getByRole('button', { name: /^Weight Max:/ }); await max.click(); popup = page.getByRole('dialog'); await expect(popup).not.toContainText('Alpha'); await expect(popup).not.toContainText(/UTC|America\//); await page.keyboard.press('Escape'); await b(page, 'Back').click()
  await expect(page.getByRole('region', { name: 'Plan analytics' }).getByLabel('Search exercises', { exact: true })).toHaveValue('Press'); await expect(b(page, 'Back')).toHaveCount(1)
  expect(await page.evaluate(() => (window as any).photoReads)).toBe(0)
  await page.screenshot({ path: info.outputPath('plan-analytics-dark.png'), fullPage: true }); await b(page, 'Back').click(); await b(page, 'Settings').click(); await b(page, 'Light').click(); await b(page, 'Progress').click(); await selection(page, 'Renamed press').click(); await page.screenshot({ path: info.outputPath('exercise-analytics-light.png'), fullPage: true }); expect(page.url()).toBe(address)
})

test('Progress shares Previous Plans Hide/Unhide/Delete state, wording and result removal with Calendar', async ({ page }) => {
  await seed(page); const alpha = page.getByRole('article', { name: 'Run Alpha', exact: true })
  await b(page, 'Actions for Alpha').click(); await b(page, 'Hide').click(); await expect(alpha).toHaveCount(0)
  await selection(page, 'Renamed press').click(); await expect(b(page, 'Weight Min: 0 kg')).toBeVisible(); await b(page, 'Back').click()
  await b(page, 'Calendar').click(); await runPage(page, 'Previous Plans'); await expect(alpha).toHaveCount(0); await page.getByRole('checkbox', { name: 'Show hidden plans' }).check(); await alpha.getByRole('button').click(); await b(page, 'Unhide').click()
  await b(page, 'Progress').click(); await expect(alpha).toBeVisible(); await b(page, 'Actions for Alpha').click(); await b(page, 'Delete').click(); const confirm = page.getByRole('dialog', { name: 'Delete Plan?', exact: true }); await expect(confirm).toContainText('Deleting this plan will delete all results associated with it. This cannot be undone.'); await confirm.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.keyboard.press('Escape'); await expect(alpha).toBeVisible()
  await b(page, 'Actions for Alpha').click(); await b(page, 'Delete').click(); await confirm.getByRole('button', { name: 'Delete', exact: true }).click(); await expect(alpha).toHaveCount(0)
  await selection(page, 'Renamed press').click(); await expect(b(page, 'Weight Min: 40 kg')).toBeVisible(); await expect(page.locator('.analytics-metrics')).toContainText('2Times Completed')
})

test('backup round trip, profile isolation, Clear invalidation and enlarged text preserve analytics', async ({ page, context }, info) => {
  await seed(page); await b(page, 'Settings').click();
  const download = page.waitForEvent('download'); await confirmDownload(page); const buffer = await readFile((await (await download).path())!)
  await page.getByLabel('Backup ZIP', { exact: true }).setInputFiles({ name: 'progress.zip', mimeType: 'application/zip', buffer }); await expect(page.getByRole('heading', { name: /^Validated backup:/ })).toBeVisible()
  await page.getByRole('combobox', { name: 'Import choice', exact: true }).selectOption('new'); await page.getByLabel('Imported profile name', { exact: true }).fill('Progress restored'); await b(page, 'Preview import').click(); await page.getByRole('checkbox', { name: /^I confirm/ }).check(); await b(page, 'Confirm and save').click(); await expect(page.getByText(/Changes are saved locally\./)).toBeVisible(); await page.reload()
  await b(page, 'Progress').click(); await expect(page.locator('.weight-point')).toHaveCount(3); await selection(page, 'Renamed press').click(); await expect(b(page, 'Weight Max: 61 kg')).toBeVisible(); await b(page, 'Back').click()
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px' }); await page.setViewportSize({ width: 320, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('progress-large-text.png'), fullPage: true })
  await b(page, 'Settings').click(); await page.getByRole('combobox', { name: 'Active profile', exact: true }).selectOption({ label: 'Other history' }); await b(page, 'Progress').click(); await expect(selection(page, 'Renamed press')).toHaveCount(0); await selection(page, 'Private exercise').click(); await expect(b(page, 'Weight Max: 999 kg')).toBeVisible()
  const other = await context.newPage(); await other.goto('./'); await b(other, 'Settings').click(); await b(other, 'Clear data').click(); await other.getByRole('checkbox', { name: /^I confirm/ }).check(); await b(other, 'Confirm and save').click(); await expect(page.locator('.exercise-statistics')).toHaveCount(0); await expect(page.getByRole('alert').filter({ hasText: /unavailable|replaced|changed/ }).first()).toBeVisible(); await other.close()
})

import { createNamedProfile } from './settings-actions'
import { manageRun, returnCalendar, addCalendarPlan, stagePlan } from './calendar-actions'
import { waitForDraft } from './train-actions'
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(90000)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const fixture = { schemaVersion: 1, kind: 'plan', plan: { name: 'Calendar four', trainingDaysPerWeek: 4, days: ['Upper', 'Lower', 'Push', 'Pull'].map((name) => ({ name, exercises: [{ name: `${name} exercise`, sets: [{ reps: { min: 5, max: 8 } }, { reps: { min: 8, max: 8 } }] }] })) } }
async function setup(page: Page) {
  await page.clock.setFixedTime(new Date('2025-01-06T01:00:00Z'))
  await page.goto('./'); await button(page, 'Create').click()
  const notice = button(page, 'Understood'); if (await notice.isVisible()) await notice.click()
  await button(page, 'Import').click(); await page.getByLabel('AI output JSON', { exact: true }).fill(JSON.stringify(fixture))
  await button(page, 'Validate and preview').click(); await page.getByLabel('Duration (weeks)', { exact: true }).fill('104'); await button(page, 'Save plan').click()
  await expect(page.getByRole('article', { name: 'Plan Calendar four', exact: true })).toBeVisible()
  await button(page, 'Calendar').click(); await button(page, 'Week').click(); await addCalendarPlan(page, '2024-12-30', 'Calendar four'); await expect(page.locator('.calendar-event')).toHaveCount(4)
}
const upper = (page: Page) => page.locator('.calendar-event').filter({ hasText: 'Upper' })
async function recordPartial(page: Page) {
  await page.getByLabel('Upper exercise set 1 Weight (kg)', { exact: true }).fill('40')
  await page.getByLabel('Upper exercise set 1 Repetitions', { exact: true }).fill('5')
  await button(page, 'Save').click(); await expect(page.getByRole('dialog')).toContainText('partial')
  await page.getByRole('dialog').getByRole('button').last().click()
  await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('Partial session')
}

test('four-day schedule: partial completion, next/prior week, all views, reload, details, themes and profile isolation', async ({ page }, testInfo) => {
  await setup(page); const address = page.url()
  await page.screenshot({ path: testInfo.outputPath('calendar-dark.png'), fullPage: true })
  await expect(button(page, 'Week')).toHaveAttribute('aria-pressed', 'true')
  await upper(page).click(); await expect(page.getByRole('region', { name: 'Training session' })).not.toContainText('Scheduled:')
  await recordPartial(page); await page.reload(); await button(page, 'Calendar').click(); await button(page, 'Week').click(); await page.getByLabel('Calendar date', { exact: true }).fill('2024-12-30')
  await expect(page.locator('.calendar-event').filter({ hasText: 'Completed' })).toHaveCount(1); await expect(upper(page)).toContainText('Completed')
  await button(page, 'Next period').click(); await expect(page.locator('.calendar-event')).toHaveCount(4); await expect(page.locator('.calendar-event.completed')).toHaveCount(0)
  await button(page, 'Previous period').click(); await expect(page.locator('.calendar-event').filter({ hasText: 'Completed' })).toHaveCount(1)
  await button(page, 'Day').click(); await expect(page.locator('.calendar-event')).toHaveCount(1)
  await button(page, 'Month').click(); await expect(page.getByLabel('month calendar')).toBeVisible()
  await button(page, 'Today').click(); await expect(page.getByLabel('Calendar date', { exact: true })).toHaveValue(/2025-01-0[56]/)
  await button(page, 'Week').click(); await page.getByLabel('Calendar date', { exact: true }).fill('2024-12-30')
  await page.reload(); await button(page, 'Week').click(); await page.getByLabel('Calendar date', { exact: true }).fill('2024-12-30'); await upper(page).click()
  await expect(page.getByRole('region', { name: 'Saved session details' })).not.toContainText('Scheduled:'); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calendar')
  const localCompletion = await page.evaluate(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2025-01-06T01:00:00Z')))
  await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText(`Completed: ${localCompletion}`)
  await page.getByRole('dialog', { name: 'Completed workout' }).getByRole('button', { name: 'Close', exact: true }).click(); await button(page, 'Settings').click(); await button(page, 'Light').click()
  await createNamedProfile(page, 'Other calendar')
  await button(page, 'Calendar').click(); await button(page, 'Week').click(); await expect(page.locator('.calendar-event')).toHaveCount(0); await expect(page.getByText('No Calendar assignments. Add a plan to begin.')).toHaveCount(0)
  await button(page, 'Settings').click(); await page.getByRole('combobox', { name: 'Active profile', exact: true }).selectOption({ label: 'Guest' }); await button(page, 'Calendar').click()
  await page.getByLabel('Calendar date', { exact: true }).fill('2024-12-30'); await expect(page.locator('.calendar-event').filter({ hasText: 'Completed' })).toHaveCount(1)
  expect(page.url()).toBe(address)
  if (testInfo.project.name.includes('phone')) await page.setViewportSize({ width: 320, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await button(page, 'Add Plan').focus(); await button(page, 'Add Plan').scrollIntoViewIfNeeded()
  const actionBox = await button(page, 'Add Plan').boundingBox(), navBox = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox()
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(navBox!.y)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('calendar-light.png'), fullPage: true })
})

test('current mapping keeps started input; stale previews reject and keyboard cancellation preserves edits', async ({ page, context }) => {
  await setup(page); await page.getByLabel('Calendar date', { exact: true }).fill('2025-01-06'); await upper(page).click()
  await page.getByLabel('Upper exercise set 1 Weight (kg)', { exact: true }).fill('55'); await waitForDraft(page)
  await page.reload(); await button(page, 'Calendar').click(); await manageRun(page, 'Edit'); await page.getByLabel('Upper weekday', { exact: true }).selectOption('4')
  page.once('dialog', d => d.dismiss()); await button(page, 'Train').click(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit Plan')
  await expect(page.getByLabel('Upper weekday', { exact: true })).toHaveValue('4')
  const second = await context.newPage(); await second.clock.setFixedTime(new Date('2025-01-06T01:00:00Z')); await second.goto('./'); await button(second, 'Calendar').click(); await manageRun(second, 'Edit'); await second.getByLabel('Upper weekday', { exact: true }).selectOption('5'); await button(second, 'Save').click(); await expect(second.getByRole('article', { name: 'Run Calendar four' })).toBeVisible(); await expect(second.getByRole('dialog')).toHaveCount(0)
  await button(page, 'Save').click(); await expect(page.getByRole('alert')).toContainText('run changed'); await expect(page.getByLabel('Upper weekday', { exact: true })).toHaveValue('4')
  await button(page, 'Cancel').click(); await returnCalendar(page); await button(page, 'Week').click(); await page.getByLabel('Calendar date', { exact: true }).fill('2025-01-06'); await expect(upper(page)).toContainText('Incomplete'); await upper(page).click(); await expect(page.getByLabel('Upper exercise set 1 Weight (kg)', { exact: true })).toHaveValue('55')
  await page.reload(); await button(page, 'Calendar').click(); await button(page, 'Week').click(); await page.getByLabel('Calendar date', { exact: true }).fill('2024-12-30'); await expect(page.locator('.calendar-event')).toHaveCount(4); await second.close()
})

test('stored schedule zone and Today survive a device-zone change at a Sunday/Monday boundary', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' })
  await setup(page); await expect(page.getByLabel('Displayed time zone', { exact: true })).toHaveCount(0)
  await button(page, 'Today').click(); await expect(page.getByLabel('Calendar date', { exact: true })).toHaveValue('2025-01-05')
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' }); await page.reload()
  await button(page, 'Today').click(); await expect(page.getByLabel('Calendar date', { exact: true })).toHaveValue('2025-01-06')
  await button(page, 'Calendar').click(); await button(page, 'Today').click(); await expect(page.getByLabel('Calendar date', { exact: true })).toHaveValue('2025-01-06'); await expect(page.locator('.calendar-event').first()).not.toContainText('America/New_York')
  await manageRun(page, 'Edit'); await expect(page.locator('.schedule-editor')).not.toContainText('America/New_York')
})

test('failed schedule save preserves preview and unload guard; retry creates one assignment for another template', async ({ page }) => {
  await setup(page); await button(page, 'Create').click(); await button(page, 'Import').click(); await page.getByLabel('AI output JSON', { exact: true }).fill(JSON.stringify({ ...fixture, plan: { ...fixture.plan, name: 'Second plan' } })); await button(page, 'Validate and preview').click(); await page.getByLabel('Duration (weeks)', { exact: true }).fill('104'); await button(page, 'Save plan').click(); await button(page, 'Calendar').click(); await button(page, 'Week').click(); await page.getByLabel('Calendar date', { exact: true }).fill('2024-12-30'); await button(page, 'Add Plan').click(); await stagePlan(page, 'Second plan')
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add
    ;(window as unknown as { restoreCalendarWrite: () => void }).restoreCalendarWrite = () => { IDBObjectStore.prototype.add = original }
    IDBObjectStore.prototype.add = function (...args) { if (this.name === 'schedules') throw new DOMException('Simulated schedule disk full', 'QuotaExceededError'); return original.apply(this, args) }
  })
  await button(page, 'Save').click(); await expect(page.getByRole('alert')).toContainText('Simulated schedule disk full'); await expect(page.locator('.add-plan-list .status-pill')).toHaveText('Scheduled')
  const unload = page.waitForEvent('dialog'); await page.evaluate(() => { setTimeout(() => window.location.reload(), 0) })
  const warning = await unload; expect(warning.type()).toBe('beforeunload'); await warning.dismiss(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Add Plan')
  await page.evaluate(() => (window as unknown as { restoreCalendarWrite: () => void }).restoreCalendarWrite())
  await button(page, 'Save').click(); await expect(page.locator('.calendar-event')).toHaveCount(8)
  const names = await upper(page).allTextContents(); expect(names[0]).not.toEqual(names[1])
  await upper(page).first().click(); await recordPartial(page); await button(page, 'Calendar').click(); await button(page, 'Week').click(); await page.getByLabel('Calendar date', { exact: true }).fill('2024-12-30')
  await expect(page.locator('.calendar-event').filter({ hasText: 'Completed' })).toHaveCount(1); await expect(upper(page)).toHaveCount(2)
  await page.reload(); await button(page, 'Week').click(); await page.getByLabel('Calendar date', { exact: true }).fill('2024-12-30'); await expect(page.locator('.calendar-event')).toHaveCount(8); await expect(page.locator('.calendar-event').filter({ hasText: 'Completed' })).toHaveCount(1)
})

import { cardAction } from './create-actions'
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(120000)
const button = (p: Page, name: string) => p.getByRole('button', { name, exact: true })
const field = (p: Page, name: string) => name === 'Active profile' ? p.getByRole('combobox', { name, exact: true }) : p.getByLabel(name, { exact: true })
const card = (p: Page, name: string) => p.getByRole('article', { name: `Train plan ${name}`, exact: true })
async function start(p: Page) {
  await p.goto('./'); await expect(p.getByText('No active plan(s) selected.', { exact: true })).toBeVisible()
  if (await button(p, 'Understood').isVisible()) await button(p, 'Understood').click()
  await expect(p.getByRole('heading', { name: 'Start or resume' })).toHaveCount(0)
  await expect(p.getByRole('button', { name: /^Saved sessions/ })).toHaveCount(0)
}
async function importPlan(p: Page, name: string) {
  await button(p, 'Create').click(); await button(p, 'Import AI Output').click()
  await field(p, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 2, kind: 'plan', plan: { name, durationWeeks: 1, trainingDaysPerWeek: 1, days: [{ name: 'Workout', exercises: [{ name: 'Press', sets: [{ reps: { min: 5, max: 8 } }, { reps: { min: 5, max: 8 } }] }] }] } }))
  await button(p, 'Validate and preview').click(); await button(p, 'Save plan').click(); await expect(p.getByRole('article', { name: `Plan ${name}`, exact: true })).toBeVisible()
}
async function zone(p: Page, value: string) {
  await button(p, 'Settings').click(); await field(p, 'Time zone').fill(value); await button(p, 'Save profile').click(); await expect(p.getByText('Profile saved.', { exact: true })).toBeVisible()
}
async function select(p: Page, names: string[]) {
  await button(p, 'Train').click(); if (await button(p, 'Back to training days').isVisible()) await button(p, 'Back to training days').click(); await button(p, 'Select Plans').click()
  const checks = p.getByRole('dialog').getByRole('checkbox')
  for (let i = 0; i < await checks.count(); i++) await checks.nth(i).uncheck()
  for (const name of names) await p.getByRole('dialog').getByRole('checkbox', { name, exact: true }).check()
  await button(p, 'Save selection').click(); await expect(p.getByRole('dialog')).toHaveCount(0)
}
async function schedule(p: Page, name: string, date: string) {
  await button(p, 'Calendar').click(); await expect(button(p, 'Month')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(p, 'Create a plan')).toHaveCount(0); await expect(field(p, 'Displayed time zone')).toHaveCount(0)
  await button(p, 'Add Plan').click(); await field(p, 'Schedule plan').selectOption({ label: name }); await field(p, 'Starting week (Monday)').fill(date)
  await button(p, 'Preview schedule').click(); await expect(p.getByRole('dialog')).toContainText('Monday: Workout'); await button(p, 'Confirm schedule').click()
}
async function records(p: Page) {
  return p.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try { const output: Record<string, any[]> = {}; for (const key of ['profiles', 'plans', 'schedules', 'sessions', 'drafts']) output[key] = await new Promise((resolve, reject) => { const r = db.transaction(key).objectStore(key).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }); return output }
    finally { db.close() }
  })
}

test('two plans → finite month schedule → exact unselected occurrence → reload draft → partial save → isolated profile, both themes and keyboard', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2025-03-01T12:00:00Z')); await start(page); const address = page.url()
  await zone(page, 'UTC'); await importPlan(page, 'Alpha'); await importPlan(page, 'Beta'); await select(page, ['Alpha', 'Beta'])
  await expect(card(page, 'Alpha')).toBeVisible(); await expect(card(page, 'Beta')).toBeVisible(); expect((await records(page)).drafts).toHaveLength(0)
  await button(page, 'Open Alpha').focus(); await page.keyboard.press('Enter'); await field(page, 'Training day').selectOption({ label: '1. Workout' })
  await button(page, 'Back to plans').click(); await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeFocused()
  await button(page, 'Open Beta').click(); await button(page, 'Back to plans').click(); await button(page, 'Open Alpha').click(); await expect(field(page, 'Training day')).not.toHaveValue('')
  await schedule(page, 'Alpha', '2025-02-24'); await button(page, 'Today').click()
  await expect(page.locator('.calendar-range')).toHaveText('March 2025'); await expect(page.locator('.calendar-day')).toHaveCount(42)
  const adjacent = page.getByRole('region', { name: '2025-02-24', exact: true }); await expect(adjacent).toHaveClass(/adjacent-month/); await expect(adjacent.locator('.calendar-event')).toContainText('Alpha / Workout')
  await button(page, 'Previous period').click(); await expect(page.locator('.calendar-range')).toHaveText('February 2025'); await button(page, 'Next period').click()
  await page.screenshot({ path: info.outputPath('group3-month-dark.png'), fullPage: true })
  await button(page, 'Train').click(); await expect(card(page, 'Alpha')).toContainText('PAST DUE'); await expect(card(page, 'Alpha')).toContainText('2025-02-24'); await expect(card(page, 'Beta').locator('.schedule-status')).toHaveCount(0)
  await expect(card(page, 'Alpha').locator('.past-due')).toHaveCSS('color', 'rgb(255, 147, 147)')
  await page.screenshot({ path: info.outputPath('group3-cards-dark.png'), fullPage: true })
  await select(page, ['Beta']); await expect(field(page, 'Training day')).toBeVisible(); await expect(button(page, 'Open Beta')).toHaveCount(0)
  const selectedBefore = (await records(page)).profiles[0].selectedPlanIds
  await button(page, 'Calendar').click(); await adjacent.locator('.calendar-event').click()
  await expect(page.getByRole('region', { name: 'Training session', exact: true })).toContainText('Scheduled: 2025-02-24')
  await field(page, 'Press set 1 Weight (kg)').fill('42'); await field(page, 'Press set 1 Repetitions').fill('6'); await expect(page.getByText('Draft saved locally.', { exact: true })).toBeVisible()
  const draft = (await records(page)).drafts[0]; await page.reload(); await page.getByRole('button', { name: /^Resume Alpha/ }).click(); await expect(field(page, 'Press set 1 Weight (kg)')).toHaveValue('42')
  expect((await records(page)).drafts[0].id).toBe(draft.id); expect((await records(page)).profiles[0].selectedPlanIds).toEqual(selectedBefore)
  await button(page, 'Save').click(); await button(page, 'Save partial session').click(); await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('Partial session')
  await select(page, ['Alpha', 'Beta']); await expect(card(page, 'Alpha')).toContainText('COMPLETED'); await expect(card(page, 'Alpha')).toContainText('Last workout: 2025-03-01')
  await button(page, 'Calendar').click(); await expect(adjacent.locator('.calendar-event')).toContainText('Completed · Partial')
  await button(page, 'Settings').click(); await button(page, 'Light').click(); await field(page, 'New profile name').fill('Isolated'); await button(page, 'Create profile').click()
  await button(page, 'Train').click(); await expect(page.getByText('No active plan(s) selected.')).toBeVisible(); await expect(page.getByRole('button', { name: /^Resume|^Saved sessions/ })).toHaveCount(0)
  await button(page, 'Settings').click(); await field(page, 'Active profile').selectOption({ label: 'Guest' }); await expect(field(page, 'Time zone')).toHaveValue('UTC')
  await button(page, 'Train').click(); await expect(card(page, 'Alpha')).toContainText('COMPLETED'); await page.reload(); await expect(card(page, 'Alpha')).toContainText('COMPLETED')
  await page.screenshot({ path: info.outputPath('group3-cards-light.png'), fullPage: true })
  await page.getByRole('button', { name: /^Saved sessions/ }).click(); await button(page, 'Review session').click(); await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('42 kg')
  await button(page, 'Calendar').click(); if (info.project.name.includes('phone')) await page.setViewportSize({ width: 320, height: 780 })
  await adjacent.locator('.calendar-event').focus(); await expect(adjacent.locator('.calendar-event')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const eventBox = await adjacent.locator('.calendar-event').boundingBox(), nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox(); expect(eventBox!.y + eventBox!.height).toBeLessThanOrEqual(nav!.y)
  await page.screenshot({ path: info.outputPath('group3-month-light.png'), fullPage: true }); expect(page.url()).toBe(address)
})

test('profile zone validation, stale selection, failed preference save and guarded Back/brand/profile changes retain recoverable input', async ({ page, context }) => {
  await start(page); await importPlan(page, 'Alpha'); await importPlan(page, 'Beta'); await select(page, ['Alpha', 'Beta'])
  await button(page, 'Select Plans').click(); await page.getByRole('checkbox', { name: 'Beta', exact: true }).uncheck()
  const second = await context.newPage(); await second.goto('./'); await zone(second, 'Asia/Tokyo')
  await button(page, 'Save selection').click(); await expect(page.getByRole('alert')).toContainText('changed in another tab'); await expect(page.getByRole('checkbox', { name: 'Beta', exact: true })).not.toBeChecked()
  page.once('dialog', (d) => d.dismiss()); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeVisible()
  page.once('dialog', (d) => d.accept()); await page.keyboard.press('Escape'); await select(page, ['Alpha'])
  await button(page, 'Settings').click(); await field(page, 'Time zone').fill('Mars/Olympus'); await button(page, 'Save profile').click(); await expect(page.getByRole('alert')).toContainText('supported IANA')
  page.once('dialog', (d) => d.dismiss()); await button(page, 'Boros home').click(); await expect(field(page, 'Time zone')).toHaveValue('Mars/Olympus')
  await field(page, 'New profile name').fill('Other'); page.once('dialog', (d) => d.dismiss()); await button(page, 'Create profile').click(); expect((await records(page)).profiles).toHaveLength(1)
  await field(page, 'Time zone').fill('UTC'); await button(page, 'Save profile').click(); await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  await button(page, 'Create profile').click(); await expect(field(page, 'Active profile')).not.toHaveValue((await records(page)).profiles.find((p) => p.name === 'Guest').id)
  await field(page, 'Time zone').fill('Pacific/Honolulu'); page.once('dialog', (d) => d.dismiss()); await field(page, 'Active profile').selectOption({ label: 'Guest' }); await expect(field(page, 'Time zone')).toHaveValue('Pacific/Honolulu')
  page.once('dialog', (d) => d.accept()); await field(page, 'Active profile').selectOption({ label: 'Guest' }); await button(page, 'Train').click(); await field(page, 'Training day').selectOption({ label: '1. Workout' }); await button(page, 'Start session').click()
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).recoverWrites = () => { IDBObjectStore.prototype.put = original }; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts') throw new DOMException('Group 3 simulated quota', 'QuotaExceededError'); return original.apply(this, args) } })
  await field(page, 'Press set 1 Weight (kg)').fill('12.'); await expect(page.getByText('Draft not saved. Your input is kept.')).toBeVisible()
  page.once('dialog', (d) => d.dismiss()); await button(page, 'Back to training days').click(); await expect(field(page, 'Press set 1 Weight (kg)')).toHaveValue('12.')
  page.once('dialog', (d) => d.dismiss()); await button(page, 'Settings').click(); await expect(field(page, 'Press set 1 Weight (kg)')).toHaveValue('12.')
  await page.evaluate(() => (window as any).recoverWrites()); await button(page, 'Retry draft save').click(); await expect(page.getByText('Draft saved locally.', { exact: true })).toBeVisible()
  await button(page, 'Back to training days').click(); await button(page, 'Select Plans').click(); await page.getByRole('checkbox', { name: 'Beta', exact: true }).check()
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).recoverPrefs = () => { IDBObjectStore.prototype.put = original }; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'profiles') throw new DOMException('Preference disk full', 'QuotaExceededError'); return original.apply(this, args) } })
  await button(page, 'Save selection').click(); await expect(page.getByRole('alert')).toContainText('Preference disk full'); await expect(page.getByRole('checkbox', { name: 'Beta', exact: true })).toBeChecked()
  await page.evaluate(() => (window as any).recoverPrefs()); await button(page, 'Save selection').click(); await expect(page.getByRole('dialog')).toHaveCount(0); await second.close()
})

test('status refreshes across midnight and background resume; changing preference keeps old schedule zone while new schedules use it', async ({ page }) => {
  await page.clock.install({ time: new Date('2025-01-05T23:59:30Z') }); await start(page); await zone(page, 'UTC'); await importPlan(page, 'Alpha'); await select(page, ['Alpha']); await schedule(page, 'Alpha', '2025-01-06')
  await button(page, 'Train').click(); await expect(card(page, 'Alpha')).toContainText('ON GOING')
  await page.clock.fastForward(31000); await expect(card(page, 'Alpha')).toContainText('DUE TODAY')
  await page.clock.setSystemTime(new Date('2025-01-07T00:00:01Z')); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await expect(card(page, 'Alpha')).toContainText('PAST DUE')
  const original = (await records(page)).schedules[0]; await zone(page, 'Pacific/Honolulu'); await page.reload(); await expect(field(page, 'Time zone')).toHaveValue('Pacific/Honolulu')
  await button(page, 'Calendar').click(); await button(page, 'Today').click(); await expect(field(page, 'Calendar date')).toHaveValue('2025-01-06')
  expect((await records(page)).schedules[0]).toEqual(original)
  await schedule(page, 'Alpha', '2025-01-06'); const all = (await records(page)).schedules; expect(all).toHaveLength(2); expect(all.find((s) => s.id !== original.id).timeZone).toBe('Pacific/Honolulu')
  await button(page, 'Train').click(); await expect(card(page, 'Alpha')).toContainText('PAST DUE'); await expect(card(page, 'Alpha')).toContainText('2 schedules')
})

test('archived selections disappear without choosing another plan and return when explicitly restored', async ({ page }) => {
  await start(page); await importPlan(page, 'Alpha'); await importPlan(page, 'Beta'); await select(page, ['Alpha'])
  const before = (await records(page)).profiles[0].selectedPlanIds
  await button(page, 'Create').click(); await cardAction(page, page.getByRole('article', { name: 'Plan Alpha', exact: true }), 'Archive'); await button(page, 'Archive').click()
  await button(page, 'Train').click(); await expect(page.getByText('No active plan(s) selected.')).toBeVisible(); expect((await records(page)).profiles[0].selectedPlanIds).toEqual(before)
  await page.reload(); await expect(card(page, 'Beta')).toHaveCount(0); await button(page, 'Create').click(); await page.getByRole('checkbox', { name: 'Show archived plans', exact: true }).check()
  await cardAction(page, page.getByRole('article', { name: 'Plan Alpha', exact: true }), 'Restore')
  await button(page, 'Train').click(); await expect(card(page, 'Alpha')).toBeVisible(); expect((await records(page)).drafts).toHaveLength(0)
})

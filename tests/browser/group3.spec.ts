import { deviceZone, createNamedProfile } from './settings-actions'
import { manageRun, returnCalendar, stagePlan } from './calendar-actions'
import { waitForDraft, startWeekly } from './train-actions'
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(120000)
const button = (p: Page, name: string) => p.getByRole('button', { name, exact: true })
const field = (p: Page, name: string) => ['Active profile', 'Program context'].includes(name) ? p.getByRole('combobox', { name, exact: true }) : p.getByLabel(name, { exact: true })
const card = (p: Page, name: string) => p.getByRole('article', { name: `Plan ${name}`, exact: true })
async function start(p: Page) {
  await p.goto('./'); await expect(p.getByText('No active plan(s) selected.', { exact: true })).toBeVisible()
  if (await button(p, 'Understood').isVisible()) await button(p, 'Understood').click()
  await expect(p.getByRole('heading', { name: 'Start or resume' })).toHaveCount(0)
  await expect(p.getByRole('button', { name: /^Saved sessions/ })).toHaveCount(0)
}
async function importPlan(p: Page, name: string) {
  await button(p, 'Create').click(); await button(p, 'Imported').click()
  await field(p, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 2, kind: 'plan', plan: { name, durationWeeks: 1, trainingDaysPerWeek: 1, days: [{ name: 'Workout', exercises: [{ name: 'Press', sets: [{ reps: { min: 5, max: 8 } }, { reps: { min: 5, max: 8 } }] }] }] } }))
  await button(p, 'Validate and preview').click(); await button(p, 'Save plan').click(); await expect(p.getByRole('article', { name: `Plan ${name}`, exact: true })).toBeVisible()
}
async function zone(p: Page, value: string) {
  await deviceZone(p, value)
}
async function select(p: Page, names: string[]) {
  await button(p, 'Train').click()
  for (const name of names) { await button(p, 'Add Plan').click(); await p.getByRole('dialog').getByRole('article', { name: 'Plan ' + name, exact: true }).getByRole('button').click(); await expect(p.getByRole('dialog')).toHaveCount(0) }
}
async function schedule(p: Page, name: string, date: string) {
  await button(p, 'Calendar').click(); await expect(button(p, 'Month')).toHaveAttribute('aria-pressed', 'true')
  await field(p, 'Calendar date').fill(date); await button(p, 'Add Plan').click()
  const candidate = p.getByRole('article', { name: 'Plan ' + name, exact: true })
  if (await candidate.count()) { await stagePlan(p, name); await button(p, 'Save').click() }
  else { await button(p, 'Cancel').click(); await manageRun(p, 'Edit', name); await field(p, 'Workout weekday').selectOption('0'); await button(p, 'Save').click(); await expect(p.getByRole('heading', { level: 1 })).toHaveText('Current Plans'); await returnCalendar(p) }
}
async function records(p: Page) {
  return p.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try { const output: Record<string, any[]> = {}; for (const key of ['profiles', 'plans', 'schedules', 'sessions', 'drafts']) output[key] = await new Promise((resolve, reject) => { const r = db.transaction(key).objectStore(key).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }); return output }
    finally { db.close() }
  })
}

test('immediate multi-plan selection, scheduling existing run, exact calendar occurrence, isolation and both themes', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2025-03-01T12:00:00Z')); await start(page); const address = page.url()
  await zone(page, 'UTC'); await importPlan(page, 'Alpha'); await importPlan(page, 'Beta'); await select(page, ['Alpha', 'Beta'])
  await expect(card(page, 'Alpha')).toBeVisible(); await expect(card(page, 'Beta')).toBeVisible()
  await card(page, 'Alpha').getByRole('button').focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Alpha')
  await button(page, 'Back to Plans').click(); await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeFocused()
  await schedule(page, 'Alpha', '2025-02-24'); await button(page, 'Today').click(); await expect(page.locator('.calendar-range')).toHaveText('March 2025')
  const adjacent = page.getByRole('region', { name: '2025-02-24', exact: true }); await expect(adjacent).toHaveClass(/adjacent-month/)
  await button(page, 'Train').click(); await card(page, 'Alpha').getByRole('button').click()
  await expect(field(page, 'Program context')).toHaveCount(0)
  const subtitle = page.getByRole('region', { name: 'Program week', exact: true }).locator(':scope > p.muted')
  await expect(subtitle).toContainText('Scheduled')
  const selected = (await records(page)).profiles[0].selectedPlanIds
  await button(page, 'Calendar').click(); await adjacent.locator('.calendar-event').click(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Alpha')
  await field(page, 'Press set 1 Weight (kg)').fill('42'); await field(page, 'Press set 1 Repetitions').fill('6'); await waitForDraft(page)
  const draft = (await records(page)).drafts[0]; await page.reload(); await page.getByRole('button', { name: /^Resume Alpha/ }).click(); await expect(field(page, 'Press set 1 Weight (kg)')).toHaveValue('42')
  await button(page, 'Save').click(); await button(page, 'Save partial session').click(); expect((await records(page)).sessions[0].occurrenceKey).toBe(draft.occurrenceKey); expect((await records(page)).profiles[0].selectedPlanIds).toEqual(selected)
  await button(page, 'Settings').click(); await button(page, 'Light').click(); await createNamedProfile(page, 'Other'); await expect(page.locator('input[name="name"]')).toHaveValue('Other')
  await button(page, 'Train').click(); await expect(page.getByText('No active plan(s) selected.')).toBeVisible()
  await button(page, 'Settings').click(); await field(page, 'Active profile').selectOption({ label: 'Guest' }); await button(page, 'Calendar').click(); await adjacent.locator('.calendar-event').click(); await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('42 kg')
  await page.getByRole('dialog', { name: 'Completed workout' }).getByRole('button', { name: 'Close', exact: true }).click(); await adjacent.locator('.calendar-event').focus(); await expect(adjacent.locator('.calendar-event')).toBeFocused(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('group3-calendar-light.png'), fullPage: true }); expect(page.url()).toBe(address)
})

test('concurrent Add Plan appends safely; failed selection and draft writes retain recoverable input', async ({ page, context }) => {
  await start(page); await importPlan(page, 'Alpha'); await importPlan(page, 'Beta'); await button(page, 'Train').click(); await button(page, 'Add Plan').click()
  const second = await context.newPage(); await second.goto('./'); await button(second, 'Train').click(); await button(second, 'Add Plan').click()
  await Promise.all([page.getByRole('dialog').getByRole('article', { name: 'Plan Alpha', exact: true }).getByRole('button').click(), second.getByRole('dialog').getByRole('article', { name: 'Plan Beta', exact: true }).getByRole('button').click()])
  await expect(card(page, 'Alpha')).toBeVisible(); await expect(card(page, 'Beta')).toBeVisible(); expect((await records(page)).profiles[0].selectedPlanIds).toHaveLength(2)
  await card(page, 'Beta').getByRole('button').click(); await button(page, 'Leave Plan').click(); await page.getByRole('dialog', { name: 'Ending a Plan?' }).getByRole('button', { name: 'End', exact: true }).click()
  await button(page, 'Add Plan').click(); await page.evaluate(() => { const put = IDBObjectStore.prototype.put; (window as any).recoverPrefs = () => { IDBObjectStore.prototype.put = put }; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'profiles') throw new DOMException('Preference disk full', 'QuotaExceededError'); return put.apply(this, args) } })
  await page.getByRole('dialog').getByRole('article', { name: 'Plan Beta', exact: true }).getByRole('button').click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Preference disk full')
  expect((await records(page)).profiles[0].selectedPlanIds).toHaveLength(1)
  await page.evaluate(() => (window as any).recoverPrefs()); await page.getByRole('dialog').getByRole('article', { name: 'Plan Beta', exact: true }).getByRole('button').click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await startWeekly(page, 'Alpha', 'Workout'); await page.evaluate(() => { const put = IDBObjectStore.prototype.put; (window as any).recover = () => { IDBObjectStore.prototype.put = put }; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts') throw new DOMException('Draft disk full', 'QuotaExceededError'); return put.apply(this, args) } })
  await field(page, 'Press set 1 Weight (kg)').fill('12.'); await expect(page.getByRole('alert')).toContainText('Draft disk full')
  await button(page, 'Settings').click(); await expect(page.getByRole('alert').first()).toContainText('Draft disk full'); await expect(field(page, 'Press set 1 Weight (kg)')).toHaveValue('12.')
  await button(page, 'Cancel').click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(field(page, 'Press set 1 Weight (kg)')).toHaveValue('12.')
  await page.evaluate(() => (window as any).recover()); await button(page, 'Retry draft save').click(); await waitForDraft(page); await second.close()
})

test('schedule-local status refreshes at midnight and old runs retain their saved zone', async ({ page }) => {
  await page.clock.install({ time: new Date('2025-01-05T23:59:30Z') }); await start(page); await zone(page, 'UTC'); await importPlan(page, 'Alpha')
  await schedule(page, 'Alpha', '2025-01-06'); await button(page, 'Train').click(); await card(page, 'Alpha').getByRole('button').click(); await button(page, 'Next week').click()
  await expect(page.locator('.training-day-card')).toContainText('Pending'); await page.clock.fastForward(31000); await expect(page.locator('.training-day-card')).toContainText('Due Today')
  await page.clock.setSystemTime(new Date('2025-01-07T00:00:01Z')); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await expect(page.locator('.training-day-card')).toContainText('Past Due')
  const original = (await records(page)).schedules[0]; await zone(page, 'Pacific/Honolulu'); await page.reload(); await expect(field(page, 'Time zone')).toHaveCount(0)
  await button(page, 'Calendar').click(); await button(page, 'Today').click(); await expect(field(page, 'Calendar date')).toHaveValue('2025-01-06'); expect((await records(page)).schedules[0]).toEqual(original)
  await manageRun(page, 'End'); await page.getByRole('dialog', { name: 'Ending a Plan?' }).getByRole('button', { name: 'End', exact: true }).click(); await returnCalendar(page); await button(page, 'Train').click(); await schedule(page, 'Alpha', '2025-01-06'); const all = (await records(page)).schedules; expect(all).toHaveLength(2); expect(all.find(s => s.id !== original.id).timeZone).toBe('Pacific/Honolulu')
})

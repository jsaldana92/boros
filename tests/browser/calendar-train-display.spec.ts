import { expect, test, type Page } from '@playwright/test'
import { addCalendarPlan, manageRun, returnCalendar, runPage } from './calendar-actions'

test.setTimeout(90000)
const b = (p: Page, name: string) => p.getByRole('button', { name, exact: true })
const f = (p: Page, name: string) => p.getByLabel(name, { exact: true })
const planCard = (p: Page, name = 'Display') => p.getByRole('article', { name: `Plan ${name}`, exact: true })
const day = (p: Page, name = 'Upper') => p.locator('.training-day-card').filter({ hasText: name })
const date = (p: Page, value: string) => p.getByRole('region', { name: value, exact: true })
async function rows(page: Page, name: string) {
  return page.evaluate(async (name) => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }); try { return await new Promise<any[]>((resolve, reject) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) } finally { db.close() } }, name)
}
async function setup(page: Page, names = ['Display']) {
  await page.clock.setFixedTime(new Date('2026-10-08T12:00:00Z')); await page.goto('./'); await expect(b(page, 'Settings')).toBeVisible()
  if (await b(page, 'Understood').isVisible()) await b(page, 'Understood').click()
  await b(page, 'Settings').click(); await f(page, 'Time zone').fill('UTC'); await b(page, 'Save profile').click(); await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  for (const name of names) {
    await b(page, 'Create').click(); await b(page, 'Import AI Output').click(); await f(page, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 3, kind: 'plan', plan: { name, durationWeeks: 3, trainingDaysPerWeek: 3, days: ['Upper', 'Lower', 'Pull'].map(name => ({ name, exercises: [{ name: 'Press', sets: [{ reps: { min: 5, max: 5 } }, { reps: { min: 5, max: 5 } }] }] })) } })); await b(page, 'Validate and preview').click(); await b(page, 'Save plan').click(); await expect(planCard(page, name)).toBeVisible()
  }
}
async function select(page: Page, name = 'Display') { await b(page, 'Train').click(); await b(page, 'Add Plan').click(); await page.getByRole('dialog').getByRole('article', { name: `Plan ${name}` }).getByRole('button').click(); await expect(page.getByRole('dialog')).toHaveCount(0) }
async function saveDay(page: Page, name: string, partial = false) {
  await day(page, name).click(); await b(page, 'Start').click()
  for (let i = 1; i <= (partial ? 1 : 2); i++) { await f(page, `Press set ${i} Weight (kg)`).fill('0'); await f(page, `Press set ${i} Repetitions`).fill('5') }
  await b(page, 'Save').click(); if (partial) await b(page, 'Save partial session').click()
  await expect(page.getByRole('region', { name: 'Saved session details' })).toBeVisible(); await b(page, 'Back to training days').click()
}

test('unscheduled weekly layout is visual only; full, partial and manual activity appears once on actual Thursday', async ({ page }) => {
  await setup(page); await select(page); const address = page.url(), original = (await rows(page, 'schedules'))[0]
  await expect(planCard(page).locator('button > span')).toHaveText(['Week 1', '3 weeks · 3 training days · 4 rest days'])
  await b(page, 'Calendar').click(); await expect(page.locator('.calendar-event')).toHaveCount(0)
  await b(page, 'Train').click(); await planCard(page).getByRole('button').click(); await expect(f(page, 'Program context')).toHaveCount(0)
  await expect(day(page, 'Upper')).toContainText('Monday'); await expect(day(page, 'Lower')).toContainText('Tuesday'); await expect(day(page, 'Pull')).toContainText('Wednesday'); await expect(page.locator('.rest-day-card')).toHaveCount(4)
  await expect(page.getByRole('region', { name: 'Program week', exact: true }).locator(':scope > p.muted')).toHaveText('3 weeks · 3 training days · 4 rest days · Unscheduled')
  await saveDay(page, 'Upper'); await saveDay(page, 'Lower', true); await day(page, 'Pull').click(); await b(page, 'Mark as Complete').click()
  await b(page, 'Calendar').click(); await b(page, 'Week').click(); await f(page, 'Calendar date').fill('2026-10-08')
  await expect(date(page, '2026-10-08').locator('.calendar-event')).toHaveCount(3); await expect(page.locator('.calendar-event')).toHaveCount(3); await expect(date(page, '2026-10-05').locator('.calendar-event')).toHaveCount(0)
  for (const [name, status] of [['Upper', 'Completed'], ['Lower', 'Incomplete'], ['Pull', 'Completed']]) await expect(date(page, '2026-10-08').locator('.calendar-event').filter({ hasText: name }).locator('.status-pill')).toHaveText(status)
  await date(page, '2026-10-08').locator('.calendar-event').filter({ hasText: 'Upper' }).click(); await expect(page.getByRole('region', { name: 'Saved session details' })).toBeVisible()
  await b(page, 'Calendar').click(); await page.locator('.calendar-event').filter({ hasText: 'Pull' }).click(); await expect(page.getByRole('dialog')).toContainText('Manually completed'); await page.keyboard.press('Escape')
  await page.reload(); await expect(page.locator('.calendar-event')).toHaveCount(3); expect(page.url()).toBe(address)
  const saved = (await rows(page, 'schedules'))[0]; expect(saved.id).toBe(original.id); expect(saved.kind).toBe('unscheduled'); expect(saved.revisions).toEqual(original.revisions)
  await b(page, 'Settings').click(); await f(page, 'New profile name').fill('Other'); await b(page, 'Create profile').click(); await b(page, 'Calendar').click(); await expect(page.locator('.calendar-event')).toHaveCount(0)
})

test('Train card week follows progression and gaps independently of the browsed week and respects finite boundaries', async ({ page }) => {
  await setup(page); await select(page); await planCard(page).getByRole('button').click()
  await b(page, 'Move Training to Next Week').click(); await expect(page.getByRole('dialog')).not.toContainText(/Run [a-f0-9]/); await b(page, 'Confirm move').click(); await expect(day(page)).toContainText('Pending')
  await b(page, 'Back to Plans').click(); await expect(planCard(page).locator('.current-program-week')).toHaveText('Paused')
  await planCard(page).getByRole('button').click(); await expect(page.locator('.training-day-cards > *')).toHaveCount(0); await expect(page.getByText(/Excluded week/)).toBeVisible()
  await b(page, 'Next week').click(); await expect(page.getByText('Week 1', { exact: true })).toBeVisible(); await b(page, 'Next week').click(); await expect(page.getByText('Week 2', { exact: true })).toBeVisible(); await b(page, 'Back to Plans').click(); await expect(planCard(page).locator('.current-program-week')).toHaveText('Paused')
  await page.clock.setFixedTime(new Date('2026-10-19T12:00:00Z')); await page.reload(); await expect(planCard(page).locator('.current-program-week')).toHaveText('Week 2')
  await planCard(page).getByRole('button').click(); await b(page, 'Next week').click(); await expect(page.getByText('Week 3', { exact: true })).toBeVisible(); await b(page, 'Next week').click(); await expect(page.getByText('No active training in this week.')).toBeVisible(); await expect(page.locator('.training-day-cards > *')).toHaveCount(0)
  await b(page, 'Back to Plans').click(); await expect(planCard(page).locator('.current-program-week')).toHaveText('Week 2')
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00Z')); await page.reload(); await expect(planCard(page)).toHaveCount(0)
})

test('direct reassignment preserves colliding saved dates, rest rows and following-week assignments', async ({ page }) => {
  await setup(page); await b(page, 'Calendar').click(); await addCalendarPlan(page, '2026-10-05'); await b(page, 'Train').click(); await planCard(page).getByRole('button').click()
  await day(page).click(); await b(page, 'Mark as Complete').click(); await b(page, 'Calendar').click(); await manageRun(page, 'Edit')
  await expect(page.locator('.schedule-editor')).not.toContainText('UTC'); await f(page, 'Upper weekday').selectOption('2'); await f(page, 'Lower weekday').selectOption('0'); await f(page, 'Pull weekday').selectOption('4'); await b(page, 'Save').focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Current Plans'); await expect(page.getByRole('dialog')).toHaveCount(0)
  await returnCalendar(page); await b(page, 'Week').click(); await f(page, 'Calendar date').fill('2026-10-05'); await expect(date(page, '2026-10-05').locator('.calendar-event')).toHaveCount(2)
  await b(page, 'Train').click(); await planCard(page).getByRole('button').click(); await expect(day(page, 'Upper')).toContainText('Monday'); await expect(day(page, 'Lower')).toContainText('Monday'); await expect(day(page, 'Pull')).toContainText('Friday'); await expect(page.locator('.rest-day-card')).toHaveCount(5)
  await b(page, 'Next week').click(); await expect(day(page, 'Upper')).toContainText('Wednesday'); await expect(day(page, 'Lower')).toContainText('Monday'); await expect(page.locator('.rest-day-card')).toHaveCount(4)
  await b(page, 'Previous week').click(); await expect(day(page, 'Upper')).toContainText('Completed'); await expect(day(page, 'Lower')).toContainText('Monday')
})

test('editor rejects results changed since opening, keeps choices, and has no confirmation step', async ({ page, context }) => {
  await setup(page); await b(page, 'Calendar').click(); await addCalendarPlan(page, '2026-10-05'); await manageRun(page, 'Edit'); await f(page, 'Upper weekday').selectOption('4')
  const peer = await context.newPage(); await peer.clock.setFixedTime(new Date('2026-10-08T12:00:00Z')); await peer.goto('./'); await b(peer, 'Calendar').click(); await b(peer, 'Week').click(); await f(peer, 'Calendar date').fill('2026-10-05'); await date(peer, '2026-10-05').locator('.calendar-event').click(); await expect(peer.getByRole('region', { name: 'Training session', exact: true })).toBeVisible()
  await b(page, 'Save').click(); await expect(page.getByRole('alert')).toContainText('results changed while editing'); await expect(f(page, 'Upper weekday')).toHaveValue('4'); await expect(page.getByRole('dialog')).toHaveCount(0); expect((await rows(page, 'schedules'))[0].revision).toBe(1)
  await b(page, 'Cancel').click(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Current Plans'); await peer.close()
})

test('an existing invalid mapping can open for repair and save directly without replacing the instance', async ({ page }) => {
  await setup(page); await b(page, 'Calendar').click(); await addCalendarPlan(page, '2026-10-05'); const original = (await rows(page, 'schedules'))[0]
  await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result) }); const runs: any[] = await new Promise(resolve => { const r = db.transaction('schedules').objectStore('schedules').getAll(); r.onsuccess = () => resolve(r.result) }); runs[0].revisions[0].mapping = []; runs[0].revisions[0].needsRepair = true; await new Promise<void>((resolve, reject) => { const tx = db.transaction('schedules', 'readwrite'); tx.objectStore('schedules').put(runs[0]); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close() })
  await page.reload(); await manageRun(page, 'Edit'); await expect(f(page, 'Upper weekday')).toBeEnabled(); await expect(f(page, 'Upper weekday')).toHaveValue('')
  for (const [index, name] of ['Upper', 'Lower', 'Pull'].entries()) await f(page, `${name} weekday`).selectOption(String(index))
  await b(page, 'Save').click(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Current Plans'); await expect(page.getByRole('dialog')).toHaveCount(0)
  const repaired = (await rows(page, 'schedules'))[0]; expect(repaired.id).toBe(original.id); expect(repaired.revisions.at(-1).needsRepair).toBe(false); expect(repaired.revisions.at(-1).mapping).toHaveLength(3)
})

test('month sections, stable colors, distinct rings, concise menus and keyboard behavior in both themes', async ({ page }, info) => {
  await setup(page, ['Display', 'Second']); await b(page, 'Calendar').click(); await addCalendarPlan(page, '2026-10-05', 'Display')
  await expect(page.locator('.calendar-event').first()).toBeVisible(); const firstColor = await page.locator('.calendar-event').first().evaluate(el => (el as HTMLElement).style.getPropertyValue('--plan-color'))
  await addCalendarPlan(page, '2026-10-05', 'Second')
  const palette = async () => { await expect(page.locator('.calendar-event').first()).toBeVisible(); return page.locator('.calendar-event').evaluateAll(elements => Object.fromEntries(elements.map(el => [el.querySelector('.event-name')!.textContent, (el as HTMLElement).style.getPropertyValue('--plan-color')]))) }
  const colors = await palette(); expect(colors.Display).toBe(firstColor); expect(colors.Display).not.toBe(colors.Second)
  for (const theme of ['Dark', 'Light']) {
    await b(page, 'Settings').click(); await b(page, theme).click(); await b(page, 'Calendar').click(); expect(await palette()).toEqual(colors)
    for (const [value, count] of [['2021-02-12', 4], ['2026-03-12', 6], ['2027-01-01', 5]] as const) {
      await f(page, 'Calendar date').fill(value); await expect(page.locator('.calendar-week-section')).toHaveCount(count)
      for (const section of await page.locator('.calendar-week-section').all()) { await expect(section.locator('.calendar-day')).toHaveCount(7); await expect(section.locator('.calendar-day h3').first()).toContainText('Monday'); await expect(section.locator('.calendar-day h3').last()).toContainText('Sunday') }
    }
    await f(page, 'Calendar date').fill('2026-10-08')
    for (const width of [390, 800, 1440]) {
      await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await page.locator('.calendar-week-section').first().locator('.calendar-day').evaluateAll(els => new Set(els.map(el => el.getBoundingClientRect().top)).size)).toBe(1)
      await page.screenshot({ path: info.outputPath(`month-${theme}-${width}.png`), fullPage: true })
    }
    await b(page, 'Day').click(); await expect(page.locator('.calendar-week-section')).toHaveCount(0); await expect(page.locator('.calendar-day')).toHaveCount(1); await b(page, 'Week').click(); await expect(page.locator('.calendar-day')).toHaveCount(7)
    await runPage(page)
    const strokes = await page.locator('.plan-card').first().locator('.run-fill').evaluateAll(els => els.map(el => getComputedStyle(el).stroke)); expect(new Set(strokes).size).toBe(3); expect(strokes).not.toContain('rgb(255, 255, 255)'); expect(strokes).not.toContain('rgb(241, 241, 241)')
    const card = page.getByRole('article', { name: 'Run Display' }).getByRole('button'); await card.focus(); await page.keyboard.press('Enter'); const popup = page.getByRole('dialog'); await expect(popup.locator('p')).toHaveCount(0); await expect(popup.getByRole('button')).toHaveText(['Edit', 'Reset', 'End', 'Cancel']); await page.keyboard.press('Escape'); await expect(card).toBeFocused()
    await manageRun(page, 'Reset', 'Display'); const reset = page.getByRole('dialog', { name: 'Reset Plan?' }); await expect(reset.locator('p')).toHaveText('Resetting this plan will erase all progress for this plan and restart you from the first week.'); await reset.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.keyboard.press('Escape')
    await manageRun(page, 'End', 'Display'); const end = page.getByRole('dialog', { name: 'Ending a Plan?' }); await expect(end.locator('p')).toHaveText('Your saved progress will remain, but you cannot continue this plan. Adding it again starts from Week 1.'); await end.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.keyboard.press('Escape')
    await returnCalendar(page); await b(page, 'Month').click()
  }
  await page.reload(); expect(await palette()).toEqual(colors)
  await manageRun(page, 'End', 'Second'); await page.getByRole('dialog', { name: 'Ending a Plan?' }).getByRole('button', { name: 'End', exact: true }).click(); await returnCalendar(page); await runPage(page, 'Previous Plans'); await page.getByRole('article', { name: 'Run Second' }).getByRole('button').click(); await expect(page.getByRole('dialog').locator('p')).toHaveCount(0); await b(page, 'Delete').click(); const remove = page.getByRole('dialog', { name: 'Delete Plan?' }); await expect(remove.locator('p')).toHaveText('Deleting this plan will delete all results associated with it. This cannot be undone.'); await remove.getByRole('button', { name: 'Delete', exact: true }).click(); await returnCalendar(page); expect((await palette()).Display).toBe(colors.Display)
})

test('legacy multiple active instances bind to the clicked card without a context selector or silent fallback', async ({ page, context }) => {
  await setup(page); await select(page)
  await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result) }); const runs: any[] = await new Promise(resolve => { const r = db.transaction('schedules').objectStore('schedules').getAll(); r.onsuccess = () => resolve(r.result) }); const clone = structuredClone(runs[0]); clone.id = crypto.randomUUID(); clone.revisions[0].planName = 'Other instance'; clone.durationWeeks = 8; clone.endDate = '2026-11-29'; await new Promise<void>((resolve, reject) => { const tx = db.transaction('schedules', 'readwrite'); tx.objectStore('schedules').add(clone); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close() })
  await page.reload(); await expect(planCard(page, 'Other instance')).toContainText('8 weeks · 3 training days · 4 rest days'); await planCard(page, 'Other instance').getByRole('button').click(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Other instance'); await expect(f(page, 'Program context')).toHaveCount(0); await day(page).click(); await b(page, 'Skip').click()
  const runs = await rows(page, 'schedules'); expect(runs.find(r => r.revisions[0].planName === 'Display').outcomes).toBeUndefined(); expect(runs.find(r => r.revisions[0].planName === 'Other instance').outcomes).toHaveLength(1)
  const peer = await context.newPage(); await peer.clock.setFixedTime(new Date('2026-10-08T12:00:00Z')); await peer.goto('./'); await b(peer, 'Calendar').click(); await manageRun(peer, 'End', 'Other instance'); await peer.getByRole('dialog', { name: 'Ending a Plan?' }).getByRole('button', { name: 'End', exact: true }).click(); await returnCalendar(peer); await runPage(peer, 'Previous Plans'); await peer.getByRole('article', { name: 'Run Other instance' }).getByRole('button').click(); await b(peer, 'Delete').click(); await peer.getByRole('dialog', { name: 'Delete Plan?' }).getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('This plan instance is unavailable. Return to Plans to choose one.')).toBeVisible(); await expect(page.locator('.training-day-card')).toHaveCount(0)
  await b(page, 'Back to Plans').click(); await planCard(page).getByRole('button').click(); await expect(day(page)).toContainText('Pending'); await peer.close()
})

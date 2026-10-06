import { expect, test, type Page } from '@playwright/test'
import { manageRun, returnCalendar, runPage, stagePlan } from './calendar-actions'

test.setTimeout(90000)
const b = (p: Page, name: string) => p.getByRole('button', { name, exact: true })
const f = (p: Page, name: string) => p.getByLabel(name, { exact: true })
async function rows(page: Page, store: string) {
  return page.evaluate(async (store) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try { return await new Promise<any[]>((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) } finally { db.close() }
  }, store)
}
async function setup(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'))
  await page.goto('./'); await expect(b(page, 'Calendar')).toBeVisible(); if (await b(page, 'Understood').isVisible()) await b(page, 'Understood').click()
  await b(page, 'Create').click(); await b(page, 'Imported').click()
  await f(page, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 3, kind: 'plan', plan: { name: 'Calendar strength', durationWeeks: 5, trainingDaysPerWeek: 4, days: ['Upper', 'Lower', 'Push', 'Pull'].map((name) => ({ name, exercises: [{ name: 'Press', sets: [{ reps: { min: 5, max: 5 } }] }] })) } }))
  await b(page, 'Validate and preview').click(); await b(page, 'Save plan').click(); await expect(page.getByRole('article', { name: 'Plan Calendar strength', exact: true })).toBeVisible()
  await b(page, 'Calendar').click()
}
async function preview(page: Page) {
  await f(page, 'Calendar date').fill('2026-10-05'); await b(page, 'Add Plan').click(); await stagePlan(page, 'Calendar strength')
}
async function scheduled(page: Page) { await setup(page); await preview(page); await b(page, 'Save').click(); await expect(page.locator('.calendar-event').first()).toBeVisible() }

test('pointer down/up does not move the occurrence or lose its click; phone tap and keyboard controls', async ({ page }, info) => {
  await scheduled(page)
  if (await b(page, 'Week 4').getAttribute('aria-expanded') === 'false') await b(page, 'Week 4').click()
  const event = page.getByRole('region', { name: '2026-10-19', exact: true }).locator('.calendar-event')
  await event.evaluate(el => { const nav = document.querySelector('.main-nav')!.getBoundingClientRect(); window.scrollBy(0, el.getBoundingClientRect().bottom - nav.top - 10) })
  const before = await event.boundingBox(), y = await page.evaluate(() => scrollY)
  await page.mouse.move(before!.x + before!.width / 2, before!.y + 12); await page.mouse.down()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.evaluate(() => scrollY)).toBe(y); expect((await event.boundingBox())!.y).toBe(before!.y)
  await page.mouse.up(); await expect(page.getByRole('region', { name: 'Training session', exact: true })).toBeVisible()
  await b(page, 'Cancel').click(); await b(page, 'Calendar').click()
  if (info.project.name.includes('phone')) await b(page, 'Week').tap(); else await b(page, 'Week').click()
  await expect(b(page, 'Week')).toHaveAttribute('aria-pressed', 'true')
  await b(page, 'Next period').focus(); await page.keyboard.press('Enter'); await expect(f(page, 'Calendar date')).toHaveValue('2026-10-12')
  await b(page, 'Previous period').click(); await expect(f(page, 'Calendar date')).toHaveValue('2026-10-05')
})

test('menu blocks background, Escape restores focus; run pages return the view/date/scroll with one click', async ({ page }) => {
  await scheduled(page); const address = page.url()
  await b(page, 'Week').click(); await f(page, 'Calendar date').fill('2026-10-12')
  await page.evaluate(() => scrollTo(0, 40)); const y = await page.evaluate(() => scrollY)
  await b(page, 'Calendar menu').click(); await expect(page.getByRole('dialog').getByRole('button')).toHaveText(['Current Plans', 'Previous Plans', 'Cancel'])
  const outside = await page.getByRole('navigation').getByRole('button', { name: 'Train', exact: true }).boundingBox()
  await page.mouse.click(outside!.x + outside!.width / 2, outside!.y + outside!.height / 2); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calendar')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).focus(); await page.keyboard.press('Tab'); await expect(b(page, 'Current Plans')).toBeFocused()
  await page.keyboard.press('Escape'); await expect(b(page, 'Calendar menu')).toBeFocused(); expect(await page.evaluate(() => scrollY)).toBe(y)
  await b(page, 'Calendar menu').click(); await b(page, 'Current Plans').click(); await expect(page.getByRole('heading', { level: 1, name: 'Current Plans' })).toBeFocused()
  await expect(page.getByRole('article', { name: 'Run Calendar strength' })).toContainText('05/10/2026 - On Going')
  await returnCalendar(page); await expect(b(page, 'Week')).toHaveAttribute('aria-pressed', 'true'); await expect(f(page, 'Calendar date')).toHaveValue('2026-10-12'); expect(await page.evaluate(() => scrollY)).toBe(y)
  await expect(b(page, 'Calendar menu')).toBeFocused()
  await runPage(page, 'Previous Plans'); await expect(page.getByText('No previous plans.', { exact: true })).toBeVisible(); await returnCalendar(page); expect(page.url()).toBe(address)
  const card = page.locator('.calendar-event').first(); await expect(card.locator(':scope > span')).toHaveCount(3); await expect(card).not.toContainText('Schedule'); await expect(card).not.toContainText('UTC'); await expect(card).toContainText('Pending')
  await b(page, 'Today').click(); await expect(page.locator('.calendar-event').first()).toContainText('Due Today')
  await b(page, 'Month').click(); await b(page, 'Week 1').click(); await expect(page.locator('.calendar-day.adjacent-month').first()).toBeVisible()
  await expect(page.getByText(/^Today uses/)).toHaveCount(0); await expect(page.getByRole('region', { name: 'Unassigned weekly training' })).toHaveCount(0)
})

test('two-tab stale preview and rapid retry create one assignment; failed input stays recoverable', async ({ page, context }) => {
  await setup(page); await preview(page)
  const second = await context.newPage(); await second.clock.setFixedTime(new Date('2026-10-05T12:00:00Z')); await second.goto('./'); await b(second, 'Calendar').click(); await preview(second)
  await Promise.all([b(page, 'Save').click(), b(second, 'Save').click()])
  await expect.poll(async () => (await rows(page, 'schedules')).length).toBe(1)
  const loser = await page.getByRole('alert').isVisible() ? page : second, winner = loser === page ? second : page
  await expect(loser.getByRole('alert')).toContainText('active run'); await b(loser, 'Save').click(); expect((await rows(page, 'schedules'))).toHaveLength(1)
  await loser.getByRole('article', { name: 'Plan Calendar strength' }).getByRole('button').click(); await b(loser, 'Edit').click(); await expect(f(loser, 'Upper weekday')).toHaveValue('0'); await loser.keyboard.press('Escape')
  loser.once('dialog', dialog => dialog.dismiss()); await b(loser, 'Train').click(); await expect(loser.getByRole('heading', { level: 1 })).toHaveText('Add Plan')
  await b(winner, 'Add Plan').click(); await expect(winner.getByRole('article', { name: 'Plan Calendar strength' })).toHaveCount(0)
  await b(loser, 'Cancel').click(); await b(winner, 'Cancel').click(); await second.close()
})

test('legacy duplicates, scheduled/unscheduled runs, 50/40/10 rings, guarded Leave, themes and tablet layout', async ({ page }, info) => {
  await scheduled(page)
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result) })
    const run: any = await new Promise(resolve => { const r = db.transaction('schedules').objectStore('schedules').getAll(); r.onsuccess = () => resolve(r.result[0]) })
    const events = Array.from({ length: 20 }, (_, i) => { const date = new Date('2026-10-05T12:00:00Z'); date.setUTCDate(date.getUTCDate() + Math.floor(i / 4) * 7 + i % 4); const day = run.revisions[0].days[i % 4], scheduledDate = date.toISOString().slice(0, 10); date.setUTCDate(date.getUTCDate() - i % 4); return { id: crypto.randomUUID(), day, planName: run.revisions[0].planName, ref: { key: `${run.id}:${day.id}:${scheduledDate}`, scheduleId: run.id, dayId: day.id, scheduledDate, scheduledWeek: date.toISOString().slice(0, 10), timeZone: run.timeZone, scheduleRevisionId: run.revisions[0].id }, recordedAt: run.createdAt, updatedAt: run.createdAt, revision: 1, status: i < 8 ? 'completed' : 'skipped' } })
    run.outcomes = events.slice(0, 10)
    const legacy = { ...structuredClone(run), id: crypto.randomUUID(), outcomes: [] }, unscheduled = { ...structuredClone(run), id: crypto.randomUUID(), kind: 'unscheduled', outcomes: [] }
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('schedules', 'readwrite'); [run, legacy, unscheduled].forEach(r => tx.objectStore('schedules').put(r)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close()
  })
  await page.reload(); await expect(b(page, 'Review Current Plans')).toBeVisible(); await runPage(page)
  await expect(page.getByRole('article', { name: 'Run Calendar strength' })).toHaveCount(3)
  const ring = page.getByRole('img', { name: 'Plan: 10 of 20 planned workouts, 50%' }); await expect(ring).toBeVisible(); await expect(page.getByRole('img', { name: 'Completed: 8 of 20 planned workouts, 40%' })).toBeVisible(); await expect(page.getByRole('img', { name: 'Skipped: 2 of 20 planned workouts, 10%' })).toBeVisible()
  const circles = page.locator('.plan-card').filter({ has: ring }).locator('.run-ring'), positions = await circles.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }))
  expect(new Set(positions.map(p => p.y)).size).toBe(1); expect(positions[1].x).toBeGreaterThan(positions[0].x)
  const center = await circles.first().locator('span').boundingBox(); expect(Math.abs(center!.y + center!.height / 2 - positions[0].y - positions[0].height / 2)).toBeLessThan(2)
  await page.screenshot({ path: info.outputPath('calendar-runs-dark.png'), fullPage: true })
  await manageRun(page, 'End'); await page.getByRole('dialog', { name: 'Ending a Plan?' }).getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(1); await b(page, 'End').click(); await page.getByRole('dialog', { name: 'Ending a Plan?' }).getByRole('button', { name: 'End' }).click()
  await expect(page.getByRole('article', { name: 'Run Calendar strength' })).toHaveCount(2)
  await returnCalendar(page); await runPage(page, 'Previous Plans'); await expect(page.getByRole('article')).toContainText('05/10/2026 - 05/10/2026')
  await page.reload(); await runPage(page, 'Previous Plans'); await expect(page.getByRole('article')).toHaveCount(1)
  await b(page, 'Settings').click(); await b(page, 'Light').click(); await b(page, 'Calendar').click(); await runPage(page)
  await page.setViewportSize({ width: 768, height: 1024 }); await page.screenshot({ path: info.outputPath('calendar-runs-tablet-light.png'), fullPage: true }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 320, height: 844 }); await page.evaluate(() => document.documentElement.style.fontSize = '24px'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('legacy unbounded and missing run dates stay honest; long names fit at phone width', async ({ page }) => {
  await scheduled(page)
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result) })
    const run: any = await new Promise(resolve => { const r = db.transaction('schedules').objectStore('schedules').getAll(); r.onsuccess = () => resolve(r.result[0]) })
    delete run.durationWeeks; delete run.endDate; delete run.startWeek
    run.revisions[0].planName = 'A long saved plan name with enough detail to wrap across a narrow phone card'
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('schedules', 'readwrite'); tx.objectStore('schedules').put(run); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close()
  })
  await page.reload(); await runPage(page); await expect(page.getByRole('article')).toContainText('Date unavailable - On Going'); await expect(page.getByText('No fixed total', { exact: true })).toBeVisible()
  await expect(page.getByRole('article')).not.toContainText('%'); await expect(page.getByRole('article')).not.toContainText('NaN')
  await page.setViewportSize({ width: 320, height: 844 }); await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; document.body.style.fontSize = '24px' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

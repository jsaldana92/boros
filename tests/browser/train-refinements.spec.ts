import { expect, test, type Page } from '@playwright/test'
import { waitForDraft, closeTimer } from './train-actions'

const b = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const f = (page: Page, name: string) => page.getByLabel(name, { exact: true })
const day = (page: Page, name = 'Upper') => page.locator('.training-day-card').filter({ hasText: name })
const plan = (page: Page) => page.getByRole('article', { name: 'Plan Refined plan', exact: true }).getByRole('button')
async function rows(page: Page, name: string) {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result) })
    try { return await new Promise<any[]>((resolve) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result) }) } finally { db.close() }
  }, name)
}
async function fixture(page: Page, theme = 'Dark') {
  await page.clock.setFixedTime(new Date('2026-10-05T16:00:00Z')); await page.goto('./')
  await expect(b(page, 'Settings')).toBeVisible(); if (await b(page, 'Understood').isVisible()) await b(page, 'Understood').click()
  await b(page, 'Settings').click(); await b(page, theme).click(); await b(page, 'Create').click(); await b(page, 'Imported').click()
  await f(page, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 2, kind: 'plan', plan: { name: 'Refined plan', durationWeeks: 4, trainingDaysPerWeek: 2, days: ['Upper', 'Lower'].map((name) => ({ name, exercises: [{ name: 'Press', instructions: 'Snapshot instructions', youtubeUrl: 'https://youtu.be/abcdefghijk', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 1, max: 2 } }, { reps: { min: 8, max: 8 } }], restBetweenSetsSeconds: 10 }] })) } }))
  await b(page, 'Validate and preview').click(); await f(page, 'Note (optional):').fill('Hide this subtitle in Train'); await page.locator('.plan-day').first().getByRole('button', {name: /^Actions for /}).first().click(); await b(page, 'Edit').click(); await f(page, 'Notes (optional)').fill('Template note'); await page.locator('.exercise-editor button[type=submit]').click(); await b(page, 'Save plan').click(); await expect(plan(page)).toBeVisible()
  await b(page, 'Train').click(); await b(page, 'Add Plan').click(); await page.getByRole('dialog', { name: 'Add Plan' }).getByRole('article').getByRole('button').click(); await plan(page).click(); await expect(day(page)).toContainText('Pending')
}
async function start(page: Page) { await day(page).click(); await b(page, 'Start').click(); await expect(page.getByRole('region', { name: 'Training session', exact: true })).toBeVisible() }
async function results(page: Page) { await f(page, 'Press set 1 Weight (kg)').fill('0'); await f(page, 'Press set 1 Repetitions').fill('5'); await f(page, 'Press set 1 Actual RIR (optional)').fill('0'); await waitForDraft(page) }
async function interrupt(page: Page) { await page.reload(); await expect(b(page, 'Add Plan')).toBeVisible() }

for (const theme of ['Dark', 'Light']) test(`recovery cards, exact labels, interruption versus cancellation and responsive layout (${theme})`, async ({ page }, info) => {
  await fixture(page, theme); await expect(page.getByText('Hide this subtitle in Train', { exact: true })).toHaveCount(0); await expect(page.getByText('Week 1', { exact: true })).toBeVisible()
  await start(page); await b(page, 'REST Press after set 1').click(); await closeTimer(page); await b(page, 'Cancel').click()
  expect(await rows(page, 'drafts')).toHaveLength(0); expect(await rows(page, 'restTimers')).toHaveLength(0)
  await start(page); const originalStart = (await rows(page, 'drafts'))[0].startedAt; await results(page); await interrupt(page)
  const recovery = page.getByRole('region', { name: 'Unfinished sessions' }); await expect(recovery.getByRole('button')).toHaveCount(1)
  await expect(recovery.locator('button > span')).toHaveText('Refined plan · 2026-10-05'); await expect(recovery.locator('small')).toHaveText('Upper')
  for (const width of [390, 800, 1280]) {
    await page.setViewportSize({ width, height: 900 }); await expect.poll(() => page.locator('.unfinished-cards').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(width < 650 ? 1 : width < 1000 ? 2 : 3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`recovery-${theme}-${width}.png`), fullPage: true })
  }
  await recovery.getByRole('button').click(); await expect(f(page, 'Press set 1 Weight (kg)')).toHaveValue('0'); expect((await rows(page, 'drafts'))[0].startedAt).toBe(originalStart)
  await b(page, 'Cancel').click(); const confirmation = page.getByRole('dialog', { name: 'Leaving Upper' }); await expect(confirmation).toContainText('Leaving now will clear all your progress and you will have to restart.')
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(f(page, 'Press set 1 Weight (kg)')).toHaveValue('0')
  await b(page, 'Settings').click(); await expect(confirmation).toHaveCount(0); await b(page, 'Train').click(); await expect(page.getByRole('region', { name: 'Training session', exact: true })).toBeVisible()
  await b(page, 'Progress').click(); await b(page, 'Leave').click(); await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible(); expect(await rows(page, 'drafts')).toHaveLength(0)
  await b(page, 'Train').click(); await expect(recovery).toHaveCount(0); await page.reload(); await expect(recovery).toHaveCount(0)
})

test('failed cancellation keeps input; Clear stays open and deletes no other history; Cancel removes empty artifacts', async ({ page }) => {
  await fixture(page); await start(page); await results(page)
  await page.evaluate(() => { const original = IDBObjectStore.prototype.delete; (window as any).restoreDelete = () => { IDBObjectStore.prototype.delete = original }; IDBObjectStore.prototype.delete = function (...args) { if (this.name === 'drafts') throw new DOMException('Test deletion denied', 'UnknownError'); return original.apply(this, args) } })
  await b(page, 'Cancel').click(); await b(page, 'Leave').click(); await expect(page.getByRole('alert').first()).toContainText('Test deletion denied'); await expect(f(page, 'Press set 1 Weight (kg)')).toHaveValue('0')
  await page.evaluate(() => (window as any).restoreDelete())
  await b(page, 'Clear').click(); const dialog = page.getByRole('dialog', { name: 'Clear entered results?' }); await expect(dialog).toContainText('This will clear all entered results and notes.'); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(f(page, 'Press set 1 Weight (kg)')).toHaveValue('0')
  await b(page, 'Clear').click(); await dialog.getByRole('button', { name: 'Clear', exact: true }).click(); await expect(f(page, 'Press set 1 Weight (kg)')).toHaveValue('')
  await b(page, 'Cancel').click(); expect(await rows(page, 'drafts')).toHaveLength(0)
})

test('Leave Plan removes every draft week, keeps history, closes run across reload and re-adds fresh', async ({ page }) => {
  await fixture(page); await start(page); await results(page); await b(page, 'Save').click(); await b(page, 'Save partial session').click(); await b(page, 'Back to workouts').click()
  const completed = await rows(page, 'sessions'), firstRun = (await rows(page, 'schedules'))[0]
  for (let week = 1; week <= 2; week++) {
    await b(page, 'Next week').click(); await start(page); await results(page); await interrupt(page); await plan(page).click()
    if (week === 1) await b(page, 'Next week').click()
  }
  await b(page, 'Leave Plan').click(); const leave = page.getByRole('dialog', { name: 'Ending a Plan?' }); await expect(leave.locator('p')).toHaveText('Your saved progress will remain, but you cannot continue this plan. Adding it again starts from Week 1.'); await leave.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await rows(page, 'drafts')).filter((d) => !d.finalizedAt)).toHaveLength(2)
  await b(page, 'Leave Plan').click(); await leave.getByRole('button', { name: 'End', exact: true }).click(); await expect(page.getByText('No active plan(s) selected.')).toBeVisible(); await expect(page.getByRole('region', { name: 'Unfinished sessions' })).toHaveCount(0)
  await page.reload(); expect((await rows(page, 'drafts')).filter((d) => !d.finalizedAt)).toHaveLength(0); expect(await rows(page, 'sessions')).toEqual(completed)
  await b(page, 'Add Plan').click(); await page.getByRole('dialog').getByRole('article').getByRole('button').click(); await plan(page).click(); await expect(page.getByText('Week 1', { exact: true })).toBeVisible(); await expect(day(page)).toContainText('Pending')
  const runs = await rows(page, 'schedules'); expect(runs.find((r) => r.id === firstRun.id).closedAt).toBeTruthy(); expect(runs.filter((r) => !r.closedAt)).toHaveLength(1)
  await start(page); await expect(f(page, 'Press set 1 Weight (kg)')).not.toHaveAttribute('placeholder'); await b(page, 'Cancel').click()
})

test('snapshot information, previous placeholders and occurrence Reset agree with Calendar and Progress', async ({ page }, info) => {
  let embeds = 0
  await page.route('https://www.youtube.com/embed/**', (route) => { embeds++; return route.fulfill({ contentType: 'text/html', body: '<html><body><button>Simulated video controls</button></body></html>' }) })
  await fixture(page); await start(page); expect(embeds).toBe(0)
  await b(page, 'Information for Press').click(); const information = page.getByRole('dialog', { name: 'Press', exact: true })
  await expect(information.getByRole('heading', { name: 'Instructions', exact: true })).toBeVisible(); await expect(information.getByRole('heading', { name: 'Note', exact: true })).toBeVisible(); await expect(information.locator('hr')).toHaveCount(2); await expect(information.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  await expect(information.locator('iframe')).toHaveAttribute('src', /^https:\/\/www.youtube.com\/embed\/abcdefghijk\?/); await b(page, 'Close').click(); await expect(page.locator('iframe')).toHaveCount(0); await expect(b(page, 'Information for Press')).toBeFocused()
  await expect(page.locator('.set-target').first()).toHaveText('5–8 reps · 1–2 RIR'); await expect(page.locator('.set-target').nth(1)).toHaveText('8 reps')
  await results(page); await b(page, 'Save').click(); await b(page, 'Save partial session').click(); await b(page, 'Back to workouts').click(); await b(page, 'Next week').click(); await start(page)
  await expect(f(page, 'Press set 1 Weight (kg)')).toHaveAttribute('placeholder', '0'); await expect(f(page, 'Press set 1 Repetitions')).toHaveAttribute('placeholder', '5'); await expect(f(page, 'Press set 1 Actual RIR (optional)')).toHaveAttribute('placeholder', '0'); await expect(f(page, 'Press set 1 Weight (kg)')).toHaveValue(''); await expect(f(page, 'Press set 2 Weight (kg)')).not.toHaveAttribute('placeholder')
  await f(page, 'Press set 1 Weight (kg)').fill('25'); await f(page, 'Press set 1 Weight (kg)').fill(''); await waitForDraft(page); await b(page, 'Cancel').click(); await expect(page.getByRole('region', { name: 'Unfinished sessions' })).toHaveCount(0)
  await b(page, 'Previous week').click(); await day(page).click(); await b(page, 'Reset').click(); const reset = page.getByRole('dialog', { name: 'Reset this workout?' }); await expect(reset).toContainText('Saved results for this occurrence will be deleted'); await reset.getByRole('button', { name: 'Cancel', exact: true }).click(); await b(page, 'Close').click(); expect(await rows(page, 'sessions')).toHaveLength(1)
  await day(page).click(); await b(page, 'Reset').click(); await reset.getByRole('button', { name: 'Reset', exact: true }).click(); await expect(day(page)).toContainText('Pending'); expect(await rows(page, 'sessions')).toHaveLength(0)
  await b(page, 'Calendar').click(); await expect(page.getByRole('region', { name: 'Unassigned weekly training' })).toHaveCount(0)
  await b(page, 'Progress').click(); await expect(page.getByRole('article', { name: 'Run Refined plan', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('reset-progress.png'), fullPage: true })
})

test('stale tabs cannot recreate Reset or closed-run drafts and their timers', async ({ page, context }) => {
  await fixture(page); await start(page); await results(page)
  const peer = await context.newPage(); await peer.goto('./'); await plan(peer).click(); await day(peer).click()
  await b(peer, 'Reset').click(); await peer.getByRole('dialog', { name: 'Reset this workout?' }).getByRole('button', { name: 'Reset', exact: true }).click()
  await f(page, 'Press set 1 Weight (kg)').fill('50'); await expect(page.getByRole('alert').first()).toContainText('unavailable'); await expect(f(page, 'Press set 1 Weight (kg)')).toHaveValue('50')
  expect(await rows(page, 'drafts')).toHaveLength(0); expect(await rows(page, 'sessions')).toHaveLength(0)
  page.once('dialog', (dialog) => dialog.accept()); await page.reload(); await plan(page).click(); await start(page); await results(page)
  await b(page, 'REST Press after set 1').click(); await closeTimer(page)
  await peer.reload(); await plan(peer).click(); await b(peer, 'Leave Plan').click(); await peer.getByRole('dialog', { name: 'Ending a Plan?' }).getByRole('button', { name: 'End', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Rest timer', exact: true })).toHaveCount(0)
  await f(page, 'Press set 1 Weight (kg)').fill('75'); await expect(page.getByRole('alert').first()).toContainText('unavailable'); await expect(f(page, 'Press set 1 Weight (kg)')).toHaveValue('75')
  await b(page, 'Retry draft save').click(); expect(await rows(page, 'drafts')).toHaveLength(0); expect(await rows(page, 'restTimers')).toHaveLength(0)
  await peer.reload(); await expect(peer.getByRole('region', { name: 'Unfinished sessions' })).toHaveCount(0)
})

test('information omits absent sections and empty information is plain text with only Close', async ({ page }) => {
  await page.route('https://www.youtube.com/embed/**', (route) => route.fulfill({ contentType: 'text/html', body: 'Simulated player' }))
  await fixture(page); await day(page, 'Lower').click(); await b(page, 'Start').click(); await b(page, 'Information for Press').click()
  const dialog = page.getByRole('dialog', { name: 'Press', exact: true })
  await expect(dialog.getByRole('heading', { name: 'Note', exact: true })).toHaveCount(0); await expect(dialog.locator('hr')).toHaveCount(1)
  await b(page, 'Close').click(); await b(page, 'Cancel').click(); await b(page, 'Create').click()
  await b(page, 'Create exercise').click(); await f(page, 'Exercise name').fill('No information'); await f(page, 'Set 1 Reps minimum').fill('5'); await b(page, 'Save exercise').click()
  await b(page, 'Create Plan').click(); await f(page, 'Plan name').fill('Empty information'); await f(page, 'Duration (weeks)').fill('1'); await page.getByRole('combobox', { name: 'Workouts per week', exact: true }).selectOption('1')
  await b(page, 'Add exercise').click(); await b(page, 'Add No information').click(); await b(page, 'Save plan').click()
  await b(page, 'Train').click(); await b(page, 'Add Plan').click(); await page.getByRole('dialog').getByRole('article', { name: 'Plan Empty information', exact: true }).getByRole('button').click()
  await page.getByRole('article', { name: 'Plan Empty information', exact: true }).getByRole('button').click(); await page.locator('.training-day-card').click(); await b(page, 'Start').click(); await b(page, 'Information for No information').click()
  const empty = page.getByRole('dialog', { name: 'No information', exact: true }); await expect(empty).toContainText('Add exercise information in Create.'); await expect(empty.locator('hr, iframe, a')).toHaveCount(0); await expect(empty.getByRole('button')).toHaveCount(1)
  await b(page, 'Close').click(); await expect(b(page, 'Information for No information')).toBeFocused()
})

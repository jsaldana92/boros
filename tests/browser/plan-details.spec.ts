import { createNamedProfile } from './settings-actions'
import { expect, test, type Page } from '@playwright/test'
import { cardAction } from './create-actions'

test.setTimeout(90000)
const b = (p: Page, name: string) => p.getByRole('button', { name, exact: true })
const f = (p: Page, name: string) => p.getByLabel(name, { exact: true }).and(p.locator('input, textarea, select'))
const card = (p: Page, name = 'Detailed plan') => p.getByRole('article', { name: `Plan ${name}`, exact: true })
const instructions = 'Plan instructions\n<em>Plain text only</em>'
function fixture(name = 'Detailed plan') {
  const exercise = (name: string, count: number, reps: number, rir?: number, superset: number | null = null) => ({ name, sets: Array.from({ length: count }, () => ({ reps: { min: reps, max: reps + 2 }, ...(rir === undefined ? {} : { rir: { min: rir, max: rir } }) })), superset, instructions: 'Exercise instructions only' })
  return { schemaVersion: 3, kind: 'plan', plan: { name, durationWeeks: 12, instructions, trainingDaysPerWeek: 2, days: [
    { name: 'Upper', supersets: [{ number: 1 }], exercises: [exercise('Warmup', 1, 5), exercise('Repeated', 3, 8, 0, 1), exercise('Partner', 2, 10, 1, 1), { ...exercise('Repeated', 2, 6), sets: [{ reps: { min: 6, max: 6 }, rir: { min: 1, max: 2 } }, { reps: { min: 8, max: 12 } }] }] },
    { name: 'Lower', exercises: [exercise('Finish', 1, 12)] },
  ] } }
}
async function open(p: Page) { await p.goto('./'); await b(p, 'Create').click(); if (await b(p, 'Understood').isVisible()) await b(p, 'Understood').click(); await expect(b(p, 'Create Plan')).toBeEnabled() }
async function preview(p: Page, payload: unknown) { await b(p, 'Import AI Output').click(); await f(p, 'AI output JSON').fill(JSON.stringify(payload)); await b(p, 'Validate and preview').click(); await expect(f(p, 'Plan name')).toBeVisible() }
async function seed(p: Page) { await open(p); await preview(p, fixture()); await expect(f(p, 'Instructions')).toHaveValue(instructions); await f(p, 'Note (optional):').fill('Plan note\nSeparate text'); await b(p, 'Save plan').click(); await expect(card(p)).toBeVisible() }
async function records(p: Page, store = 'plans') {
  return p.evaluate(async (store) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try { return await new Promise<any[]>((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) } finally { db.close() }
  }, store)
}

test('plan details show saved order, repeated occurrences, accurate targets and one superset box; top-only dialogs restore focus in both themes', async ({ page }, info) => {
  await seed(page)
  for (const theme of ['Dark', 'Light']) {
    await b(page, 'Settings').click(); await b(page, theme).click(); await b(page, 'Create').click()
    const trigger = card(page).getByRole('button'); await trigger.focus(); await page.keyboard.press('Enter')
    const details = page.getByRole('dialog', { name: 'Detailed plan', exact: true })
    await expect(details).toBeVisible(); await expect(details).toContainText('12 weeks · 2 training days · 5 rest days')
    await expect(details.locator('.plan-details-day > h3')).toHaveText(['Upper', 'Lower'])
    await expect(details.locator('.plan-details-exercise h4, .plan-details-exercise h5')).toHaveText(['Warmup', 'Repeated', 'Partner', 'Repeated', 'Finish'])
    const box = details.locator('.plan-superset-members')
    await expect(box).toHaveCount(1); await expect(box.locator('.plan-details-exercise')).toHaveCount(2)
    await expect(box).toContainText('3 sets · 8–10 reps · 0 RIR'); await expect(box).toContainText('2 sets · 10–12 reps · 1 RIR')
    expect(await box.evaluate((node) => node.parentElement!.nextElementSibling!.textContent)).toContain('Repeated')
    await expect(details.locator('.varying-targets li')).toHaveText(['Set 1: 6 reps · 1–2 RIR', 'Set 2: 8–12 reps'])
    await expect(details.getByRole('region', { name: 'Instructions', exact: true })).toContainText(instructions)
    await expect(details.getByRole('region', { name: 'Note', exact: true })).toContainText('Plan note\nSeparate text')
    await expect(details.locator('em')).toHaveCount(0); await expect(details).not.toContainText('Exercise instructions only')
    await expect(details.locator(':scope > .actions button')).toHaveText(['Close'])
    await expect(details.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    expect(await page.locator('body').evaluate((node) => node.style.position)).toBe('fixed')
    const address = page.url(); await page.mouse.click(1, 1); await expect(details).toBeVisible()
    await b(page, 'Train').evaluate((node: HTMLButtonElement) => node.focus()); expect(await details.evaluate((node) => node.contains(document.activeElement))).toBe(true)
    const menuButton = details.getByRole('button', { name: 'Plan actions' }); await menuButton.click()
    const menu = page.getByRole('dialog', { name: 'Plan actions', exact: true })
    await expect(menu.getByRole('button')).toHaveText(['Edit', 'Duplicate', 'Archive', 'Close'])
    expect(await details.evaluate((node: HTMLDialogElement) => node.inert)).toBe(true)
    await menu.getByRole('button', { name: 'Close' }).focus(); await page.keyboard.press('Tab'); await expect(menu.getByRole('button', { name: 'Edit', exact: true })).toBeFocused()
    await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(menuButton).toBeFocused()
    await menuButton.click(); await menu.getByRole('button', { name: 'Close' }).click(); await expect(details).toBeVisible(); await expect(menuButton).toBeFocused()
    await page.screenshot({ path: info.outputPath(`details-${theme}.png`) })
    expect(await details.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused(); expect(page.url()).toBe(address)
    expect(await page.locator('body').evaluate((node) => node.style.position)).not.toBe('fixed')
  }
})

test('instructions survive manual create, edits, failed/stale saves, reload and duplication; archive cancel/restore and profile isolation remain correct', async ({ page }) => {
  await seed(page); const originals = await records(page, 'exercises')
  await b(page, 'Create Plan').click(); await f(page, 'Plan name').fill('Manual'); await f(page, 'Duration (weeks)').fill('4'); await f(page, 'Instructions').fill('Manual instructions\nSecond line')
  await b(page, 'Add exercise').click(); await b(page, 'Add Warmup').click(); await b(page, 'Save plan').click()
  await cardAction(page, card(page, 'Manual'), 'Edit'); await expect(f(page, 'Instructions')).toHaveValue('Manual instructions\nSecond line')
  await f(page, 'Plan name').fill('Detailed plan'); await f(page, 'Instructions').fill('Keep after failure'); await b(page, 'Save plan').click()
  await expect(page.getByRole('alert')).toContainText('already exists'); await expect(f(page, 'Instructions')).toHaveValue('Keep after failure')
  await f(page, 'Plan name').fill('Manual'); await b(page, 'Save plan').click(); await page.reload()
  await cardAction(page, card(page, 'Manual'), 'Edit'); await expect(f(page, 'Instructions')).toHaveValue('Keep after failure')
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result) })
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('plans', 'readwrite'), store = tx.objectStore('plans'), r = store.getAll(); r.onsuccess = () => { const plan = r.result.find((p) => p.name === 'Manual'); store.put({ ...plan, instructions: 'Concurrent edit', revision: plan.revision + 1 }) }; tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error) }); db.close()
  })
  await f(page, 'Instructions').fill('Stale recoverable text'); await b(page, 'Save plan').click(); await expect(page.getByRole('alert')).toContainText('another tab'); await expect(f(page, 'Instructions')).toHaveValue('Stale recoverable text')
  await b(page, 'Cancel').click(); await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
  await cardAction(page, card(page, 'Manual'), 'Duplicate'); await expect(f(page, 'Instructions')).toHaveValue('Concurrent edit'); await b(page, 'Save plan').click()
  await expect(card(page, 'Manual (copy)')).toBeVisible(); const plans = await records(page), copy = plans.find((p) => p.name === 'Manual (copy)'), source = plans.find((p) => p.name === 'Manual')
  expect(copy.id).not.toBe(source.id); expect(copy.instructions).toBe(source.instructions); expect(await records(page, 'exercises')).toEqual(originals)
  await cardAction(page, card(page, 'Manual'), 'Archive'); await page.getByRole('dialog', { name: 'Archive plan?' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog', { name: 'Manual', exact: true })).toBeVisible(); await page.keyboard.press('Escape'); await expect(card(page, 'Manual').getByRole('button')).toBeFocused()
  await cardAction(page, card(page, 'Manual'), 'Archive'); await page.getByRole('dialog', { name: 'Archive plan?' }).getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(card(page, 'Manual')).toHaveCount(0); await f(page, 'Show archived plans').check(); await cardAction(page, card(page, 'Manual'), 'Restore'); await expect(card(page, 'Manual')).toHaveCount(0)
  await f(page, 'Show archived plans').uncheck(); await expect(card(page, 'Manual')).toBeVisible()
  await b(page, 'Settings').click(); await createNamedProfile(page, 'Other'); await expect(page.locator('input[name=name]')).toHaveValue('Other'); await b(page, 'Create').click()
  await expect(card(page, 'Manual')).toHaveCount(0); expect((await records(page)).find((p) => p.id === source.id).instructions).toBe('Concurrent edit')
})

test('AI v3 without instructions and older payloads stay editable without invented text; blank sections and legacy duration remain honest', async ({ page }) => {
  await open(page)
  for (const version of [1, 2, 3]) {
    const payload: any = { schemaVersion: version, kind: 'plan', plan: { name: `Version ${version}`, trainingDaysPerWeek: 1, days: [{ name: 'Day', exercises: [{ name: 'Press', sets: [{ reps: { min: 5, max: 5 } }], instructions: 'Exercise only' }] }], ...(version > 1 ? { durationWeeks: 2 } : {}) } }
    await preview(page, payload); await expect(f(page, 'Instructions')).toHaveValue(''); await expect(f(page, 'Note (optional):')).toHaveValue(''); await f(page, 'Duration (weeks)').fill('2')
    if (version === 3) await f(page, 'Instructions').fill('Preview instructions')
    await b(page, 'Save plan').click(); await expect(card(page, `Version ${version}`)).toBeVisible()
  }
  await page.reload(); expect((await records(page)).find((p) => p.name === 'Version 3').instructions).toBe('Preview instructions')
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result) })
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('plans', 'readwrite'), store = tx.objectStore('plans'), r = store.getAll(); r.onsuccess = () => { const plan = r.result.find((p) => p.name === 'Version 1'); delete plan.durationWeeks; plan.instructions = ' \n '; plan.notes = ' '; store.put(plan) }; tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error) }); db.close()
  })
  await page.reload(); await card(page, 'Version 1').getByRole('button').click()
  const details = page.getByRole('dialog'); await expect(details).toContainText('Legacy unbounded duration · 1 training day · 6 rest days')
  await expect(details.getByRole('region', { name: 'Instructions', exact: true })).toHaveCount(0); await expect(details.getByRole('region', { name: 'Note', exact: true })).toHaveCount(0); await expect(details.locator('hr')).toHaveCount(1)
  await expect(details.locator('.prescription-summary')).toHaveText('1 set · 5 reps')
})

test('long names, long plain instructions and 200% text remain scrollable without horizontal overflow at phone/tablet/desktop widths', async ({ page }, info) => {
  await open(page); const value = fixture('Long plan ' + 'Z'.repeat(110)); value.plan.instructions = ('Long instructions ' + 'W'.repeat(200) + '\n').repeat(60); value.plan.days[0].name = 'D'.repeat(120); value.plan.days[0].exercises[0].name = 'E'.repeat(120)
  await preview(page, value); await b(page, 'Save plan').click(); await expect(card(page, value.plan.name)).toBeVisible()
  for (const [width, theme] of [[320, 'Dark'], [768, 'Light'], [1280, 'Dark']] as const) {
    await page.setViewportSize({ width, height: 800 }); await b(page, 'Settings').click(); await b(page, theme).click(); await b(page, 'Create').click()
    await page.evaluate(() => document.documentElement.style.fontSize = '32px'); await card(page, value.plan.name).getByRole('button').click()
    const details = page.getByRole('dialog'); await expect(details).toBeVisible()
    expect(await details.evaluate((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight > node.clientHeight)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await details.getByRole('button', { name: 'Close' }).scrollIntoViewIfNeeded(); await expect(details.getByRole('button', { name: 'Close' })).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`large-text-${width}-${theme}.png`) }); await details.getByRole('button', { name: 'Close' }).click()
    await page.evaluate(() => document.documentElement.style.fontSize = '')
  }
})

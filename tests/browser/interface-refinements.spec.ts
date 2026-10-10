import { expect, test, type Page } from './strength-test'
import { runPage, returnCalendar } from './calendar-actions'

const b = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function start(page: Page) { await page.goto('./'); await expect(b(page, 'Settings')).toBeVisible(); if (await b(page, 'Understood').isVisible()) await b(page, 'Understood').click() }
async function rows(page: Page, store: string) { return page.evaluate(async store => {
  const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result) })
  try { return await new Promise<any[]>(resolve => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result) }) } finally { db.close() }
}, store) }

test('Calendar headings, horizontal weeks, Back and remembered view work without changing the address or records', async ({ page, context }, info) => {
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z')); await start(page); const address = page.url()
  await b(page, 'Calendar').click(); await expect(b(page, 'Month')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.calendar-range')).toHaveCSS('text-align', 'center')
  const heading = b(page, 'Week 2'); await expect(heading).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)'); await expect(heading).toHaveCSS('border-top-width', '0px')
  await page.keyboard.press('Tab'); await heading.focus(); await expect(heading).toHaveCSS('outline-style', 'solid'); await page.keyboard.press('Enter'); await expect(heading).toHaveAttribute('aria-expanded', 'false'); await page.keyboard.press('Space'); await expect(heading).toHaveAttribute('aria-expanded', 'true')
  const cells = page.getByRole('region', { name: 'Calendar Week 2' }).locator('.calendar-day')
  const positions = await cells.evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y } }))
  expect(positions).toHaveLength(7); expect(new Set(positions.map(p => p.y)).size).toBe(1); expect(new Set(positions.map(p => p.x)).size).toBe(7)
  await b(page, 'Week').click(); await expect(page.locator('.calendar-range')).toHaveCSS('text-align', 'center'); await b(page, 'Create').click(); await b(page, 'Calendar').click(); await expect(b(page, 'Week')).toHaveAttribute('aria-pressed', 'true')
  await page.reload(); await expect(b(page, 'Week')).toHaveAttribute('aria-pressed', 'true')
  await b(page, 'Day').click(); await expect(page.locator('.calendar-range')).toHaveCount(0); await expect(page.locator('.calendar-day h3')).toContainText('Mon')
  await runPage(page); await expect(b(page, 'Cancel')).toHaveCount(0); await returnCalendar(page); await expect(b(page, 'Day')).toHaveAttribute('aria-pressed', 'true')
  await runPage(page, 'Previous Plans'); await expect(b(page, 'Back')).toBeVisible(); await returnCalendar(page)
  const reopened = await context.newPage(); await reopened.goto('./'); await b(reopened, 'Calendar').click(); await expect(b(reopened, 'Day')).toHaveAttribute('aria-pressed', 'true'); await reopened.close()
  expect(await rows(page, 'schedules')).toEqual([]); expect(page.url()).toBe(address)
  await b(page, 'Month').click(); await page.screenshot({ path: info.outputPath('calendar-month-dark.png'), fullPage: true })
  await b(page, 'Settings').click(); await b(page, 'Light').click(); await b(page, 'Calendar').click(); await page.setViewportSize({ width: 768, height: 1024 }); await page.screenshot({ path: info.outputPath('calendar-month-tablet-light.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('invalid or unavailable interface preferences cannot block Calendar', async ({ page }) => {
  await start(page); await page.evaluate(() => localStorage.setItem('boros.calendar-view', 'year')); await b(page, 'Calendar').click(); await expect(b(page, 'Month')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('boros.calendar-view'))).toBe('year') // No mount-time overwrite.
  await page.addInitScript(() => { const read = Storage.prototype.getItem, write = Storage.prototype.setItem; Storage.prototype.getItem = function (key) { if (key === 'boros.calendar-view') throw new DOMException('Denied', 'SecurityError'); return read.call(this, key) }; Storage.prototype.setItem = function (key, value) { if (key === 'boros.calendar-view') throw new DOMException('Denied', 'SecurityError'); return write.call(this, key, value) } })
  await page.reload(); await expect(b(page, 'Month')).toHaveAttribute('aria-pressed', 'true'); await b(page, 'Day').click(); await b(page, 'Train').click(); await b(page, 'Calendar').click(); await expect(b(page, 'Day')).toHaveAttribute('aria-pressed', 'true')
})

test('new-profile action allocates and selects independent Guest names; canceled dirty changes create nothing', async ({ page, context }) => {
  await start(page); await b(page, 'Settings').click(); const select = page.getByLabel('Active profile', { exact: true }), name = page.getByLabel('Name', { exact: true }), original = await select.inputValue()
  await expect(name).toHaveValue('Guest'); await expect(page.getByLabel('Time zone', { exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: /^Return to/ })).toHaveCount(0)
  await b(page, 'Train').click(); await b(page, 'Settings').click() // Loading effective Guest did not become dirty.
  await name.fill('Not saved'); page.once('dialog', d => d.dismiss()); await select.selectOption('new-profile'); await expect(name).toHaveValue('Not saved'); await expect(select).toHaveValue(original); expect(await rows(page, 'profiles')).toHaveLength(1)
  page.once('dialog', d => d.accept()); await select.selectOption('new-profile'); await expect(name).toHaveValue('Guest (1)'); const first = await select.inputValue(); expect(first).not.toBe(original)
  await expect(page.getByLabel('Age (optional)')).toHaveValue(''); await expect(page.getByLabel('Weight (kg, optional)', { exact: true })).toHaveValue('')
  const peer = await context.newPage(); await peer.goto('./'); await b(peer, 'Settings').click()
  await Promise.all([select.selectOption('new-profile'), peer.getByLabel('Active profile', { exact: true }).selectOption('new-profile')])
  await expect.poll(async () => (await rows(page, 'profiles')).length).toBe(4)
  expect((await rows(page, 'profiles')).map(p => p.name).sort()).toEqual(['Guest', 'Guest (1)', 'Guest (2)', 'Guest (3)'])
  expect(await select.inputValue()).not.toBe(await peer.getByLabel('Active profile', { exact: true }).inputValue())
  await peer.close(); await select.selectOption(original); await expect(name).toHaveValue('Guest'); await page.reload(); await expect(select).toHaveValue(original)
  expect((await rows(page, 'settings'))[0].activeProfileId).toBe(original); expect((await rows(page, 'profiles')).find(p => p.id === original).revision).toBe(1)
})

test('creation failure rolls back selection and records; repeated pending events allocate once', async ({ page }) => {
  await start(page); await b(page, 'Settings').click(); const select = page.getByLabel('Active profile', { exact: true }), original = await select.inputValue()
  await page.evaluate(() => { const put = IDBObjectStore.prototype.put; (window as any).restoreWrites = () => { IDBObjectStore.prototype.put = put }; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'settings') throw new DOMException('Simulated disk full', 'QuotaExceededError'); return put.apply(this, args) } })
  await select.selectOption('new-profile'); await expect(page.getByRole('alert')).toContainText('Simulated disk full'); await expect(select).toHaveValue(original); expect(await rows(page, 'profiles')).toHaveLength(1)
  await page.evaluate(() => (window as any).restoreWrites())
  await select.evaluate((el: HTMLSelectElement) => { el.value = 'new-profile'; el.dispatchEvent(new Event('change', { bubbles: true })); el.value = 'new-profile'; el.dispatchEvent(new Event('change', { bubbles: true })) })
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Guest (1)'); expect(await rows(page, 'profiles')).toHaveLength(2)
})

test('bottom tabs leave a gesture buffer and keep settings controls reachable with large text', async ({ page }, info) => {
  await start(page); await b(page, 'Settings').click(); await page.setViewportSize({ width: 320, height: 720 }); await page.addStyleTag({ content: 'html { font-size: 24px; }' })
  const nav = page.getByRole('navigation', { name: 'Main navigation' }), tabs = nav.getByRole('button')
  const gap = await nav.evaluate(el => { const bottom = el.getBoundingClientRect().bottom; return Math.min(...Array.from(el.querySelectorAll('button')).map(b => bottom - b.getBoundingClientRect().bottom)) })
  expect(gap).toBeGreaterThanOrEqual(24); for (let i = 0; i < await tabs.count(); i++) expect((await tabs.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await b(page, 'Save profile').focus(); const control = await b(page, 'Save profile').boundingBox(); expect(control!.y + control!.height).toBeLessThanOrEqual((await nav.boundingBox())!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await b(page, 'Download').click(); const modal = page.getByRole('dialog', { name: 'Downloading data' }); await expect(modal.getByRole('checkbox')).toHaveCount(0); await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(b(page, 'I understand (Download)')).toBeFocused(); await page.keyboard.press('Escape'); await expect(b(page, 'Download')).toBeFocused()
  await page.screenshot({ path: info.outputPath('settings-gesture-buffer.png'), fullPage: true })
})

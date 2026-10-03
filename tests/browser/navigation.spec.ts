import { expect, test, type Page } from '@playwright/test'

test('failed screen chunk keeps the last opened preference and navigation usable', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible()
  const before = await page.evaluate(() => JSON.stringify(sessionStorage))
  await page.route(/ProgressPage/, (route) => route.abort())
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('This screen could not open')
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).toBe(before)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.reload(); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
})

const key = 'boros.navigation.screen'
const labels = ['Train', 'Create', 'Calendar', 'Progress', 'Settings']
async function start(page: Page) {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
}
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true, level: 1 })

test('fresh Train, all screens remember after refresh, and no browser history entries', async ({ page, context }) => {
  await start(page)
  await expect(heading(page, 'Train')).toBeVisible()
  const address = page.url(), historyLength = await page.evaluate(() => history.length)
  for (const label of labels) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(heading(page, label)).toBeVisible()
    await expect(page).toHaveURL(address)
    expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe(label.toLowerCase())
    await page.reload()
    await expect(heading(page, label)).toBeVisible()
    await expect(page).toHaveURL(address)
    expect(await page.evaluate(() => history.length)).toBe(historyLength)
  }
  const separateTab = await context.newPage()
  await start(separateTab)
  await expect(heading(separateTab, 'Train')).toBeVisible()
})

test('legacy hashes override remembered screens, clean by replacement, and preserve base/query', async ({ page, baseURL }) => {
  await page.addInitScript((key) => sessionStorage.setItem(key, 'progress'), key)
  for (const screen of ['train', 'create', 'calendar', 'progress', 'settings', 'missing']) {
    await page.goto('about:blank')
    await page.goto(`./?keep=1#/${screen}`)
    const expected = screen === 'missing' ? 'Train' : screen[0].toUpperCase() + screen.slice(1)
    await expect(heading(page, expected)).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
    expect(new URL(page.url()).search).toBe('?keep=1')
    expect(new URL(page.url()).pathname).toBe(new URL(baseURL!).pathname)
    expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe(expected.toLowerCase())
  }
})

test('invalid session preferences safely fall back to Train', async ({ page }) => {
  await page.addInitScript((key) => sessionStorage.setItem(key, '{"screen":"settings","draft":"bad"}'), key)
  await start(page)
  await expect(heading(page, 'Train')).toBeVisible()
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe('train')
})

test('unavailable sessionStorage does not block navigation and refresh falls back to Train', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError') } }))
  await start(page)
  await expect(heading(page, 'Train')).toBeVisible()
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(heading(page, 'Create')).toBeVisible()
  await page.reload()
  await expect(heading(page, 'Train')).toBeVisible()
})

test('Settings returns internally, refresh loses return history and safely returns to Train', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: 'Calendar', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.locator('nav [aria-current]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to Calendar', exact: true }).click()
  await expect(heading(page, 'Calendar')).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(heading(page, 'Settings')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Return to Train', exact: true }).click()
  await expect(heading(page, 'Train')).toBeVisible()
})

test('canceled dirty navigation preserves screen, input and preference; accepted navigation commits', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: 'Create Workout', exact: true }).click()
  await page.getByLabel('Exercise name', { exact: true }).fill('Unsaved exercise')
  const address = page.url()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByLabel('Exercise name', { exact: true })).toHaveValue('Unsaved exercise')
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe('create')
  await expect(page).toHaveURL(address)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(heading(page, 'Settings')).toBeVisible()
  await page.locator('input[name="name"]').fill('Unsaved profile')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Return to Create', exact: true }).click()
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe('settings')
  await expect(page.locator('input[name="name"]')).toHaveValue('Unsaved profile')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Return to Create', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create Workout', exact: true })).toBeVisible()
  await expect(page.getByLabel('Exercise name', { exact: true })).toHaveCount(0)
})

test('screen controls have no link addresses or new-tab paths and keyboard focus remains functional', async ({ page, context }) => {
  await start(page)
  const address = page.url()
  await expect(page.locator('header a, nav a, a.skip-link')).toHaveCount(0)
  for (const label of labels) {
    const control = page.getByRole('button', { name: label, exact: true })
    expect(await control.getAttribute('href')).toBeNull()
    await control.click({ modifiers: ['Control'] })
    await expect(heading(page, label)).toBeVisible()
    await expect(page).toHaveURL(address)
  }
  await expect(page.getByRole('main')).toBeFocused()
  await page.getByRole('button', { name: 'Create', exact: true }).click({ button: 'middle' })
  await page.keyboard.press('Escape')
  expect(context.pages()).toHaveLength(1)
  await page.getByRole('button', { name: 'Progress', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('main')).toBeFocused()
  await expect(heading(page, 'Progress')).toBeVisible()
  await page.getByRole('button', { name: 'Skip to content' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  await expect(page).toHaveURL(address)
})

test('browser Back leaves Boros; legacy cleanup replaces entry; dirty unload can be canceled', async ({ page, baseURL }) => {
  const outside = new URL('outside.html', baseURL!.endsWith('/') ? baseURL! : `${baseURL}/`).href
  await page.route(outside, (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Outside Boros</h1>' }))
  await page.goto(outside)
  const before = await page.evaluate(() => history.length)
  await page.goto('./#/create')
  await expect(heading(page, 'Create')).toBeVisible()
  expect(await page.evaluate(() => history.length)).toBe(before + 1)
  await page.getByRole('button', { name: 'Calendar', exact: true }).click()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(heading(page, 'Progress')).toBeVisible()
  await page.goBack()
  await expect(heading(page, 'Outside Boros')).toBeVisible()
  await page.goForward()
  await expect(heading(page, 'Progress')).toBeVisible()
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: 'Create Workout', exact: true }).click()
  await page.getByLabel('Exercise name', { exact: true }).fill('Keep this draft')
  const leaving = page.waitForEvent('dialog')
  await page.evaluate((url) => { setTimeout(() => location.assign(url), 0) }, outside)
  const warning = await leaving
  expect(warning.type()).toBe('beforeunload'); await warning.dismiss()
  await expect(page.getByLabel('Exercise name', { exact: true })).toHaveValue('Keep this draft')
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe('create')
})

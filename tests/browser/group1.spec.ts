import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function settings(page: Page) {
  await page.goto('./'); await button(page, 'Settings').click()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  if (await button(page, 'Understood').isVisible()) await button(page, 'Understood').click()
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const result: Record<string, Record<string, unknown>[]> = {}
    try {
      for (const name of ['profiles', 'measurements', 'settings']) result[name] = await new Promise((resolve, reject) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      return result
    } finally { db.close() }
  })
}

test('existing native IDs and measurements survive fallback initialization and profile switching', async ({ page, context }) => {
  await settings(page)
  await page.locator('input[name=name]').fill('Original')
  await page.getByLabel('Weight (kg, optional)', { exact: true }).fill('70')
  await button(page, 'Save profile').click(); await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  const before = await records(page), id = await page.getByLabel('Active profile').inputValue()
  await context.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }))
  await page.reload(); await expect(page.getByLabel('Active profile')).toHaveValue(id)
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined')
  expect(await records(page)).toEqual(before)
  await page.getByLabel('New profile name').fill('Independent'); await button(page, 'Create profile').click()
  await expect(page.locator('input[name=name]')).toHaveValue('Independent')
  expect(await page.getByLabel('Active profile').inputValue()).not.toBe(id)
  await expect(page.getByLabel('Weight (kg, optional)', { exact: true })).toHaveValue('')
  await page.getByLabel('Active profile').selectOption(id)
  await page.reload(); await expect(page.getByLabel('Weight (kg, optional)', { exact: true })).toHaveValue('70')
  const after = await records(page)
  expect(after.profiles.find(profile => profile.id === id)).toEqual(before.profiles[0])
  expect(after.measurements).toEqual(before.measurements)
})

test('no secure random source reports compatibility without creating a database or claiming storage failure', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    Object.defineProperty(crypto, 'getRandomValues', { value: undefined, configurable: true })
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Browser compatibility issue' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Secure random ID generation is unavailable')
  await expect(page.getByText('Browser storage unavailable')).toHaveCount(0)
  await expect(page.getByText('Check browser storage permissions', { exact: false })).toHaveCount(0)
  expect(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'boros'))).toBe(false)
  await button(page, 'Retry opening workspace').click()
  await expect(page.getByRole('heading', { name: 'Browser compatibility issue' })).toBeVisible()
})

test('UUID fallback does not conceal missing secure context, checksum APIs or clipboard support', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
  })
  await settings(page)
  await expect(page.getByText('This connection is not secure.', { exact: false })).toBeVisible()
  const before = await records(page), downloads: string[] = []
  page.on('download', file => downloads.push(file.suggestedFilename()))
  await page.getByRole('checkbox', { name: 'I understand this exports saved data only.' }).check()
  await button(page, 'Download data').click()
  await expect(page.locator('.backup-export [role=alert]')).toContainText('Backup checksum verification requires Web Crypto')
  await expect(page.locator('.backup-export [role=alert]')).toContainText('No download was started')
  await page.getByLabel('Backup ZIP', { exact: true }).setInputFiles({ name: 'fixture.zip', mimeType: 'application/zip', buffer: Buffer.from('not trusted') })
  await expect(page.locator('.backup-restore [role=alert]')).toContainText('Checksums cannot be skipped')
  expect(downloads).toEqual([]); expect(await records(page)).toEqual(before)
  await button(page, 'Create').click(); await button(page, 'Import AI Output').click()
  await button(page, 'Copy').click()
  await expect(page.getByText('Clipboard unavailable.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Formatting instructions', { exact: true })).toBeFocused()
})

test('owner branding, avatar-only Settings and both brand-image clicks preserve navigation guards', async ({ page }, info) => {
  await settings(page); const address = page.url()
  const profile = button(page, 'Settings')
  await expect(profile).toHaveText(''); await expect(profile).toHaveAttribute('title', 'Settings')
  for (const theme of ['Light', 'Dark']) {
    await button(page, theme).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase())
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 })
      await profile.scrollIntoViewIfNeeded()
      const images = page.locator('.brand img')
      expect(await images.evaluateAll(nodes => nodes.every(node => { const image = node as HTMLImageElement; return image.complete && image.naturalWidth > 0 && Math.abs(image.clientWidth / image.clientHeight - image.naturalWidth / image.naturalHeight) < 0.1 }))).toBe(true)
      await expect(profile).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath(`group1-${theme}-${width}.png`), fullPage: true })
    }
  }
  for (const image of ['Ouroboros: a snake eating its tail', 'Boros']) {
    await button(page, 'Create').click(); await button(page, 'Create exercise').click()
    await page.getByLabel('Exercise name', { exact: true }).fill('Recoverable input')
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('img', { name: image, exact: true }).click()
    await expect(page.getByLabel('Exercise name', { exact: true })).toHaveValue('Recoverable input')
    expect(await page.evaluate(() => sessionStorage.getItem('boros.navigation.screen'))).toBe('create')
    page.once('dialog', dialog => dialog.accept()); await button(page, 'Boros home').focus(); await page.keyboard.press('Enter')
    await expect(page).toHaveTitle('Train | Boros'); await expect(page.getByRole('main')).toBeFocused(); await expect(page).toHaveURL(address)
  }
})

test('paired units remain beside their measurements at phone width and unrelated edits keep timestamp precision', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2025-11-02T06:30:17.456Z'))
  await settings(page)
  await page.setViewportSize({ width: 320, height: 844 })
  const pair = async (input: string, unit: string) => {
    const field = await page.getByLabel(input, { exact: true }).boundingBox(), select = await page.getByRole('combobox', { name: unit, exact: true }).boundingBox()
    expect(Math.abs(field!.y + field!.height - select!.y - select!.height)).toBeLessThan(2)
    expect(select!.x).toBeGreaterThanOrEqual(field!.x + field!.width)
    expect(select!.height).toBeGreaterThanOrEqual(44)
  }
  await pair('Height (cm, optional)', 'Height unit'); await pair('Weight (kg, optional)', 'Weight unit')
  const age = await page.getByLabel('Age (optional)').boundingBox(), height = await page.getByLabel('Height (cm, optional)', { exact: true }).boundingBox()
  expect(age!.y + age!.height).toBeLessThan(height!.y)
  await page.getByRole('combobox', { name: 'Height unit', exact: true }).selectOption('ft')
  await pair('Height (inches)', 'Height unit')
  await button(page, 'Save profile').click(); await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  await button(page, 'Progress').click(); await button(page, 'Add measurement').click()
  const date = page.getByLabel('Measurement date/time', { exact: true })
  await expect(date).toHaveAttribute('step', '60'); expect(await date.inputValue()).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/)
  await page.getByLabel('Weight (kg)', { exact: true }).fill('70'); await button(page, 'Save measurement').click()
  await expect(page.getByText('Measurement saved.', { exact: true })).toBeVisible()
  const before = (await records(page)).measurements[0]; expect(before.measuredAt).toBe('2025-11-02T06:30:17.456Z')
  await button(page, 'Edit measurement').click(); await page.getByRole('checkbox', { name: 'Change measurement date/time' }).check()
  await page.getByLabel('Weight (kg)', { exact: true }).fill('71'); await button(page, 'Save measurement').click()
  await expect(page.getByText('Measurement saved.', { exact: true })).toBeVisible()
  const after = (await records(page)).measurements[0]
  for (const key of ['id', 'measuredAt', 'measuredLocal', 'timeZone', 'offsetMinutes', 'loggedAt']) expect(after[key]).toEqual(before[key])
  await expect(page.locator('.measurement-card')).not.toContainText(':17.456')
  await button(page, 'Settings').click(); await page.getByRole('combobox', { name: 'Weight unit', exact: true }).selectOption('lb')
  await button(page, 'Save profile').click(); await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  expect((await records(page)).measurements).toEqual([after])
  await page.screenshot({ path: info.outputPath('group1-units-320.png'), fullPage: true })
})

test('production Support uses the supplied destination only on explicit click with a protected new tab', async ({ page, context }, info) => {
  test.skip(new URL(info.project.use.baseURL!).port === '5173', 'Production build configuration; development retains unavailable-state coverage')
  const requests: string[] = []
  context.on('request', request => { if (request.url().startsWith('https://ko-fi.com')) requests.push(request.url()) })
  await context.route('https://ko-fi.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Explicit Support destination</title>' }))
  await settings(page); expect(requests).toEqual([])
  const link = page.getByRole('link', { name: 'Support Boros' })
  await expect(link).toHaveAttribute('href', 'https://ko-fi.com/jhonatansaldana')
  await expect(link).toHaveAttribute('target', '_blank'); await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  const popupReady = page.waitForEvent('popup'); await link.click(); const popup = await popupReady
  await popup.waitForLoadState(); expect(popup.url()).toBe('https://ko-fi.com/jhonatansaldana')
  expect(await popup.evaluate(() => window.opener)).toBe(null); expect(requests).toHaveLength(1)
  await popup.close(); await expect(page).toHaveTitle('Settings | Boros')
})

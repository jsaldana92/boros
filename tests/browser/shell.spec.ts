import { expect, test } from '@playwright/test'

const destinations = [
  ['Train', 'train'], ['Create', 'create'], ['Calendar', 'calendar'],
  ['Progress', 'progress'], ['Settings', 'settings'],
]

test('navigation, remembered refresh, unchanged address, and runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`) })
  await page.goto('./')
  const address = page.url()
  for (const [label, path] of destinations) {
    const link = page.getByRole('button', { name: label, exact: true })
    await link.click()
    await expect(page).toHaveURL(address)
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if (!['settings', 'create'].includes(path)) await expect(page.getByText('Not available yet', { exact: true })).toBeVisible()
    await page.reload()
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveTitle(`${label} | Boros`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: 'Calendar', exact: true }).click()
  await expect(page).toHaveURL(address)
  await expect(page.getByRole('button', { name: 'Support Boros' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Support Boros' })).toBeDisabled()
  await expect(page.getByText('Support link coming soon.')).toBeVisible()
  expect(errors).toEqual([])
})

test('keyboard skip action and screen focus', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await page.keyboard.press('Tab')
  const skip = page.getByRole('button', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await expect(skip).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  expect(new URL(page.url()).hash).toBe('')
  await page.getByRole('button', { name: 'Create', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()

})

test('responsive layout, touch targets, and screenshots', async ({ page }, testInfo) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const [label] of destinations) {
      const link = page.getByRole('button', { name: label, exact: true })
      await expect(link).toBeInViewport()
      const box = await link.boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(44)
      expect(box?.width).toBeGreaterThanOrEqual(44)
    }
    await page.screenshot({ path: testInfo.outputPath(`shell-${width}.png`), fullPage: true })
  }
})

import { expect, type Page } from '@playwright/test'
export async function runPage(page: Page, title = 'Current Plans') {
  await page.getByRole('button', { name: 'Calendar menu', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: title, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
}
export async function manageRun(page: Page, action: string, name?: string) {
  await expect(page.locator('.calendar-heading')).toBeVisible()
  if (await page.getByRole('button', { name: 'Calendar menu', exact: true }).isVisible()) await runPage(page)
  const cards = name ? page.getByRole('article', { name: `Run ${name}`, exact: true }) : page.locator('.plan-card')
  await cards.first().getByRole('button').click()
  await page.getByRole('dialog').getByRole('button', { name: action, exact: true }).click()
}
export async function returnCalendar(page: Page) {
  await expect(page.locator('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Calendar menu', exact: true })).toBeVisible()
}
export async function stagePlan(page: Page, name?: string, mapping?: number[]) {
  const cards = name ? page.getByRole('article', { name: `Plan ${name}`, exact: true }) : page.locator('.add-plan-list .plan-card').first()
  await cards.getByRole('button').click()
  const popup = page.getByRole('dialog'), fields = popup.getByRole('combobox')
  for (let i = 0; i < await fields.count(); i++) await fields.nth(i).selectOption(String(mapping?.[i] ?? i))
  await popup.getByRole('button', { name: 'Save', exact: true }).click(); await expect(popup).toHaveCount(0)
}
export async function addCalendarPlan(page: Page, date: string, name?: string, mapping?: number[]) {
  await page.getByLabel('Calendar date', { exact: true }).fill(date)
  await page.getByRole('button', { name: 'Add Plan', exact: true }).click(); await stagePlan(page, name, mapping)
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('heading', { level: 1, name: 'Calendar', exact: true })).toBeVisible()
}

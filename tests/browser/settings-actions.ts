import { expect, type Page, type CDPSession } from '@playwright/test'

export async function createNamedProfile(page: Page, name: string) {
  const select = page.getByLabel('Active profile', { exact: true }), previous = await select.inputValue()
  await select.selectOption('new-profile')
  await expect(select).not.toHaveValue(previous)
  await page.locator('input[name="name"]').fill(name)
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
}
export async function confirmDownload(page: Page) {
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  await page.getByRole('dialog', { name: 'Downloading data', exact: true }).getByRole('button', { name: 'I understand (Download)', exact: true }).click()
}
const zoneClients = new WeakMap<Page, CDPSession>()
// Only test browser defaults; never write the removed profile preference.
export async function deviceZone(page: Page, zone: string) {
  const client = zoneClients.get(page) ?? await page.context().newCDPSession(page)
  zoneClients.set(page, client)
  await client.send('Emulation.setTimezoneOverride', { timezoneId: zone })
  return client
}

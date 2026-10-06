import { expect, type Locator, type Page } from '@playwright/test'

// Card faces expose one action; details own edits and lifecycle controls.
export async function cardAction(page: Page, card: Locator, action: string) {
  await card.getByRole('button').click()
  let dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const menu = dialog.getByRole('button', { name: /^(Exercise|Plan|Workout) actions$/ })
  if (await menu.count()) {
    const title = await menu.getAttribute('aria-label')
    await menu.click()
    dialog = page.getByRole('dialog', { name: title!, exact: true })
  }
  await dialog.getByRole('button', { name: action, exact: true }).click()
}

export async function occurrenceAction(page: Page, container: Locator, action: string) {
  await container.getByRole('button', { name: /^Actions for / }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: action, exact: true }).click()
}

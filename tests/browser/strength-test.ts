import { test as base } from '@playwright/test'
export * from '@playwright/test'
// Existing suites exercise Strength. A separate Interval suite explicitly tests
// the chooser, Cancel and type restrictions. Older release builds have no chooser.
export const test = base.extend({ page: async ({ page }, runFixture) => {
  const chooser = page.getByRole('dialog', { name: /^(Training type|Plan Type|Workout Type|Exercise Type)$/ })
  await page.addLocatorHandler(chooser, async () => { await chooser.getByRole('button', { name: 'Strength', exact: true }).click() })
  await runFixture(page)
} })

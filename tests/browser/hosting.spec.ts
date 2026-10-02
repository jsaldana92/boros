import { expect, test } from '@playwright/test'

test('plain static root and project mounts serve only existing files', async ({ request }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('root-') && !testInfo.project.name.startsWith('project-'), 'Plain-static-host check only')
  expect((await request.get('./')).status()).toBe(200)
  for (const path of ['train', 'create', 'calendar', 'progress', 'settings', 'missing.js']) expect((await request.get(path)).status()).toBe(404)
})

import { defineConfig } from '@playwright/test'

// The test owns a static server and switches its files without changing origin.
// Keep output separate: Playwright must not remove the prepared release inputs.
export default defineConfig({
  testDir: './tests/updates',
  testMatch: '*.spec.ts',
  outputDir: 'test-results/update-runs',
  reporter: [['list'], ['json', { outputFile: 'test-results/update-runs/results.json' }]],
  workers: 1,
  timeout: 180000,
  expect: { timeout: 10000 },
  use: { trace: 'retain-on-failure', actionTimeout: 15000 },
  projects: [
    { name: 'root-desktop', use: { channel: 'msedge', viewport: { width: 1440, height: 1000 } } },
    { name: 'project-phone', use: { channel: 'msedge', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'firefox-desktop', use: { browserName: 'firefox', viewport: { width: 1440, height: 1000 } } },
  ],
})

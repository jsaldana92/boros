import { defineConfig } from '@playwright/test'
import config from './playwright.preview.config'

// Install with PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright.
// CDP-only device timezone changes remain covered by the Edge suite.
export default defineConfig({
  ...config,
  outputDir: 'test-results/engines',
  workers: 2,
  expect: { timeout: 10000 },
  grepInvert: /stored schedule zone and Today|out-of-order history\/chart|default repeated-hour timestamp/,
  use: { ...config.use, channel: undefined },
  projects: ['firefox', 'webkit'].flatMap((browserName) => [
    { name: `${browserName}-desktop`, use: { browserName: browserName as 'firefox' | 'webkit', viewport: { width: 1440, height: 1000 } } },
    { name: `${browserName}-phone`, use: { browserName: browserName as 'firefox' | 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true } },
  ]),
})

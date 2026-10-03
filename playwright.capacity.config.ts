import { defineConfig } from '@playwright/test'
import config from './playwright.preview.config'

export default defineConfig({ ...config, testDir: 'tests/capacity', outputDir: 'test-results/capacity', workers: 1,
  projects: [{ name: 'edge-desktop', use: { viewport: { width: 1440, height: 1000 } } }],
})

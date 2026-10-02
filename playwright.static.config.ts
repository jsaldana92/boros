import { defineConfig } from '@playwright/test'
import config from './playwright.config'

export default defineConfig({
  ...config,
  outputDir: 'test-results/static',
  projects: ['root', 'project'].flatMap((mount) => config.projects!.map((project) => ({
    ...project, name: `${mount}-${project.name}`,
    use: { ...project.use, baseURL: `http://127.0.0.1:4174/${mount === 'project' ? 'project-check/' : ''}` },
  }))),
  webServer: { command: 'node tests/static-server.mjs', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
})

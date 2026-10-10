import { expect, test, type Page } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

type Stage = { label: string; directory: string; commit: string; htmlSha256: string; entry: string; entrySha256: string }
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const field = (page: Page, name: string) => ['Active profile', 'Schedule plan', 'Training day'].includes(name)
  ? page.getByRole('combobox', { name, exact: true }) : page.getByLabel(name, { exact: true })
const planName = 'Update preservation plan'
const profileName = 'Update preservation owner'

// Native IndexedDB reads, independent of the new app's services or schemas.
// An unexpected absent DB aborts opening instead of creating one for the test.
async function records(page: Page) {
  return page.evaluate(async () => {
    const open = (window as unknown as { updateTestOpen?: IDBFactory['open'] }).updateTestOpen ?? indexedDB.open.bind(indexedDB)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = open('boros')
      request.onupgradeneeded = () => request.transaction!.abort()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
    try {
      const names = Array.from(db.objectStoreNames)
      const transaction = db.transaction(names, 'readonly')
      const completed = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onabort = transaction.onerror = () => reject(transaction.error)
      })
      const rows = await Promise.all(names.map((name) => new Promise<[string, Record<string, unknown>[]]>((resolve, reject) => {
        const request = transaction.objectStore(name).getAll()
        request.onsuccess = () => resolve([name, request.result])
        request.onerror = () => reject(request.error)
      })))
      await completed
      // Capture the actual Blob bytes, not just JSON's empty {} representation.
      for (const [, values] of rows) for (const row of values) for (const [key, value] of Object.entries(row)) {
        if (value instanceof Blob) row[key] = { type: value.type, size: value.size, bytes: Array.from(new Uint8Array(await value.arrayBuffer())) }
      }
      return { name: db.name, version: db.version, tables: Object.fromEntries(rows) }
    } finally { db.close() }
  })
}

async function oldVersionFixture(page: Page, legacyPlan: boolean) {
  await button(page, 'Settings').click()
  if (await button(page, 'Understood').isVisible()) await button(page, 'Understood').click()
  const guestId = await field(page, 'Active profile').inputValue()
  // Separate owner, so preserving active selection cannot pass by picking Guest.
  await field(page, 'New profile name').fill(profileName)
  await button(page, 'Create profile').click()
  await expect(page.locator('input[name="name"]')).toHaveValue(profileName)
  const ownerId = await field(page, 'Active profile').inputValue()
  expect(ownerId).not.toBe(guestId)
  await field(page, 'Weight (kg, optional)').fill('72.5')
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 12
    const context = canvas.getContext('2d')!; context.fillStyle = '#937ac8'; context.fillRect(0, 0, 12, 12)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await field(page, 'Profile photo').setInputFiles({ name: 'update-photo.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') })
  await button(page, 'Save profile').click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  await button(page, 'Light').click()
  await button(page, 'Create').click()
  await button(page, 'Create Workout').click()
  await field(page, 'Exercise name').fill('Update squat')
  await field(page, 'Set 1 Reps minimum').fill('5')
  await field(page, 'Set 1 RIR minimum (optional)').fill('0')
  await field(page, 'Instructions (optional)').fill('Keep this exact instruction <plain text>.')
  await field(page, 'New tag').fill('Update legs'); await button(page, 'Add').click()
  await button(page, 'Save workout').click()
  await expect(page.getByRole('article', { name: 'Update squat', exact: true })).toBeVisible()
  if (legacyPlan) {
    await button(page, 'Import AI Output').click()
    await field(page, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 1, kind: 'plan', plan: {
      name: planName, trainingDaysPerWeek: 1, days: [{ name: 'Day 1', exercises: [{ name: 'Legacy AI row', sets: [{ reps: { min: 5, max: 5 } }], tags: ['Back'] }] }],
    } }))
    await button(page, 'Validate and preview').click()
  } else {
    await button(page, 'Create Plan').click(); await field(page, 'Plan name').fill(planName)
    await page.locator('.plan-day').first().getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.locator('.exercise-picker li').filter({ hasText: 'Update squat' }).getByRole('button', { name: /^Copy / }).click()
  }
  await field(page, 'Duration (weeks)').fill('4')
  await button(page, 'Save plan').click()
  await expect(page.getByRole('article', { name: `Plan ${planName}`, exact: true })).toBeVisible()
  await button(page, 'Calendar').click(); await button(page, 'Week').click(); await button(page, 'Add Plan').click()
  await field(page, 'Schedule plan').selectOption({ label: planName })
  await field(page, 'Starting week (Monday)').fill('2026-10-05')
  await button(page, 'Preview schedule').click(); await button(page, 'Confirm schedule').click()
  await expect(page.getByRole('article', { name: `Schedule ${planName}`, exact: true })).toBeVisible()
  await button(page, 'Train').click(); await button(page, 'Select Plans').click()
  await page.getByRole('checkbox', { name: planName, exact: true }).check(); await button(page, 'Save selection').click()
  await field(page, 'Training day').selectOption({ label: '1. Day 1' }); await button(page, 'Start session').click()
  const exercise = legacyPlan ? 'Legacy AI row' : 'Update squat'
  await field(page, `${exercise} set 1 Weight (kg)`).fill('40')
  await field(page, `${exercise} set 1 Repetitions`).fill('5')
  await button(page, 'Session Note').click(); await field(page, 'Note').fill('Saved before deployment'); await button(page, 'Apply note').click()
  await button(page, 'Save').click()
  await expect(page.getByRole('region', { name: 'Saved session details' })).toContainText('Complete session')
  await button(page, 'Back to training days').click(); await button(page, 'Start session').click()
  await field(page, `${exercise} set 1 Weight (kg)`).fill('12.')
  await button(page, 'Session Note').click(); await field(page, 'Note').fill('Committed draft before deployment'); await button(page, 'Apply note').click()
  await expect(page.getByText('Draft saved locally.', { exact: true })).toBeVisible()
  await button(page, 'Settings').click()
  return { ownerId, guestId, exercise }
}

for (const legacyPlan of [false, true]) test(`same-context published releases and two rebuilds preserve ${legacyPlan ? 'legacy AI plan repair and history' : 'all linked records exactly'}`, async ({ context, page: initialPage }, info) => {
  const { stages } = JSON.parse(await readFile('test-results/update-builds/builds.json', 'utf8')) as { stages: Stage[] }
  expect(stages.map((stage) => stage.label)).toEqual(['previous', 'deployed', 'pre-interval', 'build-1', 'build-2'])
  expect(stages[0].entrySha256).not.toBe(stages[1].entrySha256)
  let active = stages[0]
  const mount = info.project.name.startsWith('project-') ? '/project-check/' : '/'
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname)
      if (!pathname.startsWith(mount)) throw new Error('Wrong mount')
      const file = resolve(active.directory, pathname.slice(mount.length) || 'index.html')
      if (!file.startsWith(active.directory + sep) || !(await stat(file)).isFile()) throw new Error('Not a file')
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Update-Test-Build': active.label })
      response.end(await readFile(file))
    } catch { response.writeHead(404); response.end('Not found') }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const address = origin + mount
  let page = initialPage
  const errors: string[] = []
  const track = (p: Page) => { p.on('pageerror', (error) => errors.push(error.message)) }
  track(page)
  try {
    // This instrumentation is confined to this disposable Playwright context.
    await context.addInitScript(() => {
      const open = indexedDB.open.bind(indexedDB)
      ;(window as unknown as { updateTestOpen: IDBFactory['open'] }).updateTestOpen = open
      if (sessionStorage.getItem('update-test.fail-open') === 'yes') indexedDB.open = () => { throw new DOMException('Simulated update storage failure', 'UnknownError') }
    })
    expect((await page.goto(address))!.headers()['x-update-test-build']).toBe('previous')
    const fixture = await oldVersionFixture(page, legacyPlan)
    let expected = await records(page)
    expect(expected.name).toBe('boros'); expect(expected.version).toBe(50)
    expect(expected.tables.profiles).toHaveLength(2)
    for (const store of ['exercises', 'plans', 'sessions', 'schedules', 'measurements', 'photos', 'tags']) expect(expected.tables[store].length, store).toBeGreaterThan(0)
    expect(expected.tables.drafts).toHaveLength(2)
    expect(expected.tables.drafts.filter((row) => !row.finalizedAt)).toHaveLength(1)
    expect(expected.tables.settings[0].activeProfileId).toBe(fixture.ownerId)
    await info.attach('before-update.json', { body: JSON.stringify(expected, null, 2), contentType: 'application/json' })
    // Baseline ordinary refresh also preserves committed data, before any update.
    await page.reload(); await expect(field(page, 'Active profile')).toHaveValue(fixture.ownerId)
    expect(await records(page)).toEqual(expected)
    const receipts: object[] = []
    for (const stage of stages.slice(1)) {
      active = stage // ONLY server files change: no new browser context or origin.
      if (stage.label === 'build-1') {
        await page.evaluate(() => sessionStorage.setItem('update-test.fail-open', 'yes'))
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Browser storage unavailable', exact: true })).toBeVisible()
        await expect(page.getByRole('alert')).toContainText('Simulated update storage failure')
        expect(await records(page)).toEqual(expected) // including profile count/IDs
        await page.evaluate(() => sessionStorage.removeItem('update-test.fail-open'))
      }
      expect((await page.reload())!.headers()['x-update-test-build']).toBe(stage.label)
      await expect(field(page, 'Active profile')).toHaveValue(fixture.ownerId)
      const after = await records(page)
      if (stage.label === 'pre-interval') {
        expect(after.version).toBe(70); expect(after.tables.workouts).toEqual([]); expect(after.tables.deletedSources).toEqual([])
        for (const [store, rows] of Object.entries(expected.tables)) expect(after.tables[store], store).toEqual(rows)
        expected = after
      }
      if (stage.label === 'build-1') {
        expect(after.version).toBe(100); expect(after.tables.workouts).toHaveLength(1); expect(after.tables.deletedSources).toEqual([])
        const withoutNewFields = (value: unknown) => JSON.parse(JSON.stringify(value, (key, v) => ['trainingType', 'publishedWorkoutId'].includes(key) ? undefined : v))
        for (const [store, rows] of Object.entries(expected.tables)) {
          if (store === 'workouts') continue
          if (store === 'plans') {
            expect(after.tables.plans).toHaveLength(rows.length)
            for (const before of rows) { const current = after.tables.plans.find(p => p.id === before.id)!; expect(current.revision).toBe(Number(before.revision) + 1); expect(withoutNewFields({ ...current, revision: before.revision })).toEqual(before) }
          } else expect(withoutNewFields(after.tables[store]), store).toEqual(rows)
        }
        expected = after
      }
      if (legacyPlan && stage.label === 'deployed') {
        // This release deliberately repairs unlinked legacy AI plans. Allow only
        // the documented additive template/link changes; everything else exact.
        // This old release already saved the AI plan's tags, so reuse them exactly.
        for (const [store, rows] of Object.entries(expected.tables)) if (!['plans', 'exercises'].includes(store)) expect(after.tables[store], store).toEqual(rows)
        expect(after.tables.exercises).toHaveLength(expected.tables.exercises.length + 1)
        for (const row of expected.tables.exercises) expect(after.tables.exercises).toContainEqual(row)
        const oldPlan = expected.tables.plans[0], newPlan = after.tables.plans[0]
        expect(after.tables.plans).toHaveLength(1)
        expect(newPlan.revision).toBe(Number(oldPlan.revision) + 1)
        const stripLinks = (plan: Record<string, unknown>) => JSON.parse(JSON.stringify(plan, (key, value) => key === 'templateId' || key === 'revision' ? undefined : value))
        expect(stripLinks(newPlan)).toEqual(stripLinks(oldPlan))
        const day = (newPlan.days as { exercises: { templateId: string }[] }[])[0]
        expect(after.tables.exercises.some((row) => row.id === day.exercises[0].templateId && row.profileId === fixture.ownerId)).toBe(true)
        expected = after
      } else expect(after).toEqual(expected)
      await expect(page.locator('header .avatar img')).toBeVisible()
      expect(await page.locator('header .avatar img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await expect(field(page, 'Weight (kg, optional)')).toHaveValue('72.5')
      if (stage.label === 'build-1') {
        // Add this release's weekly records before the second rebuild, without
        // replacing the context or touching the old fixture's history/assets.
        await button(page, 'Create').click(); await button(page, 'Import').click()
        await field(page, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 3, kind: 'plan', plan: { name: 'Weekly update program', instructions: 'Preserve plan instructions across rebuilds.\nSeparate from exercise and session notes.', durationWeeks: 4, trainingDaysPerWeek: 1, days: [{ name: 'Weekly day', exercises: [{ name: 'Update press', sets: [{ reps: { min: 5, max: 5 } }] }] }] } }))
        await button(page, 'Validate and preview').click(); await button(page, 'Save plan').click()
        await expect(page.getByRole('article', { name: 'Plan Weekly update program', exact: true })).toBeVisible()
        await button(page, 'Train').click(); await button(page, 'Add Plan').click()
        await page.getByRole('dialog').getByRole('article', { name: 'Plan Weekly update program', exact: true }).getByRole('button').click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await page.getByRole('article', { name: 'Plan Weekly update program', exact: true }).getByRole('button').click()
        await page.locator('.training-day-card').click(); await button(page, 'Skip').click()
        await expect(page.locator('.training-day-card')).toContainText('Skipped')
        await button(page, 'Next week').click(); await expect(page.locator('.training-day-card')).toContainText('Pending')
        await button(page, 'Move Training to Next Week').click(); await button(page, 'Confirm move').click()
        await expect(page.getByText('Week 2', { exact: true })).toBeVisible()
        await button(page, 'Leave Plan').click(); await page.getByRole('dialog', { name: 'Ending a Plan?' }).getByRole('button', { name: 'End', exact: true }).click()
        await button(page, 'Add Plan').click(); await page.getByRole('dialog').getByRole('article', { name: 'Plan Weekly update program', exact: true }).getByRole('button').click()
        // Exercise the new optional Calendar metadata across the next rebuild:
        // preserve a recorded unscheduled occurrence while assigning this run,
        // and hide the independent closed history without deleting it.
        await page.getByRole('article', { name: 'Plan Weekly update program', exact: true }).getByRole('button').click()
        await page.locator('.training-day-card').click(); await button(page, 'Skip').click()
        await button(page, 'Calendar').click(); await button(page, 'Calendar menu').click(); await button(page, 'Current Plans').click()
        await page.getByRole('article', { name: 'Run Weekly update program', exact: true }).getByRole('button').click(); await button(page, 'Edit').click()
        await field(page, 'Weekly day weekday').selectOption('1'); await button(page, 'Save').click()
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Current Plans'); await expect(page.getByRole('dialog')).toHaveCount(0)
        await button(page, 'Back').click(); await button(page, 'Calendar menu').click(); await button(page, 'Previous Plans').click()
        await page.getByRole('article', { name: 'Run Weekly update program', exact: true }).getByRole('button').click(); await button(page, 'Hide').click()
        // The new cycle contract must survive the SECOND build in this SAME
        // browser context too, alongside the unchanged old release fixture.
        await button(page, 'Create').click(); await button(page, 'Import').click()
        await field(page, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 4, kind: 'plan', plan: { mode: 'unique', name: 'Cycle update program', durationWeeks: 4, uniqueWeekCount: 2, weeks: [1, 2].map((week) => ({ trainingDaysPerWeek: 1, days: [{ name: `Cycle week ${week}`, exercises: [{ name: 'Cycle press', sets: [{ reps: { min: week * 5, max: week * 5 }, rir: { min: 0, max: 0 } }] }] }] })) } }))
        await button(page, 'Validate and preview').click(); await button(page, 'Save plan').click()
        await expect(page.getByRole('article', { name: 'Plan Cycle update program', exact: true })).toBeVisible()
        await button(page, 'Train').click(); await button(page, 'Add Plan').click(); await page.getByRole('dialog').getByRole('article', { name: 'Plan Cycle update program', exact: true }).getByRole('button').click()
        await page.getByRole('article', { name: 'Plan Cycle update program', exact: true }).getByRole('button').click(); await page.locator('.training-day-card').click(); await button(page, 'Skip').click()
        await button(page, 'Next week').click(); await expect(page.locator('.training-day-card')).toContainText('Cycle week 2'); await button(page, 'Move Training to Next Week').click(); await button(page, 'Confirm move').click()
        await button(page, 'Settings').click(); await page.getByRole('group', { name: 'Sound', exact: true }).getByRole('button', { name: 'On', exact: true }).click()
        await expect(page.getByRole('group', { name: 'Sound', exact: true }).getByRole('button', { name: 'On', exact: true })).toHaveAttribute('aria-pressed', 'true')
        await button(page, 'Create').click(); await button(page, 'Import').click()
        await field(page, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 5, kind: 'workout', workout: { name: 'Update workout', exercises: [{ name: 'Update standalone press', sets: [{ reps: { min: 5, max: 5 } }] }] } }))
        await button(page, 'Validate and preview').click(); await button(page, 'Save workout').click()
        await button(page, 'Train').click(); await button(page, 'Existing Workout').click(); await page.getByRole('article', { name: 'Workout Update workout', exact: true }).getByRole('button').click()
        await field(page, 'Update standalone press set 1 Weight (kg)').fill('0'); await field(page, 'Update standalone press set 1 Repetitions').fill('5'); await button(page, 'Save').click()
        await expect(page.getByRole('region', { name: 'Saved session details' })).toBeVisible()
        await button(page, 'Back to workouts').click(); await button(page, 'Custom Workout').click(); await button(page, 'Strength').click(); await button(page, 'Add Exercise').click(); await button(page, 'Add Update standalone press').click()
        await field(page, 'Update standalone press set 1 Weight (kg)').fill('12.'); await button(page, 'Settings').click()
        // Retain the new deleted-source identity across the second rebuild too.
        // Delete a disposable source with no results; keep the copied plan usable.
        await page.reload(); await button(page, 'Create').click()
        await page.getByRole('article', { name: 'Cycle press', exact: true }).getByRole('button').click()
        await button(page, 'Exercise actions').click(); await button(page, 'Delete').click()
        await page.getByRole('dialog', { name: 'Delete exercise?', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click()
        // New typed data survives the second update in this SAME storage context.
        await button(page, 'Import').click()
        await field(page, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 6, trainingType: 'interval', kind: 'workout', workout: { name: 'Update intervals', circuits: [{ name: 'Timed circuit', roundsPerSet: 1, sets: 1, restBetweenSetsSeconds: 0, restAfterCircuitSeconds: 0, exercises: [{ name: 'Update sprint', activeSeconds: 20, recoverySeconds: 0, tags: [], youtubeUrl: null }] }] } }))
        await button(page, 'Validate and preview').click(); await button(page, 'Save workout').click()
        await button(page, 'Train').click(); await button(page, 'Existing Workout').click(); await page.getByRole('article', { name: 'Workout Update intervals', exact: true }).getByRole('button').click()
        await expect(button(page, 'Start')).toBeEnabled(); await button(page, 'Start').click(); await page.waitForTimeout(5350); await button(page, 'Pause').click()
        await button(page, 'Save').click(); await button(page, 'Confirm').click(); await expect(page.getByRole('region', { name: 'Saved Interval session' })).toBeVisible()
        await button(page, 'Settings').click()
        expected = await records(page)
        expect(expected.tables.sessions.some(s => !!s.interval)).toBe(true)
        expect(expected.tables.deletedSources).toHaveLength(1)
        expect(expected.tables.workouts).toHaveLength(6)
        expect(expected.tables.sessions.some(s => (s.source as { kind?: string })?.kind === 'workout')).toBe(true)
        expect(expected.tables.drafts.some(d => (d.source as { kind?: string })?.kind === 'custom' && !d.finalizedAt)).toBe(true)
        expect(expected.tables.schedules.some((run) => !!run.hiddenAt)).toBe(true)
        expect(expected.tables.schedules.some((run) => Array.isArray(run.occurrenceExceptions) && run.occurrenceExceptions.length > 0)).toBe(true)
      }
      // Close/reopen the page, deliberately KEEPING this same browser context.
      await page.close(); page = await context.newPage(); track(page)
      expect((await page.goto(address))!.headers()['x-update-test-build']).toBe(stage.label)
      await button(page, 'Settings').click(); await expect(field(page, 'Active profile')).toHaveValue(fixture.ownerId)
      expect(await records(page)).toEqual(expected)
      expect(page.url()).toBe(address)
      receipts.push({ ...stage, address, profileId: fixture.ownerId, counts: Object.fromEntries(Object.entries(expected.tables).map(([name, rows]) => [name, rows.length])) })
    }
    await button(page, 'Train').click(); await page.getByRole('button', { name: new RegExp('^Resume ' + planName + ' / Day 1') }).click()
    await expect(field(page, `${fixture.exercise} set 1 Weight (kg)`)).toHaveValue('12.')
    await button(page, 'Session Note').click(); await expect(field(page, 'Note')).toHaveValue('Committed draft before deployment'); await page.keyboard.press('Escape')
    await page.reload(); await button(page, 'Settings').click(); await field(page, 'Active profile').selectOption(fixture.guestId)
    await expect(page.locator('input[name="name"]')).toHaveValue('Guest')
    await button(page, 'Create').click(); await expect(page.getByRole('article')).toHaveCount(0)
    await button(page, 'Settings').click(); await field(page, 'Active profile').selectOption(fixture.ownerId)
    await expect(page.locator('input[name="name"]')).toHaveValue(profileName)
    expect(await records(page)).toEqual(expected)
    const diagnostic = page.waitForEvent('console', (message) => message.type() === 'log' && message.text().startsWith('{\n  "capturedAt"'))
    await page.addScriptTag({ content: await readFile('scripts/storage-diagnostics.js', 'utf8') })
    const report = JSON.parse((await diagnostic).text())
    expect(report.url).toBe(address)
    expect(report.boros.activeProfileId).toBe(fixture.ownerId)
    expect(report.boros.counts.profiles).toBe(2)
    expect(report.boros.counts.photos).toBe(1)
    expect(await records(page)).toEqual(expected) // diagnostic itself is read-only
    await info.attach('storage-diagnostics.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
    expect(errors).toEqual([])
    await info.attach('update-receipts.json', { body: JSON.stringify(receipts, null, 2), contentType: 'application/json' })
  } finally {
    await page.close()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

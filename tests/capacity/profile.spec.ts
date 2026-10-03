import 'fake-indexeddb/auto'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { cpus, totalmem } from 'node:os'
import JSZip from 'jszip'
import { BorosDatabase } from '../../src/db/database'
import { profileService } from '../../src/db/profiles'
import { exerciseService } from '../../src/db/exercises'
import { planService } from '../../src/db/plans'
import { scheduleService } from '../../src/db/schedules'
import { sessionService } from '../../src/db/sessions'
import { newDay, copyExercise } from '../../src/schemas/plan'

test('documented larger profile loads, filters, exports and restores within archive limits', async ({ page, browser }, info) => {
  test.setTimeout(180000)
  const b = (name: string) => page.getByRole('button', { name, exact: true })
  const timings: Record<string, number> = {}
  async function time(name: string, action: () => Promise<void>) { const start = performance.now(); await action(); timings[name] = Math.round(performance.now() - start) }
  await page.goto('./'); await b('Settings').click(); if (await b('Understood').isVisible()) await b('Understood').click()
  // Deterministic photographic-size textured JPEGs, not 1px stand-ins. No external images.
  const images = await page.evaluate(() => Array.from({ length: 12 }, (_, index) => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 960
    const ctx = c.getContext('2d')!, data = ctx.createImageData(c.width, c.height)
    let seed = index + 1
    for (let i = 0; i < data.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const noise = seed >>> 24, x = (i / 4) % c.width, y = Math.floor(i / 4 / c.width)
      data.data[i] = (noise + x / 8) % 256; data.data[i + 1] = (noise + y / 4) % 256; data.data[i + 2] = noise; data.data[i + 3] = 255
    }
    ctx.putImageData(data, 0, 0); return c.toDataURL('image/jpeg', .85).split(',')[1]
  }))
  const db = new BorosDatabase(`boros-test-capacity-${crypto.randomUUID()}`)
  let owner: string
  try {
    const profiles = profileService(db), exercises = exerciseService(db), plans = planService(db), sessions = sessionService(db)
    owner = (await profiles.initialize()).activeProfileId
    await profiles.save(owner, 1, { name: 'Capacity disposable', weightUnit: 'kg', heightUnit: 'cm' })
    const prescription = { name: 'Capacity exercise', sets: [{ reps: { min: 5, max: 8 }, rir: { min: 0, max: 2 } }, { reps: { min: 8, max: 12 } }, { reps: { min: 10, max: 10 } }], tagNames: ['Strength'], instructions: 'Plain local instructions', restBetweenSeconds: 60 }
    for (let i = 0; i < 100; i++) await exercises.save(owner, { ...prescription, name: `Exercise ${String(i).padStart(3, '0')}` })
    for (let i = 0; i < 20; i++) {
      const plan = await plans.save(owner, { name: `Plan ${String(i).padStart(2, '0')}`, durationWeeks: 104, days: Array.from({ length: 4 }, (_, n) => ({ ...newDay(n + 1), exercises: [copyExercise(prescription)] })) })
      if (i < 5) await scheduleService(db).create(owner, { planId: plan.id, planRevision: plan.revision, startWeek: '2025-01-06', timeZone: 'America/New_York', mapping: plan.days.map((day, weekday) => ({ dayId: day.id, weekday })) })
      const draft = await sessions.start(owner, plan.id, plan.days[0].id), input = structuredClone(draft.input)
      input.notes = 'Capacity completed session'; input.exercises[0].sets.forEach((s) => Object.assign(s, { load: '50', reps: '8', rir: '0' }))
      await sessions.complete(owner, draft.id, draft.revision, input, false)
      const completed = (await db.sessions.get([owner, draft.id]))!, finalized = (await db.drafts.get([owner, draft.id]))!
      for (let j = 1; j < 25; j++) {
        const id = crypto.randomUUID(), stamp = new Date(Date.UTC(2023, 0, 1 + i * 25 + j, 12)).toISOString()
        await db.sessions.put({ ...completed, id, draftId: id, startedAt: stamp, completedAt: stamp, loggedAt: stamp })
        await db.drafts.put({ ...finalized, id, startedAt: stamp, updatedAt: stamp, finalizedAt: stamp })
      }
    }
    const photoIds = images.map(() => crypto.randomUUID())
    for (const [i, base64] of images.entries()) await db.photos.put({ id: photoIds[i], profileId: owner, role: 'progress', createdAt: '2025-01-01T12:00:00.000Z', width: 1280, height: 960, blob: new Blob([Buffer.from(base64, 'base64')], { type: 'image/jpeg' }) })
    for (let i = 0; i < 730; i++) {
      const stamp = new Date(Date.UTC(2023, 0, 1 + i, 12)).toISOString()
      await db.measurements.put({ id: crypto.randomUUID(), profileId: owner, weightKg: 70 + i % 10 / 10, measuredAt: stamp, loggedAt: stamp, ...(i < 12 ? { photoId: photoIds[i] } : {}) })
    }
    const stores = await Promise.all(db.tables.map(async (table) => ({ name: table.name, records: await Promise.all((await table.toArray()).map(async (r) => r.blob ? { ...r, blob: undefined, image: Buffer.from(await r.blob.arrayBuffer()).toString('base64') } : r)) })))
    await page.evaluate(async (stores) => {
      const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result) })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(stores.map((s) => s.name), 'readwrite'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)
        for (const store of stores) for (const value of store.records) { const { image, ...r } = value; if (image) r.blob = new Blob([Uint8Array.from(atob(image), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }); if (store.name === 'settings') r.noticeAccepted = true; tx.objectStore(store.name).put(r) }
      }); db.close()
    }, stores)
  } finally { await db.delete() }
  await time('reloadSettingsMs', async () => { await page.reload(); await expect(page.getByRole('combobox', { name: 'Active profile', exact: true })).toHaveValue(owner) })
  await time('train500SessionsMs', async () => { await b('Train').click(); await page.getByRole('button', { name: /^Saved sessions/ }).click(); await expect(b('Review session')).toHaveCount(500) })
  await time('create100Exercises20PlansMs', async () => { await b('Create').click(); await expect(page.getByRole('article', { name: 'Exercise 099', exact: true })).toBeVisible() })
  await time('filterExercisesMs', async () => { await page.getByLabel('Search exercises', { exact: true }).fill('099'); await expect(page.locator('.exercise-card').filter({ has: b('View / edit') })).toHaveCount(1) })
  await page.evaluate(() => {
    const w = window as unknown as { photoReads: number }; w.photoReads = 0
    for (const method of ['get', 'getAll', 'openCursor'] as const) {
      const original = IDBObjectStore.prototype[method]
      IDBObjectStore.prototype[method] = function (...args) { if (this.name === 'photos') w.photoReads++; return original.apply(this, args) }
    }
    for (const method of ['get', 'getAll', 'openCursor'] as const) {
      const original = IDBIndex.prototype[method]
      IDBIndex.prototype[method] = function (...args) { if (this.objectStore.name === 'photos') w.photoReads++; return original.apply(this, args) }
    }
  })
  await time('progress730MeasurementsMs', async () => { await b('Progress').click(); await expect(page.getByRole('combobox', { name: 'Select measurement', exact: true }).locator('option')).toHaveCount(730); await expect(page.locator('.point-chart circle')).toHaveCount(730) })
  await time('measurementSelectionMs', async () => { await page.getByRole('combobox', { name: 'Select measurement', exact: true }).selectOption({ index: 0 }); await expect(page.locator('.measurement-card h3')).toHaveText('70 kg') })
  await time('workout75SetsMs', async () => { await page.locator('.workout-progress-grid button').filter({ has: page.getByText('Capacity exercise', { exact: true }) }).first().click(); await expect(page.locator('.exercise-statistics')).toContainText('75 recorded sets') })
  await time('workoutSetSelectionMs', async () => { await page.getByRole('combobox', { name: 'Select recorded set for Capacity exercise', exact: true }).selectOption({ index: 0 }); await expect(page.locator('.exercise-statistics .point-chart [role="status"]')).toContainText('Set 1') })
  expect(await page.locator('.exercise-statistics circle').count()).toBe(75)
  await time('progressBackMs', async () => { await b('Back to Progress').click(); await expect(page.locator('.workout-progress-grid button')).toHaveCount(180) })
  expect(await page.evaluate(() => (window as unknown as { photoReads: number }).photoReads)).toBe(0)
  expect(await page.locator('.progress-photo').count()).toBe(0)
  await time('calendarWeekMs', async () => { await b('Calendar').click(); await b('Week').click(); await page.getByLabel('Calendar date', { exact: true }).fill('2025-01-06'); await expect(page.locator('.calendar-event')).toHaveCount(20) })
  await time('calendarMonthMs', async () => { await b('Month').click(); await expect(page.getByLabel('month calendar')).toBeVisible(); await expect(page.locator('.calendar-event').first()).toBeVisible() })
  expect(await page.locator('.calendar-day').count()).toBeLessThanOrEqual(42)
  await b('Settings').click(); await page.getByRole('checkbox', { name: 'I understand this exports saved data only.' }).check()
  let bytes: Buffer
  await time('exportMs', async () => { const ready = page.waitForEvent('download'); await b('Download data').click(); bytes = await readFile((await (await ready).path())!) })
  const zip = await JSZip.loadAsync(bytes!), manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
  expect(manifest.counts).toEqual({ profiles: 1, tags: 1, exercises: 100, plans: 20, schedules: 5, drafts: 500, sessions: 500, measurements: 730, assets: 12 })
  await time('validateUploadMs', async () => { await page.getByLabel('Backup ZIP').setInputFiles({ name: 'capacity.zip', mimeType: 'application/zip', buffer: bytes! }); await expect(page.getByRole('heading', { name: /^Validated backup:/ })).toBeVisible({ timeout: 60000 }) })
  await page.getByLabel('Import choice').selectOption('new'); await page.getByLabel('Imported profile name').fill('Capacity restored')
  await time('previewMs', async () => { await b('Preview import').click(); await expect(page.getByRole('region', { name: 'Restore preview' })).toBeVisible() })
  await page.getByRole('checkbox', { name: /^I confirm/ }).check()
  await time('commitRestoreMs', async () => { await b('Confirm and save').click(); await expect(page.getByText(/Changes are saved locally\./)).toBeVisible({ timeout: 60000 }) })
  await page.reload(); await expect(page.locator('input[name="name"]')).toHaveValue('Capacity restored')
  const restoredOwner = await page.getByRole('combobox', { name: 'Active profile', exact: true }).inputValue()
  // Sparse File avoids allocating 64 MiB in the test protocol; UI must reject before reading.
  await page.getByLabel('Backup ZIP').evaluate((node: HTMLInputElement) => { const transfer = new DataTransfer(); const file = new File(['x'], 'too-large.zip', { type: 'application/zip' }); Object.defineProperty(file, 'size', { value: 64 * 1024 * 1024 + 1 }); transfer.items.add(file); node.files = transfer.files; node.dispatchEvent(new Event('change', { bubbles: true })) })
  await expect(page.getByRole('alert')).toContainText('up to 64 MiB'); await expect(page.getByRole('combobox', { name: 'Active profile', exact: true })).toHaveValue(restoredOwner)
  const result = { browser: browser.version(), os: process.platform, cpu: cpus()[0].model, ramGiB: Math.round(totalmem() / 1024 ** 3), counts: manifest.counts, imageDimensions: '1280x960', imageBytes: images.map((s) => Buffer.from(s, 'base64').length), zipBytes: bytes!.length, expandedBytes: manifest.inventory.reduce((n, item) => n + item.bytes, 0), timings }
  await info.attach('capacity-observations.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  console.log(JSON.stringify(result))
})

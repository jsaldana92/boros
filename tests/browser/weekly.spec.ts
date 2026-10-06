import { deviceZone } from './settings-actions'
import { runPage, returnCalendar } from './calendar-actions'
import { writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { waitForDraft, closeTimer } from './train-actions'

test.setTimeout(90000)
const b = (p: Page, name: string) => p.getByRole('button', { name, exact: true })
const f = (p: Page, name: string) => p.getByLabel(name, { exact: true })
const card = (p: Page, day: string) => p.locator('.training-day-card').filter({ hasText: day })
async function rows(p: Page, store: string) { return p.evaluate(async (store) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
  try { return await new Promise<any[]>((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) } finally { db.close() }
}, store) }
async function fixture(p: Page, theme = 'Dark') {
  await p.clock.setFixedTime(new Date('2026-10-05T16:00:00Z')); await p.goto('./')
  if (await b(p, 'Understood').isVisible()) await b(p, 'Understood').click()
  await b(p, 'Settings').click(); await b(p, theme).click(); await deviceZone(p, 'America/New_York')
  await b(p, 'Create').click(); await b(p, 'Imported').click()
  await f(p, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 2, kind: 'plan', plan: { name: 'Weekly strength', durationWeeks: 4, trainingDaysPerWeek: 2, days: ['Upper', 'Lower'].map((name) => ({ name, exercises: [{ name: 'Press', sets: [{ reps: { min: 5, max: 5 } }, { reps: { min: 8, max: 8 } }], restBetweenSetsSeconds: 65 }] })) } }))
  await b(p, 'Validate and preview').click(); await f(p, 'Note (optional):').fill('Saved program note\nSecond line'); await b(p, 'Save plan').click()
  await expect(p.getByRole('article', { name: 'Plan Weekly strength', exact: true })).toBeVisible()
  await b(p, 'Train').click(); await b(p, 'Add Plan').click()
  const dialog = p.getByRole('dialog', { name: 'Add Plan' }); await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await dialog.getByRole('article', { name: 'Plan Weekly strength', exact: true }).getByRole('button').click(); await expect(dialog).toHaveCount(0)
  const tile = p.getByRole('article', { name: 'Plan Weekly strength', exact: true }); await expect(tile.locator('button > span')).toHaveText(['Week 1', '4 weeks · 2 workouts · 5 rest days']); await tile.getByRole('button').click()
  await expect(p.getByRole('heading', { level: 1 })).toHaveText('Weekly strength')
  await expect(p.getByRole('region', { name: 'Program week', exact: true }).locator(':scope > p.muted')).toHaveText('4 weeks · 2 workouts · 5 rest days · Unscheduled')
  await expect(card(p, 'Upper')).toContainText('Pending')
}
for (const theme of ['Dark', 'Light']) test(`weekly markers, gaps, reversal, Calendar/Progress and reload (${theme})`, async ({ page }, info) => {
  await fixture(page, theme); const address = page.url(), profile = (await rows(page, 'profiles'))[0], plan = (await rows(page, 'plans'))[0]
  await expect(page.getByRole('button', { name: 'Choose week: 05 Oct - 11 Oct, 2026' })).toBeVisible()
  await card(page, 'Upper').focus(); await page.keyboard.press('Enter'); await b(page, 'Skip').click(); await expect(card(page, 'Upper')).toContainText('Skipped')
  await card(page, 'Lower').click(); await b(page, 'Mark as Complete').click(); await expect(card(page, 'Lower')).toContainText('Completed')
  expect(await rows(page, 'sessions')).toEqual([]); expect(await rows(page, 'drafts')).toEqual([])
  await b(page, 'Move Training to Next Week').click(); await expect(page.getByRole('alert')).toContainText('markers')
  await b(page, 'Next week').click(); await expect(card(page, 'Upper')).toContainText('Pending')
  await b(page, 'Move Training to Next Week').click(); await expect(page.getByRole('dialog')).toContainText('Revised end: 2026-11-08'); await b(page, 'Cancel').click()
  expect((await rows(page, 'schedules'))[0].excludedWeeks).toBeUndefined()
  await b(page, 'Move Training to Next Week').click(); await b(page, 'Confirm move').click(); await expect(page.getByText('Week 2', { exact: true })).toBeVisible()
  await b(page, 'Previous week').click(); await expect(page.getByText(/Excluded week —/)).toBeVisible(); await expect(page.locator('.training-day-card')).toHaveCount(0)
  await b(page, 'Next week').click(); await b(page, 'Move Training to Previous Week').click(); await b(page, 'Confirm move').click(); await expect(page.getByText('Week 2', { exact: true })).toBeVisible()
  expect((await rows(page, 'schedules'))[0].excludedWeeks).toEqual([])
  await page.getByRole('button', { name: /^Choose week:/ }).click(); await f(page, 'Date in week').fill('2026-11-15'); await expect(page.getByText('No active training in this week.')).toBeVisible()
  await page.getByRole('button', { name: /^Choose week:/ }).click(); await f(page, 'Date in week').fill('2026-10-06'); await expect(card(page, 'Upper')).toContainText('Skipped')
  await page.screenshot({ path: info.outputPath(`weekly-${theme.toLowerCase()}.png`), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await b(page, 'Calendar').click(); await expect(page.getByRole('region', { name: 'Unassigned weekly training' })).toHaveCount(0)
  await runPage(page); await expect(page.getByRole('img', { name: /^Completed: 1 of/ })).toBeVisible(); await expect(page.getByRole('img', { name: /^Skipped: 1 of/ })).toBeVisible(); await returnCalendar(page)
  await b(page, 'Progress').click(); await expect(page.getByRole('article', { name: 'Run Weekly strength', exact: true })).toBeVisible()
  await page.reload(); await b(page, 'Train').click(); await page.getByRole('article', { name: 'Plan Weekly strength', exact: true }).getByRole('button').click(); await expect(card(page, 'Upper')).toContainText('Skipped')
  expect((await rows(page, 'profiles'))[0].id).toBe(profile.id); expect((await rows(page, 'plans'))[0]).toEqual(plan)
  await card(page, 'Upper').click(); await b(page, 'Correct marker to Pending').click(); await expect(card(page, 'Upper')).toContainText('Pending')
  await b(page, 'Leave Plan').click(); await page.getByRole('dialog').getByRole('button', { name: 'End', exact: true }).click(); await expect(page.getByText('No active plan(s) selected.')).toBeVisible(); expect(await rows(page, 'plans')).toHaveLength(1); expect(await rows(page, 'schedules')).toHaveLength(1); expect(page.url()).toBe(address)
})
test('draft resolution and expired timer recovery retain interrupted input', async ({ page }, info) => {
  await fixture(page); await card(page, 'Upper').click(); await b(page, 'Start').click()
  await f(page, 'Press set 1 Weight (kg)').fill('30'); await f(page, 'Press set 1 Repetitions').fill('5'); await waitForDraft(page)
  await b(page, 'REST Press after set 1').click(); await expect(page.getByRole('timer')).toContainText('1:05')
  await page.screenshot({ path: info.outputPath('timer-popup.png'), fullPage: true }); await closeTimer(page)
  await page.evaluate(async () => { const request = indexedDB.open('boros'); await new Promise<void>((resolve) => { request.onsuccess = () => { const db = request.result, tx = db.transaction('restTimers', 'readwrite'), store = tx.objectStore('restTimers'), get = store.get('active'); get.onsuccess = () => store.put({ ...get.result, endAt: new Date(Date.now() - 1000).toISOString() }); tx.oncomplete = () => { db.close(); resolve() } } }) })
  await page.reload(); await page.getByRole('button', { name: /^Resume Weekly strength/ }).click(); await expect(page.getByRole('timer')).toHaveText('Rest finished'); expect((await rows(page, 'restTimers'))[0].alertedAt).toBeUndefined(); await b(page, 'Stop').click()
  await page.reload(); await page.getByRole('article', { name: 'Plan Weekly strength', exact: true }).getByRole('button').click(); await card(page, 'Upper').click(); await expect(b(page, 'Skip')).toBeDisabled(); await b(page, 'Discard Progress').click()
  await page.getByRole('dialog', { name: 'Discard Progress?', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click(); expect(await rows(page, 'drafts')).toHaveLength(1)
  await b(page, 'Discard Progress').click(); await page.getByRole('dialog', { name: 'Discard Progress?', exact: true }).getByRole('button', { name: 'Discard Progress', exact: true }).click(); await card(page, 'Upper').click(); await b(page, 'Skip').click(); expect(await rows(page, 'drafts')).toEqual([])
})

test('Sound preference persists; the real local MP3 plays three ended-driven repetitions at root/subpath', async ({ page, request }, info) => {
  await page.addInitScript(() => {
    ;(window as any).mediaEvidence = { ended: 0, starts: 0, calls: 0, sources: [] as string[], events: [] as string[] }
    ;(window as any).testAudio = []
    document.addEventListener('play', (event) => { const audio = event.target as HTMLAudioElement; if (audio.tagName === 'AUDIO' && !audio.muted) { (window as any).mediaEvidence.starts++; (window as any).mediaEvidence.sources.push(audio.src) } }, true)
    // Audio objects are not in the DOM; register their native events without mocking playback.
    const NativeAudio = window.Audio
    window.Audio = function (src?: string) {
      const audio = new NativeAudio(src)
      const play = audio.play.bind(audio)
      audio.play = () => { if (!audio.muted) (window as any).mediaEvidence.calls++; return play() }
      ;(window as any).testAudio.push(audio)
      for (const name of ['play', 'pause', 'ended', 'error', 'loadedmetadata']) audio.addEventListener(name, () => (window as any).mediaEvidence.events.push(`${name}:${audio.muted}:${audio.currentTime}`))
      audio.addEventListener('ended', () => { if (!audio.muted) (window as any).mediaEvidence.ended++ })
      audio.addEventListener('play', () => { if (!audio.muted) { (window as any).mediaEvidence.starts++; (window as any).mediaEvidence.sources.push(audio.src) } })
      return audio
    } as typeof Audio
  })
  await fixture(page); await b(page, 'Back to Plans').click(); await b(page, 'Settings').click()
  await expect(page.getByRole('group', { name: 'Sound', exact: true }).getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('group', { name: 'Sound', exact: true }).getByRole('button', { name: 'On', exact: true }).click(); await page.reload()
  await expect(page.getByRole('group', { name: 'Sound', exact: true }).getByRole('button', { name: 'On', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const asset = await request.get('./rest-complete.mp3'); expect(asset.status()).toBe(200); expect((await asset.body()).length).toBe(25913)
  await b(page, 'Train').click(); await page.getByRole('article', { name: 'Plan Weekly strength', exact: true }).getByRole('button').click(); await card(page, 'Upper').click(); await b(page, 'Start').click()
  await page.clock.install(); await b(page, 'REST Press after set 1').click(); await expect(page.getByRole('timer')).toContainText('1:05'); await page.clock.fastForward(66000)
  await expect(page.getByRole('timer')).toHaveText('Rest finished')
  try { await expect.poll(() => page.evaluate(() => (window as any).mediaEvidence.ended), { timeout: 15000 }).toBe(3) }
  finally { await writeFile(info.outputPath('media-diagnostics.json'), JSON.stringify({ timers: await rows(page, 'restTimers'), media: await page.evaluate(() => ({ ...(window as any).mediaEvidence, states: (window as any).testAudio.map((a: HTMLAudioElement) => ({ src: a.src, paused: a.paused, time: a.currentTime, duration: a.duration, error: a.error?.message, muted: a.muted })) })) })) }
  const evidence = await page.evaluate(() => (window as any).mediaEvidence)
  expect(evidence.calls).toBe(3); expect(evidence.sources.every((source: string) => source === new URL('./rest-complete.mp3', page.url()).href)).toBe(true)
  await info.attach('actual-media-events', { body: JSON.stringify(evidence), contentType: 'application/json' })
  await b(page, 'Stop').click(); expect(await rows(page, 'restTimers')).toEqual([])
})

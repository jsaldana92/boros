import { test, expect, type Page } from '@playwright/test'
import { openWorkoutNote, setWorkoutNote, startWeekly } from './train-actions'
const b = (p: Page, name: string) => p.getByRole('button', { name, exact: true })
const f = (p: Page, name: string) => p.getByLabel(name, { exact: true })
const rest = (p: Page) => p.getByRole('region', { name: 'Post-Workout Rest', exact: true })
const training = (p: Page) => p.getByRole('region', { name: 'Interval training session', exact: true })
const instructions = '<b>Frozen workout instructions</b>\nA second line'
const interval = { name: 'Timer workout', instructions, circuits: [{ name: 'First circuit', repeat: 2, restAfterCircuitSeconds: 2, exercises: [{ name: 'Long exercise ' + 'x'.repeat(90), activeSeconds: 10, recoverySeconds: 2 }] }, { name: 'Second circuit', repeat: 1, restAfterCircuitSeconds: 0, exercises: [{ name: 'Sprint', activeSeconds: 10, recoverySeconds: 0 }] }], postWorkoutRestSeconds: 60 }
async function open(p: Page) { await p.goto('./'); await b(p, 'Create').click(); if (await b(p, 'Understood').isVisible()) await b(p, 'Understood').click() }
async function importValue(p: Page, type: 'strength' | 'interval', planned = false, value = interval) {
  const workout = type === 'interval' ? value : { name: 'Strength workout', instructions, exercises: [{ name: 'Press', instructions: '<b>Exercise details</b>', youtubeUrl: 'https://youtu.be/abcdefghijk', sets: [{ reps: { min: 5, max: 5 } }] }] }
  await b(p, 'Import').click(); await f(p, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 8, trainingType: type, kind: planned ? 'plan' : 'workout', ...(planned ? { plan: { mode: 'repeating', name: type + ' plan', instructions: 'Parent instructions', durationWeeks: 2, trainingDaysPerWeek: 1, days: [workout] } } : { workout }) })); await b(p, 'Validate and preview').click(); await b(p, planned ? 'Save plan' : 'Save workout').click()
  await expect(p.getByRole('article', { name: (planned ? 'Plan ' + type + ' plan' : 'Workout ' + workout.name), exact: true })).toBeVisible()
  if (planned) await startWeekly(p, type + ' plan', workout.name)
  else { await b(p, 'Train').click(); await b(p, 'Existing Workout').click(); await p.getByRole('article', { name: 'Workout ' + workout.name, exact: true }).getByRole('button').click() }
}
async function rows(p: Page, store: string) {
  return p.evaluate(async store => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }); try { return await new Promise<any[]>((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) } finally { db.close() } }, store)
}
async function put(p: Page, store: string, value: any) {
  await p.evaluate(async ({ store, value }) => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }); try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error) }) } finally { db.close() } }, { store, value })
}
async function tick(p: Page, ms: number) { await expect(p.getByRole('status').filter({hasText:/^Running$/})).toBeVisible(); await p.clock.fastForward(ms); await p.waitForTimeout(400) }

for (const type of ['strength', 'interval'] as const) for (const planned of [false, true]) test(`${type} ${planned ? 'planned' : 'standalone'} snapshot workout menu, scoped notes, keyboard and focus`, async ({ page }) => {
  await page.route('https://www.youtube.com/embed/**', r => r.fulfill({ contentType: 'text/html', body: '<button>Simulated player</button>' }))
  await open(page); await importValue(page, type, planned)
  const snapshot = (await rows(page, 'drafts'))[0], source = (await rows(page, planned ? 'plans' : 'workouts'))[0]
  source.instructions = 'Updated source instructions'; if (planned) source.days[0].instructions = 'Updated day instructions'; await put(page, planned ? 'plans' : 'workouts', source)
  if (type === 'interval') { await page.clock.install({ time: new Date() }); await b(page, 'Start Circuit').first().click(); await tick(page, 6000) }
  const execution = (await rows(page, 'drafts'))[0].interval?.execution?.id
  const trigger = b(page, 'Workout actions'); await trigger.focus(); await page.keyboard.press('Enter')
  const menu = page.getByRole('dialog', { name: 'Workout actions', exact: true }); await expect(menu.locator('.exercise-action-list button')).toHaveText(['Note', 'Instructions'])
  await menu.getByRole('button', { name: 'Instructions', exact: true }).click()
  const info = page.getByRole('dialog', { name: 'Workout instructions', exact: true }); await expect(info).toContainText(instructions); await expect(info).not.toContainText('Parent instructions'); await expect(info.locator('b')).toHaveCount(0); await expect(info.getByRole('textbox')).toHaveCount(0)
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); expect(await info.evaluate(e => e.contains(document.activeElement))).toBe(true) }
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused()
  await openWorkoutNote(page); const note = page.getByRole('dialog', { name: snapshot.day.name, exact: true }); await f(page, 'Note').fill('Unapplied session note')
  page.once('dialog', dialog => dialog.dismiss()); await page.keyboard.press('Escape'); await expect(note).toBeVisible(); await expect(f(page, 'Note')).toHaveValue('Unapplied session note')
  await note.getByRole('button', { name: 'Save', exact: true }).click(); await expect(note).toHaveCount(0); await expect(trigger).toBeFocused()
  await expect.poll(async () => (await rows(page, 'drafts'))[0].input.notes).toBe('Unapplied session note')
  const saved = (await rows(page, 'drafts'))[0]; expect(saved.id).toBe(snapshot.id); expect(saved.day).toEqual(snapshot.day); expect(saved.input.exercises.every((e: any) => !e.notes)).toBe(true)
  if (type === 'interval') { expect(saved.interval.execution.id).toBe(execution); expect(saved.interval.status).toBe('running'); await b(page, 'Pause').click() }
  else {
    await b(page, 'Actions for Press').click(); const exercise = page.getByRole('dialog', { name: 'Exercise actions', exact: true }); await expect(exercise.getByRole('button', { name: 'Information', exact: true })).toHaveCount(0); await exercise.getByRole('button', { name: 'Instructions', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Press', exact: true })).toContainText('<b>Exercise details</b>'); await expect(page.locator('iframe')).toHaveAttribute('src', /youtube.com\/embed\/abcdefghijk/); await expect(page.getByRole('dialog').getByRole('button',{name:'Close',exact:true})).toBeFocused(); await page.keyboard.press('Escape'); await expect(b(page, 'Actions for Press')).toBeFocused()
  }
  await openWorkoutNote(page); await expect(f(page, 'Note')).toHaveValue('Unapplied session note'); await page.keyboard.press('Escape')
})

test('custom Strength menus, unavailable new custom Interval, and an existing custom Interval snapshot retain notes and empty instructions', async ({ page }) => {
  await open(page); await b(page, 'Train').click(); await b(page, 'Custom Workout').click(); await expect(b(page, 'Interval')).toBeDisabled(); await b(page, 'Strength').click(); await setWorkoutNote(page, 'Custom strength')
  await b(page, 'Workout actions').click(); await b(page, 'Instructions').click(); await expect(page.getByRole('dialog')).toContainText('No instructions.'); await page.keyboard.press('Escape')
  await b(page, 'Cancel').click(); await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click()
  await b(page, 'Create').click(); await importValue(page, 'interval'); const existing = (await rows(page, 'drafts'))[0]
  existing.source = { kind: 'custom' }; existing.input.notes = 'Existing custom interval'; delete existing.day.instructions; await put(page, 'drafts', existing)
  await page.reload(); await b(page, 'Train').click(); await expect(training(page)).toBeVisible()
  await expect(training(page)).toBeVisible(); await openWorkoutNote(page); await expect(f(page, 'Note')).toHaveValue('Existing custom interval'); await page.keyboard.press('Escape'); await b(page, 'Workout actions').click(); await b(page, 'Instructions').click(); await expect(page.getByRole('dialog')).toContainText('No instructions.')
})

test('independent rest cannot save activity, conflicts with paused circuits, preserves results/notes through Stop and reload', async ({ page }) => {
  await open(page); await importValue(page, 'interval'); await page.clock.install({ time: new Date() }); const address = page.url()
  await rest(page).getByRole('button', { name: 'Start', exact: true }).dblclick(); await expect(rest(page).getByRole('timer')).toContainText('/ 01:00'); await expect(b(page, 'Start Circuit').first()).toBeDisabled()
  await tick(page, 6000); await expect(rest(page).locator('.interval-timer-main h3')).toHaveText('Post-Workout Rest'); expect((await rows(page, 'drafts'))[0].interval.results).toEqual([])
  await b(page, 'Pause').click(); await expect(page.getByRole('status').filter({hasText: /^Paused$/})).toBeVisible(); const paused = await page.getByRole('timer').textContent(); await page.clock.fastForward(10000); await page.waitForTimeout(400); await expect(page.getByRole('timer')).toHaveText(paused!)
  await page.evaluate(()=>scrollTo(0,0)); await page.clock.runFor(50); await expect(b(page,'Open timer')).toBeVisible(); await expect(page.locator('.interval-sticky-title')).toHaveText('Post-Workout Rest'); await expect(page.locator('.interval-sticky-time')).toContainText('/ 01:00'); await b(page,'Open timer').click(); const restModal=page.getByRole('dialog',{name:'Timer',exact:true}); await expect(restModal.getByRole('timer')).toHaveText(paused!); await restModal.getByRole('button',{name:'Start',exact:true}).click(); await expect(page.getByRole('status').filter({hasText:/^Running$/})).toBeVisible(); await restModal.getByRole('button',{name:'Pause',exact:true}).click(); await expect(page.getByRole('status').filter({hasText:/^Paused$/})).toBeVisible(); await restModal.getByRole('button',{name:'Close',exact:true}).click(); await expect(b(page,'Open timer')).toBeFocused()
  const resumedPause = await page.getByRole('timer').textContent()
  await page.reload(); await b(page,'Train').click(); await expect(training(page)).toBeVisible(); await b(page,'Reload saved timer').click(); await expect(page.getByRole('timer')).toHaveText(resumedPause!)
  await b(page, 'Stop').click(); await b(page, 'Save').click(); await expect(page.getByRole('alert')).toContainText('Record some active time'); expect(await rows(page, 'sessions')).toEqual([]); await b(page, 'Reload saved timer').click()
  await setWorkoutNote(page, 'Keep my circuit results'); await b(page, 'Start Circuit').first().click(); await b(page, 'Pause').click(); await expect(rest(page).getByRole('button', { name: 'Start', exact: true })).toBeDisabled(); await page.locator('.interval-timer-main').getByRole('button', { name: 'Start', exact: true }).click(); await tick(page, 52000)
  const before = (await rows(page, 'drafts'))[0]; expect(before.interval.results.filter((r: any) => r.phase.kind === 'active')).toHaveLength(3)
  await rest(page).getByRole('button', { name: 'Start', exact: true }).click(); await tick(page, 8000); await b(page, 'Pause').click(); await expect(page.getByRole('status').filter({hasText: /^Paused$/})).toBeVisible(); const checkpoint = await page.getByRole('timer').textContent()
  await page.reload(); await b(page, 'Train').click(); await expect(training(page)).toBeVisible(); await b(page, 'Reload saved timer').click(); await expect(page.getByRole('timer')).toHaveText(checkpoint!); await b(page, 'Stop').click()
  const after = (await rows(page, 'drafts'))[0]; expect(after.interval.results).toEqual(before.interval.results); expect(after.input.notes).toBe('Keep my circuit results'); expect(await rows(page, 'sessions')).toEqual([])
  await rest(page).getByRole('button', { name: 'Start', exact: true }).click(); await tick(page, 65000); await expect(page.getByText('Rest complete', { exact: true })).toBeVisible(); expect((await rows(page, 'drafts'))[0].interval.results).toEqual(before.interval.results); expect(await rows(page, 'sessions')).toEqual([])
  await b(page, 'Save').click(); await b(page, 'Confirm').click(); await expect(page.getByRole('region', { name: 'Saved Interval session' })).toContainText('Partial session'); expect(page.url()).toBe(address)
})

test('both themes: ordinals reset, circuit boundaries/target colors and stable one-row sticky totals at 320px', async ({ page }, info) => {
  await open(page); await importValue(page, 'interval'); await setWorkoutNote(page, 'Retain while choosing theme')
  for (const theme of ['Dark', 'Light']) {
    await b(page, 'Settings').click(); await b(page, theme).click(); await b(page, 'Train').click(); if (info.project.name.includes('phone')) await page.setViewportSize({ width: 320, height: 720 })
    await f(page, 'Continuous workout').uncheck(); await expect(page.getByText('1st', { exact: true })).toHaveCount(2); await expect(page.getByText('2nd', { exact: true })).toHaveCount(2); await expect(page.getByText('3rd', { exact: true })).toHaveCount(1); await expect(page.getByText(/^Repeat \d+$/)).toHaveCount(0); await expect(b(page, 'Start Circuit')).toHaveCount(2); await expect(b(page, 'Edit pending exercises')).toHaveCount(0)
    expect(await page.locator('.interval-circuit > h3').first().evaluate(e => { const s = getComputedStyle(e); return [s.textAlign, s.fontWeight, s.fontSize] })).toEqual(['center', '700', '16px'])
    expect(await page.locator('.interval-target').first().evaluate(e => { const s = getComputedStyle(e), probe = document.createElement('span'); probe.style.color = 'var(--training-target)'; e.append(probe); const expected = getComputedStyle(probe).color; probe.remove(); return s.color === expected && s.textAlign === 'center' })).toBe(true)
    expect(await page.locator('.interval-circuit-rest').first().evaluate(e => { const s = getComputedStyle(e); return s.color === getComputedStyle(document.body).color && s.textAlign === 'center' })).toBe(true)
    await expect(page.locator('.circuit-divider')).toHaveCount(1); await expect(page.locator('.interval-circuit').last().locator('hr')).toHaveCount(1)
    await f(page, 'Continuous workout').check(); if (theme === 'Dark') await page.clock.install({ time: new Date() }); await training(page).locator(':scope > .interval-start > button').click(); await tick(page, 11000); await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight)); await page.clock.runFor(50); await expect(b(page, 'Open timer')).toBeVisible()
    await expect(page.locator('.interval-sticky-time')).toContainText('/ 02:02'); await expect(page.locator('.interval-timer-main [role=timer]')).toContainText('/ 00:12')
    const geometry = await page.locator('.interval-sticky').evaluate(e => { const time = e.querySelector('.interval-sticky-time')!, name = e.querySelector('.interval-sticky-title')!, action = e.querySelector('.interval-play')!, t = time.getBoundingClientRect(), n = name.getBoundingClientRect(), a = action.getBoundingClientRect(); return { sameRow: Math.abs((t.y + t.height / 2) - (n.y + n.height / 2)) < 3, timesIntact: time.scrollWidth <= time.clientWidth + 1, nameTruncates: getComputedStyle(name).textOverflow === 'ellipsis', actionFits: a.right <= innerWidth, nameWidth: n.width, overflow: document.documentElement.scrollWidth > innerWidth } })
    expect(geometry).toMatchObject({ sameRow: true, timesIntact: true, nameTruncates: true, actionFits: true, overflow: false }); expect(geometry.nameWidth).toBeGreaterThan(10)
    await expect(b(page, 'Open timer')).toHaveAccessibleDescription(interval.circuits[0].exercises[0].name)
    await b(page, 'Pause timer').click(); const paused = await page.locator('.interval-sticky-time strong').textContent(); await b(page, 'Open timer').click(); const modal = page.getByRole('dialog', { name: 'Timer', exact: true }); await expect(modal.getByRole('timer')).toContainText(paused!); await expect(modal.getByRole('timer')).toContainText('/ 00:12'); await page.keyboard.press('Escape'); await expect(b(page, 'Open timer')).toBeFocused()
    await page.screenshot({ path: info.outputPath('sticky-' + theme + '.png'), fullPage: true }); await b(page, 'Open timer').click(); await page.getByRole('dialog').getByRole('button', { name: 'Stop', exact: true }).click()
  }
})

test('mocked local speech announces consecutive rests once, post-rest by name, and Sound Off suppresses independent rest', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window,'AudioContext',{value:undefined,configurable:true}); Object.assign(window, { spoken: [] as string[], sounds: [] as string[] })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { text: string; constructor(text: string) { this.text = text } } })
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ localService: true }], cancel() {}, speak: (u: { text: string }) => (window as any).spoken.push(u.text) } })
    HTMLMediaElement.prototype.play = function () { if (!this.muted && this.volume > 0) { (window as any).sounds.push(this.src); queueMicrotask(() => this.dispatchEvent(new Event('ended'))) } return Promise.resolve() }
  })
  await open(page); await importValue(page, 'interval', false, { ...interval, circuits: [{ ...interval.circuits[0], repeat: 0, exercises: [{ name: 'Rest', activeSeconds: 10, recoverySeconds: 2 }] }, interval.circuits[1]], postWorkoutRestSeconds: 3 })
  await setWorkoutNote(page, 'Audio fixture'); await b(page, 'Settings').click(); await page.getByRole('group', { name: 'Sound', exact: true }).getByRole('button', { name: 'On', exact: true }).click(); await b(page, 'Train').click()
  await page.clock.install({ time: new Date() }); await f(page, 'Continuous workout').check(); await training(page).locator(':scope > .interval-start > button').click()
  await expect(page.getByRole('status').filter({hasText:/^Running$/})).toBeVisible(); for (let second = 0; second < 48; second++) { await page.clock.runFor(1000); const now=await page.evaluate(()=>Date.now()); await expect.poll(async()=>{const d=(await rows(page,'drafts'))[0]; return d.interval.status==='finished'||Date.parse(d.interval.anchorAt)>=now-250}).toBe(true); await page.waitForTimeout(30) }
  await expect.poll(() => page.evaluate(() => (window as any).spoken)).toEqual(['Rest', 'Rest', 'Rest', 'Sprint', 'Sprint', 'Post-Workout Rest'])
  const sounds: string[] = await page.evaluate(() => (window as any).sounds); expect(sounds.filter(s => s.endsWith('circuit-start.mp3'))).toHaveLength(3); expect(sounds.filter(s => s.endsWith('circuit-end.mp3'))).toHaveLength(3); expect(sounds.filter(s => s.endsWith('rest-complete.mp3'))).toHaveLength(3)
  await b(page, 'Workout actions').click(); await b(page, 'Instructions').click(); await page.keyboard.press('Escape'); expect(await page.evaluate(() => (window as any).spoken)).toHaveLength(6)
  await b(page, 'Settings').click(); await page.getByRole('group', { name: 'Sound', exact: true }).getByRole('button', { name: 'Off', exact: true }).click(); await b(page, 'Train').click(); await rest(page).getByRole('button', { name: 'Start', exact: true }).click(); await expect(page.getByRole('status').filter({hasText:/^Running$/})).toBeVisible(); for (let i = 0; i < 9; i++) { await page.clock.runFor(1000); await page.waitForTimeout(30) }
  expect(await page.evaluate(() => (window as any).spoken)).toHaveLength(6); expect(await page.evaluate(() => (window as any).sounds)).toEqual(sounds); expect(await rows(page, 'sessions')).toEqual([])
})

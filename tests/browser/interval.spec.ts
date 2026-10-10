import { openWorkoutNote, setWorkoutNote } from './train-actions'
import { test, expect, type Page } from '@playwright/test'
import { cardAction } from './create-actions'
const button = (p: Page, name: string) => p.getByRole('button', { name, exact: true })
async function open(p: Page) { await p.goto('./'); const notice = button(p, 'Understood'); if (await notice.isVisible()) await notice.click(); await button(p, 'Create').click() }
async function createExercise(p: Page, name: string, active = '10', rest = '5') {
  await button(p, 'Create exercise').click(); await button(p, 'Interval').click()
  await p.getByLabel('Exercise name', { exact: true }).fill(name)
  await p.getByLabel('Active seconds', { exact: true }).fill(active); await p.getByLabel('Rest seconds', { exact: true }).fill(rest)
  await button(p, 'Save').click(); await expect(p.getByRole('article', { name, exact: true })).toBeVisible()
}
async function createWorkout(p: Page) {
  await button(p, 'Create workout').click(); await button(p, 'Interval').click()
  await p.getByLabel('Workout name', { exact: true }).fill('Timed Circuit')
  for (const name of ['Jumping Jacks', 'Push-ups', 'Sprint']) { await button(p, 'Add exercise').click(); await button(p, 'Add ' + name).click() }
  await button(p, 'Save workout').click(); await expect(p.getByRole('article', { name: 'Workout Timed Circuit', exact: true })).toBeVisible()
}
test('typed creation, circuits, plan publication, independent previews, refresh and stable address', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await open(page); const address = page.url()
  await button(page, 'Create exercise').click(); await button(page, 'Cancel').click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const name of ['Jumping Jacks', 'Push-ups', 'Sprint']) await createExercise(page, name)
  await createWorkout(page)
  await cardAction(page, page.getByRole('article', { name: 'Workout Timed Circuit', exact: true }), 'Edit')
  await expect(page.getByLabel('Repeat circuit', { exact: true })).toHaveValue('0')
  await button(page, 'Save workout').click()
  await button(page, 'Create Plan').click(); await button(page, 'Interval').click()
  await page.getByLabel('Plan name', { exact: true }).fill('Timed Plan'); await page.getByLabel('Duration (weeks)', { exact: true }).fill('2')
  await button(page, 'Add exercise').click(); await button(page, 'Add Sprint').click()
  await button(page, 'Save plan').click(); await expect(page.getByRole('article', { name: 'Plan Timed Plan', exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Workout Day 1', exact: true })).toBeVisible()
  await page.getByRole('article', { name: 'Plan Timed Plan', exact: true }).getByRole('button').click(); await expect(page.getByRole('dialog')).toContainText('Interval'); await expect(page.getByRole('dialog')).toContainText('10s active'); await button(page, 'Close').click()
  await page.reload(); await expect(page.getByRole('article', { name: 'Plan Timed Plan', exact: true })).toBeVisible(); expect(page.url()).toBe(address)
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(e => e.clientWidth))
  expect(errors).toEqual([])
})
test('Interval timer pauses, explicitly continues after reload and saves partial actuals for Calendar without lifting fields', async ({ page }) => {
  await open(page); await createExercise(page, 'Jumping Jacks'); await createExercise(page, 'Push-ups'); await createExercise(page, 'Sprint'); await createWorkout(page)
  await button(page, 'Train').click(); await button(page, 'Existing Workout').click(); await page.getByRole('article', { name: 'Workout Timed Circuit', exact: true }).getByRole('button').click()
  await expect(page.getByRole('region', { name: 'Interval training session' })).toBeVisible(); await expect(page.getByLabel('Continuous workout')).toHaveCount(0); await expect(page.getByRole('region',{name:'Post-Workout Rest',exact:true})).toHaveCount(0)
  await expect(button(page, 'Start Circuit')).toBeEnabled(); await button(page, 'Start Circuit').click()
  await expect(button(page, 'Pause')).toBeVisible(); await page.waitForTimeout(11100)
  const unloading = page.waitForEvent('dialog'); await page.evaluate(() => { setTimeout(() => location.reload(), 0) }); const warning = await unloading; expect(warning.type()).toBe('beforeunload'); await warning.dismiss()
  await button(page, 'Pause').click(); await expect(page.getByRole('status').filter({hasText:/^Paused$/})).toBeVisible()
  const time = await page.getByRole('timer').textContent(); await page.waitForTimeout(1100); await expect(page.getByRole('timer')).toHaveText(time!)
  await page.reload(); await button(page, 'Train').click(); await expect(page.getByRole('region',{name:'Interval training session',exact:true})).toBeVisible()
  await button(page, 'Reload saved timer').click(); await expect(button(page, 'Start')).toBeEnabled(); await expect(page.getByRole('timer')).toHaveText(time!)
  await button(page, 'Stop').click(); await expect(button(page, 'Edit pending exercises')).toHaveCount(0)
  await openWorkoutNote(page); await page.getByLabel('Note',{exact:true}).fill('Recoverable unapplied note')
  await button(page, 'Settings').evaluate((node: HTMLButtonElement) => node.click()); await expect(page.getByRole('dialog', { name: 'Leave pending edits?' })).toBeVisible(); await page.getByRole('dialog', { name: 'Leave pending edits?' }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByLabel('Note',{exact:true})).toHaveValue('Recoverable unapplied note'); page.once('dialog',d=>d.accept()); await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click()
  await button(page, 'Settings').click(); await button(page, 'Train').click()
  await expect(button(page, 'Start Circuit')).toBeEnabled(); await button(page, 'Start Circuit').click(); await page.waitForTimeout(11100); await button(page, 'Pause').click(); await setWorkoutNote(page,'Saved timed note'); await button(page, 'Save').click(); await expect(page.getByRole('dialog', { name: 'Save partial session?' })).toBeVisible(); await button(page, 'Confirm').click()
  await expect(page.getByRole('region', { name: 'Saved Interval session' })).toBeVisible(); await expect(page.getByRole('region', { name: 'Saved Interval session' })).toContainText('partial'); await expect(page.getByRole('region', { name: 'Saved Interval session' })).toContainText('Saved timed note')
  await button(page, 'Calendar').click(); await expect(page.locator('.calendar-event .type-pill', { hasText: 'Interval' }).first()).toBeVisible()
  await page.locator('.calendar-event').filter({ hasText: 'Timed Circuit' }).first().click(); await expect(page.getByRole('dialog')).toContainText('Partial session');
})

test('unique-week circuits use typed pickers; library full execution and unavailable custom Interval, sound-off and both themes retain accessible controls', async ({ page }, info) => {
  await open(page); await createExercise(page, 'Quick interval', '1', '0')
  await button(page, 'Create exercise').click(); await button(page, 'Strength').click(); await page.getByLabel('Exercise name', { exact: true }).fill('Strength only'); await page.getByLabel('Set 1 Reps minimum', { exact: true }).fill('5'); await button(page, 'Save').click()
  await button(page, 'Create Plan').click(); await button(page, 'Interval').click()
  await page.getByLabel('Plan name', { exact: true }).fill('Unique intervals'); await page.getByLabel('Duration (weeks)', { exact: true }).fill('4')
  await page.getByRole('switch', { name: 'Unique training weeks?' }).click(); await page.getByLabel('Number of Unique weeks', { exact: true }).selectOption('2')
  for (const week of [1, 2]) {
    await page.getByRole('region', { name: `Week ${week}`, exact: true }).getByRole('button', { name: 'Add exercise', exact: true }).click()
    await expect(button(page, 'Add Strength only')).toHaveCount(0); await button(page, 'Add Quick interval').click()
  }
  await button(page, 'Add workout').first().click(); await expect(button(page, 'New empty workout')).toHaveCount(0); await page.getByRole('dialog', { name: 'Workouts', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await button(page, 'Save plan').click(); await expect(page.getByRole('article', { name: 'Plan Unique intervals', exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Workout Day 1', exact: true })).toBeVisible(); await expect(page.getByRole('article', { name: 'Workout Day 1 (1)', exact: true })).toBeVisible()
  for (const theme of ['Dark', 'Light']) {
    await button(page, 'Settings').click(); await button(page, theme).click(); await button(page, 'Create').click()
    await page.getByRole('article', { name: 'Plan Unique intervals', exact: true }).getByRole('button').focus(); await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog').getByText('Interval', { exact: true })).toHaveCount(1)
    await page.screenshot({ path: info.outputPath(`interval-preview-${theme}.png`), fullPage: true })
    await page.keyboard.press('Escape'); await expect(page.getByRole('article', { name: 'Plan Unique intervals', exact: true }).getByRole('button')).toBeFocused()
  }
  await button(page, 'Train').click(); await button(page, 'Custom Workout').click(); await expect(button(page, 'Interval')).toBeDisabled(); await button(page,'Cancel').click()
  await button(page,'Existing Workout').click(); await page.getByRole('article',{name:'Workout Day 1',exact:true}).getByRole('button').click()
  await expect(button(page,'Start Circuit')).toBeEnabled(); await expect(button(page,'Edit pending exercises')).toHaveCount(0)
  await page.screenshot({path:info.outputPath('interval-timer.png'),fullPage:true})
  const address=page.url(); await button(page,'Start Circuit').click(); await expect(page.getByRole('status').filter({hasText:'Ready to save'})).toBeVisible({timeout:15000})
  await button(page,'Save').click(); await expect(page.getByRole('region',{name:'Saved Interval session'})).toContainText('Complete session'); await expect(page.getByRole('region',{name:'Saved Interval session'})).toContainText('1s / 1s')
  await button(page, 'Progress').click(); await expect(page.locator('.training-type-icon,.type-pill')).toHaveCount(0)
  await button(page, 'Tags').click(); await expect(button(page, 'Interval')).toHaveCount(0)
  expect(page.url()).toBe(address); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('warning asset resolves below either mount; denied media and a stale second tab leave recoverable state', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => { Object.defineProperty(window,'AudioContext',{value:undefined,configurable:true}); HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Device denied audio', 'NotAllowedError')) })
  await open(page); await createExercise(page, 'Jumping Jacks'); await createExercise(page, 'Push-ups'); await createExercise(page, 'Sprint'); await createWorkout(page)
  await button(page, 'Settings').click(); await page.getByRole('group', { name: 'Sound', exact: true }).getByRole('button', { name: 'On', exact: true }).click()
  const response = await page.request.get(new URL('circuit-5s-warning.mp3', page.url()).href); expect(response.ok()).toBe(true); expect((await response.body()).length).toBeGreaterThan(1000)
  await button(page, 'Train').click(); await button(page, 'Existing Workout').click(); await page.getByRole('article', { name: 'Workout Timed Circuit', exact: true }).getByRole('button').click()
  await expect(button(page, 'Start Circuit')).toBeEnabled(); await button(page, 'Start Circuit').click()
  await page.waitForTimeout(11100); await expect(page.getByRole('timer')).toContainText('/ 00:45'); await expect(button(page, 'Pause')).toBeEnabled(); await button(page, 'Pause').click(); await expect(page.getByRole('status').filter({ hasText: /^Paused$/ })).toBeVisible()
  const other = await context.newPage(); await other.goto(page.url()); await button(other, 'Train').click(); await expect(other.getByRole('region',{name:'Interval training session',exact:true})).toBeVisible(); await expect(other.getByRole('alert')).toContainText('another tab'); await button(other, 'Reload saved timer').click(); await expect(button(other, 'Start')).toBeEnabled()
  await button(page, 'Start').click(); await expect(page.getByRole('alert')).toContainText('another tab')
  await expect(button(page,'Workout actions')).toBeVisible(); await button(page, 'Reload saved timer').click(); await expect(button(page, 'Start')).toBeEnabled()
  await other.close(); expect(errors).toEqual([])
})

test('failed checkpoint stops controls without discarding input or counting error-recovery wall time', async ({ page }) => {
  await open(page); await createExercise(page, 'Failure interval', '20', '0')
  await button(page, 'Create workout').click(); await button(page, 'Interval').click(); await page.getByLabel('Workout name', { exact: true }).fill('Recoverable timer'); await button(page, 'Add exercise').click(); await button(page, 'Add Failure interval').click(); await button(page, 'Save workout').click()
  await button(page, 'Train').click(); await button(page, 'Existing Workout').click(); await page.getByRole('article', { name: 'Workout Recoverable timer', exact: true }).getByRole('button').click()
  await expect(button(page, 'Start Circuit')).toBeEnabled(); await button(page, 'Start Circuit').click(); await page.waitForTimeout(1100)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    Object.assign(window, { recoverIntervalWrites: () => { IDBObjectStore.prototype.put = original } })
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts') { (window as any).intervalWriteFailures=((window as any).intervalWriteFailures??0)+1; throw new DOMException('Injected timer quota', 'QuotaExceededError') } return original.apply(this, args) }
  })
  await expect(page.getByRole('alert')).toContainText('Injected timer quota'); await expect(page.getByText('Timer stopped', { exact: true })).toBeVisible()
  const checkpoint = await page.getByRole('timer').textContent(); await page.waitForTimeout(1100); await expect(page.getByRole('timer')).toHaveText(checkpoint!)
  await expect(button(page, 'Skip phase')).toBeDisabled(); await expect(button(page, 'Save')).toBeDisabled()
  const failures = await page.evaluate(()=>(window as any).intervalWriteFailures); await openWorkoutNote(page); await page.getByLabel('Note',{exact:true}).fill('Recoverable note'); await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click(); await expect.poll(()=>page.evaluate(()=>(window as any).intervalWriteFailures)).toBeGreaterThan(failures); await expect(page.getByRole('dialog').getByRole('button',{name:'Save',exact:true})).toBeEnabled(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Injected timer quota')
  await page.evaluate(() => (window as unknown as { recoverIntervalWrites: () => void }).recoverIntervalWrites())
  await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await button(page, 'Reload saved timer').click(); await expect(button(page, 'Start')).toBeEnabled(); await expect(page.getByRole('timer')).toHaveText(checkpoint!); await openWorkoutNote(page); await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Recoverable note')
})

import { openExerciseAction } from './train-actions'
import { confirmDownload } from './settings-actions'
import { createNamedProfile } from './settings-actions'
import { addCalendarPlan, manageRun, returnCalendar } from './calendar-actions'
import { waitForDraft, startWeekly } from './train-actions'
import { cardAction } from './create-actions'
import { expect, test, type Page } from '@playwright/test'
import { groupedAI } from '../fixtures/group2'
import { planFixture } from '../fixtures/interchange'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'

test.setTimeout(120000)
const button = (p: Page, name: string) => p.getByRole('button', { name, exact: true })
const field = (p: Page, name: string) => p.getByLabel(name, { exact: true })
const card = (p: Page, name = 'Two-week supersets') => p.getByRole('article', { name: `Plan ${name}`, exact: true })
async function open(p: Page) {
  await p.goto('./'); await button(p, 'Create').click()
  if (await button(p, 'Understood').isVisible()) await button(p, 'Understood').click()
}
async function importPlan(p: Page) {
  await open(p); await button(p, 'Import').click(); await field(p, 'AI output JSON').fill(JSON.stringify(groupedAI()))
  await button(p, 'Validate and preview').click(); await expect(field(p, 'Duration (weeks)')).toHaveValue('2')
  await button(p, 'Save plan').click(); await expect(card(p)).toBeVisible()
}
async function records(p: Page) {
  return p.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const result: Record<string, any[]> = {}
    try { for (const store of ['plans', 'drafts', 'sessions', 'schedules', 'exercises']) result[store] = await new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) }
    finally { db.close() }
    return result
  })
}
async function train(p: Page) {
  await startWeekly(p, 'Two-week supersets', 'Mixed day')
}
async function saved(p: Page) { await waitForDraft(p) }

test('manual repeated library occurrences, group edits/duplication and duration retain identity in both themes at phone width', async ({ page }, info) => {
  await open(page); const address = page.url()
  await button(page, 'Create exercise').click(); await field(page, 'Exercise name').fill('Squat'); await field(page, 'Set 1 Reps minimum').fill('5'); await button(page, 'Save').click()
  await button(page, 'Create Plan').click(); await field(page, 'Plan name').fill('Manual grouped'); await field(page, 'Duration (weeks)').fill('2')
  for (let i = 0; i < 4; i++) { await button(page, 'Add exercise').click(); await button(page, 'Add Squat').click() }
  let occurrences = page.locator('.plan-exercises > li[data-occurrence-id]')
  const ids = await occurrences.evaluateAll((items) => items.map((item) => item.getAttribute('data-occurrence-id')))
  await occurrences.nth(1).getByLabel('Superset', { exact: true }).check(); await button(page, 'Save plan').click()
  await expect(page.getByRole('alert')).toContainText('at least two members')
  await occurrences.nth(2).getByLabel('Superset', { exact: true }).check(); await occurrences.nth(3).getByLabel('Superset', { exact: true }).check()
  const group = page.locator('.superset-settings').first()
  await group.getByLabel('Rest between rounds seconds', { exact: true }).fill('0')
  await group.getByLabel('Rest after group seconds', { exact: true }).fill('wrong')
  await button(page, 'Save plan').click(); await expect(group.getByLabel('Rest after group seconds', { exact: true })).toHaveValue('wrong')
  await group.getByLabel('Rest after group seconds', { exact: true }).fill('')
  await group.getByLabel('Superset name', { exact: true }).fill('7')
  await occurrences.nth(2).getByRole('button', { name: 'Move exercise up', exact: true }).click()
  await button(page, 'Save plan').click(); await expect(card(page, 'Manual grouped')).toBeVisible()
  const original = (await records(page)).plans[0]
  expect(original.days[0].exercises.map(item => item.id).sort()).toEqual(ids.sort())
  expect(new Set(original.days[0].exercises.map(item => item.source.id)).size).toBe(1)
  expect(original.days[0].groups[0].number).toBe(7)
  await page.reload(); await cardAction(page, card(page, 'Manual grouped'), 'Edit')
  await expect(field(page, 'Duration (weeks)')).toHaveValue('2')
  await page.setViewportSize({ width: 320, height: 780 })
  await page.screenshot({ path: info.outputPath('group-editor-dark-320.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.superset-settings').getByRole('button', { name: 'Delete', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click(); await expect(page.locator('.superset-settings')).toHaveCount(0)
  await button(page, 'Save plan').click()
  expect((await records(page)).plans[0].days[0].exercises.map(item => item.prescription)).toEqual(original.days[0].exercises.map(item => item.prescription))
  await cardAction(page, card(page, 'Manual grouped'), 'Duplicate'); await button(page, 'Save plan').click()
  const copies = (await records(page)).plans; expect(copies).toHaveLength(2)
  expect(copies[0].days[0].exercises[0].id).not.toBe(copies[1].days[0].exercises[0].id)
  await button(page, 'Settings').click(); await button(page, 'Light').click()
  await button(page, 'Create').click(); await cardAction(page, card(page, 'Manual grouped'), 'Edit')
  occurrences = page.locator('.plan-exercises > li[data-occurrence-id]'); await occurrences.nth(1).getByLabel('Superset', { exact: true }).check(); await occurrences.nth(2).getByLabel('Superset', { exact: true }).check()
  await page.screenshot({ path: info.outputPath('group-editor-light-320.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await button(page, 'Calendar').click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(field(page, 'Plan name')).toHaveValue('Manual grouped')
  await expect(page).toHaveURL(address)
})

test('unequal rounds isolate repeated results, recover timers/notes, retain immutable history and export/restore group snapshots', async ({ page }, info) => {
  await importPlan(page); await cardAction(page, card(page), 'Edit'); await field(page, 'Duration (weeks)').fill('4'); await button(page, 'Save plan').click(); await train(page)
  const group = page.getByRole('region', { name: 'Superset 1', exact: true })
  await expect(group.locator('.superset-round')).toHaveCount(3)
  await expect(group.locator('.superset-round').nth(0).locator('.training-set')).toHaveCount(3)
  await expect(group.locator('.superset-round').nth(1).locator('.training-set')).toHaveCount(2)
  await expect(group.locator('.superset-round').nth(2).locator('.training-set')).toHaveCount(1)
  await expect(button(page, 'REST Superset 1 after round 1')).toBeDisabled()
  await field(page, 'Squat occurrence 1 set 1 Weight (kg)').fill('10'); await field(page, 'Squat occurrence 1 set 1 Repetitions').fill('5')
  await field(page, 'Squat occurrence 2 set 1 Weight (kg)').fill('40'); await field(page, 'Squat occurrence 2 set 1 Repetitions').fill('8')
  await openExerciseAction(page, 'Squat occurrence 2', 'Note'); await field(page, 'Note').fill('Only grouped squat'); await page.getByRole('dialog').last().getByRole('button', { name: 'Save', exact: true }).click(); await saved(page)
  await button(page, 'REST Superset 1 after group').click()
  await expect(page.getByRole('timer')).toHaveText('00:00')
  await page.reload(); await page.getByRole('button', { name: new RegExp("^Resume Two-week supersets / Mixed day") }).click()
  await expect(field(page, 'Squat occurrence 1 set 1 Weight (kg)')).toHaveValue('10'); await expect(field(page, 'Squat occurrence 2 set 1 Weight (kg)')).toHaveValue('40')
  await expect(page.getByRole('region', { name: 'Rest timer' })).toContainText('Post-Exercise')
  await button(page, 'Stop').click(); await button(page, 'Save').click(); await button(page, 'Save partial session').click()
  const details = page.getByRole('region', { name: 'Saved session details' }); await details.getByRole('region', { name: 'Saved superset 1' }).getByRole('button', { name: 'Note for Squat', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Only grouped squat'); await button(page, 'Close note').click(); await expect(details.getByRole('region', { name: 'Saved superset 1' }).locator('.superset-round')).toHaveCount(3)
  const completed = (await records(page)).sessions[0]
  await button(page, 'Create').click(); await cardAction(page, card(page), 'Edit')
  await page.locator('.superset-settings').first().getByLabel('Superset name', { exact: true }).fill('7'); await button(page, 'Save plan').click()
  expect((await records(page)).sessions[0]).toEqual(completed)
  await button(page, 'Settings').click(); await button(page, 'Light').click(); await train(page)
  await page.setViewportSize({ width: 320, height: 780 }); await page.screenshot({ path: info.outputPath('group-training-light-320.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const rows = page.locator('.training-session .training-set')
  for (let i = 0; i < await rows.count(); i++) { await rows.nth(i).getByRole('textbox', { name: /Weight/ }).fill(String(i)); await rows.nth(i).getByRole('textbox', { name: /Repetitions/ }).fill('5') }
  await saved(page); await button(page, 'Save').click(); await expect(details).toContainText('Complete session')
  await button(page, 'Settings').click(); await button(page, 'Dark').click(); await train(page)
  await page.screenshot({ path: info.outputPath('group-training-dark-320.png'), fullPage: true })
  await button(page, 'Settings').click();
  const pending = page.waitForEvent('download'); await confirmDownload(page)
  const bytes = await readFile((await (await pending).path())!), zip = await JSZip.loadAsync(bytes)
  expect(JSON.parse(await zip.file('data.json')!.async('string')).backupSchemaVersion).toBe(13)
  expect(zip.file('csv/supersets.csv')).toBeTruthy()
  await page.getByLabel('Backup ZIP', { exact: true }).setInputFiles({ name: 'groups.zip', mimeType: 'application/zip', buffer: bytes })
  await expect(page.getByRole('region', { name: 'Backup selection' })).toBeVisible()
  await page.getByLabel('Import choice').selectOption('new'); await page.getByLabel('Imported profile name').fill('Grouped restore')
  await button(page, 'Preview import').click(); await page.getByRole('checkbox', { name: /I confirm import under a new name/ }).check(); await button(page, 'Confirm and save').click()
  await expect(page.locator('input[name=name]')).toHaveValue('Grouped restore'); await page.reload()
  await button(page, 'Calendar').click(); await button(page, 'Day').click(); await expect(page.locator('.calendar-event').filter({ hasText: 'Mixed day' })).toHaveCount(2)
})

test('finite run freezes its duration and scheduling edits preserve started/missed dates after template change', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2025-01-02T12:00:00Z')); await importPlan(page)
  await button(page, 'Calendar').click(); await button(page, 'Week').click(); await addCalendarPlan(page, '2024-12-30')
  expect((await records(page)).schedules[0].endDate).toBe('2025-01-12')
  await expect(page.locator('.calendar-event')).toHaveCount(1); await expect(page.locator('.calendar-event')).toContainText('Past Due')
  await field(page, 'Calendar date').fill('2025-01-06'); await page.locator('.calendar-event').click(); await field(page, 'Squat occurrence 2 set 1 Weight (kg)').fill('55'); await saved(page)
  await page.reload(); await button(page, 'Create').click(); await cardAction(page, card(page), 'Edit'); await field(page, 'Duration (weeks)').fill('1'); await button(page, 'Save plan').click()
  expect((await records(page)).schedules[0].endDate).toBe('2025-01-12')
  await button(page, 'Calendar').click(); await button(page, 'Week').click(); await field(page, 'Calendar date').fill('2025-01-13'); await expect(page.locator('.calendar-event')).toHaveCount(0)
  await manageRun(page, 'Edit'); await button(page, 'Save').click(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Current Plans')
  expect((await records(page)).schedules[0].endDate).toBe('2025-01-12')
  await returnCalendar(page); await field(page, 'Calendar date').fill('2024-12-30'); await expect(page.locator('.calendar-event')).toContainText('Past Due')
  await field(page, 'Calendar date').fill('2025-01-06'); await expect(page.locator('.calendar-event')).toContainText('Incomplete'); await page.locator('.calendar-event').click()
  await expect(field(page, 'Squat occurrence 2 set 1 Weight (kg)')).toHaveValue('55')
})

test('legacy AI asks for duration; rejected grouping retains input and imports stay bound to their owner', async ({ page, context }) => {
  await open(page); await button(page, 'Import').click(); await field(page, 'AI output JSON').fill(JSON.stringify(planFixture()))
  await button(page, 'Validate and preview').click(); await expect(field(page, 'Duration (weeks)')).toHaveValue('')
  await button(page, 'Save plan').click(); await expect(page.getByText('Enter a positive whole duration in weeks.', { exact: true })).toBeVisible()
  expect((await records(page)).plans).toHaveLength(0)
  await field(page, 'Duration (weeks)').fill('2'); await button(page, 'Save plan').click(); await expect(card(page, 'Four-day import')).toBeVisible()
  await button(page, 'Import').click(); const invalid = groupedAI(); invalid.plan.days[0].exercises[1].superset = 99
  await field(page, 'AI output JSON').fill(JSON.stringify(invalid)); await button(page, 'Validate and preview').click(); await expect(page.getByRole('alert')).toContainText('plan.days[0].exercises[1].superset')
  await field(page, 'AI output JSON').fill(JSON.stringify(groupedAI())); await button(page, 'Validate and preview').click()
  const second = await context.newPage(); await second.goto('./'); await button(second, 'Settings').click(); await createNamedProfile(second, 'Other')
  await button(page, 'Save plan').click(); await expect(card(page)).toBeVisible()
  await button(second, 'Create').click(); await expect(card(second)).toHaveCount(0)
  await second.close()
})

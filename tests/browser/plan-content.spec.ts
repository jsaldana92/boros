import { expect, test, type Page } from '@playwright/test'
import { cardAction, occurrenceAction } from './create-actions'
import { addCalendarPlan } from './calendar-actions'
import { waitForDraft } from './train-actions'
const b = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const f = (page: Page, name: string) => page.getByLabel(name, { exact: true })
const planCard = (page: Page) => page.getByRole('article', { name: 'Plan Updated prescriptions', exact: true })
async function changeSets(page: Page, count: number) {
  await b(page, 'Create').click(); await cardAction(page, planCard(page), 'Edit')
  await occurrenceAction(page, page.locator('.plan-day').first(), 'Edit')
  await f(page, 'Number of sets').fill(String(count)); await page.locator('.count-controls button').click()
  const confirm = page.getByRole('dialog', { name: 'Remove customized sets?', exact: true })
  if (count === 1) await confirm.getByRole('button', { name: 'Confirm', exact: true }).click()
  if (count === 3) { await f(page, 'Set 3 Reps minimum').fill('5') }
  await page.locator('.exercise-editor button[type=submit]').click(); await b(page, 'Save plan').click()
  await expect(planCard(page)).toBeVisible()
}
for (const theme of ['Dark', 'Light']) test(`activated plan edits reach Train/Calendar starts and Preview while saved history stays frozen (${theme})`, async ({ page }) => {
  test.setTimeout(90000)
  await page.clock.setFixedTime(new Date('2026-10-05T16:00:00Z')); await page.goto('./')
  await b(page, 'Settings').click(); if (await b(page, 'Understood').isVisible()) await b(page, 'Understood').click(); await b(page, theme).click()
  await b(page, 'Create').click(); await b(page, 'Import').click()
  await f(page, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 5, kind: 'plan', plan: { mode: 'repeating', name: 'Updated prescriptions', durationWeeks: 4, trainingDaysPerWeek: 1, days: [{ name: 'Upper', exercises: [{ name: 'Bench', sets: [{ reps: { min: 5, max: 5 } }, { reps: { min: 5, max: 5 } }] }] }] } }))
  await b(page, 'Validate and preview').click(); await b(page, 'Save plan').click()
  await b(page, 'Calendar').click(); await addCalendarPlan(page, '2026-10-05', 'Updated prescriptions', [0])
  await changeSets(page, 3)
  await b(page, 'Train').click(); await planCard(page).getByRole('button').click(); await page.locator('.training-day-card').click()
  await b(page, 'Preview').click(); const preview = page.getByRole('dialog').last()
  await expect(preview).toContainText('3 sets'); await expect(preview.getByRole('button')).toHaveText(['Close'])
  await preview.getByRole('button', { name: 'Close', exact: true }).click(); await b(page, 'Start').click()
  await expect(page.locator('.training-set')).toHaveCount(3)
  for (let n = 1; n <= 3; n++) { await f(page, `Bench set ${n} Weight (kg)`).fill('0'); await f(page, `Bench set ${n} Repetitions`).fill('5') }
  await waitForDraft(page); await b(page, 'Save').click(); await expect(page.getByRole('region', { name: 'Saved session details' })).toBeVisible()
  await changeSets(page, 1); await page.reload()
  await b(page, 'Calendar').click(); await b(page, 'Day').click(); await f(page, 'Calendar date').fill('2026-10-05')
  await page.locator('.calendar-event').filter({ hasText: 'Upper' }).first().click()
  await expect(page.getByRole('region', { name: 'Saved session details' }).locator('li')).toHaveCount(3); await b(page, 'Close').click()
  await f(page, 'Calendar date').fill('2026-10-12'); await page.locator('.calendar-event').filter({ hasText: 'Upper' }).first().click()
  await expect(page.locator('.training-set')).toHaveCount(1); await b(page, 'Cancel').click()
  await b(page, 'Create').click(); await page.getByRole('article', { name: 'Bench', exact: true }).getByRole('button').click(); await expect(page.getByRole('dialog').locator('ol > li')).toHaveCount(2)
})


test('saved replacement keeps sparse superset round labels and recorded member set numbers', async ({ page }) => {
  test.setTimeout(90000); await page.goto('./'); await b(page, 'Create').click(); if (await b(page, 'Understood').isVisible()) await b(page, 'Understood').click()
  await b(page, 'Import').click(); await f(page, 'AI output JSON').fill(JSON.stringify({schemaVersion:5,kind:'workout',workout:{name:'Sparse',supersets:[{number:1}],exercises:[{name:'A',superset:1,sets:Array.from({length:2},()=>({reps:{min:5,max:5}}))},{name:'B',superset:1,sets:Array.from({length:4},()=>({reps:{min:5,max:5}}))},{name:'C',sets:[{reps:{min:5,max:5}}]}]}})); await b(page,'Validate and preview').click(); await b(page,'Save workout').click()
  await b(page,'Train').click(); await b(page,'Existing Workout').click(); await page.getByRole('article',{name:'Workout Sparse',exact:true}).getByRole('button').click(); await b(page,'Add Set to Superset 1').click(); await waitForDraft(page)
  await b(page,'Actions for B').click(); await b(page,'Replace').click(); const picker=page.getByRole('dialog',{name:'Replace Exercise',exact:true}); await picker.getByRole('button',{name:/^C Added/}).click(); await picker.getByRole('button',{name:'Swap',exact:true}).click()
  await expect(page.locator('.training-superset .superset-round > h4')).toHaveText(['Set 1','Set 2','Set 3','Set 5'])
  await f(page,'A set 3 Weight (kg)').fill('20'); await f(page,'A set 3 Repetitions').fill('5'); await waitForDraft(page); await b(page,'Save').click(); await b(page,'Save partial session').click()
  const group=page.getByRole('region',{name:'Saved superset 1',exact:true}); await expect(group.locator('.superset-round h4')).toHaveText(['Set 1','Set 2','Set 3','Set 5']); await expect(group.locator('.superset-round').last()).toContainText('A: Set 3: 20 kg')
})

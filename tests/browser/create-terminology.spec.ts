import { expect, test, type Page } from './strength-test'
import { cardAction, occurrenceAction } from './create-actions'
import { createNamedProfile } from './settings-actions'

const b = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const f = (page: Page, name: string) => page.getByLabel(name, { exact: true })
const pill = (page: Page, name: string) => page.locator('.tag-editor .tag-scroll').getByRole('button', { name, exact: true })
async function open(page: Page, theme: string) {
  await page.goto('./'); await b(page, 'Settings').click()
  if (await b(page, 'Understood').isVisible()) await b(page, 'Understood').click()
  await b(page, theme).click(); await b(page, 'Create').click()
}
async function rows(page: Page, store: string) {
  return page.evaluate(async store => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('boros'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try { return await new Promise<any[]>((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) } finally { db.close() }
  }, store)
}
async function addTag(page: Page, name: string) { await f(page, 'New tag').fill(name); await b(page, 'Add').click() }

for (const theme of ['Dark', 'Light']) {
  test(`plan top-level layout, workout wording and Yes/No preserve unique weeks (${theme})`, async ({ page }, info) => {
    await open(page, theme); await b(page, 'Create Plan').click()
    const toggle = page.getByRole('switch', { name: 'Unique training weeks?' })
    await expect(toggle).toHaveText('No'); await expect(f(page, 'Workouts per week')).toHaveValue('1')
    await expect(page.getByRole('heading', { name: 'Workout 1', exact: true })).toBeVisible()
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      const layout = await page.locator('.plan-top-fields').evaluate(node => {
        const rect = node.getBoundingClientRect(), children = [...node.children].map(n => n.getBoundingClientRect())
        const duration = node.querySelector('.duration-row')!.getBoundingClientRect(), input = node.querySelector('input[inputmode="numeric"]')!.getBoundingClientRect(), right = node.querySelector('.unique-toggle button')!.getBoundingClientRect()
        return { gaps: children.slice(1).map((r, i) => r.top - children[i].bottom), left: input.left - rect.left, right: rect.right - right.right, overlap: input.right > right.left, sameRow: input.top >= duration.top && right.top >= duration.top && right.bottom <= duration.bottom }
      })
      layout.gaps.forEach(gap => expect(gap).toBeCloseTo(18, 0)); expect(layout.left).toBeCloseTo(0, 0); expect(layout.right).toBeCloseTo(0, 0); expect(layout.overlap).toBe(false); expect(layout.sameRow).toBe(true)
      for (const button of await page.locator('.plan-add-button').all()) {
        const rect = await button.evaluate(node => { const p = node.parentElement!, style = getComputedStyle(p), parent = p.getBoundingClientRect(), r = node.getBoundingClientRect(); const left = parent.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft), width = p.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight); return { ratio: r.width / width, center: r.left + r.width / 2 - (left + width / 2), height: r.height } })
        expect(rect.ratio).toBeCloseTo(.8, 2); expect(rect.center).toBeCloseTo(0, 0); expect(rect.height).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await f(page, 'Duration (weeks)').fill('4'); await toggle.focus(); await page.keyboard.press('Space'); await expect(toggle).toHaveText('Yes')
    await f(page, 'Number of Unique weeks').selectOption('2'); await f(page, 'Workouts for Week 2').selectOption('3')
    await expect(page.getByRole('region', { name: 'Week 2', exact: true }).getByRole('button', { name: 'Add workout', exact: true })).toBeVisible()
    await page.getByRole('region', { name: 'Week 2', exact: true }).getByLabel('Workout 1 name', { exact: true }).fill('Training day - owner text')
    await toggle.click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(toggle).toHaveText('Yes')
    await expect(page.getByRole('region', { name: 'Week 2', exact: true }).getByLabel('Workout 1 name', { exact: true })).toHaveValue('Training day - owner text')
    await page.screenshot({ path: info.outputPath('plan-fields-' + theme + '.png'), fullPage: true })
  })

  test(`tag pills toggle, normalize, cancel, persist and remain profile/plan scoped (${theme})`, async ({ page }, info) => {
    await open(page, theme); await b(page, 'Create exercise').click()
    await f(page, 'Exercise name').fill('Training day movement'); await f(page, 'Instructions (optional)').fill('Training days stay as written.'); await f(page, 'Set 1 Reps minimum').fill('5')
    await addTag(page, 'Zulu'); await addTag(page, 'Alpha'); await addTag(page, '  ALPHA  ')
    await expect(page.locator('.tag-editor .tag-toggle')).toHaveText(['Alpha', 'Zulu'])
    await pill(page, 'Zulu').focus(); await page.keyboard.press('Space'); await expect(pill(page, 'Zulu')).toHaveAttribute('aria-pressed', 'false'); await page.keyboard.press('Enter'); await expect(pill(page, 'Zulu')).toHaveAttribute('aria-pressed', 'true')
    await f(page, 'Set 1 Reps minimum').fill('0'); await b(page, 'Save').click(); await expect(pill(page, 'Alpha')).toHaveAttribute('aria-pressed', 'true'); await f(page, 'Set 1 Reps minimum').fill('5')
    await b(page, 'Save').click(); const card = page.getByRole('article', { name: 'Training day movement', exact: true }); await expect(card).toBeVisible()
    const original = (await rows(page, 'exercises'))[0]; expect(original.name).toBe('Training day movement'); expect(original.instructions).toBe('Training days stay as written.'); expect(await rows(page, 'tags')).toHaveLength(2)
    await cardAction(page, card, 'Edit'); await expect(pill(page, 'Alpha')).toHaveAttribute('aria-pressed', 'true'); await pill(page, 'Alpha').click(); await addTag(page, 'Canceled')
    await b(page, 'Cancel').click(); await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click(); expect(await rows(page, 'exercises')).toEqual([original]); expect(await rows(page, 'tags')).toHaveLength(2)
    await cardAction(page, card, 'Edit'); await expect(pill(page, 'Canceled')).toHaveCount(0); await pill(page, 'Alpha').click(); await addTag(page, 'Beta'); await b(page, 'Save').click(); await expect(card).toBeVisible(); await page.reload(); await cardAction(page, card, 'Edit')
    await expect(pill(page, 'Alpha')).toHaveAttribute('aria-pressed', 'false'); await expect(pill(page, 'Beta')).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('.tag-editor')).not.toContainText(/filter|ANY-match/i)
    await page.screenshot({ path: info.outputPath('tag-pills-' + theme + '.png'), fullPage: true }); await b(page, 'Cancel').click()
    const library = await rows(page, 'exercises')
    await b(page, 'Create Plan').click(); await f(page, 'Plan name').fill('Training days plan'); await f(page, 'Duration (weeks)').fill('2'); await b(page, 'Add exercise').click(); await b(page, 'Add Training day movement').click(); await occurrenceAction(page, page.locator('.plan-day'), 'Edit')
    await expect(pill(page, 'Beta')).toHaveAttribute('aria-pressed', 'true'); await pill(page, 'Beta').click(); await addTag(page, 'Plan only'); await page.locator('.exercise-editor button[type="submit"]').click(); await b(page, 'Save plan').click(); await expect(page.getByRole('article', { name: 'Plan Training days plan' })).toBeVisible()
    expect(await rows(page, 'exercises')).toEqual(library); expect((await rows(page, 'plans'))[0].days[0].exercises[0].prescription.tagNames).toEqual(['Zulu', 'Plan only'])
    await b(page, 'Settings').click(); const owner = await f(page, 'Active profile').inputValue(); await createNamedProfile(page, 'Other'); await b(page, 'Create').click(); await b(page, 'Create exercise').click(); await expect(page.locator('.tag-editor .tag-toggle')).toHaveCount(0); await b(page, 'Cancel').click()
    await b(page, 'Settings').click(); await f(page, 'Active profile').selectOption(owner); await b(page, 'Create').click(); await b(page, 'Import').click()
    await f(page, 'AI output JSON').fill(JSON.stringify({ schemaVersion: 4, kind: 'workout', workout: { name: 'AI movement', sets: [{ reps: { min: 5, max: 5 } }], tags: ['Beta'] } })); await b(page, 'Validate and preview').click(); await expect(pill(page, 'Beta')).toHaveAttribute('aria-pressed', 'true'); await pill(page, 'Alpha').click()
    await b(page, 'Settings').click(); await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click(); expect(await rows(page, 'exercises')).toEqual(library)
  })
}

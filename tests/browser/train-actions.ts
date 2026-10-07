import { expect, type Page } from '@playwright/test'
export const trainButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export async function waitForDraft(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const fields = [...document.querySelectorAll<HTMLElement>('.training-set[data-occurrence-id]')].map((row) => {
      const inputs = [...row.querySelectorAll<HTMLInputElement>('.training-fields input')]
      const index = Number(inputs[0].getAttribute('aria-label')!.match(/ set (\d+) Weight/)![1]) - 1
      return [row.dataset.occurrenceId + ':' + index, ...inputs.map((input) => input.value)]
    }).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('boros'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try {
      const drafts = await new Promise<any[]>((resolve, reject) => { const r = db.transaction('drafts').objectStore('drafts').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      return drafts.some((draft) => !draft.finalizedAt && JSON.stringify(draft.input.exercises.flatMap((e: any) => e.sets.map((s: any, index: number) => [e.id + ':' + index, s.load, s.reps, s.rir])).sort((a: string[], b: string[]) => a[0].localeCompare(b[0]))) === JSON.stringify(fields))
    } finally { db.close() }
  })).toBe(true)
  await expect(page.locator('.training-session [role="status"]').filter({ hasText: /Saving|Draft not saved/ })).toHaveCount(0)
}
export async function startWeekly(page: Page, plan: string, day: string) {
  await trainButton(page, 'Train').click()
  await expect(trainButton(page, 'Add Plan')).toBeVisible()
  const card = page.getByRole('article', { name: `Plan ${plan}`, exact: true })
  if (!await card.isVisible()) {
    await trainButton(page, 'Add Plan').click(); await page.getByRole('dialog', { name: 'Add Plan' }).getByRole('article', { name: `Plan ${plan}`, exact: true }).getByRole('button').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await card.getByRole('button').click()
  await expect(page.locator('.training-day-card').first()).toBeVisible()
  for (let i = 0; i < 10; i++) {
    const pending = page.locator('.training-day-card').filter({ hasText: day }).filter({ has: page.locator('.day-status.pending, .day-status.due-today, .day-status.past-due') })
    if (await pending.count()) { await pending.first().click(); await page.getByRole('dialog').getByRole('button', { name: /^(Start|Resume)$/ }).click(); return }
    await trainButton(page, 'Next week').click(); await expect(page.locator('.training-day-card').first()).toBeVisible()
  }
  throw new Error('No active pending week for test program')
}
export async function closeTimer(page: Page) {
  const popup = page.getByRole('dialog', { name: 'Rest Timer', exact: true })
  await expect(popup).toBeVisible()
  await popup.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(popup).toHaveCount(0)
}

export async function openExerciseAction(page: Page, name: string, action: 'Information' | 'Note' | 'Replace') {
  const menu = trainButton(page, 'Actions for ' + name)
  await expect(menu.or(trainButton(page, action + ' for ' + name))).toBeVisible()
  if (await menu.isVisible()) { await menu.click(); await page.getByRole('dialog', { name: 'Exercise actions', exact: true }).getByRole('button', { name: action, exact: true }).click() }
  else await trainButton(page, action + ' for ' + name).click()
}

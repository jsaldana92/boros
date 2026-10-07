import { expect, test, type Page } from '@playwright/test'
import { waitForDraft, startWeekly, closeTimer } from './train-actions'
import { createNamedProfile } from './settings-actions'
const b=(p:Page,n:string)=>p.getByRole('button',{name:n,exact:true})
const f=(p:Page,n:string)=>p.getByLabel(n,{exact:true})
test.setTimeout(90000)
async function rows(p:Page,store:string) { return p.evaluate(async store=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('boros');r.onsuccess=()=>resolve(r.result)});try{return await new Promise<any[]>(resolve=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result)})}finally{db.close()}},store) }
async function setup(page:Page,theme='Dark') {
  await page.clock.install({time:new Date('2026-10-05T16:00:00Z')});await page.goto('./');await expect(b(page,'Settings')).toBeVisible();if(await b(page,'Understood').isVisible())await b(page,'Understood').click()
  await b(page,'Settings').click();await b(page,theme).click();await b(page,'Create').click();await b(page,'Import').click()
  await f(page,'AI output JSON').fill(JSON.stringify({schemaVersion:2,kind:'plan',plan:{name:'Live plan',durationWeeks:4,trainingDaysPerWeek:1,days:[{name:'Upper',supersets:[{number:1}],exercises:[{name:'Solo',sets:[{reps:{min:5,max:8},rir:{min:0,max:0}}],tags:['Solo']},...[3,2,1].map((n,i)=>({name:['A','B','C'][i],superset:1,tags:['Group'],sets:Array.from({length:n},(_,j)=>({reps:{min:j+5,max:j+5},rir:{min:i,max:i}}))}))]}]}}))
  await b(page,'Validate and preview').click();await b(page,'Save plan').click();await expect(page.getByRole('article',{name:'Plan Live plan',exact:true})).toBeVisible();await startWeekly(page,'Live plan','Upper')
}
for(const theme of ['Dark','Light'])test(`session additions, explicit rounds, settings persistence/unit conversion and active Progress (${theme})`,async({page},info)=>{
  await setup(page,theme);const address=page.url(),plan=(await rows(page,'plans'))[0]
  await f(page,'Solo set 1 Weight (kg)').fill('100');await f(page,'Solo set 1 Repetitions').fill('5')
  await b(page,'Add Set to Solo').click();await expect(f(page,'Solo set 2 Weight (kg)')).toHaveValue('')
  await b(page,'Add Set to Superset 1').click();const group=page.getByRole('region',{name:'Superset 1',exact:true}),round=group.getByRole('region',{name:'Superset 1 set 4',exact:true})
  await expect(round.getByRole('heading',{level:4})).toHaveText(['Set 4','A','B','C']);await expect(f(page,'B set 3 Repetitions')).toHaveValue('');await expect(group.getByRole('region',{name:'Superset 1 set 3',exact:true}).getByRole('heading',{level:4})).toHaveText(['Set 3','A'])
  for(const block of await page.locator('.training-session .training-exercise').all()) {
    const add=await block.locator('.session-add button').boundingBox(),rest=await block.locator('.post-exercise-rest button').boundingBox();expect(rest!.y).toBeGreaterThan(add!.y+add!.height)
    const centered=await block.locator('.rest-control').evaluateAll(nodes=>nodes.every(n=>{const a=n.getBoundingClientRect(),b=n.querySelector('button')!.getBoundingClientRect();return Math.abs((a.left+a.right)-(b.left+b.right))<2}));expect(centered).toBe(true)
  }
  await expect(page.locator('.training-set .check-label')).toHaveText(Array(11).fill('Skip'))
  await b(page,'Add Exercise').click();const picker=page.getByRole('dialog',{name:'Add Exercise',exact:true});await picker.getByLabel('Search exercises to add',{exact:true}).fill('Solo');await b(page,'Add Solo').click();await waitForDraft(page)
  const draft=(await rows(page,'drafts'))[0];expect(draft.day.exercises).toHaveLength(5);expect(draft.day.exercises.at(-1).id).not.toBe(draft.day.exercises[0].id)
  await b(page,'Session Note').click();await f(page,'Note').fill('Carry through Settings');await page.getByRole('dialog').last().getByRole('button', { name: 'Save', exact: true }).click()
  await b(page,'REST Solo occurrence 1 after set 1').click();await expect(page.getByRole('timer')).toHaveText('00:00');await page.clock.runFor(2100);await expect(page.getByRole('timer')).toHaveText('00:02');await expect(page.locator('.timer-progress')).toHaveCount(0);await closeTimer(page)
  const timer=(await rows(page,'restTimers'))[0];await b(page,'Settings').click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Weight unit',exact:true}).selectOption('lb');await b(page,'Save profile').click();await expect(page.getByText('Profile saved.',{exact:true})).toBeVisible()
  const support=page.getByRole('link',{name:/Support Boros/});await expect(support).toHaveAttribute('href','https://ko-fi.com/jhonatansaldana');await expect(support).toHaveAttribute('target','_blank');await expect(support).toHaveAttribute('rel','noopener noreferrer');await expect(page.getByText('Support link coming soon.')).toHaveCount(0)
  await page.reload();await b(page,'Train').click();await expect(f(page,'Solo occurrence 1 set 1 Weight (lb)')).toHaveValue('220.462262');await closeTimer(page);expect((await rows(page,'drafts'))[0].id).toBe(draft.id);expect((await rows(page,'drafts'))[0].input.notes).toBe('Carry through Settings');expect((await rows(page,'restTimers'))[0]).toEqual(timer)
  expect(await rows(page,'plans')).toEqual([plan]);expect(page.url()).toBe(address);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath(`session-${theme}.png`),fullPage:true})
  await b(page,'Progress').click();const leave=page.getByRole('dialog',{name:'Leaving Upper',exact:true});await expect(leave).toContainText('Leaving now will clear all your progress and you will have to restart.');await leave.getByRole('button',{name:'Cancel',exact:true}).click();await expect(f(page,'Solo occurrence 1 set 1 Weight (lb)')).toHaveValue('220.462262');expect((await rows(page,'restTimers'))[0]).toEqual(timer)
  await b(page,'Progress').click();await b(page,'Leave').click();await expect(page.getByRole('article',{name:'Run Live plan',exact:true})).toBeVisible();expect(await rows(page,'drafts')).toHaveLength(0);expect(await rows(page,'restTimers')).toHaveLength(0);await page.getByRole('article',{name:'Run Live plan',exact:true}).getByRole('button').click();await expect(page.getByRole('region',{name:'Plan analytics'})).toBeVisible();await expect(page.getByText('Workouts Completed',{exact:true}).locator('..')).toContainText('0')
})

test('structure-only recovery, Clear retention, picker cancellation/focus, failed Settings flush and destructive leave',async({page})=>{
  await setup(page);await b(page,'Add Exercise').click();await b(page,'Cancel selection').click();await expect(b(page,'Add Exercise')).toBeFocused();expect((await rows(page,'drafts'))[0].day.exercises).toHaveLength(4)
  await b(page,'Add Set to Solo').click();await waitForDraft(page);await page.reload();await page.getByRole('button',{name:/^Resume Live plan/}).click();await expect(f(page,'Solo set 2 Weight (kg)')).toBeVisible();await b(page,'Clear').click();await waitForDraft(page);expect((await rows(page,'drafts'))[0].structure.amended).toBe(true)
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;(window as any).restorePut=()=>{IDBObjectStore.prototype.put=put};IDBObjectStore.prototype.put=function(...args){if(this.name==='drafts')throw new DOMException('Simulated write failure','UnknownError');return put.apply(this,args)}})
  await f(page,'Solo set 1 Weight (kg)').fill('17');await b(page,'Settings').click();await expect(page.getByRole('alert').first()).toContainText('Simulated write failure');await expect(f(page,'Solo set 1 Weight (kg)')).toHaveValue('17');await expect(page.getByRole('heading',{name:'Settings',exact:true})).toHaveCount(0)
  await page.evaluate(()=>(window as any).restorePut());await b(page,'Retry draft save').click();await waitForDraft(page)
  await page.evaluate(()=>{const del=IDBObjectStore.prototype.delete;(window as any).restoreDelete=()=>{IDBObjectStore.prototype.delete=del};IDBObjectStore.prototype.delete=function(...args){if(this.name==='drafts')throw new DOMException('Simulated delete failure','UnknownError');return del.apply(this,args)}})
  await b(page,'Calendar').click();await b(page,'Leave').click();await expect(page.getByRole('alert').first()).toContainText('Simulated delete failure');await expect(f(page,'Solo set 1 Weight (kg)')).toHaveValue('17');expect(await rows(page,'drafts')).toHaveLength(1)
  await page.evaluate(()=>(window as any).restoreDelete());await b(page,'Create').click();await b(page,'Leave').click();await expect(b(page,'Create Plan')).toBeVisible();expect(await rows(page,'drafts')).toHaveLength(0);await b(page,'Train').click();await expect(page.getByRole('region',{name:'Unfinished sessions'})).toHaveCount(0)
})

test('Settings profile switch cannot resume or write another owner session',async({page})=>{
  await setup(page);await b(page,'Add Set to Solo').click();await waitForDraft(page);const before=(await rows(page,'drafts'))[0];await b(page,'Settings').click();const original=await f(page,'Active profile').inputValue();await createNamedProfile(page,'Other');await b(page,'Train').click();await expect(page.getByRole('region',{name:'Training session',exact:true})).toHaveCount(0);await expect(page.getByText('No active plan(s) selected.')).toBeVisible();expect(await rows(page,'drafts')).toEqual([before]);await b(page,'Settings').click();await f(page,'Active profile').selectOption(original);await b(page,'Train').click();await page.getByRole('button',{name:/^Resume Live plan/}).click();await expect(f(page,'Solo set 2 Weight (kg)')).toBeVisible();expect(await rows(page,'drafts')).toEqual([before])
})

test('month defaults reflect viewport and Today reveals the correct horizontally scrolled day',async({page},info)=>{
  await page.clock.setFixedTime(new Date('2026-10-11T16:00:00Z'));await page.goto('./');await expect(b(page,'Settings')).toBeVisible();if(await b(page,'Understood').isVisible())await b(page,'Understood').click();await b(page,'Calendar').click();await b(page,'Month').click()
  const mobile=page.viewportSize()!.width<640;await expect(b(page,'Week 1')).toHaveAttribute('aria-expanded',String(!mobile));await expect(b(page,'Week 2')).toHaveAttribute('aria-expanded','true')
  const scroller=page.getByRole('region',{name:'Days in Week 2',exact:true}),cells=scroller.locator('.calendar-day');const widths=await cells.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));const box=await scroller.boundingBox();expect(widths[0]/box!.width).toBeGreaterThan(mobile?.45:.1);expect(widths[0]/box!.width).toBeLessThan(mobile?.55:.16)
  await b(page,'Week 2').focus();await page.keyboard.press('Enter');await expect(b(page,'Week 2')).toHaveAttribute('aria-expanded','false');await b(page,'Today').click();await expect(b(page,'Week 2')).toHaveAttribute('aria-expanded','true');const sunday=await cells.last().boundingBox();expect(sunday!.x+sunday!.width).toBeLessThanOrEqual(box!.x+box!.width+1)
  await f(page,'Calendar date').fill('2025-02-15');for(const button of await page.locator('.calendar-week-section h2 button').all())await expect(button).toHaveAttribute('aria-expanded',String(!mobile));await b(page,'Today').click();await expect.poll(async()=>{const today=await page.locator('.calendar-day[aria-current="date"]').boundingBox(),row=await scroller.boundingBox();return !!today && !!row && today.x>=row.x-1 && today.x+today.width<=row.x+row.width+1}).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>scrollX)).toBe(0);await page.screenshot({path:info.outputPath('month-defaults.png'),fullPage:true})
})


test('added exercises and unequal final rounds save into frozen review and Progress without increasing planned workouts',async({page})=>{
  await setup(page);await b(page,'Add Set to Superset 1').click();await b(page,'Add Exercise').click()
  const picker=page.getByRole('dialog',{name:'Add Exercise',exact:true});await picker.getByLabel('Sort exercises to add',{exact:true}).selectOption('za');await picker.getByRole('button',{name:'Tags',exact:true}).click();await picker.getByRole('button',{name:'Solo',exact:true}).click();await picker.getByLabel('Solo',{exact:true}).check();await b(page,'Add selected').click()
  await f(page,'Solo occurrence 5 set 1 Weight (kg)').fill('25');await f(page,'Solo occurrence 5 set 1 Repetitions').fill('7');await f(page,'B set 3 Weight (kg)').fill('10');await f(page,'B set 3 Repetitions').fill('5');await b(page,'Save').click();await b(page,'Save partial session').click()
  const saved=page.getByRole('region',{name:'Saved session details',exact:true}),round=saved.getByRole('region',{name:'Saved superset 1',exact:true}).locator('.superset-round').last();await expect(round).toContainText('B: Set 3: 10 kg');await expect(round).toContainText('C: Set 2: Skipped');await expect(saved).toContainText('25 kg')
  const session=(await rows(page,'sessions'))[0];expect(session.day.exercises).toHaveLength(5);expect(session.structure.amended).toBe(true)
  await b(page,'Progress').click();const plan=page.getByRole('article',{name:'Run Live plan',exact:true});await expect(plan.getByRole('img',{name:'Completed: 1 of 4 planned workouts, 25%'})).toBeVisible();await plan.getByRole('button').click();await expect(page.getByRole('region',{name:'Plan exercises'}).getByRole('button')).toHaveCount(5);await page.reload();expect((await rows(page,'sessions'))[0]).toEqual(session)
})

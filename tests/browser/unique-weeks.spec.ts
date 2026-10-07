import { expect, test, type Page } from '@playwright/test'
import { cardAction, occurrenceAction } from './create-actions'
import { manageRun } from './calendar-actions'
import { createNamedProfile } from './settings-actions'

test.setTimeout(120000)
const b=(p:Page,name:string)=>p.getByRole('button',{name,exact:true})
const f=(p:Page,name:string)=>p.getByLabel(name,{exact:true})
const week=(p:Page,n:number)=>p.getByRole('region',{name:`Week ${n}`,exact:true})
const card=(p:Page)=>p.getByRole('article',{name:'Plan Cycle',exact:true})
async function rows(page:Page,store:string){return page.evaluate(async store=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('boros');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise<any[]>((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}},store)}
async function open(p:Page){await p.clock.setFixedTime(new Date('2026-10-05T15:00:00Z'));await p.goto('./');await expect(b(p,'Create')).toBeVisible();if(await b(p,'Understood').isVisible())await b(p,'Understood').click();await b(p,'Create').click()}
const payload=()=>({schemaVersion:4,kind:'plan',plan:{mode:'unique',name:'Cycle',durationWeeks:4,uniqueWeekCount:2,instructions:'Instructions',notes:'Note',weeks:[4,3].map((count,w)=>({trainingDaysPerWeek:count,days:Array.from({length:count},(_,d)=>({name:`W${w+1}D${d+1}`,exercises:[{name:'Squat',sets:[{reps:{min:5+w,max:5+w},rir:{min:0,max:0}}],restBetweenSetsSeconds:0}]}))}))}})
async function preview(p:Page){await b(p,'Import').click();await f(p,'AI output JSON').fill(JSON.stringify(payload()));await b(p,'Validate and preview').click();await expect(f(p,'Plan name')).toHaveValue('Cycle')}
async function seed(p:Page){await open(p);await preview(p);await b(p,'Save plan').click();await expect(card(p)).toBeVisible()}

test('builder divisors, separate weeks, destructive reductions, invalid duration recovery and nested draft navigation',async({page},info)=>{
  await open(page);const native:string[]=[];page.on('dialog',async d=>{native.push(d.type());await d.dismiss()})
  await b(page,'Create exercise').click();await f(page,'Exercise name').fill('Squat');await f(page,'Set 1 Reps minimum').fill('5');await b(page,'Save').click()
  await b(page,'Create Plan').click();await f(page,'Plan name').fill('Cycle');await f(page,'Duration (weeks)').fill('12');await b(page,'Add exercise').click();await b(page,'Add Squat').click()
  const oldId=await page.locator('[data-day-id]').first().getAttribute('data-day-id')
  await page.getByRole('switch',{name:'Unique training weeks?'}).click();await expect(f(page,'Workouts per week')).toHaveCount(0);await expect(f(page,'Number of Unique weeks').locator('option:not(:disabled)')).toHaveText(['2','3','4','6','12']);await f(page,'Number of Unique weeks').selectOption('2')
  await expect(f(page,'Note (optional):')).toBeVisible();expect(await week(page,1).locator('[data-day-id]').first().getAttribute('data-day-id')).toBe(oldId)
  await week(page,2).getByLabel('Workout 1 name',{exact:true}).fill('Second');await week(page,2).getByRole('button',{name:'Add exercise',exact:true}).click();await b(page,'Add Squat').click()
  await f(page,'Workouts for Week 2').selectOption('3');await expect(week(page,1).locator('.plan-day')).toHaveCount(1);await expect(week(page,2).locator('.plan-day')).toHaveCount(3)
  await f(page,'Number of Unique weeks').selectOption('4');await week(page,4).getByLabel('Workout 1 name',{exact:true}).fill('Keep fourth')
  await f(page,'Number of Unique weeks').selectOption('2');await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();await expect(f(page,'Number of Unique weeks')).toHaveValue('4');await expect(week(page,4).getByLabel('Workout 1 name',{exact:true})).toHaveValue('Keep fourth')
  await f(page,'Duration (weeks)').fill('6');await b(page,'Save plan').click();await expect(page.getByRole('alert')).toContainText('divides the duration');await expect(week(page,4)).toBeVisible()
  await f(page,'Number of Unique weeks').selectOption('2');await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();await expect(week(page,2).getByLabel('Workout 1 name',{exact:true})).toHaveValue('Second')
  await page.getByRole('switch',{name:'Unique training weeks?'}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('switch')).toHaveAttribute('aria-checked','true')
  await occurrenceAction(page,week(page,1).locator('.plan-day').first(),'Edit');await f(page,'Set 1 Reps minimum').fill('9')
  await b(page,'Settings').click();const warning=page.getByRole('dialog',{name:'Leaving plan creation',exact:true});await expect(warning).toContainText('Leaving this page will lose all information entered.');await warning.getByRole('button',{name:'Cancel',exact:true}).click();await expect(f(page,'Set 1 Reps minimum')).toHaveValue('9')
  await b(page,'Calendar').click();await warning.getByRole('button',{name:'Leave',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('Calendar');expect(await rows(page,'plans')).toHaveLength(0);expect(await rows(page,'exercises')).toHaveLength(1);expect(native).toEqual([])
  await b(page,'Create').click();await b(page,'Create Plan').click();await page.getByRole('switch').click();await page.getByRole('switch').click();await f(page,'Plan name').fill('Reverted');await f(page,'Plan name').fill('');await b(page,'Progress').click();await expect(page.getByRole('heading',{level:1})).toHaveText('Progress');await expect(page.getByRole('dialog')).toHaveCount(0)
  await b(page,'Create').click();await b(page,'Create exercise').click();await f(page,'Exercise name').fill('Reverted');await f(page,'Exercise name').fill('');await b(page,'Apply').click();await b(page,'Settings').click();await expect(page.getByRole('heading',{level:1})).toHaveText('Settings');await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('pristine-navigation.png')})
})

test('AI cycles persist, preview and per-week assignment stage once; Train uses actual weeks and Progress totals',async({page},info)=>{
  await seed(page);const saved=(await rows(page,'plans'))[0],address=page.url();expect(saved.weeks).toHaveLength(2);expect(saved.days).toHaveLength(7)
  await cardAction(page,card(page),'Edit');await expect(page.getByRole('switch')).toHaveAttribute('aria-checked','true');await expect(f(page,'Workouts for Week 1')).toHaveValue('4');await expect(f(page,'Workouts for Week 2')).toHaveValue('3');await b(page,'Cancel').click()
  await card(page).getByRole('button').click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Week 2',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toContainText('3–4 workouts');await b(page,'Close').click()
  await b(page,'Calendar').click();await f(page,'Calendar date').fill('2026-10-05');await b(page,'Add Plan').click();await card(page).getByRole('button').click()
  const popup=page.getByRole('dialog');await expect(popup.getByRole('heading',{name:'Week 1',exact:true})).toBeVisible();await expect(popup.getByRole('heading',{name:'Week 2',exact:true})).toBeVisible()
  for(let w=1;w<=2;w++){const fields=week(page,w).getByRole('combobox');for(let d=0;d<await fields.count();d++)await fields.nth(d).selectOption(String(d))}
  await popup.getByRole('button',{name:'Save',exact:true}).click();expect(await rows(page,'schedules')).toHaveLength(0);await b(page,'Save').click();await expect(page.getByRole('heading',{level:1})).toHaveText('Calendar');expect(await rows(page,'schedules')).toHaveLength(1)
  await b(page,'Train').click();await card(page).getByRole('button').click();await expect(page.locator('.training-day-card')).toHaveCount(4);await expect(page.getByText('Week 1',{exact:true})).toBeVisible();await b(page,'Next week').click();await expect(page.locator('.training-day-card')).toHaveCount(3);await expect(page.locator('.training-day-card').first()).toContainText('W2D1');await expect(page.locator('.rest-day-card')).toHaveCount(4);await b(page,'Next week').click();await expect(page.getByText('Week 3',{exact:true})).toBeVisible();await expect(page.locator('.training-day-card').first()).toContainText('W1D1')
  await b(page,'Calendar').click();await manageRun(page,'Edit','Cycle');await f(page,'W2D1 weekday').selectOption('4');await b(page,'Save').click();await b(page,'Train').click();await card(page).getByRole('button').click();await b(page,'Next week').click();await expect(page.locator('.training-day-card').filter({hasText:'W2D1'})).toContainText('Friday')
  await b(page,'Progress').click();await expect(page.getByRole('img',{name:'Plan: 0 of 14 planned workouts, 0%',exact:true})).toBeVisible();await expect(page.getByRole('article',{name:'Run Cycle'})).toContainText('3–4 workouts')
  await b(page,'Settings').click();await b(page,'Light').click();await b(page,'Create').click();await cardAction(page,card(page),'Edit');await expect(page.locator('html')).toHaveAttribute('data-theme','light');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('unique-weeks-light.png'),fullPage:true});await b(page,'Cancel').click()
  await page.reload();await expect(card(page)).toBeVisible();expect((await rows(page,'plans'))[0]).toEqual(saved);expect(page.url()).toBe(address)
  await b(page,'Settings').click();const original=await f(page,'Active profile').inputValue();await createNamedProfile(page,'Other');await b(page,'Create').click();await expect(card(page)).toHaveCount(0);await b(page,'Settings').click();await f(page,'Active profile').selectOption(original);await b(page,'Create').click();await expect(card(page)).toBeVisible()
})

test('AI cancellation and custom Create guards keep preference, focus and genuine unload warning',async({page})=>{
  await open(page);await preview(page);const before=await rows(page,'plans'),address=page.url();await b(page,'Settings').focus();await page.keyboard.press('Enter')
  const warning=page.getByRole('dialog',{name:'Leaving plan creation'});await expect(warning).toBeVisible();await warning.getByRole('button',{name:'Cancel',exact:true}).click();await expect(b(page,'Settings')).toBeFocused();expect(await page.evaluate(()=>sessionStorage.getItem('boros.navigation.screen'))).toBe('create')
  const unload=page.waitForEvent('dialog');await page.evaluate(()=>{setTimeout(()=>location.reload(),0)});const dialog=await unload;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();await expect(f(page,'Plan name')).toHaveValue('Cycle')
  await b(page,'Settings').click();await warning.getByRole('button',{name:'Leave',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('Settings');expect(await rows(page,'plans')).toEqual(before);expect(page.url()).toBe(address)
  await b(page,'Create').click();await b(page,'Create exercise').click();await f(page,'Exercise name').fill('Unsaved');await b(page,'Train').click();await expect(page.getByRole('dialog',{name:'Leaving exercise creation'})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();await expect(f(page,'Exercise name')).toHaveValue('Unsaved');await b(page,'Settings').click();await page.getByRole('dialog').getByRole('button',{name:'Leave',exact:true}).click();expect(await rows(page,'exercises')).toHaveLength(0)
})

test('manual unique plan saves independent prescriptions; duplicate and confirmed Off retain Week 1 identities',async({page})=>{
  await open(page);await b(page,'Create exercise').click();await f(page,'Exercise name').fill('Squat');await f(page,'Set 1 Reps minimum').fill('5');await b(page,'Save').click()
  await b(page,'Create Plan').click();await f(page,'Plan name').fill('Cycle');await f(page,'Duration (weeks)').fill('4');await b(page,'Add exercise').click();await b(page,'Add Squat').click();await page.getByRole('switch').click();await f(page,'Number of Unique weeks').selectOption('2')
  await week(page,2).getByRole('button',{name:'Add exercise',exact:true}).click();await b(page,'Add Squat').click();await occurrenceAction(page,week(page,2),'Edit');await f(page,'Set 1 Reps minimum').fill('8');await page.locator('.exercise-editor button[type="submit"]').click();await b(page,'Save plan').click();await expect(card(page)).toBeVisible()
  const original=(await rows(page,'plans'))[0];expect(original.days[0].exercises[0].prescription.sets[0].reps.min).toBe(5);expect(original.days[1].exercises[0].prescription.sets[0].reps.min).toBe(8)
  await cardAction(page,card(page),'Duplicate');await b(page,'Save plan').click();await expect(page.getByRole('article',{name:'Plan Cycle (copy)',exact:true})).toBeVisible();const duplicate=(await rows(page,'plans')).find(p=>p.name==='Cycle (copy)');expect(duplicate.weeks).toHaveLength(2);expect(duplicate.weeks[0].id).not.toBe(original.weeks[0].id);expect(duplicate.days[0].exercises[0].setIds[0]).not.toBe(original.days[0].exercises[0].setIds[0])
  await cardAction(page,card(page),'Edit');await page.getByRole('switch').click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('switch')).toHaveAttribute('aria-checked','false');await expect(f(page,'Number of Unique weeks')).toHaveCount(0);await b(page,'Save plan').click();await expect(card(page)).toBeVisible()
  const repeated=(await rows(page,'plans')).find(p=>p.name==='Cycle');expect(repeated.weeks).toBeUndefined();expect(repeated.days).toEqual([original.days[0]]);expect((await rows(page,'exercises'))[0].sets[0].reps.min).toBe(5)
})

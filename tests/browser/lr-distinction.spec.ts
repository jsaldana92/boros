import { test, expect, type Page } from '@playwright/test'
import { cardAction, occurrenceAction } from './create-actions'
import { readFile } from 'node:fs/promises'
import Papa from 'papaparse'
const b=(p:Page,name:string)=>p.getByRole('button',{name,exact:true})
async function rows(p:Page,store:string){return p.evaluate(async store=>{const db=await new Promise<IDBDatabase>((r,j)=>{const q=indexedDB.open('boros');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});try{return await new Promise<any[]>((r,j)=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}finally{db.close()}},store)}
async function setup(p:Page,theme:string,lr=false){
  await p.goto('./');if(await b(p,'Understood').isVisible())await b(p,'Understood').click();await b(p,'Settings').click();await b(p,theme).click();await b(p,'Create').click();await b(p,'Import').click()
  const e={name:'Lunge',lrDistinction:lr,instructions:'Control the movement',sets:[{reps:{min:5,max:8},rir:{min:0,max:0}},{reps:{min:8,max:10}}],restBetweenSetsSeconds:30}
  await p.getByLabel('AI output JSON',{exact:true}).fill(JSON.stringify({schemaVersion:10,trainingType:'strength',kind:'workout',workout:{name:'Leg day',exercises:[e]}}));await b(p,'Validate and preview').click();await b(p,'Save workout').click();await expect(p.getByRole('article',{name:'Workout Leg day',exact:true})).toBeVisible()
}
async function start(p:Page){await b(p,'Train').click();await b(p,'Existing Workout').click();await p.getByRole('article',{name:'Workout Leg day',exact:true}).getByRole('button').click()}
async function edit(p:Page){await b(p,'Create').click();await cardAction(p,p.getByRole('article',{name:'Lunge',exact:true}),'Edit')}
const toggle=(p:Page,mode:string)=>p.getByRole('group',{name:'L/R Distinction',exact:true}).getByRole('button',{name:mode,exact:true})
async function csv(p:Page){await b(p,'Settings').click();await b(p,'Download analysis CSV').click();const event=p.waitForEvent('download');await b(p,'I understand (Download)').click();const download=await event;return Papa.parse(await readFile((await download.path())!,'utf8'),{header:true}).data as Record<string,string>[]}

for(const theme of ['Dark','Light'])test(`L/R staged conversion, active draft, hints, charts and CSV (${theme})`,async({page},info)=>{
  test.setTimeout(120000);await setup(page,theme);await start(page)
  for(let i=1;i<=2;i++){await page.getByLabel(`Lunge set ${i} Weight (kg)`,{exact:true}).fill(String(i*10));await page.getByLabel(`Lunge set ${i} Repetitions`,{exact:true}).fill(String(i+5))}
  await b(page,'Save').click();await expect(page.getByRole('region',{name:'Saved session details'})).toBeVisible();const original=(await rows(page,'sessions'))[0]
  await b(page,'Back to workouts').click();await start(page);const active=(await rows(page,'activeWorkouts'))[0]
  await edit(page);await expect(toggle(page,'No')).toHaveAttribute('aria-pressed','true');await toggle(page,'Yes').click()
  const on=page.getByRole('dialog',{name:'Turn on L/R Distinction?',exact:true});await expect(on).toContainText('Previous results will be copied to both Left and Right. Each side will start with the same weight, reps, and RIR.');await on.getByRole('button',{name:'Cancel',exact:true}).click();await expect(toggle(page,'No')).toHaveAttribute('aria-pressed','true');expect((await rows(page,'sessions'))[0]).toEqual(original)
  await toggle(page,'Yes').click();await on.getByRole('button',{name:'Proceed',exact:true}).click();expect((await rows(page,'sessions'))[0]).toEqual(original)
  await b(page,'Cancel').click();await page.getByRole('dialog',{name:'Discard unsaved exercise?',exact:true}).getByRole('button',{name:'Confirm',exact:true}).click();expect((await rows(page,'sessions'))[0]).toEqual(original)
  await edit(page);await toggle(page,'Yes').click();await on.getByRole('button',{name:'Proceed',exact:true}).click();await toggle(page,'No').click();await b(page,'Save').click();expect((await rows(page,'sessions'))[0]).toEqual(original)
  await edit(page);await toggle(page,'Yes').click();await on.getByRole('button',{name:'Proceed',exact:true}).click();await b(page,'Save').click();await expect.poll(async()=>(await rows(page,'sessions'))[0].exercises[0].sets[0].sides?.right.weightKg).toBe(10)
  await b(page,'Train').click();await expect(page.locator('.training-set')).toHaveCount(2);await expect(page.locator('.training-side')).toHaveCount(4);await expect(b(page,'REST Lunge after set 1')).toHaveCount(1)
  const left=page.getByLabel('Lunge set 1 Left Weight (kg)',{exact:true}),right=page.getByLabel('Lunge set 1 Right Weight (kg)',{exact:true});await expect(left).toHaveAttribute('placeholder','10');await expect(right).toHaveAttribute('placeholder','10');await expect(left).toHaveValue('')
  await b(page,'Actions for Lunge').click();await b(page,'Instructions').click();await expect(page.getByRole('dialog',{name:'Lunge',exact:true})).toContainText('Left: 10 kg x 6 reps');await expect(page.getByRole('heading',{name:'History',exact:true})).toBeVisible();await page.keyboard.press('Escape')
  await left.fill('30');await page.getByLabel('Lunge set 1 Left Repetitions',{exact:true}).fill('12');await page.getByLabel('Lunge set 1 Left Actual RIR (optional)',{exact:true}).fill('2');await right.fill('35');await page.getByLabel('Lunge set 1 Right Repetitions',{exact:true}).fill('8');await page.getByLabel('Lunge set 1 Right Actual RIR (optional)',{exact:true}).fill('1')
  await page.getByLabel('Skip Lunge set 2 Right',{exact:true}).check();await expect(page.locator('.draft-save-status')).toHaveText('');await page.reload();await expect(left).toHaveValue('30');await expect(right).toHaveValue('35');expect((await rows(page,'activeWorkouts'))[0].draftId).toBe(active.draftId)
  await b(page,'Save').click();await b(page,'Save partial session').click();await expect(page.getByRole('region',{name:'Saved session details'})).toContainText('Right: 35 kg');expect((await rows(page,'sessions')).find(s=>s.id!==original.id).exercises[0].sets).toHaveLength(2)
  await b(page,'Progress').click();await b(page,'Lunge').click();const weightChart=page.locator('.point-chart').first();await expect(weightChart.locator('.weight-point')).toHaveCount(6)
  const leftPoint=weightChart.locator('[data-side="left"]').first(),rightPoint=weightChart.locator('[data-side="right"]').first();const style=async(el)=>el.locator('span').evaluate(node=>({color:getComputedStyle(node).backgroundColor,radius:getComputedStyle(node).borderRadius}));expect(await style(leftPoint)).not.toEqual(await style(rightPoint))
  await leftPoint.click();await expect(page.getByRole('dialog')).toContainText('Left');await b(page,'Close').click();await rightPoint.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toContainText('Right');await b(page,'Close').click()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`lr-progress-${theme}.png`),fullPage:true})
  const sided=await csv(page);expect(sided).toHaveLength(8);expect(sided.filter(r=>r.l_r_distinction==='left')).toHaveLength(4);expect(sided.filter(r=>r.status==='Unrecorded')).toHaveLength(1);expect(sided.filter(r=>r.status==='Skipped')).toHaveLength(1)
  await edit(page);await toggle(page,'No').click();const off=page.getByRole('dialog',{name:'Turn off L/R Distinction?',exact:true});await expect(off).toContainText('using reps to break a tie');await off.getByRole('button',{name:'Proceed',exact:true}).click();await b(page,'Save').click();await expect.poll(async()=>!!(await rows(page,'sessions'))[0].exercises[0].sets[0].sides).toBe(false)
  const collapsed=(await rows(page,'sessions')).find(s=>s.id!==original.id).exercises[0].sets[0];expect(collapsed).toMatchObject({weightKg:35,reps:8,rir:1});const flat=await csv(page);expect(flat).toHaveLength(4);expect(flat.every(r=>r.l_r_distinction==='no')).toBe(true)
})

test('nested authoring stages shared mode; differing targets suppress entire hints but retain History',async({page})=>{
  await setup(page,'Dark',true);await start(page)
  await page.getByLabel('Lunge set 1 Left Weight (kg)',{exact:true}).fill('5');await page.getByLabel('Lunge set 1 Left Repetitions',{exact:true}).fill('8');await b(page,'Save').click();await b(page,'Save partial session').click()
  await b(page,'Create').click();await cardAction(page,page.getByRole('article',{name:'Workout Leg day',exact:true}),'Edit');await occurrenceAction(page,page.locator('li[data-occurrence-id]').first(),'Edit')
  await expect(toggle(page,'Yes')).toHaveAttribute('aria-pressed','true');await toggle(page,'No').click();await page.getByRole('dialog',{name:'Turn off L/R Distinction?',exact:true}).getByRole('button',{name:'Proceed',exact:true}).click();await b(page,'Apply').last().click();expect((await rows(page,'exercises'))[0].lrDistinction).toBe(true);await b(page,'Save workout').click();await expect.poll(async()=>(await rows(page,'exercises'))[0].lrDistinction).toBe(false)
  await start(page);await expect(page.getByLabel('Lunge set 1 Weight (kg)',{exact:true})).toHaveAttribute('placeholder','5')
  await b(page,'Cancel').click();await b(page,'Create').click();await cardAction(page,page.getByRole('article',{name:'Workout Leg day',exact:true}),'Edit');await occurrenceAction(page,page.locator('li[data-occurrence-id]').first(),'Edit')
  await page.getByLabel('Set 2 Reps minimum',{exact:true}).fill('9');await b(page,'Apply').last().click();await b(page,'Save workout').click();await start(page)
  await expect(page.getByLabel('Lunge set 1 Weight (kg)',{exact:true})).not.toHaveAttribute('placeholder');await b(page,'Actions for Lunge').click();await b(page,'Instructions').click();await expect(page.getByRole('heading',{name:'History',exact:true})).toBeVisible()
})

test('AI mode conflicts require a choice; repeated L/R superset members keep two rounds and shared rest',async({page},info)=>{
  await page.goto('./');await b(page,'Create').click();if(await b(page,'Understood').isVisible())await b(page,'Understood').click();await b(page,'Import').click()
  const exercise={name:'Side plank',sets:[{reps:{min:5,max:8}},{reps:{min:6,max:9}}],superset:1}
  await page.getByLabel('AI output JSON',{exact:true}).fill(JSON.stringify({schemaVersion:10,trainingType:'strength',kind:'workout',workout:{name:'Leg day',supersets:[{number:1,restBetweenRoundsSeconds:30,restAfterGroupSeconds:0}],exercises:[{...exercise,lrDistinction:false},{...exercise,lrDistinction:true}]}}));await b(page,'Validate and preview').click()
  await b(page,'Continue to editable preview').click();await expect(page.getByRole('alert')).toContainText('Choose L/R Distinction for Side plank.');expect(await rows(page,'exercises')).toHaveLength(0)
  await page.getByLabel('L/R Distinction for Side plank',{exact:true}).selectOption('true');await b(page,'Continue to editable preview').click();await b(page,'Save workout').click();await start(page)
  await expect(page.locator('.superset-round')).toHaveCount(2);await expect(page.locator('.training-set')).toHaveCount(4);await expect(page.locator('.training-side')).toHaveCount(8);await expect(page.getByRole('button',{name:/REST Superset 1 after round 1/})).toHaveCount(1)
  const field=page.getByLabel('Side plank occurrence 1 set 1 Left Weight (kg)',{exact:true});await field.fill('0');await page.getByLabel('Side plank occurrence 1 set 1 Left Repetitions',{exact:true}).fill('0');await expect(page.getByLabel('Side plank occurrence 1 set 1 Right Weight (kg)',{exact:true})).toHaveValue('')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('lr-train-superset.png'),fullPage:true})
  await b(page,'Save').click();await b(page,'Save partial session').click();await expect(page.getByRole('region',{name:'Saved session details'})).toBeVisible();const sessions=await rows(page,'sessions');expect(sessions).toHaveLength(1);expect(sessions[0].exercises.map((e:any)=>e.sets.length)).toEqual([2,2])
})

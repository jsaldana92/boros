import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import Papa from 'papaparse'
import JSZip from 'jszip'
import { setWorkoutNote } from './train-actions'
const b=(p:Page,name:string)=>p.getByRole('button',{name,exact:true})
async function records(p:Page,store:string){return p.evaluate(async name=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('boros');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise<any[]>((resolve,reject)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}},store)}
async function open(p:Page){await p.goto('./');if(await b(p,'Understood').isVisible())await b(p,'Understood').click()}
async function importWorkout(p:Page,type:'strength'|'interval'){
  await b(p,'Create').click();await b(p,'Import').click()
  const exercise={name:'Bench',notes:'Default exercise note',instructions:'Historical instructions',sets:Array.from({length:4},()=>({reps:{min:5,max:8},rir:{min:0,max:0}}))}
  const workout=type==='strength'?{name:'Analysis workout',notes:'Workout default',instructions:'Workout instructions',exercises:[exercise]}:{name:'Analysis intervals',circuits:[{name:'Four executions',repeat:3,restAfterCircuitSeconds:5,exercises:[{name:'Sprint',activeSeconds:20,recoverySeconds:10,notes:'Interval default'}]}],postWorkoutRestSeconds:15}
  await p.getByLabel('AI output JSON',{exact:true}).fill(JSON.stringify({schemaVersion:8,kind:'workout',trainingType:type,workout}));await b(p,'Validate and preview').click();await b(p,'Save workout').click()
  await b(p,'Train').click();await b(p,'Existing Workout').click();await p.getByRole('article',{name:'Workout '+workout.name,exact:true}).getByRole('button').click()
}
async function csv(p:Page){await b(p,'Download analysis CSV').click();const event=p.waitForEvent('download');await p.getByRole('dialog',{name:'Download analysis CSV',exact:true}).getByRole('button',{name:'I understand (Download)',exact:true}).click();const download=await event;expect(download.suggestedFilename()).toMatch(/^Boros_.+_analysis_.+\.csv$/);const parsed=Papa.parse(await readFile((await download.path())!,'utf8'),{header:true});expect(parsed.errors).toEqual([]);return parsed.data as Record<string,string>[]}

test('Settings separates analysis and backup, exports four independent sets, persists notes and offers ZIP-only restore',async({page},info)=>{
  await open(page);const address=page.url();await importWorkout(page,'strength')
  await setWorkoutNote(page,'My workout note')
  for(let i=1;i<=4;i++){await page.getByRole('textbox',{name:`Bench set ${i} Weight (kg)`,exact:true}).fill(String(i*10));await page.getByRole('textbox',{name:`Bench set ${i} Repetitions`,exact:true}).fill(String(4+i))}
  await b(page,'Save').click();await expect(page.getByRole('region',{name:'Saved session details'})).toBeVisible()
  await b(page,'Settings').click();await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();expect(page.url()).toBe(address)
  const headings=await page.locator('h2,h3').allTextContents(),names=['Data','Profile Backup','Restore Profile from Backup'];const positions=names.map(n=>headings.indexOf(n));expect(positions[0]).toBeGreaterThan(-1);expect(positions[1]).toBeGreaterThan(positions[0]);expect(positions[2]).toBeGreaterThan(positions[1]);expect(headings.findIndex(h=>h.startsWith('Clear data for'))).toBeGreaterThan(positions[2])
  await expect(page.getByText('Download your personalized data about your plans, workouts, and exercises as a .csv file to perform your own data analysis.',{exact:true})).toBeVisible()
  await expect(page.getByText('Your information is saved in this browser. Clearing site data removes your profile and logs. Download a backup to keep a copy for migration.',{exact:true})).toBeVisible()
  await expect(b(page,'Download analysis CSV')).toHaveText('Download');await expect(b(page,'Download profile backup')).toHaveText('Download')
  expect(await page.locator('#data-heading').evaluate(e=>getComputedStyle(e.parentElement!).borderBottomStyle)).toBe('solid');expect(await page.locator('#backup-heading').evaluate(e=>getComputedStyle(e.parentElement!).borderBottomStyle)).toBe('solid');await expect(page.locator('.backup-divider')).toBeVisible()
  const before=await records(page,'sessions'),rows=await csv(page);expect(rows).toHaveLength(4);expect(rows.map(r=>r.reps)).toEqual(['5','6','7','8']);expect(rows.map(r=>r.set_number)).toEqual(['1','2','3','4']);expect(rows[0].exercise_notes).toBe('Default exercise note');expect(rows[0].workout_notes).toBe('My workout note');expect(rows[0].plan).toBe('NA');expect(rows[0].exercise_instructions).toBe('Historical instructions');expect(await records(page,'sessions')).toEqual(before)
  await b(page,'Download profile backup').click();const ready=page.waitForEvent('download');await b(page,'I understand (Download)').click();const download=await ready;expect(download.suggestedFilename()).toMatch(/\.zip$/);const zip=await JSZip.loadAsync(await readFile((await download.path())!));expect(JSON.parse(await zip.file('data.json')!.async('string')).sessions).toHaveLength(1)
  await page.getByLabel('Backup ZIP',{exact:true}).setInputFiles({name:'analysis.csv',mimeType:'text/csv',buffer:Buffer.from('username,date\nGuest,today')});await expect(page.getByRole('alert')).toContainText(/ZIP|backup/i)
  await b(page,'Light').click();await b(page,'Download analysis CSV').focus();await page.screenshot({path:info.outputPath('settings-analysis-light.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('stopped Interval activity survives reload and CSV retains four executions and an independent exercise note',async({page})=>{
  await open(page);await importWorkout(page,'interval');await page.clock.install({time:new Date()});await b(page,'Start Circuit').click();await expect(page.locator('.interval-timer-main h3')).toHaveText('Warm Up');await page.clock.fastForward(17250);await b(page,'Stop').click()
  const before=(await records(page,'drafts'))[0];expect(before.interval.activity.attempts).toHaveLength(1);const active=before.interval.activity.attempts[0].results.find((r:any)=>r.phase.kind==='active');expect(active.elapsedMs).toBeGreaterThanOrEqual(7250);expect(active.elapsedMs).toBeLessThan(20000)
  await b(page,'Sprint actions').first().click();await page.getByRole('dialog').getByRole('button',{name:'Note',exact:true}).click();await page.getByLabel('Note',{exact:true}).fill('Use this next time');await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click()
  await page.reload();await expect(b(page,'Start Circuit')).toBeEnabled();expect((await records(page,'drafts'))[0].interval.activity).toEqual(before.interval.activity)
  await b(page,'Save').click();await page.getByRole('dialog',{name:'Save partial session?',exact:true}).getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('region',{name:'Saved Interval session'})).toContainText('Use this next time')
  await b(page,'Settings').click();const rows=await csv(page);expect(rows).toHaveLength(4);expect(rows[0].exercise_time).toBe(`${active.elapsedMs/1000}, 0`);expect(rows[1].exercise_time).toBe('0, 0');expect(rows.map(r=>r.circuit_execution)).toEqual(['1','2','3','4']);expect(rows[0].status).toBe('Partial');expect(rows[0].workout_status).toBe('Completed')
})

test('empty analysis, cancellation, worker failure and profile change produce no misleading download or mutation',async({page})=>{
  await open(page);await b(page,'Settings').click();let count=0;page.on('download',()=>count++)
  await b(page,'Download analysis CSV').click();await b(page,'Cancel').click();expect(count).toBe(0)
  await b(page,'Download analysis CSV').click();await b(page,'I understand (Download)').click();await expect(page.getByText('No saved training history to export.',{exact:true})).toBeVisible();expect(count).toBe(0)
  await page.evaluate(()=>{window.Worker=class {constructor(){throw new Error('CSV worker unavailable')}} as unknown as typeof Worker})
  await b(page,'Download analysis CSV').click();await b(page,'I understand (Download)').click();await expect(page.getByRole('alert')).toContainText('No download was started');expect(count).toBe(0)
  await page.reload();await page.evaluate(()=>{const Original=Worker;window.Worker=class extends Original {postMessage(){}}})
  await b(page,'Download analysis CSV').click();await b(page,'I understand (Download)').click();await expect(b(page,'Cancel export')).toBeVisible();await page.getByLabel('Active profile',{exact:true}).selectOption('new-profile');await expect(b(page,'Cancel export')).toHaveCount(0);expect(count).toBe(0);expect(await records(page,'sessions')).toEqual([])
})

test('AI instruction disagreements require an explicit preview choice and keep independent copied notes',async({page})=>{
  await open(page);await b(page,'Create').click();await b(page,'Import').click()
  const exercise={name:'Bench',sets:[{reps:{min:5,max:5}}],notes:'First note',instructions:'First instructions'}
  await page.getByLabel('AI output JSON',{exact:true}).fill(JSON.stringify({schemaVersion:8,kind:'workout',trainingType:'strength',workout:{name:'Conflicting import',exercises:[exercise,{...exercise,notes:'Second note',instructions:'Second instructions'}]}}))
  await b(page,'Validate and preview').click();await expect(page.getByRole('heading',{name:'Review shared instructions and defaults'})).toBeVisible();expect(await records(page,'exercises')).toEqual([])
  await b(page,'Continue to editable preview').click();await expect(page.getByRole('alert')).toContainText('Choose shared instructions for Bench.')
  await page.getByRole('combobox',{name:'Shared instructions for Bench',exact:true}).selectOption('Second instructions');await page.getByLabel('Initial library note for Bench',{exact:true}).fill('Chosen default');await b(page,'Continue to editable preview').click()
  expect(await records(page,'workouts')).toEqual([]);await b(page,'Save workout').click();await expect(page.getByRole('article',{name:'Workout Conflicting import',exact:true})).toBeVisible()
  const library=await records(page,'exercises'),workout=(await records(page,'workouts'))[0];expect(library).toHaveLength(1);expect(library[0].notes).toBe('Chosen default');expect(library[0].instructions).toBe('Second instructions');expect(workout.exercises.map((e:any)=>e.prescription.notes)).toEqual(['Chosen default','Second note']);expect(new Set(workout.exercises.map((e:any)=>e.templateId))).toEqual(new Set([library[0].id]))
})

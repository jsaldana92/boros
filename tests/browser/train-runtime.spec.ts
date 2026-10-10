import { test, expect, type Page } from '@playwright/test'
import { startWeekly, setWorkoutNote } from './train-actions'
const b=(p:Page,name:string)=>p.getByRole('button',{name,exact:true})
async function rows(p:Page,store:string){return p.evaluate(async store=>{const db=await new Promise<IDBDatabase>((r,j)=>{const q=indexedDB.open('boros');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});try{return await new Promise<any[]>((r,j)=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}finally{db.close()}},store)}
async function mockAudio(p:Page){await p.addInitScript(()=>{
  const events:any[]=[];Object.assign(window,{alertEvents:events})
  Object.defineProperty(navigator,'audioSession',{value:{type:'auto'},configurable:true})
  class Context {
    state='suspended';destination={};async resume(){this.state='running';events.push('resume')}
    async decodeAudioData(bytes:ArrayBuffer){return {length:bytes.byteLength}}
    createGain(){return {gain:{value:1},connect(){},disconnect(){}}}
    createBufferSource(){let job:ReturnType<typeof setTimeout>;const node={buffer:{length:0},onended:null as null|(()=>void),connect(){},disconnect(){},start(){if((window as any).denyAudioStart)throw new DOMException('Denied test source','NotAllowedError');events.push({cue:node.buffer.length});job=setTimeout(()=>node.onended?.(),80)},stop(){clearTimeout(job)}};return node}
  }
  Object.defineProperty(window,'AudioContext',{value:Context,configurable:true})
  Object.defineProperty(navigator,'wakeLock',{value:{async request(){events.push('wake');const lock={released:false,async release(){lock.released=true;events.push('release')},addEventListener(){}};return lock}},configurable:true})
})}
async function setup(p:Page,type:'strength'|'interval',planned=false){
  await p.goto('./');if(await b(p,'Understood').isVisible())await b(p,'Understood').click()
  await b(p,'Settings').click();await p.getByRole('group',{name:'Sound',exact:true}).getByRole('button',{name:'On',exact:true}).click();await b(p,'Create').click();await b(p,'Import').click()
  const workout=type==='strength'?{name:'Strength workout',exercises:[{name:'Press',sets:[{reps:{min:5,max:8},rir:{min:0,max:0}},{reps:{min:5,max:8}}],restBetweenSetsSeconds:2}]}:{name:'Interval workout',circuits:[{name:'Circuit 1',repeat:1,restAfterCircuitSeconds:1,exercises:[{name:'Sprint',activeSeconds:4,recoverySeconds:1}]}],postWorkoutRestSeconds:3}
  await p.getByLabel('AI output JSON',{exact:true}).fill(JSON.stringify({schemaVersion:8,trainingType:type,kind:planned?'plan':'workout',...(planned?{plan:{name:'Plan A',mode:'repeating',durationWeeks:4,trainingDaysPerWeek:1,days:[workout]}}:{workout})}));await b(p,'Validate and preview').click();await b(p,planned?'Save plan':'Save workout').click()
  await expect(p.getByRole('article',{name:planned?'Plan Plan A':'Workout '+workout.name,exact:true})).toBeVisible()
  if(planned)await startWeekly(p,'Plan A',workout.name)
  else{await b(p,'Train').click();await b(p,'Existing Workout').click();await p.getByRole('article',{name:'Workout '+workout.name,exact:true}).getByRole('button').click()}
}
for(const type of ['strength','interval'] as const) for(const planned of [false,true])test(`${type} ${planned?'plan':'standalone'}: popup/tab lifetime, one workout, reload and cancellation`,async({page})=>{
  await mockAudio(page);await setup(page,type,planned);const address=page.url(),initial=(await rows(page,'drafts'))[0]
  await setWorkoutNote(page,'Keep my workout')
  if(type==='strength'){
    await page.getByRole('textbox',{name:'Press set 1 Weight (kg)',exact:true}).fill('0');await page.getByRole('textbox',{name:'Press set 1 Repetitions',exact:true}).fill('8')
    await b(page,'REST Press after set 1').click();const dialog=page.getByRole('dialog',{name:'Rest Timer',exact:true})
    await expect(dialog.getByText('Get ready',{exact:true})).toHaveCount(0)
    const reset=await dialog.getByRole('button',{name:'Reset',exact:true}).boundingBox(),close=await dialog.getByRole('button',{name:'Close',exact:true}).boundingBox();expect(reset!.width).toBeCloseTo(close!.width,1)
    await dialog.getByRole('button',{name:'Close',exact:true}).click()
  }else{
    await b(page,'Start Circuit').click();await expect(page.getByRole('timer')).toContainText('00:10')
    await page.setViewportSize({width:390,height:500});await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await b(page,'Open timer').click();await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
  }
  for(const screen of ['Create','Calendar','Progress','Settings']){await b(page,screen).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(page.url()).toBe(address);expect((await rows(page,'activeWorkouts'))[0].draftId).toBe(initial.id)}
  await b(page,'Train').click();await expect(page.getByRole('heading',{name:type==='strength'?'Strength workout':'Interval workout',exact:true})).toBeVisible();await expect(b(page,'Existing Workout')).toHaveCount(0)
  expect((await rows(page,'drafts')).filter(d=>!d.finalizedAt)).toHaveLength(1)
  await expect.poll(async()=>(await rows(page,'drafts'))[0].input.notes).toBe('Keep my workout')
  if(type==='strength'){await expect.poll(()=>page.evaluate(()=>(window as any).alertEvents.filter((e:any)=>e.cue).length)).toBe(3)}
  else{await b(page,'Pause').click();await expect(page.getByRole('status').filter({hasText:/^Paused$/})).toBeVisible()}
  await page.reload();await expect(page.getByRole('heading',{name:type==='strength'?'Strength workout':'Interval workout',exact:true})).toBeVisible()
  if(type==='interval'){await b(page,'Reload saved timer').click();await expect(page.getByRole('status').filter({hasText:/^Paused$/})).toBeVisible()}
  await b(page,'Cancel').click();const cancel=page.getByRole('dialog');await expect(cancel).toBeVisible();await cancel.getByRole('button',{name:type==='strength'?'Leave':'Confirm',exact:true}).click();await expect(b(page,'Existing Workout')).toBeVisible();expect(await rows(page,'activeWorkouts')).toHaveLength(0)
})
test('Strength saved results become hints/history without entered values; clearing restores hint and a new save excludes it',async({page})=>{
  await setup(page,'strength')
  await page.getByLabel('Press set 1 Weight (kg)',{exact:true}).fill('100');await page.getByLabel('Press set 1 Repetitions',{exact:true}).fill('8');await page.getByLabel('Press set 1 Actual RIR (optional)',{exact:true}).fill('2')
  await b(page,'Save').click();await b(page,'Save partial session').click();await expect(page.getByRole('region',{name:'Saved session details',exact:true})).toBeVisible()
  await b(page,'Back to workouts').click();await b(page,'Existing Workout').click();await page.getByRole('article',{name:'Workout Strength workout',exact:true}).getByRole('button').click()
  const load=page.getByLabel('Press set 1 Weight (kg)',{exact:true});await expect(load).toHaveAttribute('placeholder','100');await expect(load).toHaveValue('')
  await load.fill('5');await load.fill('');await expect(load).toHaveAttribute('placeholder','100')
  await b(page,'Actions for Press').click();await b(page,'Instructions').click();const info=page.getByRole('dialog',{name:'Press',exact:true});await expect(info.getByRole('heading',{name:'History',exact:true})).toBeVisible();await expect(info).toContainText('100 kg x 8 reps with 2nd RIR');await expect(info).not.toContainText('Add exercise information');await page.keyboard.press('Escape')
  await b(page,'Save').click();await expect(page.getByRole('alert')).toContainText('Record at least one');expect((await rows(page,'sessions')).length).toBe(1)
})
test('profile switch and competing browser tab cannot bypass active workout; data stays scoped',async({page,context})=>{
  await setup(page,'strength');const original=(await rows(page,'drafts'))[0]
  await b(page,'Settings').click();await page.getByLabel('Active profile',{exact:true}).selectOption('new-profile');await expect(page.locator('input[name="name"]')).toHaveValue('Guest (1)');await page.locator('input[name="name"]').fill('Second profile');await b(page,'Save profile').click();await expect(page.getByText('Profile saved.',{exact:true})).toBeVisible()
  await b(page,'Train').click();await expect(page.getByText('A workout is active in another profile.')).toBeVisible();await expect(page.getByRole('textbox')).toHaveCount(0)
  const second=await context.newPage();await second.goto(page.url());await b(second,'Train').click();await expect(b(second,'Existing Workout')).toHaveCount(0)
  await b(page,'Return to workout').click();await expect(page.getByRole('heading',{name:'Strength workout',exact:true})).toBeVisible();expect((await rows(page,'drafts'))[0].id).toBe(original.id)
})

async function advance(page:Page,ms:number){await page.clock.runFor(ms);await page.waitForTimeout(300)}
const cueCount=(page:Page)=>page.evaluate(()=>(window as any).alertEvents.filter((event:any)=>event.cue).length)
test('ownership read failure keeps recoverable editor input, reports an error and never creates a replacement workspace',async({page})=>{
  await setup(page,'strength');const initial=(await rows(page,'drafts'))[0]
  await page.evaluate(()=>{const get=IDBObjectStore.prototype.get;Object.assign(window,{restoreWorkoutRead:()=>{IDBObjectStore.prototype.get=get}});IDBObjectStore.prototype.get=function(...args){if(this.name==='activeWorkouts' && this.transaction.mode==='readonly')throw new DOMException('Injected ownership read failure','UnknownError');return get.apply(this,args)}})
  await page.getByLabel('Press set 1 Weight (kg)',{exact:true}).fill('77');await page.getByLabel('Press set 1 Repetitions',{exact:true}).fill('8')
  await expect(page.getByRole('alert').filter({hasText:'Workout storage is unavailable.'})).toBeVisible();await expect(page.getByLabel('Press set 1 Weight (kg)',{exact:true})).toHaveValue('77')
  await page.evaluate(()=>(window as any).restoreWorkoutRead());await b(page,'Retry workout storage').click();await b(page,'Retry training').click();await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(async()=>(await rows(page,'drafts'))[0].input.exercises[0].sets[0].load).toBe('77')
  expect((await rows(page,'activeWorkouts'))[0].draftId).toBe(initial.id);expect(await rows(page,'profiles')).toHaveLength(1)
})
test('resuming a preserved legacy Strength draft claims ownership before another edit',async({page,context})=>{
  await setup(page,'strength')
  const original=(await rows(page,'drafts'))[0], legacy={...structuredClone(original),id:crypto.randomUUID()}
  legacy.input.notes='Legacy recovery'
  await page.evaluate(async value=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('boros');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').add(value);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)})}finally{db.close()}},legacy)
  await b(page,'Cancel').click();await expect(page.getByRole('region',{name:'Training session',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:/^Resume /}).click()
  await expect(page.getByRole('region',{name:'Training session',exact:true})).toBeVisible()
  expect((await rows(page,'activeWorkouts'))[0].draftId).toBe(legacy.id)
  const other=await context.newPage();await other.goto('./');await expect(other.getByRole('region',{name:'Training session',exact:true})).toBeVisible();await expect(b(other,'Custom Workout')).toHaveCount(0)
  expect(await rows(page,'drafts')).toHaveLength(1);expect((await rows(page,'drafts'))[0].input.notes).toBe('Legacy recovery')
})
test('native Web Audio decodes local assets and starts exactly three completion sources after a gesture',async({page})=>{
  await page.addInitScript(()=>{
    Object.assign(window,{nativeCueStarts:0})
    const original=AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start=function(...args){original.apply(this,args);(window as any).nativeCueStarts++}
  })
  await setup(page,'strength');await b(page,'REST Press after set 1').click()
  expect(await page.evaluate(()=>(window as any).nativeCueStarts)).toBe(0)
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await b(page,'Create').click()
  await expect.poll(()=>page.evaluate(()=>(window as any).nativeCueStarts),{timeout:20000}).toBe(3)
  await b(page,'Train').click();await page.locator('.timer-compact').click();expect(await page.evaluate(()=>(window as any).nativeCueStarts)).toBe(3)
})
test('Interval audio runs on another Boros tab; Sound Off cancels cues and On does not replay them',async({page})=>{
  await mockAudio(page);await setup(page,'interval');await page.clock.install({time:new Date()})
  await b(page,'Start Circuit').click();await expect(page.getByRole('timer')).toContainText('00:10');expect(await cueCount(page)).toBe(0)
  await b(page,'Create').click();await advance(page,10000);await expect.poll(()=>cueCount(page)).toBe(1)
  await b(page,'Settings').click();await page.getByRole('group',{name:'Sound',exact:true}).getByRole('button',{name:'Off',exact:true}).click()
  await advance(page,15000);expect(await cueCount(page)).toBe(1)
  await page.getByRole('group',{name:'Sound',exact:true}).getByRole('button',{name:'On',exact:true}).click();await advance(page,1000);expect(await cueCount(page)).toBe(1)
  await b(page,'Train').click();await expect(page.getByText('Ready to save',{exact:true})).toBeVisible();expect((await rows(page,'drafts'))[0].interval.results.filter((r:any)=>r.phase.kind==='active')).toHaveLength(2)
  expect(await page.evaluate(()=>(navigator as any).audioSession.type)).toBe('auto')
})
for(const type of ['strength','interval'] as const)test(`${type}: simulated background completion is consumed without a burst on visibility return`,async({page})=>{
  await mockAudio(page);await setup(page,type);await page.clock.install({time:new Date()})
  if(type==='strength'){await b(page,'REST Press after set 1').click();await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()}else await b(page,'Start Circuit').click()
  await advance(page,250);await expect.poll(()=>page.evaluate(()=>(window as any).alertEvents.filter((e:any)=>e==='wake').length)).toBe(1)
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))})
  await advance(page,30000);expect(await cueCount(page)).toBe(0)
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))})
  await advance(page,1000);expect(await cueCount(page)).toBe(0)
  expect(await page.evaluate(()=>(window as any).alertEvents.filter((e:any)=>e==='release').length)).toBe(1)
  if(type==='strength')await expect(b(page,'Rest finished')).toBeVisible();else await expect(page.getByText('Ready to save',{exact:true})).toBeVisible()
})

for(const type of ['strength','interval'] as const)test(`${type}: rejected Web Audio source releases transient focus without stopping the clock`,async({page})=>{
  await mockAudio(page);await setup(page,type);await page.clock.install({time:new Date()})
  await page.evaluate(()=>Object.assign(window,{denyAudioStart:true}))
  if(type==='strength')await b(page,'REST Press after set 1').click();else await b(page,'Start Circuit').click()
  await advance(page,type==='strength'?4000:26000)
  expect(await cueCount(page)).toBe(0);expect(await page.evaluate(()=>(navigator as any).audioSession.type)).toBe('auto')
  if(type==='strength')await expect(page.getByRole('timer')).toHaveText('Rest finished')
  else{await expect(page.getByText('Ready to save',{exact:true})).toBeVisible();expect((await rows(page,'drafts'))[0].interval.results.filter((r:any)=>r.phase.kind==='active')).toHaveLength(2)}
  expect(await rows(page,'activeWorkouts')).toHaveLength(1)
})

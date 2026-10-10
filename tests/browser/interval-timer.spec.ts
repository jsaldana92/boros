import { test, expect, type Page } from '@playwright/test'
const button=(page:Page,name:string)=>page.getByRole('button',{name,exact:true})
async function setup(page:Page,longName=false) {
 const jumping=longName ? 'Jumping Jacks '+'x'.repeat(100) : 'Jumping Jacks'
 await page.goto('./');const notice=button(page,'Understood');if(await notice.isVisible())await notice.click();await button(page,'Create').click()
 for(const [name,active,rest] of [[jumping,'20','10'],['Push-ups','20','10'],['Sprint','20','20'],['Squats','40','20']]) {
  await button(page,'Create exercise').click();await button(page,'Interval').click();await page.getByLabel('Exercise name',{exact:true}).fill(name);await page.getByLabel('Active seconds',{exact:true}).fill(active);await page.getByLabel('Rest seconds',{exact:true}).fill(rest);await button(page,'Save').click();await expect(page.getByRole('article',{name,exact:true})).toBeVisible()
 }
 await button(page,'Create workout').click();await button(page,'Interval').click();await page.getByLabel('Workout name',{exact:true}).fill('Workout A')
 for(const name of [jumping,'Push-ups']){await button(page,'Add exercise').click();await button(page,'Add '+name).click()}
 await page.getByLabel('Rest after circuit seconds',{exact:true}).fill('30');await button(page,'Add circuit').click()
 for(const name of ['Sprint','Squats']){await page.getByRole('region',{name:'Circuit 2',exact:true}).getByRole('button',{name:'Add exercise',exact:true}).click();await button(page,'Add '+name).click()}
 await page.getByLabel('Post-workout rest minutes',{exact:true}).fill('1');await button(page,'Save workout').click();await expect(page.getByRole('article',{name:'Workout Workout A',exact:true})).toBeVisible()
 await button(page,'Train').click();await button(page,'Existing Workout').click();await page.getByRole('article',{name:'Workout Workout A',exact:true}).getByRole('button').click();await expect(page.getByLabel('Continuous workout')).toBeEnabled()
}
async function tick(page:Page,ms:number){await page.clock.fastForward(ms);await page.waitForTimeout(350)}
test('Workout A continuous blocks, sticky/modal one clock, pause/resume, explicit save and actual Calendar review',async({page},info)=>{
 await setup(page);const address=page.url();await page.clock.install({time:new Date()})
 await expect(page.getByLabel('Continuous workout')).not.toBeChecked();await expect(button(page,'Start Circuit')).toHaveCount(2)
 await page.getByLabel('Continuous workout').check();await expect(button(page,'Start')).toHaveCount(2);await button(page,'Start').first().click()
 await expect(page.getByRole('timer')).toContainText('00:10');await expect(page.getByRole('heading',{name:'Warm Up',exact:true})).toBeVisible();await expect(page.getByLabel('Continuous workout')).toBeDisabled()
 await tick(page,10000);await expect(page.getByRole('timer')).toContainText('/ 01:00');await expect(page.locator('.interval-timer-main h3')).toHaveText('Jumping Jacks')
 const ring=await page.locator('.interval-timer-main .timer-progress').getAttribute('stroke-dasharray');await tick(page,20000);await expect(page.locator('.interval-timer-main h3')).toHaveText('Rest');expect(await page.locator('.interval-timer-main .timer-progress').getAttribute('stroke-dasharray')).not.toBe(ring)
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.clock.runFor(50);await expect(page.getByRole('button',{name:'Open timer',exact:true})).toBeVisible();await expect(page.locator('.interval-sticky-main svg')).not.toContainText('00:')
 await button(page,'Pause timer').click();await expect(page.getByRole('status').filter({hasText:'Paused'})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);const paused=await page.getByRole('timer').textContent();await tick(page,60000);await expect(page.getByRole('timer')).toHaveText(paused!)
 await button(page,'Open timer').click();const modal=page.getByRole('dialog',{name:'Timer',exact:true});await expect(modal.getByRole('timer')).toHaveText(paused!);await modal.getByRole('button',{name:'Start',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Running'})).toBeVisible();await modal.getByRole('button',{name:'Close',exact:true}).click();await expect(button(page,'Pause timer')).toBeVisible()
 await tick(page,40000);await expect(page.locator('.interval-sticky-title')).toHaveText('Rest');await expect(page.locator('.interval-sticky-time')).toContainText('/ 04:10')
 await tick(page,30000);await expect(page.locator('.interval-sticky-title')).toHaveText('Sprint');await expect(page.locator('.interval-sticky-time')).toContainText('/ 04:10')
 await tick(page,100000);await button(page,'Open timer').click();await expect(modal.getByRole('heading',{name:'Post-Workout Rest',exact:true})).toBeVisible();await expect(modal.getByRole('timer')).toContainText('/ 01:00');await expect(modal.getByText(/^Next:/)).toHaveText('Next: Workout Complete!')
 await page.screenshot({path:info.outputPath('post-workout-timer.png')});await modal.getByRole('button',{name:'Close',exact:true}).click();await tick(page,60000)
 await expect(page.getByRole('status').filter({hasText:'Ready to save'})).toBeVisible();await expect(page.getByRole('region',{name:'Saved Interval session'})).toHaveCount(0)
 await button(page,'Save').click();await expect(page.getByRole('region',{name:'Saved Interval session'})).toContainText('Complete session');await button(page,'Calendar').click();await page.locator('.calendar-event').filter({hasText:'Workout A'}).first().click();await expect(page.getByRole('dialog')).toContainText('completed');expect(page.url()).toBe(address)
})
test('circuit-only scope, preparation pause/stop, restart confirmation, recovery and mode lock',async({page})=>{
 await setup(page);await page.clock.install({time:new Date()});const one=page.getByRole('region',{name:'Circuit 1',exact:true}),two=page.getByRole('region',{name:'Circuit 2',exact:true})
 await two.getByRole('button',{name:'Start Circuit',exact:true}).scrollIntoViewIfNeeded();await expect(button(page,'Open timer')).toHaveCount(0)
 await two.getByRole('button',{name:'Start Circuit',exact:true}).click();await expect(one.getByRole('button',{name:'Start Circuit',exact:true})).toBeDisabled();await two.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Paused'})).toBeVisible();const p=await two.getByRole('timer').textContent();await tick(page,20000);await expect(two.getByRole('timer')).toHaveText(p!)
 await two.getByRole('button',{name:'Start',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Running'})).toBeVisible();await tick(page,11500);await two.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Paused'})).toBeVisible();const before=await two.getByRole('timer').textContent()
 await page.reload();await button(page,'Train').click();await expect(page.getByRole('region',{name:'Interval training session',exact:true})).toBeVisible();await button(page,'Reload saved timer').click();await expect(two.getByRole('timer')).toHaveText(before!);await expect(page.getByLabel('Continuous workout')).toBeDisabled()
 await two.getByRole('button',{name:'Start',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Running'})).toBeVisible();await tick(page,110000);await expect(page.getByRole('timer')).toHaveCount(0);await expect(page.getByLabel('Continuous workout')).toBeEnabled();await expect(page.getByRole('region',{name:'Post-Workout Rest',exact:true}).getByRole('button',{name:'Start',exact:true})).toBeEnabled()
 await two.getByRole('button',{name:'Start Circuit',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Restart timer?',exact:true});await expect(dialog).toContainText('this circuit');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('timer')).toHaveCount(0)
 await one.getByRole('button',{name:'Start Circuit',exact:true}).click();await expect(one.getByRole('timer')).toContainText('/ 00:10');await one.getByRole('button',{name:'Stop',exact:true}).click();await button(page,'Save').click();await expect(page.getByRole('dialog',{name:'Save partial session?',exact:true})).toBeVisible();await button(page,'Confirm').click();await expect(page.getByRole('region',{name:'Saved Interval session'})).toContainText('Partial session')
})
test('both themes, local cue paths, silent preparation and unchanged rest beep rules, one-circuit mode and denied media',async({page},info)=>{
 const media:string[]=[];page.on('request',r=>{if(r.url().endsWith('.mp3'))media.push(r.url())})
 await page.addInitScript(()=>{Object.defineProperty(window,'AudioContext',{value:undefined,configurable:true});Object.assign(window,{timerSounds:[]});HTMLMediaElement.prototype.play=function(){(window as unknown as {timerSounds:string[]}).timerSounds.push(...(!this.muted && this.volume > 0 ? [this.src] : []));return Promise.reject(new Error('Denied test media'))}})
 await setup(page,true);await button(page,'Settings').click();await button(page,'Light').click();await page.getByRole('group',{name:'Sound',exact:true}).getByRole('button',{name:'On',exact:true}).click();await button(page,'Train').click()
 await page.clock.install({time:new Date()});await page.getByRole('region',{name:'Circuit 1',exact:true}).getByRole('button',{name:'Start Circuit',exact:true}).click();await expect(page.getByRole('timer')).toContainText('/ 00:10')
 await page.screenshot({path:info.outputPath('light-preparation.png')});expect(await page.evaluate(()=>(window as unknown as {timerSounds:string[]}).timerSounds)).toEqual([])
 await page.clock.runFor(10000);await page.waitForTimeout(350);await expect.poll(()=>page.evaluate(()=>(window as unknown as {timerSounds:string[]}).timerSounds.some(s=>s.endsWith('circuit-start.mp3')))).toBe(true)
 if(info.project.name.includes('phone'))await page.setViewportSize({width:320,height:720});await page.screenshot({path:info.outputPath('long-active-name.png')});await tick(page,20000);expect(await page.evaluate(()=>(window as unknown as {timerSounds:string[]}).timerSounds.some(s=>s.endsWith('active-warning.mp3')))).toBe(false)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 for(const file of ['circuit-start.mp3','circuit-5s-warning.mp3','circuit-end.mp3','rest-complete.mp3']){const r=await page.request.get(new URL(file,page.url()).href);expect(r.ok()).toBe(true);expect((await r.body()).length).toBeGreaterThan(1000)}
 expect(media.every(url=>!url.includes('/public/'))).toBe(true)
})

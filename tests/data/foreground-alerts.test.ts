import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID as uid } from 'node:crypto'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { copyExercise } from '../../src/schemas/plan.ts'
import { initialInterval, startInterval, advanceInterval, intervalCommand, intervalStateSchema } from '../../src/schemas/interval-session.ts'
import { IntervalFeedback } from '../../src/features/train/interval-feedback.ts'
import { captureAnalysis } from '../../src/db/analysis.ts'
import { analysisRows, analysisCsv } from '../../src/features/backups/analysis.ts'

const day=(seconds=20,repeat=1)=>{const e=copyExercise({trainingType:'interval',name:'Run',sets:[],tagNames:[],activeSeconds:seconds,recoverySeconds:0});return {id:uid(),name:'Interval',trainingType:'interval' as const,exercises:[e],circuits:[{id:uid(),name:'Circuit 1',repeat,restAfterCircuitSeconds:0,exerciseIds:[e.id]}],postWorkoutRestSeconds:0}}
const begin=(d,at=0,state=initialInterval(d))=>startInterval(state,d,'circuit',d.circuits[0].id,uid(),uid(),true,at)

test('ten-second warning crosses threshold exactly once for 15/20 seconds, never for 14, including repetitions',()=>{
  for(const seconds of [14,15,20]) {
    const d=day(seconds),start=begin(d),threshold=10000+(seconds-10)*1000
    assert.equal(advanceInterval(start,threshold-1).execution!.cues.filter(c=>c.kind==='warning').length,0)
    const crossed=advanceInterval(start,threshold+127),warnings=crossed.execution!.cues.filter(c=>c.kind==='warning')
    assert.equal(warnings.length,seconds>=15?1:0)
    if(warnings.length)assert.equal(Date.parse(warnings[0].at),threshold)
    assert.equal(advanceInterval(crossed,threshold+999).execution!.cues.filter(c=>c.kind==='warning').length,warnings.length)
    const done=advanceInterval(start,10000+seconds*2000);assert.equal(done.execution!.cues.filter(c=>c.kind==='warning').length,seconds>=15?2:0);assert.equal(new Set(done.execution!.cues.map(c=>c.key)).size,done.execution!.cues.length)
    intervalStateSchema.parse(done)
  }
})

test('pause/resume, persisted state and new attempts have the correct warning identities',()=>{
  const d=day(20,0),start=begin(d),paused=intervalCommand(start,'pause',18000)
  assert.equal(advanceInterval(paused,500000).execution!.cues.filter(c=>c.kind==='warning').length,0)
  const resumed=intervalCommand(paused,'resume',500000),crossed=advanceInterval(resumed,502111)
  assert.equal(crossed.execution!.cues.filter(c=>c.kind==='warning').length,1)
  const restored=intervalStateSchema.parse(JSON.parse(JSON.stringify(crossed))),again=advanceInterval(restored,503000);assert.equal(again.execution!.cues.filter(c=>c.kind==='warning').length,1)
  const stopped=intervalCommand(again,'stop',503500),restarted=begin(d,600000,stopped),warned=advanceInterval(restarted,620100)
  assert.equal(warned.execution!.cues.filter(c=>c.kind==='warning').length,1);assert.notEqual(warned.execution!.cues.find(c=>c.kind==='warning')!.key,crossed.execution!.cues.find(c=>c.kind==='warning')!.key)
})

test('Sound Off cancels sound/speech and vibrates once per boundary; hidden or overdue cues are consumed without replay',async t=>{
  t.mock.timers.enable({apis:['Date'],now:0});const d=day(20),run=begin(d),plays:string[]=[],buzz:number[]=[],cancels:string[]=[]
  const audio=(name:string)=>({muted:false,volume:1,currentTime:0,onended:null,onerror:null,pause(){cancels.push(name)},play(){plays.push(name);return Promise.resolve()}})
  const media={start:audio('start'),warning:audio('warning'),end:audio('end'),complete:audio('complete')},speech={cancel(){cancels.push('speech')},getVoices(){return []}} as unknown as SpeechSynthesis,feedback=new IntervalFeedback(media,speech,ms=>buzz.push(ms))
  const tick=(at:number,sound=false,visible=true)=>{t.mock.timers.setTime(at);feedback.update(advanceInterval(run,at),sound,at,visible)}
  tick(0);for(let n=1000;n<=10000;n+=1000)tick(n);assert.deepEqual(buzz,[100]);assert.deepEqual(plays,[])
  tick(10000);tick(11000,true);assert.deepEqual(plays,[],'turning On does not replay the start')
  for(let n=12000;n<=20000;n+=1000)tick(n,true);assert.deepEqual(plays,['warning']);const before=cancels.length;tick(20001,false);assert.ok(cancels.length>before,'Off immediately cancels even with no fresh cue')
  for(let n=21000;n<=30000;n+=1000)tick(n);assert.deepEqual(buzz,[100,100],'end and zero-rest next start form one vibration event')
  for(let n=31000;n<=41000;n+=1000)tick(n,false,false);tick(41100,false,true);tick(41200,true,true);assert.equal(buzz.length,2);assert.equal(plays.length,1)
  for(let n=42000;n<=49000;n+=1000)tick(n,false);tick(60000,false);assert.equal(buzz.length,2,'sleep/time gaps never replay completion')
  const unsupported=new IntervalFeedback(media,speech,()=>{throw Error('unsupported')});unsupported.update(run,false,0);for(let n=1000;n<=10000;n+=1000)assert.doesNotThrow(()=>unsupported.update(advanceInterval(run,n),false,n))
  feedback.cancel();unsupported.cancel();await Promise.resolve()
})

test('Sound is a narrow browser preference: revision/form independence, concurrent settings and failed writes',async t=>{
  const db=new BorosDatabase('boros-test-sound-'+uid());t.after(()=>db.delete());const profiles=profileService(db),workspace=await profiles.initialize(),id=workspace.activeProfileId,original=(await profiles.snapshot(id)).profile
  const unsaved={name:'Unsaved name',age:35,heightCm:170,weightUnit:'kg' as const,heightUnit:'cm' as const}
  await Promise.all([profiles.setSound(true),profiles.setTheme('light')]);assert.deepEqual((await profiles.snapshot(id)).profile,original)
  assert.equal((await profiles.settings())!.sound,true);assert.equal((await profiles.settings())!.theme,'light')
  await profiles.save(id,original.revision,unsaved);assert.equal((await profiles.settings())!.sound,true);assert.equal((await profiles.snapshot(id)).profile.name,'Unsaved name')
  db.close();await db.open();assert.equal((await profiles.settings())!.sound,true)
  const update=db.settings.update.bind(db.settings);db.settings.update=async()=>{throw Error('injected quota failure')};await assert.rejects(profiles.setSound(false),/quota/);db.settings.update=update;assert.equal((await profiles.settings())!.sound,true);await profiles.setSound(false);assert.equal((await profiles.settings())!.sound,false)
  const other=await profiles.create('Other');await profiles.select(other.id);assert.equal((await profiles.settings())!.sound,false)
})

test('CSV uses stored seconds and browser-zone date/time with exact UTC metadata and unchanged set rows',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-01-02T14:00:00Z')})
  const db=new BorosDatabase('boros-test-seconds-'+uid());t.after(()=>db.delete());const id=(await profileService(db).initialize()).activeProfileId,service=sessionService(db)
  const p=await planService(db).save(id,{name:'Seconds',durationWeeks:1,days:[{id:uid(),name:'A',exercises:[copyExercise({name:'Press',sets:Array.from({length:4},()=>({reps:{min:5,max:5}})),tagNames:[]})]}]}),draft=await service.start(id,p.id,p.days[0].id),input=structuredClone(draft.input)
  input.exercises[0].sets.forEach((s,i)=>Object.assign(s,{load:String(i),reps:'5'}));const saved=await service.complete(id,draft.id,draft.revision,input,false,'2026-01-02T14:05:07.123Z')
  const snapshot=await captureAnalysis(id,db)
  for(const [timeZone,date,time] of [['America/New_York','02/01/2026','09:05:07'],['Asia/Tokyo','02/01/2026','23:05:07'],['UTC','02/01/2026','14:05:07']]) {
    const rows=analysisRows({...snapshot,timeZone});assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.set_number),[1,2,3,4]);assert.ok(rows.every(r=>r.time===time&&r.date===date&&r.time_source==='session_completed_at'&&r.performed_at_utc===saved.completedAt));assert.match(analysisCsv({...snapshot,timeZone}).csv,new RegExp(time))
  }
})

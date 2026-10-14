import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID as uid } from 'node:crypto'
import Dexie from 'dexie'
import JSZip from 'jszip'
import Papa from 'papaparse'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { measurementService } from '../../src/db/measurements.ts'
import { measurementDateInput, measurementDate, measurementWallTime, validateTimeContext, filterMeasurements } from '../../src/lib/measurement-dates.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { captureAnalysis } from '../../src/db/analysis.ts'
import { analysisRows, analysisCsv } from '../../src/features/backups/analysis.ts'
import { generateBackup, sha256 } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { restoreService } from '../../src/db/restores.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { csvTables } from '../../src/features/backups/csv.ts'
import { validateBackupData, recordCounts } from '../../src/schemas/backup.ts'
import { representativeProfile, photoBytes } from '../fixtures/backup-profile.ts'

const photo=()=>({blob:new Blob([photoBytes],{type:'image/png'}),width:1,height:1})
const now=new Date('2026-10-13T23:45:16.123Z')
async function setup(t) {
 const db=new BorosDatabase('boros-test-body-'+uid());t.after(()=>db.delete())
 const profiles=profileService(db),id=(await profiles.initialize()).activeProfileId,service=measurementService(db)
 const add=(values,day='2025-01-01',image?)=>service.save(id,uid(),undefined,{...values,...measurementDateInput(day,undefined,now,'America/New_York')},image,uid())
 return {db,id,profiles,service,add}
}

test('weight-only, fat-only and combined records validate decimals and require a metric, never a photo alone',async t=>{
 const f=await setup(t)
 for(const values of [{},{weightKg:0},{bodyFatPercentage:0},{bodyFatPercentage:100},{bodyFatPercentage:-1},{bodyFatPercentage:Infinity},{bodyFatPercentage:NaN},{bodyFatPercentage:'24.5'},{weightKg:70,bodyFatPercentage:0}]) await assert.rejects(f.add(values,'2025-01-01',photo()))
 assert.equal(await f.db.measurements.count(),0);assert.equal(await f.db.photos.count(),0)
 const w=await f.add({weightKg:71.123456789}),fat=await f.add({bodyFatPercentage:24.5}),both=await f.add({weightKg:72,bodyFatPercentage:25.125},undefined,photo())
 assert.equal(w.bodyFatPercentage,undefined);assert.equal(fat.weightKg,undefined);assert.equal(both.bodyFatPercentage,25.125);assert.equal(await f.db.measurements.count(),3)
 await assert.rejects(f.service.save(f.id,both.id,1,{measuredAt:both.measuredAt},undefined,uid()))
 assert.deepEqual(await f.service.get(f.id,both.id),both)
})

test('independent current values, backdates, shared date editing, ties and Settings never copy body fat',async t=>{
 const f=await setup(t),both=await f.add({weightKg:70,bodyFatPercentage:24.5},'2025-03-10'),w=await f.add({weightKg:71},'2025-03-11'),fat=await f.add({bodyFatPercentage:23},'2025-03-12')
 await f.add({weightKg:90,bodyFatPercentage:30},'2024-01-01')
 assert.equal((await f.profiles.latestWeight(f.id))!.id,w.id);assert.equal((await f.service.latest(f.id,'bodyFatPercentage'))!.id,fat.id)
 const edited=await f.service.save(f.id,fat.id,1,{bodyFatPercentage:23,...measurementDateInput('2025-02-01',fat)},undefined,uid())
 assert.equal(edited.loggedAt,fat.loggedAt);assert.equal((await f.service.latest(f.id,'bodyFatPercentage'))!.id,both.id)
 assert.equal(filterMeasurements(await f.service.list(f.id),{start:'2025-02-01',end:'2025-02-01'})[0].id,fat.id)
 const tied=await f.service.save(f.id,'ffffffff-ffff-4fff-8fff-ffffffffffff',undefined,{bodyFatPercentage:26,...measurementDateInput('2025-03-10',both)},undefined,uid())
 assert.equal((await f.service.latest(f.id,'bodyFatPercentage'))!.id,tied.id)
 const profile=await f.profiles.getProfile(f.id);await f.profiles.save(f.id,profile.revision,{name:'',weightKg:69.125,weightUnit:'kg',heightUnit:'cm'})
 const settingsWeight=await f.profiles.latestWeight(f.id);assert.equal(settingsWeight!.weightKg,69.125);assert.equal(settingsWeight!.bodyFatPercentage,undefined);assert.equal((await f.service.latest(f.id,'bodyFatPercentage'))!.id,tied.id)
 const moved=await f.service.save(f.id,both.id,1,{...both,weightKg:68,...measurementDateInput('2025-04-01',both)},undefined,uid())
 assert.equal(moved.measuredLocal,'2025-04-01T12:00:00.000');assert.equal(moved.bodyFatPercentage,24.5);assert.equal(moved.loggedAt,both.loggedAt)
})

test('date-only input respects zone/date boundaries, noon provenance, DST gaps/folds and preserved legacy time',()=>{
 const n=measurementDateInput('2026-10-13',undefined,now,'Asia/Tokyo');assert.equal(n.measuredAt,'2026-10-13T03:00:00.000Z');assert.equal(n.timeSource,'date_only_noon');validateTimeContext(n)
 const exact=measurementDateInput('2026-10-14',undefined,now,'Asia/Tokyo');assert.equal(exact.measuredAt,now.toISOString());assert.equal(exact.timeSource,'device_clock')
 const late=measurementWallTime('2025-01-01T23:45:16.123','America/New_York');assert.equal(late.measuredAt,'2025-01-02T04:45:16.123Z');validateTimeContext(late)
 const initial={id:uid(),profileId:uid(),weightKg:70,loggedAt:now.toISOString(),...late}
 const summer=measurementDateInput('2025-07-01',initial);assert.equal(summer.measuredAt,'2025-07-02T03:45:16.123Z');assert.equal(summer.offsetMinutes,240);assert.equal(summer.timeSource,'legacy_preserved_time');validateTimeContext(summer)
 const fold=measurementWallTime('2025-11-02T01:30:00.123','America/New_York',300);assert.equal(fold.measuredAt,'2025-11-02T06:30:00.123Z');assert.equal(measurementDateInput('2025-11-02',{...initial,...fold}).measuredAt,fold.measuredAt)
 assert.equal(measurementWallTime('2025-11-02T01:30:00.123','America/New_York').measuredAt,'2025-11-02T05:30:00.123Z')
 const early={...initial,...measurementWallTime('2025-01-01T02:30:00.000','America/New_York')};assert.throws(()=>measurementDateInput('2025-03-09',early),/clock changes/)
 assert.throws(()=>measurementDateInput('2025-02-29',undefined,now,'UTC'),/valid date/)
 assert.throws(()=>measurementDateInput('2011-12-30',undefined,now,'Pacific/Apia'),/clock changes/)
 const legacy={id:uid(),profileId:uid(),weightKg:70,loggedAt:now.toISOString(),measuredAt:'2025-01-01T23:12:34.567Z'}
 const moved=measurementDateInput('2024-12-31',legacy);assert.equal(moved.measuredAt,'2024-12-31T23:12:34.567Z');assert.equal(moved.timeZone,'UTC');assert.equal(measurementDate(moved),'2024-12-31');validateTimeContext(moved)
})

test('metric deletion, shared photo references, stale edits, failed writes and profile ownership remain transactional',async t=>{
 const f=await setup(t),both=await f.add({weightKg:70,bodyFatPercentage:24.5},undefined,photo()),other=await f.profiles.create('Other')
 await assert.rejects(f.service.save(other.id,both.id,1,both,undefined,uid()),/deleted/)
 await f.service.remove(other.id,both.id,1,'weightKg');assert.deepEqual(await f.service.get(f.id,both.id),both)
 const revision=(await f.profiles.getProfile(f.id)).revision,fail=()=>{throw Error('Injected storage failure')};f.db.profiles.hook('updating',fail)
 await assert.rejects(f.service.remove(f.id,both.id,1,'weightKg'),/Injected/);f.db.profiles.hook('updating').unsubscribe(fail)
 assert.deepEqual(await f.service.get(f.id,both.id),both);assert.equal((await f.profiles.getProfile(f.id)).revision,revision)
 await f.service.remove(f.id,both.id,1,'weightKg');const kept=await f.service.get(f.id,both.id);assert.equal(kept.weightKg,undefined);assert.equal(kept.bodyFatPercentage,24.5);assert.equal(kept.photoId,both.photoId);assert.equal(kept.measuredAt,both.measuredAt);assert.equal(await f.profiles.latestWeight(f.id),undefined)
 await assert.rejects(f.service.save(f.id,both.id,1,both,undefined,uid()),/changed in another tab/)
 const added=await f.service.save(f.id,both.id,2,{...kept,weightKg:69.123456789},undefined,uid());assert.equal(added.weightKg,69.123456789)
 const shared=await f.add({bodyFatPercentage:25});await f.db.measurements.update([f.id,shared.id],{photoId:both.photoId})
 await f.service.remove(f.id,both.id,3,'bodyFatPercentage');const weight=await f.service.get(f.id,both.id);assert.equal(weight.bodyFatPercentage,undefined);assert.equal(weight.weightKg,69.123456789)
 await f.service.remove(f.id,both.id,4,'weightKg');assert.equal(await f.db.photos.count(),1)
 const clearedPhoto=await f.service.save(f.id,shared.id,1,shared,null,uid());assert.equal(clearedPhoto.photoId,undefined);assert.equal(await f.db.photos.count(),0)
 await f.service.remove(f.id,shared.id,2,'bodyFatPercentage');assert.equal(await f.db.measurements.count(),0)
})

test('analysis CSV exports one row per shared historical measurement, numeric fat and selected dates, without exercise loads or blobs',async t=>{
 const f=await setup(t);await f.add({weightKg:70,bodyFatPercentage:24.5},'2025-01-01',photo());await f.add({bodyFatPercentage:25},'2025-01-02');await f.add({weightKg:71},'2025-01-03')
 const foreign=await f.profiles.create('Private');await f.service.save(foreign.id,uid(),undefined,{weightKg:999,measuredAt:now.toISOString()},undefined,uid())
 const before=await f.service.list(f.id),snapshot=await captureAnalysis(f.id,f.db),result=analysisCsv(snapshot),rows=Papa.parse(result.csv,{header:true}).data as Record<string,string>[]
 assert.equal(result.count,3);assert.equal(rows[0].record_type,'measurement');assert.equal(rows[0].body_fat_percentage,'24.5');assert.equal(rows[0].measurement_date,'01/01/2025');assert.equal(rows[0].time,'12:00:00');assert.equal(rows[0].time_source,'date_only_noon');assert.equal(rows[0].body_weight_unit,'kg')
 assert.equal(rows[1].body_weight,'None');assert.equal(rows[1].body_weight_unit,'None');assert.equal(rows[2].body_fat_percentage,'None');assert.ok(rows.every(r=>r.weight==='NA'&&r.l_r_distinction==='NA'&&r.reps==='NA'))
 assert.equal('photos' in snapshot,false);assert.deepEqual(await f.service.list(f.id),before)
 const p=await f.profiles.getProfile(f.id);await f.profiles.save(f.id,p.revision,{name:'=private',weightUnit:'lb',heightUnit:'cm'});const pounds=analysisRows(await captureAnalysis(f.id,f.db));assert.equal(pounds[0].body_weight,'154.323584');assert.equal(pounds[0].body_weight_unit,'lb');assert.ok(analysisCsv(await captureAnalysis(f.id,f.db)).csv.includes("'=private"))
})

test('ZIP export/restore/export preserves association, time metadata, precision, photos and independent current values; merges honor explicit clears',async t=>{
 const f=await setup(t),both=await f.add({weightKg:70.123456789,bodyFatPercentage:24.5},'2025-01-01',photo()),fat=await f.add({bodyFatPercentage:22.75},'2025-02-01')
 const original=await captureProfile(f.id,f.db),backup=await readBackup((await generateBackup(original,'body-test')).bytes,()=>{},async()=>{})
 assert.equal(backup.manifest.backupSchemaVersion,22);assert.equal(backup.manifest.databaseSchemaVersion,16);assert.equal(backup.manifest.csvRows['csv/progress.csv'],2);assert.equal(csvTables(backup.data).length,40)
 const restores=restoreService(f.db,async()=>{}),preview=await restores.preview(backup,'new','Restored metrics');const id=await restores.commit(preview,true),reexport=await readBackup((await generateBackup(await captureProfile(id,f.db),'body-test')).bytes,()=>{},async()=>{})
 assert.deepEqual(reexport.data.measurements.map(({profileId:_profileId,...m})=>m),backup.data.measurements.map(({profileId:_profileId,...m})=>m));assert.deepEqual(await reexport.photos[0].blob.arrayBuffer(),await backup.photos[0].blob.arrayBuffer())
 assert.equal((await f.profiles.latestWeight(id))!.id,both.id);assert.equal((await f.service.latest(id,'bodyFatPercentage'))!.id,fat.id)
 const changed=structuredClone(backup);delete changed.data.measurements.find(m=>m.id===both.id)!.bodyFatPercentage
 const merged=await buildRestorePlan(changed,original,'import',uid(),'Guest',now.toISOString());assert.equal(merged.result.measurements.find(m=>m.id===both.id)!.bodyFatPercentage,undefined);assert.equal(merged.result.measurements.find(m=>m.id===fat.id)!.bodyFatPercentage,22.75)
 const local=await buildRestorePlan(changed,original,'device',uid(),'Guest',now.toISOString());assert.equal(local.result.measurements.find(m=>m.id===both.id)!.bodyFatPercentage,24.5)
})

test('strict original v21 weight-only ZIP promotes without fabricated fat; a legacy merge cannot express a body-fat clear',async t=>{
 const f=await setup(t),w=await f.add({weightKg:70}),snapshot=await captureProfile(f.id,f.db),exported=await generateBackup(snapshot,'legacy-test'),data=canonicalSnapshot(snapshot)
 data.backupSchemaVersion=21;data.measurements.forEach(m=>delete m.timeSource);validateBackupData(data)
 const tables=csvTables(data),payload=[['data.json',JSON.stringify(data)],...tables.map(t=>[t.path,t.text])],zip=new JSZip()
 const manifest={...exported.manifest,backupSchemaVersion:21,databaseSchemaVersion:15,counts:recordCounts(data),csvRows:Object.fromEntries(tables.map(t=>[t.path,t.rows])),inventory:await Promise.all(payload.map(async([path,text])=>({path,bytes:new TextEncoder().encode(text).length,sha256:await sha256(new TextEncoder().encode(text)),mediaType:path.endsWith('.csv')?'text/csv':'application/json'})))}
 payload.forEach(([path,text])=>zip.file(path,text,{createFolders:false}));zip.file('manifest.json',JSON.stringify(manifest))
 const restored=await readBackup(await zip.generateAsync({type:'uint8array'}));assert.equal(restored.manifest.backupSchemaVersion,21);assert.equal(restored.data.backupSchemaVersion,22);assert.equal(restored.data.measurements[0].bodyFatPercentage,undefined)
 const invalid=structuredClone(data);invalid.measurements[0].bodyFatPercentage=24.5;assert.throws(()=>validateBackupData(invalid),/bodyFatPercentage/)
 await f.service.save(f.id,w.id,1,{...w,bodyFatPercentage:24.5},undefined,uid());const independent=await f.add({bodyFatPercentage:22},'2025-01-02')
 const merge=await buildRestorePlan(restored,await captureProfile(f.id,f.db),'import',uid(),'Guest',now.toISOString());assert.equal(merge.result.measurements.find(m=>m.id===w.id)!.bodyFatPercentage,24.5);assert.equal(merge.result.measurements.find(m=>m.id===independent.id)!.bodyFatPercentage,22);assert.ok(merge.warnings.some(w=>w.includes('Existing body fat is retained')))
})

test('v15 to v16 preserves every existing record, selection, precise weights, dates and photo bytes',async t=>{
 const f=await setup(t);await representativeProfile(f.db)
 const all=async(db)=>Promise.all(db.tables.map(async table=>[table.name,await Promise.all((await table.toArray()).map(async r=>r.blob?{...r,blob:[...new Uint8Array(await r.blob.arrayBuffer())]}:r))]))
 // The previous version could not write body-fat/time-source fields.
 await f.db.measurements.toCollection().modify(m=>{delete m.timeSource})
 const previous=new Dexie('boros-test-body-v15-'+uid());t.after(()=>previous.delete());previous.version(15).stores(Object.fromEntries(f.db.tables.map(table=>[table.name,[table.schema.primKey.src,...table.schema.indexes.map(i=>i.src)].join(',')])));await previous.open()
 for(const table of f.db.tables)await previous.table(table.name).bulkPut(await table.toArray());const before=await all(previous);previous.close()
 const next=new BorosDatabase(previous.name);t.after(()=>next.close());await next.open();assert.equal(next.verno,16);assert.deepEqual(await all(next),before);assert.ok((await next.measurements.toArray()).every(m=>m.bodyFatPercentage===undefined))
})

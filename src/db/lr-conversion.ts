import { db, type BorosDatabase } from './database.ts'
import { createId } from '../lib/browser-crypto.ts'
import { exerciseResolver } from '../lib/exercise-identity.ts'
import { templateReference } from '../lib/template-ownership.ts'
import { convertInput, convertRecorded, inputRows, lrMode, recordedRows, actualSide, type Conversion } from '../schemas/strength-results.ts'
import type { TrainingDay } from '../schemas/plan.ts'
import type { PlanExercise } from '../schemas/plan.ts'
import type { SessionDraft, CompletedSession } from '../schemas/session.ts'
import { assessSession } from '../schemas/session.ts'

export type LRTarget = { id: string; mode: boolean }
export type LRApprovals = Record<string, string>
export type LRPreview = LRTarget & { token: string; name: string; results: number; unresolved: number; conflict?: boolean }
export class LRConfirmationError extends Error {
  preview: LRPreview
  constructor(preview: LRPreview) { super('Review the updated L/R conversion before saving. Your input is kept.'); this.preview = preview }
}
export const lrTables = (d: BorosDatabase) => [d.profiles,d.exercises,d.workouts,d.plans,d.schedules,d.drafts,d.sessions,d.deletedSources]
const stores = ['workouts','plans','schedules','drafts','sessions'] as const
type Store = typeof stores[number]
function days(record: any, store: Store): TrainingDay[] {
  return store === 'workouts' ? [record] : store === 'plans' ? record.days : store === 'schedules' ? [...record.revisions.flatMap((r: any) => r.days), ...(record.outcomes ?? []).map((r: any) => r.day)] : [record.day]
}
export function lrTargets(dayList: TrainingDay[]): LRTarget[] {
  return dayList.flatMap(d => d.exercises.flatMap(e => { const id = templateReference(e);return id && e.prescription.trainingType !== 'interval' ? [{id,mode:lrMode(e.prescription)}] : [] }))
}
async function inspect(database: BorosDatabase, profileId: string, targets: LRTarget[], forceReview: boolean) {
  if (!await database.profiles.get(profileId)) throw new Error('This profile is unavailable. Nothing was changed.')
  const library = await database.exercises.where('profileId').equals(profileId).toArray(), deleted = await database.deletedSources.where('profileId').equals(profileId).toArray()
  const resolve = exerciseResolver(profileId,[...library,...deleted.filter(t=>t.kind==='exercise')]), wanted = new Map<string,boolean>()
  for (const target of targets) {
    const id=resolve(target.id), source=library.find(e=>e.id===id)
    if (!source) continue // Deleted and unlinked copies retain their snapshots.
    if (source.trainingType === 'interval') throw new Error('L/R Distinction applies to Strength exercises only.')
    if (wanted.has(id) && wanted.get(id)!==target.mode) throw new Error(`Choose one L/R Distinction mode for all linked copies of ${source.name}.`)
    wanted.set(id,target.mode)
  }
  const affected = new Map([...wanted].filter(([id,mode])=>lrMode(library.find(e=>e.id===id)!)!==mode))
  const records = Object.fromEntries(await Promise.all(stores.map(async name=>[name,await database[name].where('profileId').equals(profileId).toArray()]))) as Record<Store,any[]>
  const linked = (day: TrainingDay,id: string) => day.exercises.filter(e=>{const ref=templateReference(e);return e.prescription.trainingType!=='interval' && !!ref && resolve(ref)===id})
  const previews: LRPreview[] = [...affected].map(([id,mode])=>{
    const selected=Object.fromEntries(stores.map(name=>[name,records[name].filter(record=>days(record,name).some(day=>linked(day,id).length))]))
    let results=0,unresolved=0
    for (const record of records.sessions as CompletedSession[]) {
      for (const e of linked(record.day,id)) if (record.exercises.find(x=>x.id===e.id)?.sets.some(s=>recordedRows(s).some(r=>actualSide(r.result)||r.result.skipped&&!r.result.unrecorded))) results++
      unresolved+=record.day.exercises.filter(e=>!templateReference(e)).length
    }
    for (const record of records.drafts as SessionDraft[]) if (!record.finalizedAt) for(const e of linked(record.day,id)) if(record.input.exercises.find(x=>x.id===e.id)?.sets.some(s=>inputRows(s).some(r=>r.result.load||r.result.reps||r.result.rir||r.result.skipped))) results++
    const source=library.find(e=>e.id===id)!
    return {id,mode,name:source.name,results,unresolved,conflict:forceReview,token:JSON.stringify([id,mode,library.filter(e=>resolve(e.id)===id),selected])}
  })
  return {previews,records,library,linked,resolve}
}
export async function previewLR(profileId: string, target: LRTarget, database = db) {
  return database.transaction('r',lrTables(database),async()=> (await inspect(database,profileId,[target],false)).previews[0])
}
export async function resolveLRReferences(profileId: string, exercises: PlanExercise[], database = db) {
  return database.transaction('r',database.exercises,database.deletedSources,async()=>{
    const resolve=exerciseResolver(profileId,[...await database.exercises.where('profileId').equals(profileId).toArray(),...(await database.deletedSources.where('profileId').equals(profileId).toArray()).filter(t=>t.kind==='exercise')])
    return Object.fromEntries(exercises.flatMap(e=>{const id=templateReference(e);return id?[[id,resolve(id)]]:[]}))
  })
}
// Caller owns the transaction. Validate every preview before the first mutation,
// so one conversion cannot invalidate a second approval in the same atomic save.
export async function applyLRConversions(database: BorosDatabase, profileId: string, targets: LRTarget[], approvals: LRApprovals = {}, forceReview = false) {
  const {previews,records,library,linked,resolve}=await inspect(database,profileId,targets,forceReview)
  for(const preview of previews) if((preview.results || forceReview) && approvals[preview.id]!==preview.token) throw new LRConfirmationError(preview)
  if(!previews.length)return
  const changedRecords = convertLRRecords(records, previews, linked, new Date().toISOString())
  for (const store of stores) for (const record of changedRecords[store]) await database.table(store).put(record)
  for(const exercise of library) {
    const preview=previews.find(p=>p.id===resolve(exercise.id))
    if(preview) await database.exercises.put({...exercise,lrDistinction:preview.mode,revision:exercise.revision+1} as typeof exercise)
  }
}

// Shared by editor saves and the reviewed restore preview; never mutates IndexedDB itself.
export function convertLRRecords(records: Record<Store, any[]>, previews: LRTarget[], linked: (day: TrainingDay, id: string) => PlanExercise[], at: string) {
  const changedRecords = { workouts: [], plans: [], schedules: [], drafts: [], sessions: [] } as Record<Store, any[]>
  const provenance=new Map(previews.map(p=>[p.id,{operationId:createId(),convertedAt:at,fromMode:p.mode?'no':'lr'} satisfies Conversion]))
  for(const store of stores) for(const record of records[store]) {
    let changed=false
    for(const day of days(record,store)) for(const preview of previews) for(const exercise of linked(day,preview.id)) {
      if(exercise.prescription.trainingType === 'interval') continue
      if(lrMode(exercise.prescription) === preview.mode) continue
      exercise.prescription={...exercise.prescription,lrDistinction:preview.mode};changed=true
      if(store==='drafts') {const input=(record as SessionDraft).input.exercises.find(e=>e.id===exercise.id);if(input)input.sets=input.sets.map(s=>convertInput(s,preview.mode,provenance.get(preview.id)!))}
      if(store==='sessions') {const input=(record as CompletedSession).exercises.find(e=>e.id===exercise.id);if(input)input.sets=input.sets.map(s=>convertRecorded(s,preview.mode,provenance.get(preview.id)!))}
    }
    // Preserve performance/edit timestamps; conversion provenance owns its time.
    if(changed) {
      if(store==='sessions') {
        const finalized=records.drafts.find(d=>d.id===record.draftId&&d.finalizedAt)
        if(finalized) {const assessed=assessSession(finalized.input);record.exercises=assessed.exercises;record.partial=assessed.skipped>0}
      }
      record.revision++; changedRecords[store].push(record)
    }
  }
  return changedRecords
}

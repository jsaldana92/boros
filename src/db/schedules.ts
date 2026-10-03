import { createId } from '../lib/browser-crypto.ts'
import { z } from 'zod'
import { db, type BorosDatabase } from './database.ts'
import { appendRevision, dateSchema, mappingSchema, occurrences, scheduleEnd, scheduleInputSchema, validateMapping, type Mapping, type Occurrence, type Schedule, type ScheduleInput } from '../schemas/schedule.ts'
import { localToday, nextMonday, weekday } from '../lib/calendar-dates.ts'
import type { CompletedSession, SessionDraft } from '../schemas/session.ts'

export interface ScheduleChange { scheduleId: string; revision: number; effectiveFrom: string; kind: 'remap' | 'stop' | 'duration'; mapping: Mapping }
export interface ChangePreview { change: ScheduleChange; fingerprint: string; conflicts: { id: string; date: string; name: string }[]; planName: string; startWeek: string; durationWeeks?: number; endDate?: string }
export interface CalendarEvent extends Occurrence { session?: CompletedSession; draft?: SessionDraft; retained?: boolean }
export function scheduleService(database: BorosDatabase) {
  const tables = [database.profiles, database.plans, database.schedules, database.drafts, database.sessions]
  const owner = async (id: string) => { if (!await database.profiles.get(id)) throw new Error('This profile is unavailable.') }
  const get = async (profileId: string, id: string) => { const value = await database.schedules.get([profileId, id]); if (!value) throw new Error('This schedule is unavailable in this profile.'); return value }
  const preview = async (profileId: string, raw: ScheduleChange): Promise<ChangePreview> => {
    await owner(profileId)
    const change = z.object({ scheduleId: z.string().uuid(), revision: z.number().int().positive(), effectiveFrom: dateSchema, kind: z.enum(['remap', 'stop', 'duration']), mapping: z.array(z.object({ dayId: z.string().uuid(), weekday: z.number().int().min(0).max(6) }).strict()).max(7) }).strict().parse(raw), schedule = await get(profileId, change.scheduleId)
    if (schedule.revision !== change.revision) throw new Error('This schedule changed. Cancel and reopen it before making a new preview.')
    if (schedule.stoppedFrom) throw new Error('This schedule is already stopped.')
    dateSchema.parse(change.effectiveFrom)
    const today = localToday(schedule.timeZone), earliest = change.kind === 'stop' ? today : nextMonday(today)
    if (change.effectiveFrom < earliest || change.effectiveFrom < schedule.startWeek) throw new Error(`Effective date must be on or after ${earliest > schedule.startWeek ? earliest : schedule.startWeek}.`)
    const plan = await database.plans.get([profileId, schedule.planId])
    if (!plan) throw new Error('The source plan is unavailable.')
    if (change.kind === 'duration' && weekday(change.effectiveFrom) !== 0) throw new Error('Duration changes must begin on a Monday.')
    if (change.kind === 'remap') {
      mappingSchema.parse(change.mapping)
      if (weekday(change.effectiveFrom) !== 0) throw new Error('Mapping changes must begin on a Monday.')
      validateMapping(change.mapping, plan.days)
    }
    const drafts = (await database.drafts.where('profileId').equals(profileId).toArray()).filter((draft) => !draft.finalizedAt && draft.occurrence?.scheduleId === schedule.id && draft.occurrence.scheduledDate >= change.effectiveFrom).sort((a, b) => a.id.localeCompare(b.id))
    const boundary = change.kind === 'duration' ? { durationWeeks: plan.durationWeeks, endDate: scheduleEnd(schedule.startWeek, plan.durationWeeks) } : schedule.durationChanges?.at(-1) ?? schedule
    return { change, planName: plan.name, startWeek: schedule.startWeek, durationWeeks: boundary.durationWeeks, endDate: boundary.endDate, fingerprint: JSON.stringify([schedule.revision, plan.revision, drafts.map((draft) => [draft.id, draft.revision])]), conflicts: drafts.map((draft) => ({ id: draft.id, date: draft.occurrence!.scheduledDate, name: draft.day.name })) }
  }
  return {
    get,
    async library(profileId: string) { return database.transaction('r', tables, async () => { await owner(profileId); return { schedules: await database.schedules.where('profileId').equals(profileId).toArray(), plans: await database.plans.where('profileId').equals(profileId).toArray() } }) },
    async create(profileId: string, raw: ScheduleInput, id = createId()) {
      const input = scheduleInputSchema.parse(raw); z.string().uuid().parse(id)
      return database.transaction('rw', tables, async () => {
        await owner(profileId)
        const committed = await database.schedules.get([profileId, id]); if (committed) return committed
        const plan = await database.plans.get([profileId, input.planId])
        if (!plan || plan.archivedAt) throw new Error('Choose an active plan.')
        if (plan.revision !== input.planRevision) throw new Error('The plan changed after your preview. Cancel and reopen Add Plan.')
        validateMapping(input.mapping, plan.days)
        const now = new Date().toISOString()
        const endDate = scheduleEnd(input.startWeek, plan.durationWeeks)
        const schedule: Schedule = { id, profileId, planId: plan.id, revision: 1, startWeek: input.startWeek, ...(endDate ? { durationWeeks: plan.durationWeeks, endDate } : {}), timeZone: input.timeZone, createdAt: now, updatedAt: now, revisions: [{ id: createId(), effectiveFrom: input.startWeek, createdAt: now, planRevision: plan.revision, planName: plan.name, days: structuredClone(plan.days), mapping: input.mapping }] }
        await database.schedules.add(schedule); return schedule
      })
    },
    async preview(profileId: string, change: ScheduleChange) { return database.transaction('r', tables, () => preview(profileId, change)) },
    async commit(profileId: string, proposed: ChangePreview, keepStarted: boolean) {
      return database.transaction('rw', tables, async () => {
        const fresh = await preview(profileId, proposed.change)
        if (fresh.fingerprint !== proposed.fingerprint) throw new Error('The plan or a started session changed after preview. Preview again before saving. Your input is kept.')
        if (fresh.conflicts.length && !keepStarted) throw new Error('Confirm keeping already-started sessions on their original dates before saving.')
        const change = fresh.change, schedule = await get(profileId, change.scheduleId), now = new Date().toISOString()
        let result = { ...schedule, revision: schedule.revision + 1, updatedAt: now }
        if (change.kind === 'stop') result.stoppedFrom = change.effectiveFrom
        else if (change.kind === 'duration') result.durationChanges = [...(schedule.durationChanges ?? []).filter((item) => item.effectiveFrom < change.effectiveFrom), { id: createId(), effectiveFrom: change.effectiveFrom, ...(fresh.durationWeeks === undefined ? {} : { durationWeeks: fresh.durationWeeks, endDate: fresh.endDate }) }]
        else {
          const plan = (await database.plans.get([profileId, schedule.planId]))!
          result = { ...result, revisions: appendRevision(schedule, { id: createId(), effectiveFrom: change.effectiveFrom, createdAt: now, planRevision: plan.revision, planName: plan.name, days: structuredClone(plan.days), mapping: change.mapping }) }
        }
        await database.schedules.put(result); return result
      })
    },
    async events(profileId: string, start: string, end: string, zone?: string): Promise<CalendarEvent[]> {
      dateSchema.parse(start); dateSchema.parse(end)
      return database.transaction('r', tables, async () => {
        await owner(profileId)
        const schedules = (await database.schedules.where('profileId').equals(profileId).toArray()).filter((item) => !zone || item.timeZone === zone)
        const events = new Map<string, CalendarEvent>(schedules.flatMap((item) => occurrences(item, start, end)).map((item) => [item.ref.key, item]))
        const drafts = await database.drafts.where('profileId').equals(profileId).toArray(), logs = await database.sessions.where('profileId').equals(profileId).toArray()
        // Started/completed snapshots remain visible even after a future remap or stop.
        for (const record of [...drafts.filter((item) => !item.finalizedAt), ...logs]) {
          const ref = record.occurrence
          if (!ref || (zone && ref.timeZone !== zone) || ref.scheduledDate < start || ref.scheduledDate > end) continue
          const generated = events.get(ref.key)
          events.set(ref.key, { ref, planId: record.sourcePlanId, planName: record.planName, day: record.day, retained: !generated || generated.ref.scheduleRevisionId !== ref.scheduleRevisionId, ...('completedAt' in record ? { session: record } : { draft: record }) })
        }
        return [...events.values()].sort((a, b) => a.ref.scheduledDate.localeCompare(b.ref.scheduledDate) || a.planName.localeCompare(b.planName))
      })
    },
  }
}
export const schedules = scheduleService(db)

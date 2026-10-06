import { db, type BorosDatabase } from './database.ts'
import { scheduleService } from './schedules.ts'
import { assertCalendarAssignment } from './calendar-assignment.ts'
import { runLifecycle } from '../lib/run-progress.ts'
import { createId } from '../lib/browser-crypto.ts'
import { localToday, monday } from '../lib/calendar-dates.ts'
import { appendRevision, revisionAt, scheduleInputSchema, validateMapping, type Mapping, type OccurrenceRef, type ScheduleInput } from '../schemas/schedule.ts'
import { z } from 'zod'
import { linkActivePlan } from './active-plans.ts'

export interface StagedPlan { id: string; input: ScheduleInput }
export interface Reassignment { profileId: string; runId: string; revision: number; mapping: Mapping; effectiveFrom: string; fingerprint: string; protectedCount: number }
export function calendarRunService(database: BorosDatabase) {
  const tables = [database.profiles, database.plans, database.schedules, database.drafts, database.sessions]
  const inspect = async (profileId: string, runId: string, revision: number, mapping?: Mapping) => {
    const run = await database.schedules.get([profileId, runId])
    if (!await database.profiles.get(profileId) || !run) throw new Error('This profile or plan run is unavailable.')
    if (run.revision !== revision) throw new Error('This run changed. Cancel and reopen Edit; your selections are kept.')
    const sessions = (await database.sessions.where('profileId').equals(profileId).toArray()).filter((s) => s.occurrence?.scheduleId === runId)
    const drafts = (await database.drafts.where('profileId').equals(profileId).toArray()).filter((d) => d.occurrence?.scheduleId === runId)
    if (runLifecycle(run, sessions).previous) throw new Error('This run has ended. Add the plan as a new run to continue.')
    const effectiveFrom = [run.startWeek, monday(localToday(run.timeZone))].sort().at(-1)!
    const source = revisionAt(run, effectiveFrom) ?? run.revisions.at(-1)!
    if (mapping) validateMapping(mapping, source.days, source.weeks)
    // Persist references, not reconstructed dates. An opened draft is protected
    // even before its first input, and future recorded work is retained too.
    const protectedRefs = new Map<string, OccurrenceRef>()
    for (const ref of [...(run.occurrenceExceptions ?? []), ...sessions.map((s) => s.occurrence!), ...drafts.map((d) => d.occurrence!), ...(run.outcomes ?? []).filter((o) => o.status !== 'pending').map((o) => o.ref)]) {
      if (ref.scheduledWeek >= effectiveFrom) protectedRefs.set(`${ref.scheduledWeek}/${ref.dayId}`, ref)
    }
    const proposal: Reassignment = { profileId, runId, revision, mapping: structuredClone(mapping ?? source.mapping), effectiveFrom, fingerprint: JSON.stringify([run, sessions, drafts]), protectedCount: protectedRefs.size }
    return { run, source, protectedRefs, proposal }
  }
  return {
    async addBatch(profileId: string, pending: StagedPlan[]) {
      if (!pending.length) throw new Error('Select at least one plan.')
      const batch = pending.map((p) => ({ id: z.string().uuid().parse(p.id), input: scheduleInputSchema.parse(p.input) }))
      if (new Set(batch.map((p) => p.id)).size !== batch.length || new Set(batch.map((p) => p.input.planId)).size !== batch.length) throw new Error('Select each plan once.')
      return database.transaction('rw', tables, async () => {
        if (!await database.profiles.get(profileId)) throw new Error('This profile is unavailable.')
        const runs = await database.schedules.where('profileId').equals(profileId).toArray(), sessions = await database.sessions.where('profileId').equals(profileId).toArray()
        const committed = batch.map((p) => runs.find((r) => r.id === p.id))
        if (committed.every(Boolean)) {
          if (committed.some((r, i) => r!.planId !== batch[i].input.planId || r!.startWeek !== batch[i].input.startWeek || r!.timeZone !== batch[i].input.timeZone || r!.revisions[0].planRevision !== batch[i].input.planRevision || JSON.stringify(r!.revisions[0].mapping) !== JSON.stringify(batch[i].input.mapping))) throw new Error('This save identity was already used. Reopen Add Plan.')
          for (const run of committed) if (!runLifecycle(run!, sessions).previous) await linkActivePlan(database, profileId, run!.planId)
          return committed.map((r) => r!)
        }
        if (committed.some(Boolean)) throw new Error('This selection changed after saving. Reopen Add Plan.')
        for (const item of batch) {
          if (runs.some((run) => run.planId === item.input.planId && !runLifecycle(run, sessions).previous)) throw new Error('This plan already has an active run. Use Current Plans → Edit to schedule it. Your pending selections are kept.')
          const plan = await database.plans.get([profileId, item.input.planId])
          if (!plan || plan.archivedAt) throw new Error('A selected plan is unavailable or archived. Remove it from the selection.')
          if (plan.revision !== item.input.planRevision) throw new Error('A selected plan changed. Edit its pending configuration before saving.')
          validateMapping(item.input.mapping, plan.days, plan.weeks)
        }
        const saved = []
        for (const item of batch) { saved.push(await scheduleService(database).create(profileId, item.input, item.id)); await linkActivePlan(database, profileId, item.input.planId) }
        return saved
      })
    },
    beginEdit: (profileId: string, runId: string, revision: number) => database.transaction('r', tables, async () => (await inspect(profileId, runId, revision)).proposal),
    previewEdit: (profileId: string, runId: string, revision: number, mapping: Mapping) => database.transaction('r', tables, async () => (await inspect(profileId, runId, revision, mapping)).proposal),
    async edit(proposed: Reassignment) {
      return database.transaction('rw', tables, async () => {
        const { run, source, protectedRefs, proposal } = await inspect(proposed.profileId, proposed.runId, proposed.revision, proposed.mapping)
        if (proposal.fingerprint !== proposed.fingerprint || proposal.effectiveFrom !== proposed.effectiveFrom) throw new Error('This plan or its results changed while editing. Cancel and reopen Edit to review the latest data. Your input is kept.')
        const now = new Date().toISOString()
        // Mark old unscheduled segments before removing the run-level flag.
        // Historical records keep their original unscheduled identity forever.
        const base = { ...run, revisions: run.revisions.map((r) => run.kind === 'unscheduled' ? { ...r, unscheduled: true as const } : r) }
        const { unscheduled: _oldKind, effectiveUntil: _oldEnd, ...snapshot } = source
        const next = { ...base, kind: undefined, revision: run.revision + 1, updatedAt: now,
          occurrenceExceptions: [...(run.occurrenceExceptions ?? []).filter((ref) => ref.scheduledWeek < proposal.effectiveFrom), ...protectedRefs.values()],
          revisions: appendRevision(base, { ...snapshot, id: createId(), createdAt: now, effectiveFrom: proposal.effectiveFrom, mapping: proposal.mapping, needsRepair: false }),
        }
        await assertCalendarAssignment(database, next)
        await database.schedules.put(next); return next
      })
    },
  }
}
export const calendarRuns = calendarRunService(db)

import { db, type BorosDatabase } from './database.ts'
import { localToday, monday } from '../lib/calendar-dates.ts'
import { occurrences, revisionAt, scheduleEnd, type OccurrenceRef, type Schedule } from '../schemas/schedule.ts'
import { runLifecycle } from '../lib/run-progress.ts'
import { createId } from '../lib/browser-crypto.ts'
import { assertCalendarAssignment } from './calendar-assignment.ts'

export interface RunActionPreview { profileId: string; runId: string; revision: number; fingerprint: string; draftCount: number; stopsCalendar: boolean; restartWeek?: string; ref?: OccurrenceRef }
export function runActionService(database: BorosDatabase) {
  const tables = [database.profiles, database.schedules, database.drafts, database.sessions, database.restTimers]
  const inspect = async (profileId: string, runId: string, revision: number, ref?: OccurrenceRef) => {
    const profile = await database.profiles.get(profileId), run = await database.schedules.get([profileId, runId])
    if (!profile || !run) throw new Error('This profile or plan run is unavailable.')
    if (run.revision !== revision) throw new Error('This run changed. Close and reopen the action before confirming.')
    const drafts = (await database.drafts.where('profileId').equals(profileId).toArray()).filter((draft) => draft.occurrence?.scheduleId === run.id && draft.sourcePlanId === run.planId && (!ref || draft.occurrenceKey === ref.key))
    const sessions = (await database.sessions.where('profileId').equals(profileId).toArray()).filter((session) => session.occurrence?.scheduleId === run.id && session.sourcePlanId === run.planId && (!ref || session.occurrenceKey === ref.key))
    if (ref && (ref.scheduleId !== run.id || ![...occurrences(run, ref.scheduledDate, ref.scheduledDate).map((item) => item.ref.key), ...(run.outcomes ?? []).map((item) => item.ref.key), ...drafts.map((item) => item.occurrenceKey), ...sessions.map((item) => item.occurrenceKey)].includes(ref.key))) throw new Error('This occurrence changed. Reopen the workout.')
    const preview: RunActionPreview = { profileId, runId, revision, fingerprint: JSON.stringify([run, drafts, sessions]), draftCount: drafts.filter((draft) => !draft.finalizedAt).length, stopsCalendar: run.kind !== 'unscheduled' && !run.closedAt && (!run.stoppedFrom || run.stoppedFrom > localToday(run.timeZone)) && (!(run.durationChanges?.at(-1) ?? run).endDate || (run.durationChanges?.at(-1) ?? run).endDate! >= localToday(run.timeZone)), ...(ref ? { ref: structuredClone(ref) } : {}) }
    preview.restartWeek = monday(localToday(run.timeZone))
    return { profile, run, drafts, sessions, preview }
  }
  const stopTimers = async (profileId: string, ids: string[]) => {
    const timer = await database.restTimers.get('active')
    if (timer?.profileId === profileId && ids.includes(timer.draftId)) await database.restTimers.delete('active')
  }
  return {
    preview: (profileId: string, runId: string, revision: number, ref?: OccurrenceRef) => database.transaction('r', tables, async () => (await inspect(profileId, runId, revision, ref)).preview),
    async resetRun(proposed: RunActionPreview) {
      if (proposed.ref) throw new Error('Reset Plan applies to a whole run.')
      return database.transaction('rw', tables, async () => {
        const { run, drafts, sessions, preview } = await inspect(proposed.profileId, proposed.runId, proposed.revision)
        if (preview.fingerprint !== proposed.fingerprint || preview.restartWeek !== proposed.restartWeek) throw new Error('Results or the restart week changed after preview. Reopen Reset; nothing was deleted.')
        if (runLifecycle(run, sessions).previous) throw new Error('This run has ended. It cannot be reset.')
        const now = new Date().toISOString(), startWeek = monday(localToday(run.timeZone)), duration = (run.durationChanges?.at(-1) ?? run).durationWeeks
        const prescription = revisionAt(run, localToday(run.timeZone)) ?? run.revisions.at(-1)!
        const { effectiveUntil: _until, unscheduled: _kind, ...source } = prescription
        const next: Schedule = { id: run.id, profileId: run.profileId, planId: run.planId, revision: run.revision + 1, timeZone: run.timeZone, startWeek, createdAt: run.createdAt, updatedAt: now,
          ...(run.kind ? { kind: run.kind } : {}), ...(run.identity ? { identity: run.identity } : {}),
          ...(duration === undefined ? {} : { durationWeeks: duration, endDate: scheduleEnd(startWeek, duration) }),
          revisions: [{ ...source, id: createId(), createdAt: now, effectiveFrom: startWeek, needsRepair: false }],
        }
        await database.drafts.bulkDelete(drafts.map((d) => [d.profileId, d.id]))
        await database.sessions.bulkDelete(sessions.map((s) => [s.profileId, s.id]))
        await stopTimers(run.profileId, [...drafts.map((d) => d.id), ...sessions.map((s) => s.draftId)])
        // Evaluate the restarted run against its cleared progress. Old completed
        // results must not make the candidate look historical and skip the guard.
        await assertCalendarAssignment(database, next)
        await database.schedules.put(next); return next
      })
    },
    async setHidden(profileId: string, runId: string, revision: number, hidden: boolean) {
      return database.transaction('rw', tables, async () => {
        const { run, sessions } = await inspect(profileId, runId, revision)
        if (!runLifecycle(run, sessions).previous) throw new Error('Only previous runs can be hidden.')
        const now = new Date().toISOString(), next = { ...run, hiddenAt: hidden ? now : undefined, revision: run.revision + 1, updatedAt: now }
        await database.schedules.put(next); return next
      })
    },
    async deletePrevious(proposed: RunActionPreview) {
      if (proposed.ref) throw new Error('Delete Plan applies to a whole run.')
      return database.transaction('rw', tables, async () => {
        const { run, drafts, sessions, preview } = await inspect(proposed.profileId, proposed.runId, proposed.revision)
        if (preview.fingerprint !== proposed.fingerprint) throw new Error('Results changed after preview. Review Delete again; nothing was deleted.')
        if (!runLifecycle(run, sessions).previous) throw new Error('End this active run before deleting its history.')
        await database.drafts.bulkDelete(drafts.map((d) => [d.profileId, d.id]))
        await database.sessions.bulkDelete(sessions.map((s) => [s.profileId, s.id]))
        await stopTimers(run.profileId, [...drafts.map((d) => d.id), ...sessions.map((s) => s.draftId)])
        // Notes, outcomes, and assignments are embedded in these owned records.
        // Avatar/progress photos belong to profiles/measurements, never to a run.
        await database.schedules.delete([run.profileId, run.id])
      })
    },
    async reset(proposed: RunActionPreview) {
      if (!proposed.ref) throw new Error('Choose an occurrence to reset.')
      return database.transaction('rw', tables, async () => {
        const { run, drafts, sessions, preview } = await inspect(proposed.profileId, proposed.runId, proposed.revision, proposed.ref)
        if (preview.fingerprint !== proposed.fingerprint) throw new Error('Results changed after preview. Reopen Reset; nothing was deleted.')
        await database.drafts.bulkDelete(drafts.map((item) => [item.profileId, item.id]))
        await database.sessions.bulkDelete(sessions.map((item) => [item.profileId, item.id]))
        await stopTimers(proposed.profileId, [...drafts.map((item) => item.id), ...sessions.map((item) => item.draftId)])
        await database.schedules.put({ ...run, outcomes: (run.outcomes ?? []).filter((item) => item.ref.key !== proposed.ref!.key), revision: run.revision + 1, updatedAt: new Date().toISOString() })
      })
    },
    async leave(proposed: RunActionPreview) {
      if (proposed.ref) throw new Error('Leave applies to a whole run.')
      return database.transaction('rw', tables, async () => {
        if ((await database.schedules.get([proposed.profileId, proposed.runId]))?.closedAt) return // Idempotent committed retry.
        const { profile, run, drafts, sessions, preview } = await inspect(proposed.profileId, proposed.runId, proposed.revision)
        if (preview.fingerprint !== proposed.fingerprint) throw new Error('This run or its drafts changed after preview. Review Leave Plan again; nothing was deleted.')
        const unfinished = drafts.filter((draft) => !draft.finalizedAt && !sessions.some((session) => session.draftId === draft.id))
        const now = new Date().toISOString(), cutoff = localToday(run.timeZone)
        await database.schedules.put({ ...run, closedAt: now, stoppedFrom: run.stoppedFrom && run.stoppedFrom < cutoff ? run.stoppedFrom : cutoff, revision: run.revision + 1, updatedAt: now })
        await database.drafts.bulkDelete(unfinished.map((draft) => [draft.profileId, draft.id]))
        await stopTimers(profile.id, drafts.map((draft) => draft.id))
        // A template card can represent several independent open runs. Keep the
        // others selectable; the closed run itself is never offered again.
        const logs = await database.sessions.where('profileId').equals(profile.id).toArray()
        const others = (await database.schedules.where('[profileId+planId]').equals([profile.id, run.planId]).toArray()).filter((item) => item.id !== run.id && !runLifecycle(item, logs).previous)
        if (!others.length) await database.profiles.put({ ...profile, selectedPlanIds: (profile.selectedPlanIds ?? []).filter((id) => id !== run.planId), revision: profile.revision + 1, updatedAt: now })
      })
    },
  }
}
export const runActions = runActionService(db)

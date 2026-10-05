import { planInstructionsSnapshot } from '../schemas/plan.ts'
import { assertCalendarAssignment } from './calendar-assignment.ts'
import { runLifecycle } from '../lib/run-progress.ts'
import { db, type BorosDatabase } from './database.ts'
import { createId } from '../lib/browser-crypto.ts'
import { addDays, browserZone, localToday, monday } from '../lib/calendar-dates.ts'
import { dateSchema, occurrences, programEnd, type OccurrenceRef, type Schedule } from '../schemas/schedule.ts'

export interface MovePreview { scheduleId: string; revision: number; week: string; direction: 1 | -1; fingerprint: string; next: Schedule }
export function weeklyService(database: BorosDatabase) {
  const tables = [database.profiles, database.plans, database.schedules, database.drafts, database.sessions]
  const owner = async (id: string) => { const value = await database.profiles.get(id); if (!value) throw new Error('This profile is unavailable.'); return value }
  const run = async (profileId: string, id: string, revision?: number) => {
    await owner(profileId)
    const value = await database.schedules.get([profileId, id])
    if (!value) throw new Error('This program is unavailable in this profile.')
    if (revision !== undefined && value.revision !== revision) throw new Error('This program changed in another tab. Close and reopen the action before trying again.')
    return value
  }
  const activate = async (profileId: string, planId: string) => {
    const profile = await owner(profileId), plan = await database.plans.get([profileId, planId])
    if (!plan || plan.archivedAt) throw new Error('Choose an active plan.')
    const existing = await database.schedules.where('[profileId+planId]').equals([profileId, planId]).toArray()
    const logs = await database.sessions.where('profileId').equals(profileId).toArray()
    const open = existing.filter((run) => !runLifecycle(run, logs).previous)
    if (open.length) return open
    const timeZone = profile.timeZone ?? browserZone(), startWeek = monday(localToday(timeZone)), now = new Date().toISOString()
    const value: Schedule = { id: createId(), profileId, planId, revision: 1, kind: 'unscheduled', identity: 'program-week', timeZone, startWeek, createdAt: now, updatedAt: now, ...(plan.durationWeeks === undefined ? {} : { durationWeeks: plan.durationWeeks, endDate: programEnd(startWeek, plan.durationWeeks) }), revisions: [{ id: createId(), effectiveFrom: startWeek, createdAt: now, planRevision: plan.revision, planName: plan.name, ...planInstructionsSnapshot(plan.instructions), days: structuredClone(plan.days), mapping: plan.days.map((day, weekday) => ({ dayId: day.id, weekday })) }] }
    await database.schedules.add(value); return [value]
  }
  const preview = async (profileId: string, id: string, revision: number, week: string, direction: 1 | -1): Promise<MovePreview> => {
    dateSchema.parse(week)
    if (monday(week) !== week || ![1, -1].includes(direction)) throw new Error('Choose a program week and move direction.')
    const value = await run(profileId, id, revision)
    if (value.closedAt || value.stoppedFrom) throw new Error('A stopped program cannot be moved.')
    if (!occurrences(value, week, addDays(week, 6)).length) throw new Error('Choose an active program week. Excluded weeks have no training to move.')
    const previous = addDays(week, -7), gaps = value.excludedWeeks ?? []
    if (direction === -1 && previous >= value.startWeek && !gaps.includes(previous)) throw new Error('The previous week is not free. Only an excluded gap or the week before the program starts can be reused.')
    const from = direction === -1 ? previous : week
    const drafts = (await database.drafts.where('profileId').equals(profileId).toArray()).filter((item) => item.occurrence?.scheduleId === id && item.occurrence.scheduledWeek >= from)
    const logs = (await database.sessions.where('profileId').equals(profileId).toArray()).filter((item) => item.occurrence?.scheduleId === id && item.occurrence.scheduledWeek >= from)
    if (drafts.length || logs.length || value.outcomes?.some((item) => item.ref.scheduledWeek >= from)) throw new Error('This move would cross recorded sessions, outcome markers or drafts. Keep those weeks in place; no data was changed.')
    const next = structuredClone(value), shift = (date: string) => date >= week ? addDays(date, direction * 7) : date
    next.excludedWeeks = direction === 1 ? [...gaps.map(shift), week].sort() : gaps.filter((gap) => gap !== previous).map(shift).sort()
    if (direction === -1 && week === value.startWeek) next.startWeek = previous
    next.revisions = next.revisions.map((item) => ({ ...item, effectiveFrom: shift(item.effectiveFrom), ...(item.effectiveUntil ? { effectiveUntil: shift(item.effectiveUntil) } : {}) }))
    next.endDate = programEnd(next.startWeek, next.durationWeeks, next.excludedWeeks)
    if (next.durationChanges) next.durationChanges = next.durationChanges.map((change) => ({ ...change, effectiveFrom: shift(change.effectiveFrom), endDate: programEnd(next.startWeek, change.durationWeeks, next.excludedWeeks) }))
    return { scheduleId: id, revision, week, direction, fingerprint: JSON.stringify(value), next }
  }
  return {
    async activate(profileId: string, planId: string) { return database.transaction('rw', tables, () => activate(profileId, planId)) },
    async addPlan(profileId: string, planId: string) {
      return database.transaction('rw', tables, async () => {
        const profile = await owner(profileId)
        await activate(profileId, planId)
        if (profile.selectedPlanIds?.includes(planId)) return profile
        const next = { ...profile, selectedPlanIds: [...(profile.selectedPlanIds ?? []), planId], revision: profile.revision + 1, updatedAt: new Date().toISOString() }
        await database.profiles.put(next); return next
      })
    },
    async removePlan(profileId: string, planId: string) {
      return database.transaction('rw', tables, async () => {
        const profile = await owner(profileId)
        await database.profiles.put({ ...profile, selectedPlanIds: (profile.selectedPlanIds ?? []).filter((id) => id !== planId), revision: profile.revision + 1, updatedAt: new Date().toISOString() })
      })
    },
    async outcome(profileId: string, ref: OccurrenceRef, revision: number, status: 'skipped' | 'completed' | 'pending') {
      return database.transaction('rw', tables, async () => {
        if (!['skipped', 'completed', 'pending'].includes(status)) throw new Error('Choose a supported outcome.')
        const value = await run(profileId, ref.scheduleId)
        if (value.closedAt) throw new Error('This plan run was left; its outcomes are historical.')
        const prior = value.outcomes?.find((item) => item.ref.key === ref.key)
        // A retry of the exact committed state is harmless; other stale intent fails.
        if (prior?.status === status && value.revision === revision + 1) return value
        if (value.revision !== revision) throw new Error('This program changed. Close and reopen the day before changing its status.')
        const session = await database.sessions.where('[profileId+occurrenceKey]').equals([profileId, ref.key]).first()
        const draft = await database.drafts.where('[profileId+occurrenceKey]').equals([profileId, ref.key]).first()
        if (session) throw new Error('This day has a saved session. Review its results; a marker cannot overwrite it.')
        if (draft) throw new Error('This day has a draft. Resume it, or explicitly discard that draft before changing status.')
        const event = occurrences(value, ref.scheduledDate, ref.scheduledDate).find((item) => item.ref.key === ref.key)
        if (!event && !prior) throw new Error('This occurrence changed. Reopen the program week.')
        const now = new Date().toISOString()
        const source = prior?.status === 'pending' ? event ?? prior : prior ?? event!
        const outcome = { id: prior?.id ?? createId(), ref: structuredClone(source.ref), day: structuredClone(source.day), planName: source.planName, ...planInstructionsSnapshot(source.planInstructions), status, recordedAt: prior?.recordedAt ?? now, updatedAt: now, revision: (prior?.revision ?? 0) + 1 }
        const next = { ...value, outcomes: [...(value.outcomes ?? []).filter((item) => item.ref.key !== ref.key), outcome], revision: value.revision + 1, updatedAt: now }
        await database.schedules.put(next); return next
      })
    },
    async discardDraft(profileId: string, draftId: string, revision: number) {
      return database.transaction('rw', [...tables, database.restTimers], async () => {
        await owner(profileId)
        const draft = await database.drafts.get([profileId, draftId])
        if (!draft || draft.revision !== revision || draft.finalizedAt || await database.sessions.get([profileId, draftId])) throw new Error('The draft changed or has a saved session. Nothing was discarded.')
        await database.drafts.delete([profileId, draftId])
        const timer = await database.restTimers.get('active')
        if (timer?.profileId === profileId && timer.draftId === draftId) await database.restTimers.delete('active')
      })
    },
    async previewMove(profileId: string, id: string, revision: number, week: string, direction: 1 | -1) { return database.transaction('r', tables, () => preview(profileId, id, revision, week, direction)) },
    async move(profileId: string, proposed: MovePreview) {
      return database.transaction('rw', tables, async () => {
        const fresh = await preview(profileId, proposed.scheduleId, proposed.revision, proposed.week, proposed.direction)
        if (fresh.fingerprint !== proposed.fingerprint) throw new Error('The program changed after preview. Preview again.')
        const now = new Date().toISOString(), next = { ...fresh.next, revision: fresh.revision + 1, updatedAt: now, weekMoves: [...(fresh.next.weekMoves ?? []), { id: createId(), fromWeek: fresh.week, direction: fresh.direction, recordedAt: now }] }
        await assertCalendarAssignment(database, next)
        await database.schedules.put(next); return next
      })
    },
  }
}
export const weekly = weeklyService(db)

import { createId } from '../lib/browser-crypto.ts'
import { db, type BorosDatabase } from './database.ts'
import { z } from 'zod'
import { daySchema, roundCount, trainingBlocks } from '../schemas/plan.ts'
import { occurrences, occurrenceKey, dateSchema } from '../schemas/schedule.ts'
import { assessSession, blankSession, timerEnd, validateDraftInput, type CompletedSession, type RestTimer, type SessionDraft, type SessionInput } from '../schemas/session.ts'

export function sessionService(database: BorosDatabase) {
  const tables = [database.profiles, database.drafts, database.sessions, database.restTimers]
  const owner = async (profileId: string) => { const profile = await database.profiles.get(profileId); if (!profile) throw new Error('This profile is unavailable. Nothing was saved.'); return profile }
  const draft = async (profileId: string, id: string) => { const value = await database.drafts.get([profileId, id]); if (!value) throw new Error('This draft is unavailable in this profile.'); return value }
  const editable = (value: SessionDraft, revision: number) => {
    if (value.finalizedAt) throw new Error('This session is already completed. Review its saved details; this draft cannot be changed.')
    if (value.revision !== revision) throw new Error('This draft changed in another tab. Your input is kept. Copy anything needed, then reload the saved draft.')
  }
  const stopOwned = async (profileId: string, draftId: string) => { const timer = await database.restTimers.get('active'); if (timer?.profileId === profileId && timer.draftId === draftId) await database.restTimers.delete('active') }
  return {
    getDraft: draft,
    async openOccurrence(profileId: string, scheduleId: string, dayId: string, date: string) {
      dateSchema.parse(date)
      return database.transaction('rw', [...tables, database.schedules], async () => {
        const profile = await owner(profileId), key = occurrenceKey(scheduleId, dayId, date)
        const session = await database.sessions.where('[profileId+occurrenceKey]').equals([profileId, key]).first()
        if (session) return { session }
        const existing = await database.drafts.where('[profileId+occurrenceKey]').equals([profileId, key]).first()
        if (existing) return { draft: existing }
        const schedule = await database.schedules.get([profileId, scheduleId])
        const event = schedule && occurrences(schedule, date, date).find((item) => item.ref.dayId === dayId)
        if (!event) throw new Error('This occurrence changed or needs mapping repair. Refresh Calendar.')
        const now = new Date().toISOString(), day = daySchema.parse(structuredClone(event.day))
        const value: SessionDraft = { id: createId(), profileId, revision: 1, sourcePlanId: event.planId, sourceDayId: dayId, occurrence: event.ref, occurrenceKey: key, activeSourceKey: `scheduled:${key}`, planName: event.planName, day, input: blankSession(day, profile.weightUnit), startedAt: now, updatedAt: now }
        await database.drafts.add(value); return { draft: value }
      })
    },
    async library(profileId: string) {
      return database.transaction('r', [...tables, database.plans, database.schedules], async () => {
        await owner(profileId)
        const timer = await database.restTimers.get('active')
        return { schedules: await database.schedules.where('profileId').equals(profileId).toArray(), plans: (await database.plans.where('profileId').equals(profileId).toArray()).filter((plan) => !plan.archivedAt), drafts: (await database.drafts.where('profileId').equals(profileId).toArray()).filter((item) => !item.finalizedAt), sessions: (await database.sessions.where('profileId').equals(profileId).toArray()).sort((a, b) => b.completedAt.localeCompare(a.completedAt)), timer: timer?.profileId === profileId ? timer : undefined }
      })
    },
    async start(profileId: string, planId: string, dayId: string) {
      return database.transaction('rw', [...tables, database.plans], async () => {
        const profile = await owner(profileId), key = `${planId}:${dayId}`
        const existing = await database.drafts.where('[profileId+activeSourceKey]').equals([profileId, key]).first()
        if (existing) return existing
        const plan = await database.plans.get([profileId, planId]), source = plan?.days.find((day) => day.id === dayId)
        if (!plan || plan.archivedAt || !source) throw new Error('This saved training day is unavailable. Choose an active plan.')
        const day = daySchema.parse(structuredClone(source)), now = new Date().toISOString()
        const result: SessionDraft = { id: createId(), profileId, revision: 1, sourcePlanId: planId, sourceDayId: dayId, activeSourceKey: key, planName: plan.name, day, input: blankSession(day, profile.weightUnit), startedAt: now, updatedAt: now }
        await database.drafts.add(result); return result
      })
    },
    async update(profileId: string, id: string, revision: number, raw: SessionInput) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId); const value = await draft(profileId, id); editable(value, revision)
        const result = { ...value, input: validateDraftInput(raw, value.day), revision: value.revision + 1, updatedAt: new Date().toISOString() }
        await database.drafts.put(result); return result
      })
    },
    async clear(profileId: string, id: string, revision: number) {
      return database.transaction('rw', tables, async () => {
        const profile = await owner(profileId), value = await draft(profileId, id); editable(value, revision)
        const result = { ...value, input: blankSession(value.day, profile.weightUnit), revision: value.revision + 1, updatedAt: new Date().toISOString() }
        await stopOwned(profileId, id); await database.drafts.put(result); return result
      })
    },
    async complete(profileId: string, id: string, revision: number, raw: SessionInput, allowPartial: boolean, completedAt = new Date().toISOString()) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId)
        const committed = await database.sessions.get([profileId, id]); if (committed) return committed
        const value = await draft(profileId, id); editable(value, revision)
        const input = validateDraftInput(raw, value.day), assessed = assessSession(input)
        if (Object.keys(assessed.errors).length) throw new Error('Correct partially entered or invalid sets, or explicitly skip them.')
        if (!assessed.recorded) throw new Error('Record at least one valid set before saving a session.')
        if (assessed.skipped && !allowPartial) throw new Error('Confirm saving a partial session with omitted sets marked skipped.')
        z.string().datetime().parse(completedAt)
        if (Date.parse(completedAt) < Date.parse(value.startedAt)) throw new Error('Completion time must be no earlier than the session start.')
        const loggedAt = new Date().toISOString()
        if (value.occurrenceKey) {
          const existing = await database.sessions.where('[profileId+occurrenceKey]').equals([profileId, value.occurrenceKey]).first()
          if (existing) return existing
        }
        const result: CompletedSession = { id, draftId: id, profileId, revision: 1, sourcePlanId: value.sourcePlanId, sourceDayId: value.sourceDayId, ...(value.occurrence ? { occurrence: structuredClone(value.occurrence), occurrenceKey: value.occurrenceKey } : {}), planName: value.planName, day: structuredClone(value.day), notes: input.notes, exercises: assessed.exercises, partial: assessed.skipped > 0, startedAt: value.startedAt, completedAt, loggedAt }
        await database.sessions.add(result)
        await database.drafts.put({ ...value, input, finalizedAt: completedAt, activeSourceKey: undefined, updatedAt: loggedAt, revision: value.revision + 1 })
        await stopOwned(profileId, id); return result
      })
    },
    async startTimer(profileId: string, draftId: string, revision: number, exerciseId: string, setIndex: number, manualSeconds?: number) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId); const value = await draft(profileId, draftId); editable(value, revision)
        const index = value.day.exercises.findIndex((exercise) => exercise.id === exerciseId), exercise = value.day.exercises[index]
        if (exercise?.groupId) throw new Error('Use the superset round rest, not a member rest.')
        if (!exercise || !Number.isInteger(setIndex) || setIndex < 0 || setIndex >= exercise.prescription.sets.length) throw new Error('This rest position is unavailable.')
        const afterExercise = setIndex === exercise.prescription.sets.length - 1
        if (afterExercise && index === value.day.exercises.length - 1) throw new Error('There is no next exercise for this rest.')
        const seconds = (afterExercise ? exercise.prescription.restAfterSeconds : exercise.prescription.restBetweenSeconds) ?? manualSeconds
        if (seconds === undefined) throw new Error('Enter a rest duration in seconds.')
        const endAt = timerEnd(seconds)
        if (seconds === 0) { await stopOwned(profileId, draftId); return undefined }
        const timer: RestTimer = { id: 'active', token: createId(), profileId, draftId, label: `${exercise.prescription.name}: ${afterExercise ? 'between exercises' : `after set ${setIndex + 1}`}`, durationSeconds: seconds, endAt }
        await database.restTimers.put(timer); return timer
      })
    },
    async startGroupTimer(profileId: string, draftId: string, revision: number, groupId: string, round: number, manualSeconds?: number) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId); const value = await draft(profileId, draftId); editable(value, revision)
        const blocks = trainingBlocks(value.day), index = blocks.findIndex((block) => block.group?.id === groupId), block = blocks[index]
        if (!block?.group || !Number.isInteger(round) || round < 0 || round >= roundCount(block.members)) throw new Error('This superset rest position is unavailable.')
        const after = round === roundCount(block.members) - 1
        const seconds = (after ? block.group.restAfterGroupSeconds : block.group.restBetweenRoundsSeconds) ?? manualSeconds
        if (seconds === undefined) throw new Error('Enter a rest duration in seconds.')
        const endAt = timerEnd(seconds)
        if (seconds === 0) { await stopOwned(profileId, draftId); return undefined }
        const timer: RestTimer = { id: 'active', token: createId(), profileId, draftId, label: `Superset ${block.group.number}: ${after ? 'after group' : `after round ${round + 1}`}`, durationSeconds: seconds, endAt }
        await database.restTimers.put(timer); return timer
      })
    },
    async changeTimer(profileId: string, draftId: string, token: string, action: 'stop' | 'reset') {
      return database.transaction('rw', tables, async () => {
        await owner(profileId); const value = await draft(profileId, draftId); editable(value, value.revision)
        const timer = await database.restTimers.get('active')
        if (!timer || timer.profileId !== profileId || timer.draftId !== draftId || timer.token !== token) throw new Error('This timer changed or is unavailable in this session.')
        if (action === 'stop') await database.restTimers.delete('active')
        else await database.restTimers.put({ ...timer, token: createId(), endAt: timerEnd(timer.durationSeconds) })
      })
    },
  }
}
export const sessions = sessionService(db)

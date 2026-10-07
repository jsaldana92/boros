import { exerciseToInput } from './exercises.ts'
import { copyExercise } from '../schemas/plan.ts'
import { workoutService } from './workouts.ts'
import { copyWorkout } from '../schemas/workout.ts'
import { duplicateDay } from '../schemas/plan.ts'
import { nameKey } from '../schemas/profile.ts'
import { browserZone } from '../lib/calendar-dates.ts'
import { initialStructure, sessionRounds, validateAmendment, type SessionSnapshot } from '../schemas/session-structure.ts'
import { planInstructionsSnapshot } from '../schemas/plan.ts'
import { previousResults } from '../lib/previous-results.ts'
import { monday } from '../lib/calendar-dates.ts'
import type { WeightUnit } from '../schemas/profile.ts'
import { createId } from '../lib/browser-crypto.ts'
import { db, type BorosDatabase } from './database.ts'
import { z } from 'zod'
import { daySchema, trainingBlocks } from '../schemas/plan.ts'
import { occurrences, occurrenceKey, dateSchema, programWeek } from '../schemas/schedule.ts'
import { assessSession, blankSession, timerEnd, validateDraftInput, type CompletedSession, type RestTimer, type SessionDraft, type SessionInput } from '../schemas/session.ts'

export function sessionService(database: BorosDatabase) {
  const tables = [database.profiles, database.drafts, database.sessions, database.restTimers, database.schedules, database.exercises, database.tags, database.workouts, database.deletedSources]
  const owner = async (profileId: string) => { const profile = await database.profiles.get(profileId); if (!profile) throw new Error('This profile is unavailable. Nothing was saved.'); return profile }
  const draft = async (profileId: string, id: string) => { const value = await database.drafts.get([profileId, id]); if (!value) throw new Error('This draft is unavailable in this profile.'); return value }
  const editable = async (value: SessionDraft, revision: number) => {
    if (value.occurrence && (await database.schedules.get([value.profileId, value.occurrence.scheduleId]))?.closedAt) throw new Error('This plan run was left. Its drafts cannot be resumed or saved.')
    if (value.finalizedAt) throw new Error('This session is already completed. Review its saved details; this draft cannot be changed.')
    if (value.revision !== revision) throw new Error('This draft changed in another tab. Your input is kept. Copy anything needed, then reload the saved draft.')
  }
  const stopOwned = async (profileId: string, draftId: string) => { const timer = await database.restTimers.get('active'); if (timer?.profileId === profileId && timer.draftId === draftId) await database.restTimers.delete('active') }
  return {
    getDraft: async (profileId: string, id: string) => database.transaction('r', tables, async () => { const value = await draft(profileId, id); if (!value.finalizedAt) await editable(value, value.revision); return value }),
    async openOccurrence(profileId: string, scheduleId: string, dayId: string, date: string, expectedRunRevision?: number) {
      dateSchema.parse(date)
      return database.transaction('rw', [...tables, database.schedules], async () => {
        const profile = await owner(profileId), schedule = await database.schedules.get([profileId, scheduleId])
        if (!schedule) throw new Error('This program is unavailable.')
        if (expectedRunRevision !== undefined && schedule.revision !== expectedRunRevision) throw new Error('This program changed. Reopen the workout.')
        const event = schedule && occurrences(schedule, date, date).find((item) => item.ref.dayId === dayId)
        const key = event?.ref.key ?? occurrenceKey(scheduleId, dayId, date, schedule.identity ? programWeek(schedule, monday(date)) : undefined)
        if (schedule?.outcomes?.some((item) => item.ref.key === key && item.status !== 'pending')) throw new Error('This day has an explicit outcome. Correct its marker in Train before starting a session.')
        const session = await database.sessions.where('[profileId+occurrenceKey]').equals([profileId, key]).first()
        if (session) return { session }
        if (schedule.closedAt) throw new Error('This plan run was left. Add the plan again to start a new run.')
        const existing = await database.drafts.where('[profileId+occurrenceKey]').equals([profileId, key]).first()
        if (existing) return { draft: existing }
        if (!event) throw new Error('This occurrence changed or needs mapping repair. Refresh Calendar.')
        const now = new Date().toISOString(), day = daySchema.parse(structuredClone(event.day))
        const value: SessionDraft = { id: createId(), profileId, revision: 1, sourcePlanId: event.planId, sourceDayId: dayId, occurrence: event.ref, occurrenceKey: key, activeSourceKey: `scheduled:${key}`, planName: event.planName, ...planInstructionsSnapshot(event.planInstructions), day, structure: initialStructure(day), input: blankSession(day, profile.weightUnit), startedAt: now, updatedAt: now }
        await database.drafts.add(value); return { draft: value }
      })
    },
    async library(profileId: string) {
      return database.transaction('r', [...tables, database.plans, database.schedules], async () => {
        await owner(profileId)
        const timer = await database.restTimers.get('active'), runs = await database.schedules.where('profileId').equals(profileId).toArray()
        return { schedules: runs, plans: await database.plans.where('profileId').equals(profileId).toArray(), drafts: (await database.drafts.where('profileId').equals(profileId).toArray()).filter((item) => !item.finalizedAt && !runs.some((run) => run.id === item.occurrence?.scheduleId && run.closedAt)), sessions: (await database.sessions.where('profileId').equals(profileId).toArray()).sort((a, b) => b.completedAt.localeCompare(a.completedAt)), timer: timer?.profileId === profileId ? timer : undefined }
      })
    },
    async hints(value: SessionDraft, unit: WeightUnit) {
      return database.transaction('r', tables, async () => {
        await owner(value.profileId)
        return previousResults(value, await database.sessions.where('profileId').equals(value.profileId).toArray(), unit)
      })
    },
    async start(profileId: string, planId: string, dayId: string) {
      return database.transaction('rw', [...tables, database.plans], async () => {
        const profile = await owner(profileId), key = `${planId}:${dayId}`
        const existing = await database.drafts.where('[profileId+activeSourceKey]').equals([profileId, key]).first()
        if (existing) return existing
        const plan = await database.plans.get([profileId, planId]), source = plan?.days.find((day) => day.id === dayId)
        if (!plan || plan.archivedAt || !source) throw new Error('This saved workout is unavailable. Choose an active plan.')
        const day = daySchema.parse(structuredClone(source)), now = new Date().toISOString()
        const result: SessionDraft = { id: createId(), profileId, revision: 1, sourcePlanId: planId, sourceDayId: dayId, activeSourceKey: key, planName: plan.name, ...planInstructionsSnapshot(plan.instructions), day, structure: initialStructure(day), input: blankSession(day, profile.weightUnit), startedAt: now, updatedAt: now }
        await database.drafts.add(result); return result
      })
    },
    async startStandalone(profileId: string, workoutId?: string) {
      return database.transaction('rw', tables, async () => {
        const profile = await owner(profileId), source = workoutId ? await database.workouts.get([profileId, workoutId]) : undefined
        if (workoutId && (!source || source.archivedAt)) throw new Error('This workout is unavailable. Choose an active workout.')
        const day = source ? copyWorkout(source) : { id: createId(), name: 'Workout', exercises: [] }, now = new Date().toISOString()
        const value: SessionDraft = { id: createId(), profileId, revision: 1, source: source ? { kind: 'workout', workoutId: source.id } : { kind: 'custom' }, sourceDayId: day.id, timeZone: browserZone(), day, structure: initialStructure(day), input: blankSession(day, profile.weightUnit), startedAt: now, updatedAt: now }
        await database.drafts.add(value); return value
      })
    },
    async update(profileId: string, id: string, revision: number, raw: SessionInput, snapshot?: SessionSnapshot) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId); const value = await draft(profileId, id); await editable(value, revision)
        if (snapshot) {
          validateAmendment(value, snapshot)
          for (const addition of snapshot.day.exercises.slice(value.day.exercises.length)) {
            if (addition.source?.kind !== 'exercise' || !await database.exercises.get([profileId, addition.source.id])) throw new Error('An added exercise is unavailable in this profile. Your session input is kept.')
          }
        }
        const next = snapshot ? { ...value, day: structuredClone(snapshot.day), structure: structuredClone(snapshot.structure) } : value
        const result = { ...next, input: validateDraftInput(raw, next.day), revision: value.revision + 1, updatedAt: new Date().toISOString() }
        await database.drafts.put(result); return result
      })
    },
    async replaceExercise(profileId: string, id: string, revision: number, occurrenceId: string, exerciseId: string, exerciseRevision: number) {
      return database.transaction('rw', tables, async () => {
        const profile = await owner(profileId), value = await draft(profileId, id); await editable(value, revision)
        const source = await database.exercises.get([profileId, exerciseId])
        if (!source || source.archivedAt || source.mergedIntoId || source.revision !== exerciseRevision) throw new Error('This exercise changed. Reopen the picker before swapping. Your input is kept.')
        const index = value.day.exercises.findIndex((e) => e.id === occurrenceId)
        if (index < 0) throw new Error('This occurrence is unavailable. Reload the saved draft.')
        const next = structuredClone(value), old = next.day.exercises[index]
        const replacement = copyExercise(exerciseToInput(source, await database.tags.where('profileId').equals(profileId).toArray()), { kind: 'exercise', id: source.id })
        // Keep the plan occurrence association; replace its movement/set identities.
        replacement.id = old.id; if (old.groupId) replacement.groupId = old.groupId
        next.day.exercises[index] = replacement
        next.structure ??= initialStructure(value.day)
        next.structure.amended = true
        next.structure.exercises[index] = initialStructure({ ...next.day, exercises: [replacement] }).exercises[0]
        // Preserve other members' stable set IDs/rounds, including appended rounds.
        if (old.groupId) {
          const others = next.day.exercises.filter(e => e.groupId === old.groupId && e.id !== old.id)
          const used = new Set(others.flatMap(e => next.structure!.exercises.find(x => x.id === e.id)!.sets.map(s => s.round)))
          const max = Math.max(0, ...used), gaps = Array.from({ length: max }, (_, r) => r + 1).filter(r => !used.has(r))
          const rounds = [...gaps.slice(0, replacement.prescription.sets.length)]
          for (let r = 1; rounds.length < replacement.prescription.sets.length; r++) if (!rounds.includes(r)) rounds.push(r)
          rounds.sort((a,b) => a-b); next.structure.exercises[index].sets.forEach((set, i) => { set.round = rounds[i] })
        }
        next.input.exercises[index] = blankSession({ ...next.day, exercises: [replacement] }, profile.weightUnit).exercises[0]
        next.revision++; next.updatedAt = new Date().toISOString()
        validateDraftInput(next.input, next.day)
        await database.drafts.put(next)
        const timer = await database.restTimers.get('active')
        if (timer?.profileId === profileId && timer.draftId === id && (!timer.exerciseId && !timer.groupId || timer.exerciseId === old.id || !!old.groupId && timer.groupId === old.groupId)) await stopOwned(profileId, id)
        return next
      })
    },
    async discard(profileId: string, id: string, revision: number) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId)
        const value = await database.drafts.get([profileId, id])
        if (!value) return // Retry after successful deletion; never recreate a record.
        if (value.finalizedAt || await database.sessions.get([profileId, id])) throw new Error('This session was saved. Its completed results were not deleted.')
        if (value.revision !== revision) throw new Error('This draft changed in another tab. Your input is kept; reload it before discarding.')
        await stopOwned(profileId, id); await database.drafts.delete([profileId, id])
      })
    },
    async clear(profileId: string, id: string, revision: number) {
      return database.transaction('rw', tables, async () => {
        const profile = await owner(profileId), value = await draft(profileId, id); await editable(value, revision)
        const result = { ...value, input: blankSession(value.day, profile.weightUnit), revision: value.revision + 1, updatedAt: new Date().toISOString() }
        await stopOwned(profileId, id); await database.drafts.put(result); return result
      })
    },
    async complete(profileId: string, id: string, revision: number, raw: SessionInput, allowPartial: boolean, completedAt = new Date().toISOString(), library?: { name: string }) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId)
        const committed = await database.sessions.get([profileId, id]); if (committed) return committed
        const value = await draft(profileId, id); await editable(value, revision)
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
        let savedDay = structuredClone(value.day), source = value.source
        if (library && source?.kind !== 'custom') throw new Error('Only a custom workout can be added to the library here.')
        if (source?.kind === 'custom') {
          let name = 'Custom Workout'
          if (library) {
            name = library.name.trim()
            if (!name) {
              let number = 1
              while (await database.workouts.where('[profileId+activeNameKey]').equals([profileId, nameKey(`Custom Workout (${number})`)]).first()) number++
              name = `Custom Workout (${number})`
            }
            const template = await workoutService(database).save(profileId, { ...duplicateDay(value.day), name })
            source = { kind: 'custom', workoutId: template.id }
          }
          savedDay = { ...savedDay, name }
        }
        const result: CompletedSession = { id, draftId: id, profileId, revision: 1, ...(value.prunedAt ? { prunedAt: value.prunedAt } : {}), ...(source ? { source, timeZone: value.timeZone } : { sourcePlanId: value.sourcePlanId, planName: value.planName }), sourceDayId: value.sourceDayId, ...(value.occurrence ? { occurrence: structuredClone(value.occurrence), occurrenceKey: value.occurrenceKey } : {}), ...planInstructionsSnapshot(value.planInstructions), day: savedDay, ...(value.structure ? { structure: structuredClone(value.structure) } : {}), notes: input.notes, exercises: assessed.exercises, partial: assessed.skipped > 0, startedAt: value.startedAt, completedAt, loggedAt }
        await database.sessions.add(result)
        await database.drafts.put({ ...value, ...(source ? { source } : {}), day: savedDay, input, finalizedAt: completedAt, activeSourceKey: undefined, updatedAt: loggedAt, revision: value.revision + 1 })
        await stopOwned(profileId, id); return result
      })
    },
    async startTimer(profileId: string, draftId: string, revision: number, exerciseId: string, setIndex: number, manualSeconds?: number) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId); const value = await draft(profileId, draftId); await editable(value, revision)
        const index = value.day.exercises.findIndex((exercise) => exercise.id === exerciseId), exercise = value.day.exercises[index]
        if (exercise?.groupId) throw new Error('Use the superset round rest, not a member rest.')
        if (!exercise || !Number.isInteger(setIndex) || setIndex < 0 || setIndex >= exercise.prescription.sets.length) throw new Error('This rest position is unavailable.')
        const afterExercise = setIndex === exercise.prescription.sets.length - 1
        const seconds = (afterExercise ? exercise.prescription.restAfterSeconds : exercise.prescription.restBetweenSeconds) ?? manualSeconds
        const timing = seconds === undefined ? { mode: 'countup' as const, startedAt: new Date().toISOString() } : { mode: 'countdown' as const, durationSeconds: seconds, endAt: timerEnd(seconds) }
        if (seconds === 0) { await stopOwned(profileId, draftId); return undefined }
        const timer: RestTimer = { id: 'active', token: createId(), profileId, draftId, exerciseId, label: exercise.prescription.name, position: afterExercise ? 'Post-Exercise' : `Set ${setIndex + 1}`, ...timing }
        await database.restTimers.put(timer); return timer
      })
    },
    async startGroupTimer(profileId: string, draftId: string, revision: number, groupId: string, round: number, manualSeconds?: number) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId); const value = await draft(profileId, draftId); await editable(value, revision)
        const blocks = trainingBlocks(value.day), index = blocks.findIndex((block) => block.group?.id === groupId), block = blocks[index]
        if (!block?.group || !Number.isInteger(round) || round < 0 || round >= sessionRounds(block.members, value.structure).length) throw new Error('This superset rest position is unavailable.')
        const rounds = sessionRounds(block.members, value.structure), first = rounds[round][0]
        const roundNumber = value.structure?.exercises.find(e => e.id === first.member.id)?.sets[first.index].round ?? round + 1
        const after = round === rounds.length - 1
        const seconds = (after ? block.group.restAfterGroupSeconds : block.group.restBetweenRoundsSeconds) ?? manualSeconds
        const timing = seconds === undefined ? { mode: 'countup' as const, startedAt: new Date().toISOString() } : { mode: 'countdown' as const, durationSeconds: seconds, endAt: timerEnd(seconds) }
        if (seconds === 0) { await stopOwned(profileId, draftId); return undefined }
        const timer: RestTimer = { id: 'active', token: createId(), profileId, draftId, groupId, label: `Superset ${block.group.number}`, position: after ? 'Post-Exercise' : `Set ${roundNumber}`, ...timing }
        await database.restTimers.put(timer); return timer
      })
    },
    async claimTimer(profileId: string, draftId: string, token: string) {
      return database.transaction('rw', tables, async () => {
        await owner(profileId)
        const timer = await database.restTimers.get('active')
        if (!timer || timer.token !== token || timer.profileId !== profileId || timer.draftId !== draftId || timer.mode === 'countup' || timer.alertedAt || Date.parse(timer.endAt) > Date.now()) return false
        await database.restTimers.put({ ...timer, alertedAt: new Date().toISOString() }); return true
      })
    },
    async changeTimer(profileId: string, draftId: string, token: string, action: 'stop' | 'reset') {
      return database.transaction('rw', tables, async () => {
        await owner(profileId); const value = await draft(profileId, draftId); await editable(value, value.revision)
        const timer = await database.restTimers.get('active')
        if (!timer || timer.profileId !== profileId || timer.draftId !== draftId || timer.token !== token) throw new Error('This timer changed or is unavailable in this session.')
        if (action === 'stop') await database.restTimers.delete('active')
        else await database.restTimers.put({ ...timer, token: createId(), alertedAt: undefined, ...(timer.mode === 'countup' ? { startedAt: new Date().toISOString() } : { endAt: timerEnd(timer.durationSeconds) }) })
      })
    },
  }
}
export const sessions = sessionService(db)

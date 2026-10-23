import { db, type BorosDatabase } from './database.ts'
import { exerciseToInput } from './exercises.ts'
import { assertTimerAvailable } from './timer-coordinator.ts'
import { sessionRest, changedRest } from '../lib/session-rest.ts'
import { copyExercise } from '../schemas/plan.ts'
import { assessSession, validateDraftInput, type CompletedSession, type SessionDraft, type SessionInput } from '../schemas/session.ts'
import { validateAmendment, replaceSessionExercise, type SessionSnapshot } from '../schemas/session-structure.ts'
import type { WeightUnit } from '../schemas/profile.ts'

export interface SavedSessionEdit { session: CompletedSession; draft: SessionDraft; draftRevision: number; timerToken?: string }
export interface SessionReplacement { occurrenceId: string; exerciseId: string; revision: number }
const serialized = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item)
const equal = (a: unknown, b: unknown) => serialized(a) === serialized(b)

export function savedSessionService(database: BorosDatabase) {
  const tables = [database.profiles, database.sessions, database.drafts, database.exercises, database.tags, database.restTimers]
  const load = async (profileId: string, id: string): Promise<SavedSessionEdit> => {
    if (!await database.profiles.get(profileId)) throw new Error('This profile is unavailable. Your input is kept.')
    const session = await database.sessions.get([profileId, id])
    if (!session) throw new Error('This saved workout was deleted or is unavailable in this profile. Your input is kept.')
    if (session.day.trainingType === 'interval') throw new Error('Only saved Strength workouts can be edited.')
    const draft = await database.drafts.get([profileId, session.draftId])
    if (!draft || draft.id !== session.id || draft.finalizedAt !== session.completedAt || !equal(draft.day, session.day) || !equal(draft.structure, session.structure)) throw new Error('The saved workout and its finalized results disagree. Nothing was changed.')
    const assessed = assessSession(validateDraftInput(draft.input, session.day))
    if (Object.keys(assessed.errors).length || draft.input.notes !== session.notes || !equal(assessed.exercises, session.exercises)) throw new Error('The saved workout and its finalized results disagree. Nothing was changed.')
    // A rest already attached to this completed session stays reachable after
    // reload. Reading it never starts/stops a timer or claims a live workout.
    const timer = await database.restTimers.get('active')
    return { session, draftRevision: draft.revision, timerToken: timer?.profileId === profileId && timer.draftId === id ? timer.token : undefined, draft: { ...structuredClone(draft), finalizedAt: undefined, activeSourceKey: undefined } }
  }
  const check = async (profileId: string, id: string, revision: number, draftRevision: number) => {
    const latest = await load(profileId, id)
    if (latest.session.revision !== revision || latest.draftRevision !== draftRevision) throw new Error('This saved workout changed in another tab. Your input is kept. Copy needed changes, then cancel and reopen it.')
    return latest
  }
  const replacement = async (profileId: string, request: SessionReplacement) => {
    const source = await database.exercises.get([profileId, request.exerciseId])
    if (!source || source.archivedAt || source.mergedIntoId || source.revision !== request.revision) throw new Error('The replacement exercise changed or is unavailable. Your input is kept. Reopen the picker.')
    if (source.trainingType === 'interval') throw new Error('Choose a Strength exercise.')
    return copyExercise(exerciseToInput(source, await database.tags.where('profileId').equals(profileId).toArray()), { kind: 'exercise', id: source.id })
  }
  const stopOwned = async (profileId: string, id: string, token?: string) => {
    if (!token) return
    const timer = await database.restTimers.get('active')
    if (timer?.profileId === profileId && timer.draftId === id && timer.token === token) await database.restTimers.delete('active')
  }
  return {
    load: (profileId: string, id: string) => database.transaction('r', tables, () => load(profileId, id)),
    replace: (profileId: string, snapshot: SessionSnapshot & { input: SessionInput }, request: SessionReplacement, unit: WeightUnit) => database.transaction('r', tables, async () => replaceSessionExercise(snapshot, request.occurrenceId, await replacement(profileId, request), unit)),
    async save(edit: SavedSessionEdit, snapshot: SessionSnapshot, raw: SessionInput, replacements: SessionReplacement[], allowPartial: boolean, timerToken?: string) {
      const { profileId, id, revision } = edit.session
      return database.transaction('rw', tables, async () => {
        const latest = await check(profileId, id, revision, edit.draftRevision), old = latest.session
        const baseline: SessionSnapshot = { day: structuredClone(old.day), structure: structuredClone(old.structure) }
        // Only explicitly selected replacements may change an existing snapshot.
        // All other changes use the same append-only validation as live Train.
        for (const request of replacements) {
          const copy = await replacement(profileId, request), index = baseline.day.exercises.findIndex(e => e.id === request.occurrenceId)
          if (index < 0) continue // A newly appended occurrence is checked below.
          const proposed = snapshot.day.exercises[index], previous = baseline.day.exercises[index]
          const count = copy.prescription.sets.length
          copy.id = previous.id; if (previous.groupId) copy.groupId = previous.groupId
          if (!proposed || !equal(copy, { ...proposed, prescription: { ...proposed.prescription, sets: proposed.prescription.sets.slice(0, count) } })) throw new Error('The replacement no longer matches the selected exercise. Your input is kept.')
          baseline.day.exercises[index] = copy
          if (baseline.structure && snapshot.structure) baseline.structure.exercises[index] = { ...snapshot.structure.exercises[index], sets: snapshot.structure.exercises[index].sets.slice(0, count) }
        }
        validateAmendment(baseline, snapshot)
        for (const item of snapshot.day.exercises.slice(old.day.exercises.length)) {
          if (item.source?.kind !== 'exercise' || !await database.exercises.get([profileId, item.source.id])) throw new Error('An added exercise is unavailable in this profile. Your input is kept.')
        }
        const input = validateDraftInput(raw, snapshot.day), assessed = assessSession(input)
        if (Object.keys(assessed.errors).length) throw new Error('Correct partially entered or invalid sets, or explicitly skip them.')
        if (!assessed.recorded) throw new Error('Record at least one valid set before saving a session.')
        if (assessed.skipped && !allowPartial) throw new Error('Confirm saving a partial session with omitted sets marked skipped.')
        // Assess the original raw input, not rounded display strings. The paired
        // finalized draft stays authoritative for precision, blanks and skip intent.
        const result: CompletedSession = { ...old, ...structuredClone(snapshot), notes: input.notes,
          ...(input.noteEdited === undefined ? {} : { noteEdited: input.noteEdited || !!input.noteInheritedClear && input.notes === '' }),
          exercises: assessed.exercises, partial: assessed.skipped > 0, revision: old.revision + 1 }
        const finalized = await database.drafts.get([profileId, old.draftId])
        await database.sessions.put(result)
        await database.drafts.put({ ...finalized!, ...structuredClone(snapshot), input, revision: latest.draftRevision + 1, updatedAt: new Date().toISOString() })
        await stopOwned(profileId, id, timerToken)
        return result
      })
    },
    timer: async (profileId: string, id: string, token?: string) => { const timer = await database.restTimers.get('active'); return token && timer?.token === token && timer.profileId === profileId && timer.draftId === id ? timer : undefined },
    stopTimer: (profileId: string, id: string, token?: string) => database.transaction('rw', database.restTimers, () => stopOwned(profileId, id, token)),
    startTimer: (edit: SavedSessionEdit, snapshot: SessionSnapshot, block: string, index: number, group: boolean, seconds?: number) => database.transaction('rw', tables, async () => {
      const { profileId, id, revision } = edit.session
      await check(profileId, id, revision, edit.draftRevision); await assertTimerAvailable(database)
      const timer = sessionRest(profileId, id, snapshot, block, index, group, seconds)
      if (timer) await database.restTimers.put(timer)
      return timer
    }),
    changeTimer: (profileId: string, id: string, token: string, action: 'stop' | 'reset' | 'pause' | 'resume') => database.transaction('rw', tables, async () => {
      const timer = await database.restTimers.get('active')
      if (!timer || timer.profileId !== profileId || timer.draftId !== id || timer.token !== token) throw new Error('This timer changed or is unavailable in this editing copy.')
      if (action !== 'stop') { await load(profileId, id); await assertTimerAvailable(database, undefined, token) }
      const next = changedRest(timer, action)
      if (next) await database.restTimers.put(next); else await database.restTimers.delete('active')
      return next
    }),
  }
}
export const savedSessions = savedSessionService(db)

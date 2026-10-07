import { db, type BorosDatabase } from './database.ts'
import { exerciseResolver } from '../lib/exercise-identity.ts'
import { exerciseIdentity } from '../lib/progress-analytics.ts'
import { runLifecycle } from '../lib/run-progress.ts'
import { assessSession, type SessionDraft, type CompletedSession } from '../schemas/session.ts'
import type { DeletedSource } from '../schemas/deleted-source.ts'

export interface DeletePreview { profileId: string; kind: DeletedSource['kind']; id: string; revision: number; active: boolean; fingerprint: string }
export function libraryDeleteService(database: BorosDatabase) {
  const tables = [database.profiles, database.exercises, database.workouts, database.plans, database.schedules, database.sessions, database.drafts, database.restTimers, database.deletedSources]
  const inspect = async (profileId: string, kind: DeletePreview['kind'], id: string, revision: number) => {
    const profile = await database.profiles.get(profileId)
    if (!profile) throw new Error('This profile is unavailable.')
    const [exercises, workouts, plans, runs, sessions, drafts, deletedSources, timer] = await Promise.all([
      database.exercises.where('profileId').equals(profileId).toArray(), database.workouts.where('profileId').equals(profileId).toArray(), database.plans.where('profileId').equals(profileId).toArray(), database.schedules.where('profileId').equals(profileId).toArray(), database.sessions.where('profileId').equals(profileId).toArray(), database.drafts.where('profileId').equals(profileId).toArray(), database.deletedSources.where('profileId').equals(profileId).toArray(), database.restTimers.get('active'),
    ])
    const record = (kind === 'exercise' ? exercises : kind === 'workout' ? workouts : plans).find(r => r.id === id)
    if (!record || record.revision !== revision || ('mergedIntoId' in record && record.mergedIntoId)) throw new Error('This item changed or was deleted. Close and reopen Delete; nothing was removed.')
    const active = kind === 'plan' && runs.some(r => r.planId === id && !runLifecycle(r, sessions).previous)
    const ownedTimer = timer?.profileId === profileId ? timer : undefined
    // Conservative scope check includes all owned library/session records: a new
    // result, merge, activation or pending autosave must force a fresh review.
    const preview: DeletePreview = { profileId, kind, id, revision, active, fingerprint: JSON.stringify([profile, exercises, workouts, plans, runs, sessions, drafts, deletedSources, ownedTimer]) }
    return { profile, exercises, workouts, plans, runs, sessions, drafts, deletedSources, timer: ownedTimer, preview }
  }
  return {
    preview: (profileId: string, kind: DeletePreview['kind'], id: string, revision: number) => database.transaction('r', tables, async () => (await inspect(profileId, kind, id, revision)).preview),
    async remove(proposed: DeletePreview) {
      return database.transaction('rw', tables, async () => {
        const data = await inspect(proposed.profileId, proposed.kind, proposed.id, proposed.revision)
        if (data.preview.fingerprint !== proposed.fingerprint || data.preview.active !== proposed.active) throw new Error('Saved data changed after confirmation opened. Close and reopen Delete; nothing was removed.')
        const { profileId, kind, id } = proposed, now = new Date().toISOString(), affected = new Set<string>()
        const removePair = async (draft: SessionDraft) => { affected.add(draft.id); await database.drafts.delete([profileId, draft.id]); await database.sessions.delete([profileId, draft.id]) }
        if (kind === 'exercise') {
          const resolve = exerciseResolver(profileId, [...data.exercises, ...data.deletedSources.filter(t => t.kind === 'exercise')]), canonical = resolve(id)
          const ids = new Set(data.exercises.filter(e => resolve(e.id) === canonical).map(e => e.id))
          for (const draft of data.drafts.filter(d => !d.sourcePlanId)) {
            const removed = new Set(draft.day.exercises.filter(e => {
              const key = exerciseIdentity(undefined, draft.day.id, e)
              return key.startsWith('library:') && resolve(key.slice(8)) === canonical
            }).map(e => e.id))
            if (!removed.size) continue
            const next = structuredClone(draft)
            next.day.exercises = next.day.exercises.filter(e => !removed.has(e.id))
            next.input.exercises = next.input.exercises.filter(e => !removed.has(e.id))
            if (!next.day.exercises.length && !next.input.notes.trim()) { await removePair(draft); continue }
            // Dissolve groups with fewer than two remaining members. Other member
            // occurrence/set IDs, actual results and notes remain unchanged.
            if (next.day.groups) {
              next.day.groups = next.day.groups.filter(g => next.day.exercises.filter(e => e.groupId === g.id).length >= 2)
              for (const exercise of next.day.exercises) if (exercise.groupId && !next.day.groups.some(g => g.id === exercise.groupId)) delete exercise.groupId
              if (!next.day.groups.length) delete next.day.groups
            }
            if (next.structure) { next.structure.exercises = next.structure.exercises.filter(e => !removed.has(e.id)); next.structure.amended = true }
            next.prunedAt = now; next.revision++; next.updatedAt = now
            await database.drafts.put(next); affected.add(next.id)
            const session = data.sessions.find(s => s.draftId === draft.id)
            if (session) {
              const assessed = assessSession(next.input)
              const saved: CompletedSession = { ...session, day: structuredClone(next.day), structure: structuredClone(next.structure), exercises: session.exercises.filter(e => !removed.has(e.id)), partial: assessed.skipped > 0, prunedAt: now, revision: session.revision + 1 }
              await database.sessions.put(saved)
            }
          }
          for (const sourceId of ids) {
            await database.exercises.delete([profileId, sourceId])
            await database.deletedSources.put({ profileId, kind, id: sourceId, deletedAt: now, ...(sourceId === canonical ? {} : { mergedIntoId: canonical }) })
          }
        } else {
          const owned = data.drafts.filter(d => kind === 'plan' ? d.sourcePlanId === id : !d.sourcePlanId && d.source?.workoutId === id)
          for (const draft of owned) await removePair(draft)
          // Cover legacy records without a retained draft as well.
          for (const session of data.sessions.filter(s => kind === 'plan' ? s.sourcePlanId === id : !s.sourcePlanId && s.source?.workoutId === id)) { affected.add(session.draftId); await database.sessions.delete([profileId, session.id]) }
          if (kind === 'plan') {
            await database.schedules.bulkDelete(data.runs.filter(r => r.planId === id).map(r => [profileId, r.id]))
            await database.plans.delete([profileId, id])
            if (data.profile.selectedPlanIds?.includes(id)) await database.profiles.put({ ...data.profile, selectedPlanIds: data.profile.selectedPlanIds.filter(p => p !== id), revision: data.profile.revision + 1, updatedAt: now })
          } else await database.workouts.delete([profileId, id])
          await database.deletedSources.put({ profileId, kind, id, deletedAt: now })
        }
        if (data.timer && affected.has(data.timer.draftId)) await database.restTimers.delete('active')
      })
    },
  }
}
export const libraryDelete = libraryDeleteService(db)

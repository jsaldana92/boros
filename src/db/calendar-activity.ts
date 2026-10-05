import { db, type BorosDatabase } from './database.ts'
import { scheduleService, type CalendarEvent } from './schedules.ts'
import { browserZone, localToday } from '../lib/calendar-dates.ts'
import type { CompletedSession } from '../schemas/session.ts'
import type { TrainingDay } from '../schemas/plan.ts'

export interface CalendarActivity { id: string; date: string; planId: string; planName: string; day: TrainingDay; event?: CalendarEvent; session?: CompletedSession }
export function calendarActivityService(database: BorosDatabase) {
  return {
    async events(profileId: string, start: string, end: string): Promise<CalendarActivity[]> {
      return database.transaction('r', [database.profiles, database.plans, database.schedules, database.drafts, database.sessions], async () => {
        const profile = await database.profiles.get(profileId)
        if (!profile) throw new Error('This profile is unavailable.')
        const entries = new Map<string, CalendarActivity>()
        for (const event of await scheduleService(database).events(profileId, start, end)) {
          if (!event.unscheduled) entries.set(event.ref.key, { id: event.ref.key, date: event.ref.scheduledDate, planId: event.planId, planName: event.planName, day: event.day, event, session: event.session })
        }
        // Completion time can be outside the program week, so query saved activity
        // independently of generated occurrences. Never rewrite occurrence refs.
        const logs = await database.sessions.where('profileId').equals(profileId).toArray()
        const savedKeys = new Set(logs.flatMap((log) => log.occurrence?.key ?? []))
        const inRange = (date: string) => date >= start && date <= end
        for (const run of await database.schedules.where('profileId').equals(profileId).toArray()) {
          for (const outcome of run.outcomes ?? []) {
            if (!outcome.ref.unscheduled || outcome.status !== 'completed' || savedKeys.has(outcome.ref.key)) continue
            const date = localToday(outcome.ref.timeZone, new Date(outcome.updatedAt))
            if (inRange(date)) entries.set(outcome.ref.key, { id: outcome.ref.key, date, planId: run.planId, planName: outcome.planName, day: outcome.day, event: { ...outcome, planId: run.planId, outcome, unscheduled: true } })
          }
        }
        for (const session of logs) {
          if (session.occurrence && !session.occurrence.unscheduled) continue
          const date = localToday(session.occurrence?.timeZone ?? profile.timeZone ?? browserZone(), new Date(session.completedAt))
          if (!inRange(date)) continue
          const id = session.occurrence?.key ?? session.id
          entries.set(id, { id, date, planId: session.sourcePlanId, planName: session.planName, day: session.day, session })
        }
        return [...entries.values()].sort((a, b) => a.date.localeCompare(b.date) || a.planName.localeCompare(b.planName) || a.id.localeCompare(b.id))
      })
    },
  }
}
export const calendarActivity = calendarActivityService(db)

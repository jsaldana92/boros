import { z } from 'zod'
import { planInstructionsSnapshot, positiveInteger, type TrainingDay } from './plan.ts'
import { addDays, dateRange, monday, validDate, validZone, weekday } from '../lib/calendar-dates.ts'

export const dateSchema = z.string().refine(validDate, 'Enter a valid calendar date.')
export const mappingSchema = z.array(z.object({ dayId: z.string().uuid(), weekday: z.number().int().min(0).max(6) }).strict()).min(1).max(7)
  .refine((items) => new Set(items.map((item) => item.dayId)).size === items.length, 'Assign every training day exactly once.')
  .refine((items) => new Set(items.map((item) => item.weekday)).size === items.length, 'Choose a distinct weekday for each training day.')
export const scheduleInputSchema = z.object({ planId: z.string().uuid(), planRevision: z.number().int().positive(), startWeek: dateSchema.refine((date) => validDate(date) && monday(date) === date, 'Choose a Monday for the starting week.'), timeZone: z.string().refine(validZone, 'Choose a supported IANA time zone.'), mapping: mappingSchema }).strict()
export type Mapping = z.infer<typeof mappingSchema>
export type ScheduleInput = z.infer<typeof scheduleInputSchema>
export interface ScheduleRevision { id: string; effectiveFrom: string; effectiveUntil?: string; createdAt: string; planRevision: number; planName: string; planInstructions?: string; days: TrainingDay[]; mapping: Mapping; needsRepair?: boolean; unscheduled?: true }
export interface DurationChange { id: string; effectiveFrom: string; durationWeeks?: number; endDate?: string }
export interface OccurrenceOutcome { id: string; ref: OccurrenceRef; day: TrainingDay; planName: string; planInstructions?: string; status: 'skipped' | 'completed' | 'pending'; recordedAt: string; updatedAt: string; revision: number }
export interface WeekMove { id: string; fromWeek: string; direction: 1 | -1; recordedAt: string }
export interface Schedule { id: string; profileId: string; planId: string; revision: number; timeZone: string; startWeek: string; createdAt: string; updatedAt: string; closedAt?: string; hiddenAt?: string; stoppedFrom?: string; durationWeeks?: number; endDate?: string; durationChanges?: DurationChange[]; revisions: ScheduleRevision[]; kind?: 'unscheduled'; identity?: 'program-week'; excludedWeeks?: string[]; outcomes?: OccurrenceOutcome[]; weekMoves?: WeekMove[]; occurrenceExceptions?: OccurrenceRef[] }
export function scheduleEnd(startWeek: string, durationWeeks?: number) {
  if (durationWeeks === undefined) return undefined
  positiveInteger.parse(durationWeeks)
  const end = addDays(startWeek, durationWeeks * 7 - 1)
  if (!validDate(end)) throw new Error('Duration extends beyond the supported calendar range (years 1–9999).')
  return end
}
export function scheduleActiveOn(schedule: Schedule, date: string) {
  const boundary = schedule.durationChanges?.findLast((item) => item.effectiveFrom <= date) ?? schedule
  return date >= schedule.startWeek && !schedule.excludedWeeks?.includes(monday(date)) && (!schedule.stoppedFrom || date < schedule.stoppedFrom) && (!boundary.endDate || date <= boundary.endDate)
}
export interface OccurrenceRef { key: string; scheduleId: string; dayId: string; scheduledDate: string; scheduledWeek: string; timeZone: string; scheduleRevisionId: string; programWeek?: number; unscheduled?: true }
export interface Occurrence { ref: OccurrenceRef; planId: string; planName: string; planInstructions?: string; day: TrainingDay }
export const occurrenceKey = (scheduleId: string, dayId: string, date: string, programWeek?: number) => `${scheduleId}:${dayId}:${programWeek === undefined ? date : `week-${programWeek}`}`
export function programWeek(schedule: Schedule, week: string) {
  // Both operands are civil Monday labels carried in UTC, never local instants.
  return Math.round((Date.parse(`${week}T00:00:00Z`) - Date.parse(`${schedule.startWeek}T00:00:00Z`)) / 604800000) + 1 - (schedule.excludedWeeks ?? []).filter((gap) => gap < week).length
}
export function programEnd(start: string, duration?: number, gaps: string[] = []) {
  let end = scheduleEnd(start, duration)
  if (end) for (const gap of [...gaps].sort()) if (gap >= start && gap <= end) end = addDays(end, 7)
  return end
}
export function validateMapping(mapping: Mapping, days: TrainingDay[]) {
  mappingSchema.parse(mapping)
  if (mapping.length !== days.length || days.some((day) => !mapping.some((item) => item.dayId === day.id))) throw new Error('Map every current training day to one distinct weekday.')
}
export function revisionAt(schedule: Schedule, date: string) { return schedule.revisions.findLast((item) => item.effectiveFrom <= date && (!item.effectiveUntil || date < item.effectiveUntil)) }
export function occurrences(schedule: Schedule, start: string, end: string): Occurrence[] {
  const generated = dateRange(start, end).flatMap((date) => {
    if (!scheduleActiveOn(schedule, date)) return []
    const revision = revisionAt(schedule, date)
    if (!revision || revision.needsRepair) return []
    const assignment = revision.mapping.find((item) => item.weekday === weekday(date)), day = revision.days.find((item) => item.id === assignment?.dayId)
    const week = schedule.identity ? programWeek(schedule, monday(date)) : undefined
    if (day && schedule.occurrenceExceptions?.some((ref) => ref.dayId === day.id && ref.scheduledWeek === monday(date))) return []
    return day ? [{ planId: schedule.planId, planName: revision.planName, ...planInstructionsSnapshot(revision.planInstructions), day, ref: { key: occurrenceKey(schedule.id, day.id, date, week), scheduleId: schedule.id, dayId: day.id, scheduledDate: date, scheduledWeek: monday(date), timeZone: schedule.timeZone, scheduleRevisionId: revision.id, ...(week === undefined ? {} : { programWeek: week }), ...(schedule.kind === 'unscheduled' || revision.unscheduled ? { unscheduled: true as const } : {}) } }] : []
  })
  // Frozen exceptions replace one day in its week, even when two dates coincide.
  const retained = (schedule.occurrenceExceptions ?? []).flatMap((ref) => {
    if (ref.scheduledDate < start || ref.scheduledDate > end || !scheduleActiveOn(schedule, ref.scheduledDate)) return []
    const revision = schedule.revisions.find((item) => item.id === ref.scheduleRevisionId), day = revision?.days.find((item) => item.id === ref.dayId)
    return revision && day ? [{ ref, day, planId: schedule.planId, planName: revision.planName, ...planInstructionsSnapshot(revision.planInstructions) }] : []
  })
  return [...generated, ...retained].sort((a, b) => a.ref.scheduledDate.localeCompare(b.ref.scheduledDate))
}
// Close superseded segments without deleting their metadata, including pending revisions.
export function appendRevision(schedule: Schedule, revision: ScheduleRevision) {
  return [...schedule.revisions.map((old) => old.effectiveUntil && old.effectiveUntil <= revision.effectiveFrom ? old : { ...old, effectiveUntil: old.effectiveFrom > revision.effectiveFrom ? old.effectiveFrom : revision.effectiveFrom }), revision]
}

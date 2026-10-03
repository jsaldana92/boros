import { z } from 'zod'
import { positiveInteger, type TrainingDay } from './plan.ts'
import { addDays, dateRange, monday, validDate, validZone, weekday } from '../lib/calendar-dates.ts'

export const dateSchema = z.string().refine(validDate, 'Enter a valid calendar date.')
export const mappingSchema = z.array(z.object({ dayId: z.string().uuid(), weekday: z.number().int().min(0).max(6) }).strict()).min(1).max(7)
  .refine((items) => new Set(items.map((item) => item.dayId)).size === items.length, 'Assign every training day exactly once.')
  .refine((items) => new Set(items.map((item) => item.weekday)).size === items.length, 'Choose a distinct weekday for each training day.')
export const scheduleInputSchema = z.object({ planId: z.string().uuid(), planRevision: z.number().int().positive(), startWeek: dateSchema.refine((date) => validDate(date) && monday(date) === date, 'Choose a Monday for the starting week.'), timeZone: z.string().refine(validZone, 'Choose a supported IANA time zone.'), mapping: mappingSchema }).strict()
export type Mapping = z.infer<typeof mappingSchema>
export type ScheduleInput = z.infer<typeof scheduleInputSchema>
export interface ScheduleRevision { id: string; effectiveFrom: string; effectiveUntil?: string; createdAt: string; planRevision: number; planName: string; days: TrainingDay[]; mapping: Mapping; needsRepair?: boolean }
export interface DurationChange { id: string; effectiveFrom: string; durationWeeks?: number; endDate?: string }
export interface Schedule { id: string; profileId: string; planId: string; revision: number; timeZone: string; startWeek: string; createdAt: string; updatedAt: string; stoppedFrom?: string; durationWeeks?: number; endDate?: string; durationChanges?: DurationChange[]; revisions: ScheduleRevision[] }
export function scheduleEnd(startWeek: string, durationWeeks?: number) {
  if (durationWeeks === undefined) return undefined
  positiveInteger.parse(durationWeeks)
  const end = addDays(startWeek, durationWeeks * 7 - 1)
  if (!validDate(end)) throw new Error('Duration extends beyond the supported calendar range (years 1–9999).')
  return end
}
export function scheduleActiveOn(schedule: Schedule, date: string) {
  const boundary = schedule.durationChanges?.findLast((item) => item.effectiveFrom <= date) ?? schedule
  return date >= schedule.startWeek && (!schedule.stoppedFrom || date < schedule.stoppedFrom) && (!boundary.endDate || date <= boundary.endDate)
}
export interface OccurrenceRef { key: string; scheduleId: string; dayId: string; scheduledDate: string; scheduledWeek: string; timeZone: string; scheduleRevisionId: string }
export interface Occurrence { ref: OccurrenceRef; planId: string; planName: string; day: TrainingDay }
export const occurrenceKey = (scheduleId: string, dayId: string, date: string) => `${scheduleId}:${dayId}:${date}`
export function validateMapping(mapping: Mapping, days: TrainingDay[]) {
  mappingSchema.parse(mapping)
  if (mapping.length !== days.length || days.some((day) => !mapping.some((item) => item.dayId === day.id))) throw new Error('Map every current training day to one distinct weekday.')
}
export function revisionAt(schedule: Schedule, date: string) { return schedule.revisions.findLast((item) => item.effectiveFrom <= date && (!item.effectiveUntil || date < item.effectiveUntil)) }
export function occurrences(schedule: Schedule, start: string, end: string): Occurrence[] {
  return dateRange(start, end).flatMap((date) => {
    if (!scheduleActiveOn(schedule, date)) return []
    const revision = revisionAt(schedule, date)
    if (!revision || revision.needsRepair) return []
    const assignment = revision.mapping.find((item) => item.weekday === weekday(date)), day = revision.days.find((item) => item.id === assignment?.dayId)
    return day ? [{ planId: schedule.planId, planName: revision.planName, day, ref: { key: occurrenceKey(schedule.id, day.id, date), scheduleId: schedule.id, dayId: day.id, scheduledDate: date, scheduledWeek: monday(date), timeZone: schedule.timeZone, scheduleRevisionId: revision.id } }] : []
  })
}
// Close superseded segments without deleting their metadata, including pending revisions.
export function appendRevision(schedule: Schedule, revision: ScheduleRevision) {
  return [...schedule.revisions.map((old) => old.effectiveUntil && old.effectiveUntil <= revision.effectiveFrom ? old : { ...old, effectiveUntil: old.effectiveFrom > revision.effectiveFrom ? old.effectiveFrom : revision.effectiveFrom }), revision]
}

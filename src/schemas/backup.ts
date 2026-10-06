import { exerciseResolver } from '../lib/exercise-identity.ts'
import { templateReference } from '../lib/template-ownership.ts'
import { workoutInputSchema, type Workout } from './workout.ts'
import { sessionStructureSchema, validateStructure } from './session-structure.ts'
import { z } from 'zod'
import { exerciseInputSchema, setSchema } from './exercise.ts'
import { daySchema as originalDaySchema, occurrenceSchema, weekSchema, sourceSchema, planInputSchema, planInstructionsSchema, positiveInteger } from './plan.ts'
import { heightUnitSchema, measurementSchema, selectedPlanIdsSchema, timeZoneSchema, weightUnitSchema, type Measurement, type PhotoAsset, type Profile } from './profile.ts'
import type { Exercise, Tag } from './exercise.ts'
import type { Plan } from './plan.ts'
import { dateSchema, mappingSchema, cycleMappingSchema, occurrenceKey, programEnd, programWeek, validateMapping, type Schedule } from './schedule.ts'
import { assessSession, sessionInputSchema, validateDraftInput, type CompletedSession, type SessionDraft } from './session.ts'
import { monday, validZone } from '../lib/calendar-dates.ts'
import { validateTimeContext } from '../lib/measurement-dates.ts'

export const BACKUP_VERSION = 12
const LEGACY_SNAPSHOT_POLICY = 'Persisted records only. Unsaved forms, unapplied notes and pending/failed autosaves in any tab are excluded. Wait for Draft saved locally in every training tab before exporting.'
export const SNAPSHOT_POLICY = 'Persisted records only. Unsaved forms, unapplied notes and pending/failed autosaves in any tab are excluded. Apply notes and wait until Saving disappears without an error in every training tab before exporting.'
export interface ProfileSnapshot {
  databaseVersion: number; capturedAt: string; profile: Profile; tags: Tag[]; exercises: Exercise[]; plans: Plan[]; workouts: Workout[]
  schedules: Schedule[]; drafts: SessionDraft[]; sessions: CompletedSession[]; measurements: Measurement[]; photos: PhotoAsset[]
}
const id = z.string().uuid(), time = z.string().datetime(), revision = z.number().int().positive()
const owned = { id, profileId: id }, timestamps = { createdAt: time, updatedAt: time }
const prescription = exerciseInputSchema.extend({ sets: z.array(setSchema.strict()).min(1).max(100) }).strict()
const source = z.discriminatedUnion('kind', [sourceSchema.options[0].strict(), sourceSchema.options[1].strict()])
const daySchema = originalDaySchema.omit({ instructions: true, notes: true, sourceWorkoutId: true }).extend({ exercises: z.array(occurrenceSchema.omit({ setIds: true }).extend({ prescription, source: source.optional() }).strict()).min(1).max(100) }).strict()
const archived = { ...owned, ...timestamps, archivedAt: time.optional(), nameKey: z.string(), activeNameKey: z.string().optional(), revision }
const occurrence = z.object({ key: z.string(), scheduleId: id, dayId: id, scheduledDate: dateSchema, scheduledWeek: dateSchema, timeZone: z.string().refine(validZone), scheduleRevisionId: id }).strict()
const sessionBase = { ...owned, revision, sourcePlanId: id, sourceDayId: id, planName: z.string(), day: daySchema, startedAt: time, occurrence: occurrence.optional(), occurrenceKey: z.string().optional() }
const number = z.number().finite().nonnegative(), integer = number.int().max(Number.MAX_SAFE_INTEGER)
const recorded = z.discriminatedUnion('skipped', [z.object({ skipped: z.literal(true) }).strict(), z.object({ skipped: z.literal(false), weightKg: number, load: number, unit: weightUnitSchema, reps: integer, rir: integer.optional() }).strict()])
export const assetSchema = z.object({ ...owned, createdAt: time, role: z.enum(['avatar', 'progress']), width: z.number().int().positive().max(4096), height: z.number().int().positive().max(4096), mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']), bytes: z.number().int().positive().max(5 * 1024 * 1024), path: z.string().regex(/^photos\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i) }).strict()
export type BackupAsset = z.infer<typeof assetSchema>
export interface BackupData extends Omit<ProfileSnapshot, 'databaseVersion' | 'capturedAt' | 'photos'> { format: 'boros-profile-backup'; backupSchemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12; assets: BackupAsset[] }
// Validation never replaces the original records with Zod's parsed/transformed output.
// The JSON payload retains saved text, optional-field presence, array order and snapshots.
export const v4BackupDataSchema = z.object({
  format: z.literal('boros-profile-backup'), backupSchemaVersion: z.literal(4),
  profile: z.object({ id, kind: z.enum(['guest', 'named']), name: z.string(), nameKey: z.string(), age: z.number().int().min(0).max(130).nullable().optional(), heightCm: z.number().positive().max(300).nullable().optional(), weightUnit: weightUnitSchema, heightUnit: heightUnitSchema, photoId: id.nullable().optional(), timeZone: timeZoneSchema.optional(), selectedPlanIds: selectedPlanIdsSchema.optional(), revision, ...timestamps }).strict(),
  tags: z.array(z.object({ ...owned, ...timestamps, name: z.string(), nameKey: z.string(), archivedAt: time.optional() }).strict()),
  exercises: z.array(prescription.omit({ tagNames: true }).extend({ ...archived, tagIds: z.array(id) }).strict()),
  plans: z.array(z.object({ ...archived, name: z.string(), durationWeeks: positiveInteger.optional(), days: z.array(daySchema).min(1).max(7) }).strict()),
  schedules: z.array(z.object({ ...owned, ...timestamps, planId: id, revision, timeZone: z.string().refine(validZone), startWeek: dateSchema, stoppedFrom: dateSchema.optional(), durationWeeks: positiveInteger.optional(), endDate: dateSchema.optional(), durationChanges: z.array(z.object({ id, effectiveFrom: dateSchema, durationWeeks: positiveInteger.optional(), endDate: dateSchema.optional() }).strict()).optional(), revisions: z.array(z.object({ id, effectiveFrom: dateSchema, effectiveUntil: dateSchema.optional(), createdAt: time, planRevision: revision, planName: z.string(), days: z.array(daySchema).min(1).max(7), mapping: mappingSchema, needsRepair: z.boolean().optional() }).strict()).min(1) }).strict()),
  drafts: z.array(z.object({ ...sessionBase, activeSourceKey: z.string().optional(), input: sessionInputSchema.extend({ exercises: sessionInputSchema.shape.exercises.min(1) }), updatedAt: time, finalizedAt: time.optional() }).strict()),
  sessions: z.array(z.object({ ...sessionBase, draftId: id, notes: z.string(), exercises: z.array(z.object({ id, notes: z.string(), sets: z.array(recorded).min(1) }).strict()), partial: z.boolean(), completedAt: time, loggedAt: time }).strict()),
  measurements: z.array(measurementSchema.extend({ ...owned, loggedAt: time, updatedAt: time.optional(), revision: revision.optional(), photoId: id.optional(), lastMutationId: id.optional() }).strict()),
  assets: z.array(assetSchema),
}).strict()
// Freeze the v1 allowed field set. Verify its original bytes/CSV contract before
// upgrading only the envelope; absent groups/duration retain their original meaning.
const legacySource = z.discriminatedUnion('kind', [source.options[0], source.options[1].omit({ libraryId: true })])
const legacyDay = daySchema.omit({ groups: true }).extend({ exercises: z.array(occurrenceSchema.omit({ setIds: true, groupId: true, templateId: true }).extend({ prescription, source: legacySource.optional() }).strict()).min(1).max(100) })
const v3Day = daySchema.extend({ exercises: z.array(occurrenceSchema.omit({ setIds: true, templateId: true }).extend({ prescription, source: source.optional() }).strict()).min(1).max(100) })
export const v3BackupDataSchema = v4BackupDataSchema.extend({
  backupSchemaVersion: z.literal(3),
  plans: z.array(v4BackupDataSchema.shape.plans.element.extend({ days: z.array(v3Day).min(1).max(7) })),
  schedules: z.array(v4BackupDataSchema.shape.schedules.element.extend({ revisions: z.array(v4BackupDataSchema.shape.schedules.element.shape.revisions.element.extend({ days: z.array(v3Day).min(1).max(7) })).min(1) })),
  drafts: z.array(v4BackupDataSchema.shape.drafts.element.extend({ day: v3Day })),
  sessions: z.array(v4BackupDataSchema.shape.sessions.element.extend({ day: v3Day })),
})
export const v2BackupDataSchema = v3BackupDataSchema.extend({ backupSchemaVersion: z.literal(2), profile: v4BackupDataSchema.shape.profile.omit({ timeZone: true, selectedPlanIds: true }) })
export const legacyBackupDataSchema = v2BackupDataSchema.extend({
  backupSchemaVersion: z.literal(1),
  plans: z.array(v4BackupDataSchema.shape.plans.element.omit({ durationWeeks: true }).extend({ days: z.array(legacyDay).min(1).max(7) })),
  schedules: z.array(v4BackupDataSchema.shape.schedules.element.omit({ durationWeeks: true, endDate: true, durationChanges: true }).extend({ revisions: z.array(v4BackupDataSchema.shape.schedules.element.shape.revisions.element.extend({ days: z.array(legacyDay).min(1).max(7) })).min(1) })),
  drafts: z.array(v4BackupDataSchema.shape.drafts.element.extend({ day: legacyDay })),
  sessions: z.array(v4BackupDataSchema.shape.sessions.element.extend({ day: legacyDay })),
})
const weeklyOccurrence = occurrence.extend({ programWeek: positiveInteger.optional(), unscheduled: z.literal(true).optional() })
export const v5BackupDataSchema = v4BackupDataSchema.extend({
  backupSchemaVersion: z.literal(5),
  plans: z.array(v4BackupDataSchema.shape.plans.element.extend({ notes: z.string().max(20000).optional() })),
  schedules: z.array(v4BackupDataSchema.shape.schedules.element.extend({
    kind: z.literal('unscheduled').optional(), identity: z.literal('program-week').optional(),
    excludedWeeks: z.array(dateSchema).optional(),
    weekMoves: z.array(z.object({ id, fromWeek: dateSchema, direction: z.union([z.literal(1), z.literal(-1)]), recordedAt: time }).strict()).optional(),
    outcomes: z.array(z.object({ id, ref: weeklyOccurrence, day: daySchema, planName: z.string(), status: z.enum(['skipped', 'completed', 'pending']), recordedAt: time, updatedAt: time, revision }).strict()).optional(),
  })),
  drafts: z.array(v4BackupDataSchema.shape.drafts.element.extend({ occurrence: weeklyOccurrence.optional() })),
  sessions: z.array(v4BackupDataSchema.shape.sessions.element.extend({ occurrence: weeklyOccurrence.optional() })),
})
export const v6BackupDataSchema = v5BackupDataSchema.extend({
  backupSchemaVersion: z.literal(6),
  schedules: z.array(v5BackupDataSchema.shape.schedules.element.extend({ closedAt: time.optional() })),
})
// New optional text has its own strict wire version; old allowed fields/CSV stay frozen.
export const v7BackupDataSchema = v6BackupDataSchema.extend({
  backupSchemaVersion: z.literal(7),
  plans: z.array(v6BackupDataSchema.shape.plans.element.extend({ instructions: planInstructionsSchema })),
  schedules: z.array(v6BackupDataSchema.shape.schedules.element.extend({
    revisions: z.array(v6BackupDataSchema.shape.schedules.element.shape.revisions.element.extend({ planInstructions: planInstructionsSchema })).min(1),
    outcomes: z.array(v5BackupDataSchema.shape.schedules.element.shape.outcomes.unwrap().element.extend({ planInstructions: planInstructionsSchema })).optional(),
  })),
  drafts: z.array(v6BackupDataSchema.shape.drafts.element.extend({ planInstructions: planInstructionsSchema })),
  sessions: z.array(v6BackupDataSchema.shape.sessions.element.extend({ planInstructions: planInstructionsSchema })),
})
export const v8BackupDataSchema = v7BackupDataSchema.extend({
  backupSchemaVersion: z.literal(8),
  schedules: z.array(v7BackupDataSchema.shape.schedules.element.extend({
    hiddenAt: time.optional(), occurrenceExceptions: z.array(weeklyOccurrence).optional(),
    revisions: z.array(v7BackupDataSchema.shape.schedules.element.shape.revisions.element.extend({ unscheduled: z.literal(true).optional() })).min(1),
  })),
})
export const v9BackupDataSchema = v8BackupDataSchema.extend({
  backupSchemaVersion: z.literal(9),
  drafts: z.array(v8BackupDataSchema.shape.drafts.element.extend({ structure: sessionStructureSchema.extend({ exercises: sessionStructureSchema.shape.exercises.min(1) }).optional() })),
  sessions: z.array(v8BackupDataSchema.shape.sessions.element.extend({ structure: sessionStructureSchema.extend({ exercises: sessionStructureSchema.shape.exercises.min(1) }).optional() })),
})
const cycleDay = daySchema.extend({ exercises: z.array(daySchema.shape.exercises.element.extend({ setIds: z.array(id).min(1).max(100).optional() })).min(1).max(100) })
const cycleStructure = { days: z.array(cycleDay).min(1), weeks: z.array(weekSchema).min(2).optional() }
export const v10BackupDataSchema = v9BackupDataSchema.extend({
  backupSchemaVersion: z.literal(10),
  plans: z.array(v9BackupDataSchema.shape.plans.element.extend(cycleStructure)),
  schedules: z.array(v9BackupDataSchema.shape.schedules.element.extend({
    revisions: z.array(v9BackupDataSchema.shape.schedules.element.shape.revisions.element.extend({ ...cycleStructure, mapping: cycleMappingSchema })).min(1),
    outcomes: z.array(v9BackupDataSchema.shape.schedules.element.shape.outcomes.unwrap().element.extend({ day: cycleDay })).optional(),
  })),
  drafts: z.array(v9BackupDataSchema.shape.drafts.element.extend({ day: cycleDay })),
  sessions: z.array(v9BackupDataSchema.shape.sessions.element.extend({ day: cycleDay })),
})
const workoutDay = cycleDay.extend({ instructions: originalDaySchema.shape.instructions, notes: originalDaySchema.shape.notes, sourceWorkoutId: id.optional() })
const standaloneSource = z.discriminatedUnion('kind', [z.object({ kind: z.literal('workout'), workoutId: id }).strict(), z.object({ kind: z.literal('custom'), workoutId: id.optional() }).strict()])
const sessionSource = { sourcePlanId: id.optional(), planName: z.string().optional(), source: standaloneSource.optional(), timeZone: timeZoneSchema.optional(), day: workoutDay, structure: sessionStructureSchema.optional() }
export const v11BackupDataSchema = v10BackupDataSchema.extend({
  backupSchemaVersion: z.literal(11),
  workouts: z.array(workoutDay.omit({ sourceWorkoutId: true }).extend(archived)),
  plans: z.array(v10BackupDataSchema.shape.plans.element.extend({ days: z.array(workoutDay).min(1) })),
  schedules: z.array(v10BackupDataSchema.shape.schedules.element.extend({
    revisions: z.array(v10BackupDataSchema.shape.schedules.element.shape.revisions.element.extend({ days: z.array(workoutDay).min(1) })).min(1),
    outcomes: z.array(v10BackupDataSchema.shape.schedules.element.shape.outcomes.unwrap().element.extend({ day: workoutDay })).optional(),
  })),
  drafts: z.array(v10BackupDataSchema.shape.drafts.element.extend({ ...sessionSource, day: workoutDay.extend({ exercises: workoutDay.shape.exercises.min(0) }), input: sessionInputSchema })),
  sessions: z.array(v10BackupDataSchema.shape.sessions.element.extend(sessionSource)),
})
export const backupDataSchema = v11BackupDataSchema.extend({
  backupSchemaVersion: z.literal(BACKUP_VERSION),
  exercises: z.array(v11BackupDataSchema.shape.exercises.element.extend({ mergedIntoId: id.optional(), mergedAt: time.optional(), mergeOperationId: id.optional() })),
})
export const inventorySchema = z.object({ path: z.string(), bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/), mediaType: z.string() }).strict()
export const manifestSchema = z.object({
  format: z.literal('boros-profile-backup'), backupSchemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12)]), databaseSchemaVersion: z.union([z.literal(5), z.literal(6)]),
  app: z.object({ name: z.literal('boros'), version: z.string().min(1) }).strict(), exportedAt: time, snapshotAt: time,
  profile: z.object({ id, name: z.string(), kind: z.enum(['guest', 'named']) }).strict(), snapshotPolicy: z.union([z.literal(LEGACY_SNAPSHOT_POLICY), z.literal(SNAPSHOT_POLICY)]),
  counts: z.record(z.number().int().nonnegative()), csvRows: z.record(z.number().int().nonnegative()),
  authoritative: z.tuple([z.literal('data.json'), z.literal('manifest.json'), z.literal('photos/')]),
  checksum: z.literal('SHA-256 of every payload file as uncompressed bytes; manifest.json is excluded. Integrity only, not authenticity.'),
  exclusions: z.array(z.string()), inventory: z.array(inventorySchema), assets: z.array(assetSchema.extend({ sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
}).strict()
export type BackupManifest = z.infer<typeof manifestSchema>
export function recordCounts(data: BackupData) {
  return { ...(data.backupSchemaVersion >= 11 ? { workouts: data.workouts.length } : {}), profiles: 1, tags: data.tags.length, exercises: data.exercises.length, plans: data.plans.length, schedules: data.schedules.length, drafts: data.drafts.length, sessions: data.sessions.length, measurements: data.measurements.length, assets: data.assets.length, ...(data.backupSchemaVersion >= 5 ? { outcomes: data.schedules.reduce((n, run) => n + (run.outcomes?.length ?? 0), 0), excludedWeeks: data.schedules.reduce((n, run) => n + (run.excludedWeeks?.length ?? 0), 0) } : {}) }
}
function equalRecord(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => equalRecord(value, b[index]))
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left).filter((key) => left[key] !== undefined).sort(), other = Object.keys(right).filter((key) => right[key] !== undefined).sort()
  return keys.length === other.length && keys.every((key, index) => key === other[index] && equalRecord(left[key], right[key]))
}
export function validateBackupData(data: BackupData) {
  const fail = (message: string): never => { throw new Error(`Backup cannot be completed: ${message}. Reopen the affected record and repair it before retrying; source data was not changed.`) }
  const validation = (data.backupSchemaVersion === 1 ? legacyBackupDataSchema : data.backupSchemaVersion === 2 ? v2BackupDataSchema : data.backupSchemaVersion === 3 ? v3BackupDataSchema : data.backupSchemaVersion === 4 ? v4BackupDataSchema : data.backupSchemaVersion === 5 ? v5BackupDataSchema : data.backupSchemaVersion === 6 ? v6BackupDataSchema : data.backupSchemaVersion === 7 ? v7BackupDataSchema : data.backupSchemaVersion === 8 ? v8BackupDataSchema : data.backupSchemaVersion === 9 ? v9BackupDataSchema : data.backupSchemaVersion === 10 ? v10BackupDataSchema : data.backupSchemaVersion === 11 ? v11BackupDataSchema : backupDataSchema).safeParse(data)
  if (!validation.success) { const issue = validation.error.issues[0]; fail(`invalid saved ${issue.path.join('.')}: ${issue.message}`) }
  const index = <T extends { id: string; profileId: string }>(records: T[], label: string) => {
    const map = new Map<string, T>()
    for (const item of records) { if (item.profileId !== data.profile.id) fail(`wrong profile in ${label}`); if (map.has(item.id)) fail(`duplicate ${label} ID ${item.id}`); map.set(item.id, item) }
    return map
  }
  const tags = index(data.tags, 'tag'), plans = index(data.plans, 'plan'), schedules = index(data.schedules, 'schedule'), drafts = index(data.drafts, 'draft'), sessions = index(data.sessions, 'session'), assets = index(data.assets, 'photo')
  const workouts = index(data.workouts ?? [], 'workout')
  const templates = index(data.exercises, 'exercise'); index(data.measurements, 'measurement')
  const resolve = exerciseResolver(data.profile.id, data.exercises)
  for (const exercise of data.exercises) {
    if (exercise.mergedIntoId) {
      if (!exercise.mergedAt || !exercise.mergeOperationId || exercise.activeNameKey !== undefined) fail('invalid retired exercise metadata')
      resolve(exercise.id) // checks destination ownership, missing links and cycles
    } else if (exercise.mergedAt || exercise.mergeOperationId) fail('merge metadata requires a destination')
  }
  for (const selected of data.profile.selectedPlanIds ?? []) if (!plans.has(selected)) fail(`selected plan ${selected} is missing`)
  for (const exercise of data.exercises) for (const tag of exercise.tagIds) if (!tags.has(tag)) fail(`exercise ${exercise.id} requires missing tag ${tag}`)
  for (const workout of workouts.values()) { workoutInputSchema.parse(workout); for (const exercise of workout.exercises) if (templateReference(exercise) && !templates.has(templateReference(exercise)!)) fail('workout requires a missing exercise template') }
  for (const plan of data.plans) { planInputSchema.parse(plan); for (const day of plan.days) for (const item of day.exercises) if (item.templateId && !templates.has(item.templateId)) fail(`plan ${plan.id} requires missing template ${item.templateId}`) }
  for (const day of [...data.plans.flatMap(p => p.days), ...data.schedules.flatMap(s => [...s.revisions.flatMap(r => r.days), ...(s.outcomes ?? []).map(o => o.day)]), ...data.drafts.map(d => d.day), ...data.sessions.map(s => s.day)]) if (day.sourceWorkoutId && !workouts.has(day.sourceWorkoutId)) fail('snapshot requires a missing workout template')
  for (const schedule of data.schedules) {
    if (schedule.closedAt && !schedule.stoppedFrom) fail('closed run requires a schedule cutoff')
    if (schedule.kind === 'unscheduled' && schedule.identity !== 'program-week') fail('weekly program is missing its stable identity mode')
    if (!plans.has(schedule.planId)) fail(`schedule ${schedule.id} requires missing plan ${schedule.planId}`)
    if (monday(schedule.startWeek) !== schedule.startWeek) fail(`schedule ${schedule.id} has invalid start week`)
    if (schedule.endDate !== programEnd(schedule.startWeek, schedule.durationWeeks, schedule.excludedWeeks)) fail(`schedule ${schedule.id} has inconsistent duration/end date`)
    const gaps = schedule.excludedWeeks ?? []
    if (new Set(gaps).size !== gaps.length || gaps.some((week, i) => monday(week) !== week || week < schedule.startWeek || (i > 0 && gaps[i - 1] >= week))) fail('invalid excluded weeks')
    const outcomeKeys = new Set<string>(), outcomeIds = new Set<string>()
    for (const outcome of schedule.outcomes ?? []) {
      const ref = outcome.ref, segment = schedule.revisions.find((item) => item.id === ref.scheduleRevisionId)
      if (ref.unscheduled !== (schedule.kind === 'unscheduled' || segment?.unscheduled ? true : undefined) || ref.programWeek !== (schedule.identity ? programWeek(schedule, ref.scheduledWeek) : undefined) || schedule.excludedWeeks?.includes(ref.scheduledWeek)) fail('outcome has inconsistent program week')
      if (outcomeKeys.has(ref.key) || outcomeIds.has(outcome.id) || ref.scheduleId !== schedule.id || ref.dayId !== outcome.day.id || !segment?.days.some((day) => day.id === ref.dayId) || ref.timeZone !== schedule.timeZone || ref.scheduledWeek !== monday(ref.scheduledDate) || ref.key !== occurrenceKey(schedule.id, ref.dayId, ref.scheduledDate, ref.programWeek)) fail('inconsistent occurrence outcome')
      if (outcome.status !== 'pending' && [...data.drafts, ...data.sessions].some((item) => item.occurrenceKey === ref.key)) fail('outcome overlaps session or draft')
      outcomeKeys.add(ref.key); outcomeIds.add(outcome.id)
      planInputSchema.parse({ name: outcome.planName, days: [outcome.day] })
    }
    const changes = schedule.durationChanges ?? [], changeIds = new Set<string>()
    changes.forEach((change, i) => {
      if (changeIds.has(change.id) || monday(change.effectiveFrom) !== change.effectiveFrom || change.effectiveFrom < schedule.startWeek || (i > 0 && changes[i - 1].effectiveFrom >= change.effectiveFrom) || change.endDate !== programEnd(schedule.startWeek, change.durationWeeks, schedule.excludedWeeks)) fail(`schedule ${schedule.id} has invalid duration history`)
      changeIds.add(change.id)
    })
    const ids = new Set<string>()
    for (const item of schedule.revisions) { if (ids.has(item.id)) fail(`schedule ${schedule.id} has duplicate revision ${item.id}`); ids.add(item.id); validateMapping(item.mapping, item.days, item.weeks); planInputSchema.parse({ name: item.planName, days: item.days, weeks: item.weeks, durationWeeks: (schedule.durationChanges?.findLast((c) => c.effectiveFrom <= item.effectiveFrom) ?? schedule).durationWeeks }); if (item.effectiveUntil && item.effectiveUntil < item.effectiveFrom) fail(`schedule ${schedule.id} has reversed revision dates`) }
    const exceptions = new Set<string>()
    for (const ref of schedule.occurrenceExceptions ?? []) {
      const segment = schedule.revisions.find((r) => r.id === ref.scheduleRevisionId), key = `${ref.scheduledWeek}/${ref.dayId}`
      if (exceptions.has(key) || ref.scheduleId !== schedule.id || !segment?.days.some((d) => d.id === ref.dayId) || ref.scheduledWeek !== monday(ref.scheduledDate) || ref.timeZone !== schedule.timeZone || ref.key !== occurrenceKey(schedule.id, ref.dayId, ref.scheduledDate, ref.programWeek) || ref.programWeek !== (schedule.identity ? programWeek(schedule, ref.scheduledWeek) : undefined) || ref.unscheduled !== (schedule.kind === 'unscheduled' || segment?.unscheduled ? true : undefined) || schedule.excludedWeeks?.includes(ref.scheduledWeek)) fail('invalid occurrence exception')
      exceptions.add(key)
    }
  }
  for (const item of [...data.drafts, ...data.sessions]) {
    validateStructure(item.day, item.structure)
    if (item.source) {
      if (item.sourcePlanId || item.planName !== undefined || item.planInstructions !== undefined || item.occurrence || item.occurrenceKey || !item.timeZone || ('activeSourceKey' in item && item.activeSourceKey)) fail('standalone session contains plan metadata or lacks its time zone')
      if (item.source.workoutId && !workouts.has(item.source.workoutId)) fail('standalone session requires its workout template')
    } else if (!item.sourcePlanId || !plans.has(item.sourcePlanId)) fail(`session/draft ${item.id} requires missing plan ${item.sourcePlanId}`)
    if (item.sourceDayId !== item.day.id) fail(`session/draft ${item.id} has mismatched day identity`)
    if (item.day.exercises.length) planInputSchema.parse({ name: item.planName ?? item.day.name, days: [item.day] })
    else if (item.source?.kind !== 'custom' || !('input' in item) || item.finalizedAt) fail('only an unfinished custom workout can be empty')
    if (!!item.occurrence !== !!item.occurrenceKey) fail(`session/draft ${item.id} has incomplete occurrence metadata`)
    if (item.occurrence) {
      const ref = item.occurrence, schedule = schedules.get(ref.scheduleId), revision = schedule?.revisions.find((r) => r.id === ref.scheduleRevisionId)
      if (schedule && (ref.unscheduled !== (schedule.kind === 'unscheduled' || revision?.unscheduled ? true : undefined) || ref.programWeek !== (schedule.identity ? programWeek(schedule, ref.scheduledWeek) : undefined) || schedule.excludedWeeks?.includes(ref.scheduledWeek))) fail('session has inconsistent program week')
      if (!schedule || schedule.planId !== item.sourcePlanId || !revision || !revision.days.some((day) => day.id === ref.dayId) || ref.dayId !== item.sourceDayId || ref.timeZone !== schedule.timeZone || ref.scheduledWeek !== monday(ref.scheduledDate) || ref.key !== occurrenceKey(ref.scheduleId, ref.dayId, ref.scheduledDate, ref.programWeek) || item.occurrenceKey !== ref.key) fail(`session/draft ${item.id} has inconsistent schedule references`)
    }
  }
  for (const draft of data.drafts) { validateDraftInput(draft.input, draft.day); if (draft.finalizedAt && !sessions.has(draft.id)) fail(`finalized draft ${draft.id} requires a completed session`) }
  for (const session of data.sessions) {
    const draft = drafts.get(session.draftId)
    if (!draft || draft.id !== session.id || draft.finalizedAt !== session.completedAt || draft.sourcePlanId !== session.sourcePlanId || !equalRecord(draft.source, session.source) || draft.timeZone !== session.timeZone || draft.occurrenceKey !== session.occurrenceKey || draft.planInstructions !== session.planInstructions || !equalRecord(draft.day, session.day) || !equalRecord(draft.structure, session.structure)) fail(`session ${session.id} has an inconsistent finalized draft`)
    if (session.exercises.length !== session.day.exercises.length || session.exercises.some((e, i) => e.id !== session.day.exercises[i].id || e.sets.length !== session.day.exercises[i].prescription.sets.length)) fail(`session ${session.id} results do not match its snapshot`)
    const assessed = assessSession(draft!.input)
    if (Object.keys(assessed.errors).length || !assessed.recorded || session.partial !== (assessed.skipped > 0) || session.notes !== draft!.input.notes || !equalRecord(assessed.exercises, session.exercises) || session.completedAt < session.startedAt) fail(`session ${session.id} results disagree with its finalized draft`)
  }
  for (const record of [data.profile, ...data.measurements]) if (record.photoId && !assets.has(record.photoId)) fail(`record ${record.id} requires missing photo ${record.photoId}`)
  for (const item of data.measurements) validateTimeContext(item)
  for (const asset of data.assets) if (asset.path !== `photos/${asset.id}.${asset.mediaType === 'image/jpeg' ? 'jpg' : asset.mediaType.split('/')[1]}`) fail(`photo ${asset.id} has an invalid path`)
}

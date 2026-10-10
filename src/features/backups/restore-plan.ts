import { assertSameTrainingType, type TrainingType } from '../../schemas/training-type.ts'
import { closedRunDraftIds } from '../../lib/closed-runs.ts'
import { materializeTemplates } from '../../lib/template-ownership.ts'
import { validateBackupData, type ProfileSnapshot } from '../../schemas/backup.ts'
import { nameKey, type PhotoAsset, type Profile } from '../../schemas/profile.ts'
import type { TrainingDay } from '../../schemas/plan.ts'
import { occurrenceKey } from '../../schemas/schedule.ts'
import { sha256 } from './integrity.ts'
import { displayDateTime } from '../../lib/display-dates.ts'
import { canonicalSnapshot, validateRestoreRecords } from './restore-records.ts'
import type { ValidatedBackup } from './restore-format.ts'

export type RestoreChoice = 'new' | 'replace' | 'device' | 'import' | 'clear'
export const ownedStores = ['deletedSources', 'tags', 'exercises', 'workouts', 'plans', 'schedules', 'drafts', 'sessions', 'measurements', 'photos'] as const
export type OwnedStore = typeof ownedStores[number]
export interface PlanCounts { added: number; conflicts: number; replaced: number; removed: number; skipped: number }
export interface RestorePlan {
  id: string; choice: RestoreChoice; targetId?: string; targetFingerprint?: string; targetPhotoFingerprint?: string; targetName?: string
  result: ProfileSnapshot; counts: Record<OwnedStore, PlanCounts>; warnings: string[]; conflicts: string[]
}
// Stable record-field ordering; photo bytes have a separate fingerprint.
export function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJSON(v)}`).join(',')}}`
  return JSON.stringify(value)
}
export function snapshotFingerprint(snapshot: ProfileSnapshot) { return stableJSON(canonicalSnapshot(snapshot)) }
export async function photoFingerprint(photos: PhotoAsset[]) {
  const hashes: [string, string][] = []
  for (const photo of photos) hashes.push([photo.id, await sha256(new Uint8Array(await photo.blob.arrayBuffer()))])
  return stableJSON(hashes.sort(([a], [b]) => a.localeCompare(b)))
}
const signature = <T extends { profileId?: string }>(record: T) => { const { profileId: _owner, ...rest } = record; return stableJSON(rest) }
async function remapId(seed: string) {
  const hash = await sha256(new TextEncoder().encode(`boros-restore-v1:${seed}`))
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
type Named = { id: string; name: string; nameKey: string }
function matches<T extends Named>(incoming: T[], local: T[], label: string) {
  const result = new Map<string, T>(), used = new Set<string>()
  for (const item of incoming) {
    const byId = local.find((row) => row.id === item.id), byName = local.filter((row) => nameKey(row.name) === nameKey(item.name))
    if (byName.length > 1 || (byId && byName.some((row) => row.id !== byId.id))) throw new Error(`Ambiguous ${label} "${item.name}": ID and normalized name identify different records. Import under a new name or resolve the names first.`)
    const found = byId ?? byName[0]
    if (found && label !== 'tag') assertSameTrainingType(item as T & { trainingType?: TrainingType }, found as T & { trainingType?: TrainingType })
    if (found) { if (used.has(found.id)) throw new Error(`Ambiguous ${label} matching: multiple imported records identify "${found.name}".`); used.add(found.id); result.set(item.id, found) }
  }
  return result
}

// No DB writes. Preserve optional legacy profile zones without inventing a preference.
// Hash-derived collision IDs are stable across repeated imports and owner rotations.
export async function buildRestorePlan(backup: ValidatedBackup | undefined, local: ProfileSnapshot | undefined, choice: RestoreChoice, newId: string, displayName: string, at: string): Promise<RestorePlan> {
  if ((choice !== 'new') !== !!local || (choice !== 'clear' && !backup)) throw new Error('Choose an available profile and restore operation.')
  const counts = Object.fromEntries(ownedStores.map((key) => [key, { added: 0, conflicts: 0, replaced: 0, removed: 0, skipped: 0 }])) as RestorePlan['counts']
  const warnings: string[] = [], conflicts: string[] = [], merging = choice === 'device' || choice === 'import', preferImport = choice !== 'device'
  const input = backup && structuredClone(backup.data), current = local && canonicalSnapshot(local)
  if (input) { validateBackupData(input); validateRestoreRecords(input) }
  if (current && merging) { validateBackupData(current); validateRestoreRecords(current) }
  if (choice !== 'new' && input && nameKey(input.profile.name) !== nameKey(local!.profile.name)) throw new Error('Restore target must match the imported profile name.')
  const source = choice === 'clear' || choice === 'device' ? local!.profile : input!.profile
  const profile: Profile = choice === 'clear'
    ? { id: newId, name: source.name, nameKey: source.nameKey, kind: source.kind, weightUnit: source.weightUnit, heightUnit: source.heightUnit, ...(source.timeZone ? { timeZone: source.timeZone } : {}), revision: 1, createdAt: at, updatedAt: at }
    : { ...structuredClone(source), id: newId, ...(choice === 'new' ? { name: displayName.trim(), nameKey: nameKey(displayName), kind: input!.profile.kind === 'guest' && displayName === 'Guest' ? 'guest' as const : 'named' as const } : {}) }
  if (!profile.nameKey || profile.name.length > 80) throw new Error('Enter an unused profile name of 1–80 characters.')
  const result: ProfileSnapshot = { databaseVersion: 11, deletedSources: [], capturedAt: at, profile, tags: [], exercises: [], workouts: [], plans: [], schedules: [], drafts: [], sessions: [], measurements: [], photos: [] }
  const plan: RestorePlan = { id: newId, choice, targetId: local?.profile.id, targetName: local?.profile.name, targetFingerprint: local && snapshotFingerprint(local), targetPhotoFingerprint: local && await photoFingerprint(local.photos), result, counts, warnings, conflicts }
  if (choice === 'clear') { for (const key of ownedStores) counts[key].removed = (local![key] ?? []).length; return plan }
  const file = input!, device = current
  const tombstones = [...(merging ? device!.deletedSources ?? [] : []), ...(file.deletedSources ?? [])]
  result.deletedSources = [...new Map(tombstones.map(t => [`${t.kind}:${t.id}`, t])).values()]
  counts.deletedSources.added = result.deletedSources.length - (merging ? (device!.deletedSources?.length ?? 0) : 0)
  // A merge cannot silently revive a deleted identity or delete retained device
  // results from an imported tombstone. Resolve that explicit conflict by New or Replace.
  for (const t of result.deletedSources) {
    const key = t.kind === 'exercise' ? 'exercises' : t.kind === 'workout' ? 'workouts' : 'plans'
    if ([...file[key], ...(merging ? device![key] : [])].some(r => r.id === t.id)) throw new Error('This backup and device disagree about a deleted library item. Restore under a new profile name or use reviewed Replace; merge cannot revive or delete it implicitly.')
  }
  const localPlans = merging ? device!.plans : [], localExercises = merging ? device!.exercises : [], localTags = merging ? device!.tags : []
  const localWorkouts = merging ? device!.workouts : [], workoutMatches = matches(file.workouts, localWorkouts, 'workout')
  const workoutIds = new Map(file.workouts.map(w => [w.id, workoutMatches.get(w.id)?.id ?? w.id]))
  const planMatches = matches(file.plans, localPlans, 'plan'), exerciseMatches = new Map(file.exercises.flatMap(row => { const found = localExercises.find(e => e.id === row.id); if (found && !found.mergedIntoId && !row.mergedIntoId && localExercises.some(e => e.id !== found.id && !e.mergedIntoId && nameKey(e.name) === nameKey(row.name))) throw new Error(`Ambiguous exercise "${row.name}": ID and name identify different records. Restore under a new profile name.`); return found ? [[row.id, found] as const] : [] })), tagMatches = matches(file.tags, localTags, 'tag')
  const planIds = new Map(file.plans.map((p) => [p.id, planMatches.get(p.id)?.id ?? p.id])), exerciseIds = new Map(file.exercises.map((e) => [e.id, exerciseMatches.get(e.id)?.id ?? e.id])), tagIds = new Map(file.tags.map((t) => [t.id, tagMatches.get(t.id)?.id ?? t.id]))
  for (const [label, found] of [['workout', workoutMatches], ['plan', planMatches], ['exercise', exerciseMatches], ['tag', tagMatches]] as const) for (const row of found.values()) conflicts.push(`${label}: ${row.name}`)
  const mergeNamed = <T extends Named>(incoming: T[], locals: T[], found: Map<string, T>, key: 'plans' | 'exercises' | 'tags' | 'workouts') => {
    const replaced = new Set(preferImport ? [...found.values()].map((row) => row.id) : [])
    const kept = locals.filter((row) => !replaced.has(row.id)), selected = incoming.filter((row) => preferImport || !found.has(row.id)).map((row) => ({ ...row, id: found.get(row.id)?.id ?? row.id }))
    counts[key].conflicts = found.size; counts[key].replaced = replaced.size; counts[key].skipped = preferImport ? 0 : found.size
    counts[key].added = incoming.length - found.size
    return { all: [...kept, ...selected], imported: selected }
  }
  const tags = mergeNamed(file.tags, localTags, tagMatches, 'tags'), exercises = mergeNamed(file.exercises, localExercises, exerciseMatches, 'exercises'), plans = mergeNamed(file.plans, localPlans, planMatches, 'plans')
  const workouts = mergeNamed(file.workouts, localWorkouts, workoutMatches, 'workouts'); result.workouts = workouts.all
  result.tags = tags.all; result.exercises = exercises.all; result.plans = plans.all
  if (profile.selectedPlanIds) profile.selectedPlanIds = [...new Set(profile.selectedPlanIds.map((id) => choice === 'device' ? id : planIds.get(id)!).filter((id) => result.plans.some((p) => p.id === id)))]
  for (const exercise of exercises.imported) {
    exercise.tagIds = exercise.tagIds.map((id) => tagIds.get(id)!)
    if (exercise.mergedIntoId) exercise.mergedIntoId = exerciseIds.get(exercise.mergedIntoId) ?? exercise.mergedIntoId
    const previous = localExercises.find(e => e.id === exercise.id)
    if (previous) assertSameTrainingType(previous, exercise)
    // A pre-merge backup may update fields according to precedence, but cannot
    // revive a retired identity used by retained device history.
    if (previous?.mergedIntoId && !exercise.mergedIntoId) {
      exercise.mergedIntoId = previous.mergedIntoId; exercise.mergedAt = previous.mergedAt; exercise.mergeOperationId = previous.mergeOperationId; exercise.activeNameKey = undefined
      warnings.push(`Retain the existing merge for exercise "${previous.name}"; the older record cannot restore a separate selectable identity.`)
    }
  }
  const importedPlanIds = new Set(file.plans.filter((p) => preferImport || !planMatches.has(p.id)).map((p) => p.id)), removedLocalPlans = new Set(preferImport ? [...planMatches.values()].map((p) => p.id) : [])
  const retained = <T extends { sourcePlanId?: string }>(rows: T[]) => rows.filter((row) => (!row.sourcePlanId || !removedLocalPlans.has(row.sourcePlanId)))
  const incomingStandalone = new Set(file.drafts.filter(d => d.source).map(d => d.id))
  const retainStandalone = <T extends { id: string; source?: unknown }>(rows: T[]) => rows.filter(row => !(preferImport && row.source && incomingStandalone.has(row.id)))
  const localSchedules = merging ? device!.schedules.filter((s) => !removedLocalPlans.has(s.planId)) : [], localDrafts = merging ? retainStandalone(retained(device!.drafts)) : [], localSessions = merging ? retainStandalone(retained(device!.sessions)) : []
  const importedSchedules = file.schedules.filter((s) => importedPlanIds.has(s.planId)), importedDrafts = file.drafts.filter((s) => (s.source ? preferImport || !device?.drafts.some(d => d.id === s.id && d.source) : !!s.sourcePlanId && importedPlanIds.has(s.sourcePlanId))), importedSessions = file.sessions.filter((s) => (s.source ? preferImport || !device?.drafts.some(d => d.id === s.id && d.source) : !!s.sourcePlanId && importedPlanIds.has(s.sourcePlanId)))
  const allocate = async (kind: string, rows: { id: string }[], retainedRows: { id: string }[]) => {
    const used = new Set(retainedRows.map((r) => r.id)), ids = new Map<string, string>()
    for (const row of rows) {
      const id = used.has(row.id) ? await remapId(`${kind}:${file.profile.id}:${row.id}`) : row.id
      if (used.has(id)) throw new Error(`Ambiguous ${kind} identity after remapping. Import under a new name.`)
      used.add(id); ids.set(row.id, id)
    }
    return ids
  }
  const scheduleIds = await allocate('schedule', importedSchedules, localSchedules), draftIds = await allocate('draft', importedDrafts, [...localDrafts, ...localSessions])
  const remapInterval = (state?: import('../../schemas/interval-session.ts').IntervalState) => {
    if (!state) return
    for (const phase of [...state.phases, ...state.results.map(r => r.phase)]) if (phase.templateId) phase.templateId = exerciseIds.get(phase.templateId) ?? phase.templateId
  }
  for (const item of [...importedDrafts, ...importedSessions]) remapInterval(item.interval)
  // Imported drafts are inert checkpoints, never imported live ownership.
  for (const draft of importedDrafts.filter(d => !d.finalizedAt)) if (draft.interval) {
    if (draft.interval.status === 'running') draft.interval.status = 'paused'
    draft.interval.anchorAt = undefined
    if (draft.interval.execution) draft.interval.execution.owner = undefined
  }
  const remapDay = (day: TrainingDay) => { if (day.publishedWorkoutId) day.publishedWorkoutId = workoutIds.get(day.publishedWorkoutId) ?? day.publishedWorkoutId; if (day.sourceWorkoutId) day.sourceWorkoutId = workoutIds.get(day.sourceWorkoutId) ?? day.sourceWorkoutId; for (const exercise of day.exercises) { if (exercise.templateId) exercise.templateId = exerciseIds.get(exercise.templateId) ?? exercise.templateId; if (exercise.source) { const ids = exercise.source.kind === 'exercise' ? exerciseIds : planIds; exercise.source.id = ids.get(exercise.source.id) ?? exercise.source.id; if (exercise.source.kind === 'plan' && exercise.source.libraryId) exercise.source.libraryId = exerciseIds.get(exercise.source.libraryId) ?? exercise.source.libraryId } } }
  for (const w of workouts.imported) remapDay(w)
  for (const p of plans.imported) p.days.forEach(remapDay)
  for (const schedule of importedSchedules) { schedule.id = scheduleIds.get(schedule.id)!; schedule.planId = planIds.get(schedule.planId)!; for (const ref of schedule.occurrenceExceptions ?? []) { ref.scheduleId = schedule.id; ref.key = occurrenceKey(schedule.id, ref.dayId, ref.scheduledDate, ref.programWeek) } for (const revision of schedule.revisions) revision.days.forEach(remapDay); for (const outcome of schedule.outcomes ?? []) { outcome.ref.scheduleId = schedule.id; outcome.ref.key = occurrenceKey(schedule.id, outcome.ref.dayId, outcome.ref.scheduledDate, outcome.ref.programWeek); remapDay(outcome.day) } }
  for (const item of [...importedDrafts, ...importedSessions]) {
    item.id = draftIds.get(item.id)!; if (item.sourcePlanId) item.sourcePlanId = planIds.get(item.sourcePlanId)!; if (item.source?.workoutId) item.source.workoutId = workoutIds.get(item.source.workoutId) ?? item.source.workoutId; remapDay(item.day)
    if (item.occurrence) { item.occurrence.scheduleId = scheduleIds.get(item.occurrence.scheduleId)!; item.occurrence.key = occurrenceKey(item.occurrence.scheduleId, item.occurrence.dayId, item.occurrence.scheduledDate, item.occurrence.programWeek); item.occurrenceKey = item.occurrence.key }
    if ('draftId' in item) item.draftId = item.id
    else item.activeSourceKey = item.finalizedAt || item.source ? undefined : item.occurrenceKey ? `scheduled:${item.occurrenceKey}` : `${item.sourcePlanId}:${item.sourceDayId}`
  }
  result.schedules = [...localSchedules, ...importedSchedules]; result.drafts = [...localDrafts, ...importedDrafts]; result.sessions = [...localSessions, ...importedSessions]
  for (const key of ['schedules', 'drafts', 'sessions'] as const) {
    const selected = key === 'schedules' ? importedSchedules : key === 'drafts' ? importedDrafts : importedSessions
    const kept = key === 'schedules' ? localSchedules : key === 'drafts' ? localDrafts : localSessions
    counts[key].added = selected.length; counts[key].removed = (merging ? device![key].length : 0) - kept.length; counts[key].skipped = file[key].length - selected.length
    if (key !== 'schedules' && merging) {
      const collisions = file[key].filter(row => row.source && device![key].some(old => old.id === row.id && old.source))
      counts[key].conflicts = collisions.length; counts[key].replaced = preferImport ? collisions.length : 0
      counts[key].added -= counts[key].replaced; counts[key].removed -= counts[key].replaced
      if (key === 'drafts') for (const row of collisions) conflicts.push(`standalone session: ${row.id}`)
    }
  }
  const localMeasurements = merging ? device!.measurements : [], measurementIds = new Set(file.measurements.map((m) => m.id))
  for (const m of file.measurements) {
    const same = localMeasurements.find((row) => row.id === m.id)
    if (same) { counts.measurements.conflicts++; conflicts.push(`measurement: ${m.id} (${displayDateTime(same.measuredAt, 'UTC')} / ${displayDateTime(m.measuredAt, 'UTC')} UTC)`); if (same.measuredAt !== m.measuredAt || same.loggedAt !== m.loggedAt) warnings.push(`Measurement ${m.id} has different date/origin metadata. The selected source wins this ID.`) }
    if (m.lastMutationId && localMeasurements.some((row) => row.id !== m.id && row.lastMutationId === m.lastMutationId)) throw new Error('Ambiguous measurement: the same saved mutation has different IDs. Import under a new name and review the measurements separately.')
  }
  const selectedMeasurements = file.measurements.filter((m) => preferImport || !localMeasurements.some((row) => row.id === m.id))
  result.measurements = [...localMeasurements.filter((m) => !preferImport || !measurementIds.has(m.id)), ...selectedMeasurements]
  counts.measurements.added = file.measurements.length - counts.measurements.conflicts; counts.measurements.replaced = preferImport ? counts.measurements.conflicts : 0; counts.measurements.skipped = preferImport ? 0 : counts.measurements.conflicts
  const importedRefs = [...(choice === 'device' ? [] : [result.profile]), ...selectedMeasurements], localRefs = [...(choice === 'device' ? [result.profile] : []), ...result.measurements.filter((m) => !selectedMeasurements.includes(m))]
  const localRequired = new Set(localRefs.flatMap((r) => r.photoId ? [r.photoId] : [])), importedRequired = new Set(importedRefs.flatMap((r) => r.photoId ? [r.photoId] : []))
  result.photos = (local?.photos ?? []).filter((p) => localRequired.has(p.id)).map((p) => ({ ...p }))
  for (const photo of backup!.photos.filter((p) => importedRequired.has(p.id))) {
    const existing = result.photos.find((p) => p.id === photo.id), hash = await sha256(new Uint8Array(await photo.blob.arrayBuffer()))
    const metadata = ({ blob, ...row }: PhotoAsset) => ({ ...row, blobType: blob.type, blobSize: blob.size })
    let id = photo.id
    if (existing && (signature(metadata(existing)) !== signature(metadata(photo)) || await sha256(new Uint8Array(await existing.blob.arrayBuffer())) !== hash)) id = await remapId(`photo:${photo.id}:${signature(metadata(photo))}:${hash}`)
    for (const ref of importedRefs) if (ref.photoId === photo.id) ref.photoId = id
    const found = result.photos.find((p) => p.id === id)
    if (found && (signature(metadata(found)) !== signature({ ...metadata(photo), id }) || await sha256(new Uint8Array(await found.blob.arrayBuffer())) !== hash)) throw new Error('Ambiguous photo identity after remapping.')
    if (!found) result.photos.push({ ...photo, id })
  }
  counts.photos.added = result.photos.filter((p) => !local?.photos.some((old) => old.id === p.id)).length
  counts.photos.removed = (local?.photos ?? []).filter((p) => !result.photos.some((next) => next.id === p.id)).length
  if (local && !merging) for (const key of ownedStores) { counts[key].removed = local[key].length; counts[key].added = result[key].length }
  const removesFamilies = !!(counts.drafts.removed || counts.sessions.removed || counts.schedules.removed)
  for (const key of ownedStores) result[key] = result[key].map((record) => ({ ...record, profileId: newId })) as never
  const abandoned = closedRunDraftIds(result.schedules, result.drafts, result.sessions)
  if (abandoned.length) {
    result.drafts = result.drafts.filter((draft) => !abandoned.includes(draft.id))
    const omitted = importedDrafts.filter((draft) => abandoned.includes(draft.id)).length
    counts.drafts.removed += abandoned.length - omitted
    counts.drafts.added -= omitted
    counts.drafts.skipped += omitted
    warnings.push('Closed-run compatibility cleanup: omit ' + abandoned.length + ' unfinished drafts from explicitly left runs. Completed history stays unchanged.')
  }
  const activeExerciseNames = new Set<string>()
  for (const exercise of result.exercises.filter(e => !e.archivedAt && !e.mergedIntoId)) {
    if (activeExerciseNames.has(exercise.nameKey)) throw new Error('Different exercise identities share a name. Restore under a new profile name or resolve the names first; exercises are not merged by name.')
    activeExerciseNames.add(exercise.nameKey)
  }
  const repaired = materializeTemplates(newId, result, at)
  result.plans = repaired.plans; result.exercises = repaired.exercises; result.tags = repaired.tags
  counts.exercises.added += repaired.addedExercises.length; counts.tags.added += repaired.addedTags.length
  if (repaired.changedPlans.length || repaired.addedExercises.length) warnings.push(`Library compatibility repair: update links in ${repaired.changedPlans.length} plans and add ${repaired.addedExercises.length} independent templates using the earliest retained occurrence defaults. Existing templates and all historical snapshots stay unchanged. Original AI defaults may no longer be recoverable.`)
  validateBackupData(canonicalSnapshot(result)); validateRestoreRecords(canonicalSnapshot(result))
  if (removesFamilies) warnings.push('Removed plan families include all their history, schedules and saved drafts. Histories are not combined inside a conflicting family.')
  return plan
}

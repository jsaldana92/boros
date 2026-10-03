import { validateBackupData, type ProfileSnapshot } from '../../schemas/backup.ts'
import { nameKey, type PhotoAsset, type Profile } from '../../schemas/profile.ts'
import type { TrainingDay } from '../../schemas/plan.ts'
import { occurrenceKey } from '../../schemas/schedule.ts'
import { sha256 } from './integrity.ts'
import { displayDateTime } from '../../lib/display-dates.ts'
import { canonicalSnapshot, validateRestoreRecords } from './restore-records.ts'
import type { ValidatedBackup } from './restore-format.ts'
import { browserZone } from '../../lib/calendar-dates.ts'

export type RestoreChoice = 'new' | 'replace' | 'device' | 'import' | 'clear'
export const ownedStores = ['tags', 'exercises', 'plans', 'schedules', 'drafts', 'sessions', 'measurements', 'photos'] as const
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
    if (found) { if (used.has(found.id)) throw new Error(`Ambiguous ${label} matching: multiple imported records identify "${found.name}".`); used.add(found.id); result.set(item.id, found) }
  }
  return result
}

// No DB writes; the optional default zone is captured for a reviewed legacy import.
// Hash-derived collision IDs are stable across repeated imports and owner rotations.
export async function buildRestorePlan(backup: ValidatedBackup | undefined, local: ProfileSnapshot | undefined, choice: RestoreChoice, newId: string, displayName: string, at: string, defaultTimeZone = browserZone()): Promise<RestorePlan> {
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
  profile.timeZone ??= defaultTimeZone
  const result: ProfileSnapshot = { databaseVersion: 5, capturedAt: at, profile, tags: [], exercises: [], plans: [], schedules: [], drafts: [], sessions: [], measurements: [], photos: [] }
  const plan: RestorePlan = { id: newId, choice, targetId: local?.profile.id, targetName: local?.profile.name, targetFingerprint: local && snapshotFingerprint(local), targetPhotoFingerprint: local && await photoFingerprint(local.photos), result, counts, warnings, conflicts }
  if (choice === 'clear') { for (const key of ownedStores) counts[key].removed = local![key].length; return plan }
  const file = input!, device = current
  const localPlans = merging ? device!.plans : [], localExercises = merging ? device!.exercises : [], localTags = merging ? device!.tags : []
  const planMatches = matches(file.plans, localPlans, 'plan'), exerciseMatches = matches(file.exercises, localExercises, 'exercise'), tagMatches = matches(file.tags, localTags, 'tag')
  const planIds = new Map(file.plans.map((p) => [p.id, planMatches.get(p.id)?.id ?? p.id])), exerciseIds = new Map(file.exercises.map((e) => [e.id, exerciseMatches.get(e.id)?.id ?? e.id])), tagIds = new Map(file.tags.map((t) => [t.id, tagMatches.get(t.id)?.id ?? t.id]))
  for (const [label, found] of [['plan', planMatches], ['exercise', exerciseMatches], ['tag', tagMatches]] as const) for (const row of found.values()) conflicts.push(`${label}: ${row.name}`)
  const mergeNamed = <T extends Named>(incoming: T[], locals: T[], found: Map<string, T>, key: 'plans' | 'exercises' | 'tags') => {
    const replaced = new Set(preferImport ? [...found.values()].map((row) => row.id) : [])
    const kept = locals.filter((row) => !replaced.has(row.id)), selected = incoming.filter((row) => preferImport || !found.has(row.id)).map((row) => ({ ...row, id: found.get(row.id)?.id ?? row.id }))
    counts[key].conflicts = found.size; counts[key].replaced = replaced.size; counts[key].skipped = preferImport ? 0 : found.size
    counts[key].added = incoming.length - found.size
    return { all: [...kept, ...selected], imported: selected }
  }
  const tags = mergeNamed(file.tags, localTags, tagMatches, 'tags'), exercises = mergeNamed(file.exercises, localExercises, exerciseMatches, 'exercises'), plans = mergeNamed(file.plans, localPlans, planMatches, 'plans')
  result.tags = tags.all; result.exercises = exercises.all; result.plans = plans.all
  if (profile.selectedPlanIds) profile.selectedPlanIds = [...new Set(profile.selectedPlanIds.map((id) => choice === 'device' ? id : planIds.get(id)!).filter((id) => result.plans.some((p) => p.id === id)))]
  for (const exercise of exercises.imported) exercise.tagIds = exercise.tagIds.map((id) => tagIds.get(id)!)
  const importedPlanIds = new Set(file.plans.filter((p) => preferImport || !planMatches.has(p.id)).map((p) => p.id)), removedLocalPlans = new Set(preferImport ? [...planMatches.values()].map((p) => p.id) : [])
  const retained = <T extends { sourcePlanId: string }>(rows: T[]) => rows.filter((row) => !removedLocalPlans.has(row.sourcePlanId))
  const localSchedules = merging ? device!.schedules.filter((s) => !removedLocalPlans.has(s.planId)) : [], localDrafts = merging ? retained(device!.drafts) : [], localSessions = merging ? retained(device!.sessions) : []
  const importedSchedules = file.schedules.filter((s) => importedPlanIds.has(s.planId)), importedDrafts = file.drafts.filter((s) => importedPlanIds.has(s.sourcePlanId)), importedSessions = file.sessions.filter((s) => importedPlanIds.has(s.sourcePlanId))
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
  const remapDay = (day: TrainingDay) => { for (const exercise of day.exercises) if (exercise.source) { const ids = exercise.source.kind === 'exercise' ? exerciseIds : planIds; exercise.source.id = ids.get(exercise.source.id) ?? exercise.source.id; if (exercise.source.kind === 'plan' && exercise.source.libraryId) exercise.source.libraryId = exerciseIds.get(exercise.source.libraryId) ?? exercise.source.libraryId } }
  for (const p of plans.imported) p.days.forEach(remapDay)
  for (const schedule of importedSchedules) { schedule.id = scheduleIds.get(schedule.id)!; schedule.planId = planIds.get(schedule.planId)!; for (const revision of schedule.revisions) revision.days.forEach(remapDay) }
  for (const item of [...importedDrafts, ...importedSessions]) {
    item.id = draftIds.get(item.id)!; item.sourcePlanId = planIds.get(item.sourcePlanId)!; remapDay(item.day)
    if (item.occurrence) { item.occurrence.scheduleId = scheduleIds.get(item.occurrence.scheduleId)!; item.occurrence.key = occurrenceKey(item.occurrence.scheduleId, item.occurrence.dayId, item.occurrence.scheduledDate); item.occurrenceKey = item.occurrence.key }
    if ('draftId' in item) item.draftId = item.id
    else item.activeSourceKey = item.finalizedAt ? undefined : item.occurrenceKey ? `scheduled:${item.occurrenceKey}` : `${item.sourcePlanId}:${item.sourceDayId}`
  }
  result.schedules = [...localSchedules, ...importedSchedules]; result.drafts = [...localDrafts, ...importedDrafts]; result.sessions = [...localSessions, ...importedSessions]
  for (const key of ['schedules', 'drafts', 'sessions'] as const) {
    const selected = key === 'schedules' ? importedSchedules : key === 'drafts' ? importedDrafts : importedSessions
    const kept = key === 'schedules' ? localSchedules : key === 'drafts' ? localDrafts : localSessions
    counts[key].added = selected.length; counts[key].removed = (merging ? device![key].length : 0) - kept.length; counts[key].skipped = file[key].length - selected.length
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
  for (const key of ownedStores) result[key] = result[key].map((record) => ({ ...record, profileId: newId })) as never
  validateBackupData(canonicalSnapshot(result)); validateRestoreRecords(canonicalSnapshot(result))
  if (counts.drafts.removed || counts.sessions.removed || counts.schedules.removed) warnings.push('Removed plan families include all their history, schedules and saved drafts. Histories are not combined inside a conflicting family.')
  return plan
}

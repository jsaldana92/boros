import { BACKUP_VERSION, type BackupData, type ProfileSnapshot } from '../../schemas/backup.ts'
import { nameKey } from '../../schemas/profile.ts'

export function canonicalSnapshot(snapshot: ProfileSnapshot): BackupData {
  const { databaseVersion: _version, capturedAt: _at, photos, ...records } = snapshot
  return { format: 'boros-profile-backup', backupSchemaVersion: BACKUP_VERSION, ...structuredClone(records), workouts: structuredClone(snapshot.workouts ?? []), assets: photos.map(({ blob, ...photo }) => ({ ...photo, bytes: blob.size, mediaType: blob.type as 'image/png' | 'image/jpeg' | 'image/webp', path: `photos/${photo.id}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1]}` })) }
}

// Checks required for restoring unique indexes and derived identity fields. The
// export validator remains compatible with historical v1 exports.
export function validateRestoreRecords(data: BackupData) {
  const names = (records: { id: string; name: string; nameKey: string; archivedAt?: string; activeNameKey?: string; mergedIntoId?: string }[], label: string, archive = false) => {
    const active = new Set<string>()
    for (const record of records) {
      const key = nameKey(record.name)
      if (!key || record.nameKey !== key || (archive && record.activeNameKey !== (record.archivedAt || record.mergedIntoId ? undefined : key))) throw new Error(`Invalid normalized ${label} name: ${record.name}`)
      if (!archive || (!record.archivedAt && !record.mergedIntoId)) { if (active.has(key)) throw new Error(`Duplicate normalized ${label} name: ${record.name}`); active.add(key) }
    }
  }
  names([data.profile], 'profile'); if (data.profile.name.trim().length > 80) throw new Error('Profile name exceeds 80 characters.')
  names(data.tags, 'tag'); names(data.exercises, 'exercise', true); names(data.plans, 'plan', true); names(data.workouts ?? [], 'workout', true)
  const unique = (values: (string | undefined)[], label: string) => { const defined = values.filter((v): v is string => v !== undefined); if (new Set(defined).size !== defined.length) throw new Error(`Duplicate ${label} identity.`) }
  unique(data.drafts.map((d) => d.activeSourceKey), 'active draft'); unique(data.drafts.map((d) => d.occurrenceKey), 'draft occurrence'); unique(data.sessions.map((s) => s.occurrenceKey), 'completed occurrence')
  for (const draft of data.drafts) {
    const expected = draft.finalizedAt || draft.source ? undefined : draft.occurrenceKey ? `scheduled:${draft.occurrenceKey}` : `${draft.sourcePlanId}:${draft.sourceDayId}`
    if (draft.activeSourceKey !== expected) throw new Error(`Draft ${draft.id} has inconsistent active identity.`)
  }
}

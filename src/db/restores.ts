import { reconcileWorkout } from './active-workout.ts'
import { createId } from '../lib/browser-crypto.ts'
import { db, type BorosDatabase } from './database.ts'
import Dexie from 'dexie'
import { captureProfile } from './backups.ts'
import { nameKey } from '../schemas/profile.ts'
import { buildRestorePlan, ownedStores, snapshotFingerprint, photoFingerprint, type RestoreChoice, type RestorePlan } from '../features/backups/restore-plan.ts'
import { decodeBackupPhoto, type ValidatedBackup } from '../features/backups/restore-format.ts'
import { latestMeasurement } from './measurements.ts'

export class StaleRestoreError extends Error {
  constructor() { super('Saved data changed after preview. Nothing was imported or cleared. Build a fresh preview and confirm its updated consequences.'); this.name = 'StaleRestoreError' }
}

export function restoreService(database: BorosDatabase, decodePhoto = decodeBackupPhoto) {
  // Plans are issued by this service. Keep a private copy so the reviewed operation
  // cannot be retargeted by later UI edits. Successful/repeated calls share a receipt.
  const prepared = new WeakMap<RestorePlan, RestorePlan>(), inFlight = new WeakMap<RestorePlan, Promise<string>>(), committed = new WeakMap<RestorePlan, string>()
  return {
    async matchingProfile(backup: ValidatedBackup) { return database.profiles.where('nameKey').equals(nameKey(backup.data.profile.name)).first() },
    async preview(backup: ValidatedBackup | undefined, choice: RestoreChoice, newName?: string, clearId?: string) {
      const match = backup ? await database.profiles.where('nameKey').equals(nameKey(backup.data.profile.name)).first() : undefined
      const targetId = choice === 'clear' ? clearId : choice === 'new' ? undefined : match?.id
      if (choice !== 'new' && !targetId) throw new Error('The target profile is unavailable. Choose a profile and preview again.')
      const displayName = choice === 'new' ? newName ?? backup!.data.profile.name : match?.name ?? ''
      if (choice === 'new' && await database.profiles.where('nameKey').equals(nameKey(displayName)).first()) throw new Error('A profile with that normalized name already exists. Enter an unused name.')
      const snapshot = targetId ? await captureProfile(targetId, database) : undefined
      const plan = await buildRestorePlan(backup, snapshot, choice, createId(), displayName, new Date().toISOString())
      // Image decode and Blob reads finish before the write transaction.
      for (const photo of plan.result.photos) await decodePhoto(photo)
      prepared.set(plan, structuredClone(plan)); return plan
    },
    commit(reviewed: RestorePlan, confirmed: boolean): Promise<string> {
      if (!confirmed) return Promise.reject(new Error('Confirm the reviewed operation before saving.'))
      if (committed.has(reviewed)) return Promise.resolve(committed.get(reviewed)!)
      if (inFlight.has(reviewed)) return inFlight.get(reviewed)!
      const plan = prepared.get(reviewed)
      if (!plan) return Promise.reject(new Error('Build a fresh preview before saving.'))
      const operation = database.transaction('rw', database.tables, async () => {
        if (plan.targetId) {
          if (!await database.profiles.get(plan.targetId)) throw new StaleRestoreError()
          const actual = await captureProfile(plan.targetId, database)
          if (snapshotFingerprint(actual) !== plan.targetFingerprint) throw new StaleRestoreError()
          // Decode/validation already finished. This byte-level concurrency check
          // also detects same-size Blob replacement without changed metadata.
          // waitFor keeps the transaction alive; timeout/failure rolls it all back.
          if (await Dexie.waitFor(photoFingerprint(actual.photos)) !== plan.targetPhotoFingerprint) throw new StaleRestoreError()
        }
        const nameMatch = await database.profiles.where('nameKey').equals(plan.result.profile.nameKey).first()
        if ((nameMatch?.id ?? undefined) !== plan.targetId) throw new StaleRestoreError()
        if (await database.profiles.get(plan.id)) throw new StaleRestoreError()
        if (plan.targetId) {
          for (const store of ownedStores) await database[store].where('profileId').equals(plan.targetId).delete()
          await database.restTimers.where('profileId').equals(plan.targetId).delete()
          await database.profiles.delete(plan.targetId)
        }
        await database.profiles.add(plan.result.profile)
        for (const store of ownedStores) if (plan.result[store].length) await database.table(store).bulkAdd(plan.result[store])
        await reconcileWorkout(database)
        // Current weight remains derived from dated measurements, never a cache.
        await latestMeasurement(database, plan.id)
        if (!await database.settings.update('workspace', { activeProfileId: plan.id })) throw new Error('Workspace settings are unavailable. The operation was rolled back.')
        return plan.id
      }).then((id) => { committed.set(reviewed, id); return id }).finally(() => { inFlight.delete(reviewed) })
      inFlight.set(reviewed, operation); return operation
    },
  }
}
export const restores = restoreService(db)

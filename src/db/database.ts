import Dexie, { type Table } from 'dexie'
import type { Measurement, PhotoAsset, Profile, WorkspaceSettings } from '../schemas/profile.ts'
import type { Plan } from '../schemas/plan.ts'
import type { Exercise, Tag } from '../schemas/exercise.ts'

export class BorosDatabase extends Dexie {
  profiles!: Table<Profile, string>
  settings!: Table<WorkspaceSettings, string>
  photos!: Table<PhotoAsset, [string, string]>
  measurements!: Table<Measurement, [string, string]>
  exercises!: Table<Exercise, [string, string]>
  tags!: Table<Tag, [string, string]>
  plans!: Table<Plan, [string, string]>

  constructor(name = 'boros') {
    super(name)
    // Retain v1 forever. Future changes add version(n).stores(...).upgrade(...)
    // in a transaction; never delete/recreate a database to recover from errors.
    this.version(1).stores({
      profiles: 'id, &nameKey',
      settings: 'id',
      photos: '[profileId+id], profileId',
      measurements: '[profileId+id], [profileId+measuredAt], profileId',
    })
    // Additive migration: existing v1 stores and records are untouched.
    this.version(2).stores({
      exercises: '[profileId+id], profileId, &[profileId+activeNameKey]',
      tags: '[profileId+id], profileId, &[profileId+nameKey]',
    })
    // Additive v3: prescriptions live inside one atomically saved plan record.
    this.version(3).stores({ plans: '[profileId+id], profileId, &[profileId+activeNameKey]' })
  }
}

export const db = new BorosDatabase()

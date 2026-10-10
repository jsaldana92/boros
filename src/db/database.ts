import { convertIntervalDay } from '../schemas/interval-conversion.ts'
import type { DeletedSource } from '../schemas/deleted-source.ts'
import type { Workout } from '../schemas/workout.ts'
import Dexie, { type Table } from 'dexie'
import type { Measurement, PhotoAsset, Profile, WorkspaceSettings } from '../schemas/profile.ts'
import type { Plan } from '../schemas/plan.ts'
import type { Exercise, Tag } from '../schemas/exercise.ts'
import type { CompletedSession, RestTimer, SessionDraft } from '../schemas/session.ts'
import type { Schedule } from '../schemas/schedule.ts'
import { classifyStrengthRecords } from './training-migration.ts'
import type { ActiveWorkout } from './active-workout.ts'

export class BorosDatabase extends Dexie {
  activeWorkouts!: Table<ActiveWorkout, string>
  deletedSources!: Table<DeletedSource, [string, string, string]>
  profiles!: Table<Profile, string>
  settings!: Table<WorkspaceSettings, string>
  photos!: Table<PhotoAsset, [string, string]>
  measurements!: Table<Measurement, [string, string]>
  exercises!: Table<Exercise, [string, string]>
  tags!: Table<Tag, [string, string]>
  plans!: Table<Plan, [string, string]>
  workouts!: Table<Workout, [string, string]>
  drafts!: Table<SessionDraft, [string, string]>
  sessions!: Table<CompletedSession, [string, string]>
  restTimers!: Table<RestTimer, string>
  schedules!: Table<Schedule, [string, string]>

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
    this.version(4).stores({
      drafts: '[profileId+id], profileId, &[profileId+activeSourceKey]',
      sessions: '[profileId+id], profileId, &[profileId+draftId]',
      restTimers: 'id, profileId',
    })
    // Existing v4 records remain byte-for-byte unchanged. Absent occurrence keys
    // are not indexed, so unscheduled history remains separate.
    this.version(5).stores({
      schedules: '[profileId+id], profileId, [profileId+planId]',
      drafts: '[profileId+id], profileId, &[profileId+activeSourceKey], &[profileId+occurrenceKey]',
      sessions: '[profileId+id], profileId, &[profileId+draftId], &[profileId+occurrenceKey]',
    })
    // Additive v6: never extract plan copies or rewrite existing records.
    this.version(6).stores({ workouts: '[profileId+id], profileId, &[profileId+activeNameKey]' })
    // Additive only: retain deleted library identities without resurrecting templates.
    this.version(7).stores({ deletedSources: '[profileId+kind+id], profileId' })
    this.version(8).stores({}).upgrade(async transaction => {
      for (const name of ['exercises', 'workouts', 'plans', 'schedules', 'drafts', 'sessions']) {
        await transaction.table(name).toCollection().modify(record => { classifyStrengthRecords(record) })
      }
    })
    // Optional timer-generation and workout-rest fields: existing snapshots stay intact.
    this.version(9).stores({})
    // Only editable templates are converted. Schedules, started drafts and
    // completed snapshots retain their original phase identities and timing.
    this.version(10).stores({}).upgrade(async transaction => {
      await transaction.table('workouts').toCollection().modify(record => { Object.assign(record, convertIntervalDay(record)) })
      await transaction.table('plans').toCollection().modify(record => { record.days = record.days.map(convertIntervalDay) })
    })
    // Optional independent-rest execution and rest cue ledger. No record rewrites.
    this.version(11).stores({})
    // Local ownership is not a foreign runtime lock or part of exported profiles.
    this.version(12).stores({ activeWorkouts: 'id' })
  }
}

export const db = new BorosDatabase()

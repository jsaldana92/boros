import { type BorosDatabase, db } from './database.ts'
import { nameKey, photoSchema, profileInputSchema, themeSchema, workspaceSettingsSchema } from '../schemas/profile.ts'
import { appendSettingsWeight, latestMeasurement } from './measurements.ts'
import { removeUnusedPhoto } from './photos.ts'
import type { PreparedPhoto, Profile, ProfileInput, Theme } from '../schemas/profile.ts'

export class ConflictError extends Error {
  constructor() { super('This profile changed in another tab. Your input is kept. Review the latest saved profile before trying again.'); this.name = 'ConflictError' }
}

export function profileService(database: BorosDatabase) {
  const tables = [database.profiles, database.settings, database.photos, database.measurements]
  const latestWeight = (profileId: string) => latestMeasurement(database, profileId)
  const getProfile = async (id: string) => {
    const profile = await database.profiles.get(id)
    if (!profile) throw new Error('The selected profile is missing. No replacement workspace was created.')
    return profile
  }
  const checkName = async (displayName: string, ownId?: string) => {
    if (!nameKey(displayName)) throw new Error('Enter a profile name.')
    const existing = await database.profiles.where('nameKey').equals(nameKey(displayName)).first()
    if (existing && existing.id !== ownId) throw new Error('A profile with that name already exists.')
  }
  return {
    async initialize() {
      await database.open()
      return database.transaction('rw', database.tables, async () => {
        const settings = await database.settings.get('workspace')
        if (settings) {
          workspaceSettingsSchema.parse(settings)
          await getProfile(settings.activeProfileId)
          return settings
        }
        if ((await Promise.all(database.tables.map((table) => table.count()))).some(Boolean)) {
          throw new Error('Workspace settings are missing but records exist. No data was replaced. Keep this browser data and seek recovery assistance.')
        }
        const now = new Date().toISOString()
        const guest: Profile = { id: crypto.randomUUID(), kind: 'guest', name: 'Guest', nameKey: nameKey('Guest'), weightUnit: 'kg', heightUnit: 'cm', revision: 1, createdAt: now, updatedAt: now }
        await database.profiles.add(guest)
        const initial = { id: 'workspace' as const, activeProfileId: guest.id, theme: 'dark' as const, noticeAccepted: false }
        await database.settings.add(initial)
        return initial
      })
    },
    list: () => database.profiles.toArray(),
    settings: () => database.settings.get('workspace'),
    getProfile,
    latestWeight,
    async snapshot(profileId: string) {
      return database.transaction('r', tables, async () => {
        const profile = await getProfile(profileId)
        const measurement = await latestWeight(profileId)
        const photo = profile.photoId ? await database.photos.get([profileId, profile.photoId]) : undefined
        return { profile, measurement, photo }
      })
    },
    async select(profileId: string) {
      await database.transaction('rw', database.profiles, database.settings, async () => {
        await getProfile(profileId)
        if (!await database.settings.update('workspace', { activeProfileId: profileId })) throw new Error('Workspace settings are unavailable.')
      })
    },
    async setTheme(theme: Theme) {
      themeSchema.parse(theme)
      if (!await database.settings.update('workspace', { theme })) throw new Error('Appearance could not be saved.')
    },
    async acceptNotice() {
      if (!await database.settings.update('workspace', { noticeAccepted: true })) throw new Error('The storage notice could not be saved.')
    },
    async create(name: string) {
      const input = profileInputSchema.parse({ name, weightUnit: 'kg', heightUnit: 'cm' })
      return database.transaction('rw', database.profiles, database.settings, async () => {
        await checkName(input.name)
        const now = new Date().toISOString()
        const profile: Profile = { id: crypto.randomUUID(), name: input.name, nameKey: nameKey(input.name), kind: 'named', revision: 1, weightUnit: 'kg', heightUnit: 'cm', createdAt: now, updatedAt: now }
        await database.profiles.add(profile)
        if (!await database.settings.update('workspace', { activeProfileId: profile.id })) throw new Error('Workspace settings are unavailable.')
        return profile
      })
    },
    async save(profileId: string, expectedRevision: number, raw: ProfileInput, photo?: PreparedPhoto | null) {
      const input = profileInputSchema.parse(raw)
      if (photo) photoSchema.parse(photo)
      return database.transaction('rw', tables, async () => {
        const original = await getProfile(profileId)
        if (original.revision !== expectedRevision) throw new ConflictError()
        const displayName = input.name || (original.kind === 'guest' ? 'Guest' : '')
        await checkName(displayName, profileId)
        const { weightKg, ...fields } = input
        const next: Profile = { ...original, ...fields, name: displayName, nameKey: nameKey(displayName), kind: input.name ? 'named' : original.kind, revision: original.revision + 1, updatedAt: new Date().toISOString() }
        if (photo !== undefined) {
          next.photoId = photo ? crypto.randomUUID() : undefined
          if (photo) await database.photos.add({ ...photo, profileId, id: next.photoId!, createdAt: next.updatedAt, role: 'avatar' })
        }
        if (weightKg !== undefined) await appendSettingsWeight(database, profileId, weightKg)
        await database.profiles.put(next)
        if (photo !== undefined) await removeUnusedPhoto(database, profileId, original.photoId)
        return next
      })
    },
  }
}

export const profiles = profileService(db)
export type ProfileSnapshot = Awaited<ReturnType<typeof profiles.snapshot>>

import { z } from 'zod'

export const weightUnitSchema = z.enum(['kg', 'lb'])
export const heightUnitSchema = z.enum(['cm', 'ft'])
export const themeSchema = z.enum(['dark', 'light'])
export const workspaceSettingsSchema = z.object({
  id: z.literal('workspace'),
  activeProfileId: z.string().uuid(),
  theme: themeSchema,
  noticeAccepted: z.boolean(),
})
export type WeightUnit = z.infer<typeof weightUnitSchema>
export type HeightUnit = z.infer<typeof heightUnitSchema>
export type Theme = z.infer<typeof themeSchema>

// NFKC folds compatibility forms; whitespace and case are ignored for conflicts.
export const nameKey = (name: string) => name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
export const profileInputSchema = z.object({
  name: z.string().trim().max(80, 'Name must be 80 characters or fewer.'),
  age: z.number().int().min(0).max(130).optional(),
  heightCm: z.number().finite().positive().max(300).optional(),
  weightKg: z.number().finite().positive().max(1000).optional(),
  weightUnit: weightUnitSchema,
  heightUnit: heightUnitSchema,
})
export type ProfileInput = z.infer<typeof profileInputSchema>

export interface Profile {
  id: string
  kind: 'guest' | 'named'
  name: string
  nameKey: string
  age?: number
  heightCm?: number
  weightUnit: WeightUnit
  heightUnit: HeightUnit
  photoId?: string
  revision: number
  createdAt: string
  updatedAt: string
}
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>
export interface PhotoAsset {
  profileId: string
  id: string
  blob: Blob
  width: number
  height: number
  createdAt: string
  role: 'avatar' | 'progress'
}
export interface Measurement {
  profileId: string
  id: string
  weightKg: number
  measuredAt: string
  loggedAt: string
  // Optional metadata keeps legacy v5 records readable without rewriting them.
  updatedAt?: string
  revision?: number
  photoId?: string
  measuredLocal?: string
  timeZone?: string
  offsetMinutes?: number
  lastMutationId?: string
}
export const photoSchema = z.object({
  blob: z.instanceof(Blob).refine((blob) => ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) && blob.size > 0 && blob.size <= 5 * 1024 * 1024, 'Choose a JPEG, PNG, or WebP image up to 5 MB.'),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
})
export type PreparedPhoto = z.infer<typeof photoSchema>
export const measurementSchema = z.object({
  weightKg: z.number().finite().positive().max(1000),
  measuredAt: z.string().datetime(),
  measuredLocal: z.string().optional(),
  timeZone: z.string().optional(),
  offsetMinutes: z.number().int().optional(),
})

export const toKg = (value: number, unit: WeightUnit) => unit === 'lb' ? value * 0.45359237 : value
export const fromKg = (value: number, unit: WeightUnit) => unit === 'lb' ? value / 0.45359237 : value
export const displayNumber = (value: number) => String(Number(value.toFixed(6)))

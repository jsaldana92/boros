import { z } from 'zod'
import { nameKey } from './profile.ts'

const integer = (minimum: number) => z.number().finite().int('Use a whole number.').min(minimum, `Must be at least ${minimum}.`).max(Number.MAX_SAFE_INTEGER)
const range = (minimum: number) => z.object({ min: integer(minimum), max: integer(minimum) }).refine((value) => value.max >= value.min, { message: 'Maximum must be at least the minimum.', path: ['max'] })
export const setSchema = z.object({ reps: range(1), rir: range(0).optional() })
export const tagNameSchema = z.string().trim().min(1, 'Enter a tag name.').max(80, 'Use at most 80 characters.').refine((value) => !!nameKey(value), 'Enter a tag name.')

export function isYouTubeUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    const videoId = /^[A-Za-z0-9_-]{11}$/
    if (url.hostname === 'youtu.be') return videoId.test(url.pathname.slice(1))
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) return false
    if (url.pathname === '/watch') return url.searchParams.getAll('v').length === 1 && videoId.test(url.searchParams.get('v') ?? '')
    return /^\/(shorts|live|embed)\/[A-Za-z0-9_-]{11}$/.test(url.pathname)
  } catch { return false }
}
export const exerciseInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter an exercise name.').max(120, 'Use at most 120 characters.').refine((value) => !!nameKey(value), 'Enter an exercise name.'),
  sets: z.array(setSchema).min(1, 'Add at least one set.').max(100, 'Use at most 100 sets.'),
  restBetweenSeconds: integer(0).optional(),
  restAfterSeconds: integer(0).optional(),
  instructions: z.string().max(20000, 'Use at most 20,000 characters.').optional(),
  notes: z.string().max(20000, 'Use at most 20,000 characters.').optional(),
  tutorialUrl: z.string().trim().refine(isYouTubeUrl, 'Use an HTTPS YouTube video URL (watch, youtu.be, shorts, live, or embed).').optional(),
  tagNames: z.array(tagNameSchema).max(50, 'Use at most 50 tags.'),
})
export type ExerciseInput = z.infer<typeof exerciseInputSchema>
export interface Exercise extends Omit<ExerciseInput, 'tagNames'> {
  id: string
  profileId: string
  nameKey: string
  activeNameKey?: string
  tagIds: string[]
  createdAt: string
  updatedAt: string
  archivedAt?: string
  revision: number
}
export interface Tag {
  id: string
  profileId: string
  name: string
  nameKey: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

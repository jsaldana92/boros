import { z } from 'zod'
// Minimal identity metadata only; no prescription, notes or performance data.
export const deletedSourceSchema = z.object({ profileId: z.string().uuid(), id: z.string().uuid(), kind: z.enum(['exercise', 'workout', 'plan']), deletedAt: z.string().datetime(), mergedIntoId: z.string().uuid().optional() }).strict()
export type DeletedSource = z.infer<typeof deletedSourceSchema>

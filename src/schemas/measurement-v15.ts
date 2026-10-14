// Frozen weight-only contract for backup versions 1 through 21.
import { z } from 'zod'

export const measurementSchema = z.object({
  weightKg: z.number().finite().positive().max(1000),
  measuredAt: z.string().datetime(),
  measuredLocal: z.string().optional(),
  timeZone: z.string().optional(),
  offsetMinutes: z.number().int().optional(),
})


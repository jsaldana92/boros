import { z } from 'zod'
import { createId } from '../lib/browser-crypto.ts'

export const circuitSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(120),
  exerciseIds: z.array(z.string().uuid()).min(1).max(100),
  roundsPerSet: z.number().int().min(1).max(100), sets: z.number().int().min(1).max(100),
  restBetweenSetsSeconds: z.number().int().min(0).max(86400),
  restAfterCircuitSeconds: z.number().int().min(0).max(86400),
}).strict()
export type Circuit = z.infer<typeof circuitSchema>
export const newCircuit = (number: number): Circuit => ({ id: createId(), name: `Circuit ${number}`, exerciseIds: [], roundsPerSet: 1, sets: 1, restBetweenSetsSeconds: 0, restAfterCircuitSeconds: 0 })

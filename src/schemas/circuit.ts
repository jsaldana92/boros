import { z } from 'zod'
import { createId } from '../lib/browser-crypto.ts'
import { circuitSchema as legacyCircuitSchema } from './circuit-legacy.ts'
export { legacyCircuitSchema }
export const repeatCircuitSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(120),
  exerciseIds: z.array(z.string().uuid()).min(1).max(100),
  repeat: z.number().int().min(0).max(10).default(0),
  restAfterCircuitSeconds: z.number().int().min(0).max(86400),
}).strict()
// Historical snapshots retain the strict original shape. New editors/wire
// contracts use repeatCircuitSchema exclusively.
export const circuitSchema = z.union([repeatCircuitSchema, legacyCircuitSchema])
export type Circuit = z.infer<typeof circuitSchema>
export type RepeatCircuit = z.infer<typeof repeatCircuitSchema>
export const isRepeatCircuit = (c: Circuit): c is RepeatCircuit => 'repeat' in c
export const newCircuit = (number: number): RepeatCircuit => ({ id: createId(), name: `Circuit ${number}`, exerciseIds: [], repeat: 0, restAfterCircuitSeconds: 0 })

import { z } from 'zod'
import { weightUnitSchema, toKg } from './profile.ts'

export const sides = ['left', 'right'] as const
export type Side = typeof sides[number]
export const lrMode = (p: { trainingType?: string; lrDistinction?: boolean }) => p.trainingType !== 'interval' && p.lrDistinction === true
export const conversionSchema = z.object({ operationId: z.string().uuid(), convertedAt: z.string().datetime(), fromMode: z.enum(['no', 'lr']), copiedFrom: z.literal('unsided').optional(), selectedSide: z.enum(sides).optional() }).strict()
const text = z.string().max(64)
export const sideInputSchema = z.object({ load: text, reps: text, rir: text, unit: weightUnitSchema, skipped: z.boolean(), conversion: conversionSchema.optional() }).strict()
export const resultInputSchema = sideInputSchema.extend({ sides: z.object({ left: sideInputSchema, right: sideInputSchema }).strict().optional() }).strict()
const number = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const recordedSideSchema = z.discriminatedUnion('skipped', [
  z.object({ skipped: z.literal(true), unrecorded: z.literal(true).optional(), conversion: conversionSchema.optional() }).strict(),
  z.object({ skipped: z.literal(false), weightKg: number.optional(), load: number.optional(), unit: weightUnitSchema.optional(), reps: number.int().optional(), rir: number.int().optional(), conversion: conversionSchema.optional() }).strict(),
])
export const recordedSetSchema = z.union([recordedSideSchema, z.object({ sides: z.object({ left: recordedSideSchema, right: recordedSideSchema }).strict() }).strict()])
export type SideInput = z.infer<typeof sideInputSchema>
export type ResultInput = z.infer<typeof resultInputSchema>
export type RecordedSide = z.infer<typeof recordedSideSchema>
export type RecordedSet = z.infer<typeof recordedSetSchema>
export type Conversion = z.infer<typeof conversionSchema>
export const recordedRows = (set: RecordedSet): { side?: Side; result: RecordedSide }[] => 'sides' in set ? sides.map(side => ({ side, result: set.sides[side] })) : [{ result: set }]
export const inputRows = (set: ResultInput): { side?: Side; result: SideInput }[] => set.sides ? sides.map(side => ({ side, result: set.sides![side] })) : [{ result: set }]
export const blankResult = (unit: z.infer<typeof weightUnitSchema>, lr = false): ResultInput => {
  const value: SideInput = { load: '', reps: '', rir: '', unit, skipped: false }
  return lr ? { ...value, sides: { left: { ...value }, right: { ...value } } } : value
}
export const actualSide = (set: RecordedSide) => !set.skipped && (set.weightKg !== undefined || set.reps !== undefined)
const numberText = (text: string) => text.trim() && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()) && Number.isFinite(Number(text)) ? Number(text) : undefined
// Choose one whole tuple. Missing never becomes zero and RIR never breaks a tie.
function winner<T>(left: T, right: T, score: (v: T) => { actual: boolean; weight?: number; reps?: number; skipped: boolean }) {
  const a = score(left), b = score(right)
  if (a.actual !== b.actual) return a.actual ? 'left' : 'right'
  if (a.actual) {
    if (a.weight !== b.weight) return a.weight !== undefined && (b.weight === undefined || a.weight > b.weight) ? 'left' : 'right'
    if (a.reps !== b.reps) return a.reps !== undefined && (b.reps === undefined || a.reps > b.reps) ? 'left' : 'right'
  }
  if (!a.actual && a.skipped !== b.skipped) return a.skipped ? 'right' : 'left'
  return 'left'
}
export function convertRecorded(set: RecordedSet, mode: boolean, provenance: Conversion): RecordedSet {
  if (mode) return 'sides' in set ? set : { sides: { left: { ...set, conversion: { ...provenance, copiedFrom: 'unsided' } }, right: { ...set, conversion: { ...provenance, copiedFrom: 'unsided' } } } }
  if (!('sides' in set)) return set
  const side = winner(set.sides.left, set.sides.right, s => ({ actual: actualSide(s), weight: s.skipped ? undefined : s.weightKg, reps: s.skipped ? undefined : s.reps, skipped: s.skipped && !s.unrecorded }))
  const chosen = set.sides[side]
  return { ...(!actualSide(chosen) && !chosen.skipped ? { skipped: true as const, unrecorded: true as const } : chosen), conversion: { ...provenance, selectedSide: side } }
}
export function convertInput(set: ResultInput, mode: boolean, provenance: Conversion): ResultInput {
  if (mode) {
    if (set.sides) return set
    const { sides: _sides, ...unsided } = set
    return { ...blankResult(set.unit), sides: { left: { ...unsided, conversion: { ...provenance, copiedFrom: 'unsided' } }, right: { ...unsided, conversion: { ...provenance, copiedFrom: 'unsided' } } } }
  }
  if (!set.sides) return set
  const side = winner(set.sides.left, set.sides.right, s => ({ actual: !s.skipped && !!(s.load.trim() || s.reps.trim() || s.rir.trim()), weight: !s.skipped && numberText(s.load) !== undefined ? toKg(numberText(s.load)!, s.unit) : undefined, reps: s.skipped ? undefined : numberText(s.reps), skipped: s.skipped }))
  return { ...set.sides[side], conversion: { ...provenance, selectedSide: side } }
}

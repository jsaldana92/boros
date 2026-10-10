import { z } from 'zod'

export const trainingTypeSchema = z.enum(['strength', 'interval'])
export type TrainingType = z.infer<typeof trainingTypeSchema>
// Absence is supported only for the original, validated repetition contract.
export const trainingTypeOf = (value?: { trainingType?: TrainingType }) => value?.trainingType ?? 'strength'
export const trainingTypeName = (type: TrainingType) => type === 'interval' ? 'Interval' : 'Strength'
export function assertSameTrainingType(a: { trainingType?: TrainingType }, b: { trainingType?: TrainingType }) {
  if (trainingTypeOf(a) !== trainingTypeOf(b)) throw new Error('Strength and Interval cannot be mixed or converted. Your input is kept.')
}

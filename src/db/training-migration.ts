import { strengthInputSchema } from '../schemas/exercise.ts'

// Only recognized original records gain a discriminator. No durations, IDs,
// defaults, names, tags, results, or timestamps are manufactured or replaced.
export function classifyStrengthRecords(value: unknown): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { value.forEach(classifyStrengthRecords); return }
  const record = value as Record<string, unknown>
  if (record.trainingType === undefined) {
    if (typeof record.name === 'string' && Array.isArray(record.sets)) {
      strengthInputSchema.strip().parse({ ...record, tagNames: record.tagNames ?? [] })
      record.trainingType = 'strength'
    } else if (typeof record.name === 'string' && (Array.isArray(record.days) || Array.isArray(record.exercises))) record.trainingType = 'strength'
  }
  Object.values(record).forEach(classifyStrengthRecords)
}

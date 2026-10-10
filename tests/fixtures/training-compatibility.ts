// Legacy archive fixtures must use the original field set, not a current record
// with its envelope version relabeled. This helper never runs in application code.
export function withoutTrainingFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutTrainingFields) as T
  if (!value || typeof value !== 'object' || value instanceof Blob) return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['trainingType', 'publishedWorkoutId'].includes(key)).map(([key, item]) => [key, withoutTrainingFields(item)])) as T
}
export function stripTrainingFields(value: object): void {
  if (Array.isArray(value)) { value.forEach(stripTrainingFields); return }
  if (!value || typeof value !== 'object' || value instanceof Blob) return
  for (const key of ['trainingType', 'publishedWorkoutId']) delete value[key]
  Object.values(value).forEach(item => { if (item && typeof item === 'object') stripTrainingFields(item) })
}

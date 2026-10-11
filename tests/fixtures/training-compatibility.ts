// Legacy archive fixtures must use the original field set, not a current record
// with its envelope version relabeled. This helper never runs in application code.
export function withoutTrainingFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutTrainingFields) as T
  if (!value || typeof value !== 'object' || value instanceof Blob) return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['trainingType', 'publishedWorkoutId', 'noteOverride', 'noteEdited', 'noteInitial', 'noteInheritedClear', 'planNotes', 'activity'].includes(key)).map(([key, item]) => [key, withoutTrainingFields(item)])) as T
}
export function stripTrainingFields(value: object): void {
  if (Array.isArray(value)) { value.forEach(stripTrainingFields); return }
  if (!value || typeof value !== 'object' || value instanceof Blob) return
  for (const key of ['trainingType', 'publishedWorkoutId', 'noteOverride', 'noteEdited', 'noteInitial', 'noteInheritedClear', 'planNotes', 'activity']) delete value[key]
  Object.values(value).forEach(item => { if (item && typeof item === 'object') stripTrainingFields(item) })
}

export function stripAnalysisFields(value: object): void {
  if (Array.isArray(value)) { value.forEach(stripAnalysisFields); return }
  if (!value || typeof value !== 'object' || value instanceof Blob) return
  for (const key of ['noteOverride', 'noteEdited', 'noteInitial', 'noteInheritedClear', 'planNotes', 'activity']) delete value[key]
  if (value.day?.trainingType === 'interval' && 'completedAt' in value) value.exercises = []
  Object.values(value).forEach(item => { if (item && typeof item === 'object') stripAnalysisFields(item) })
}

export interface WorkoutIdentity { id: string; profileId: string; mergedIntoId?: string }
export function workoutResolver(profileId: string, records: WorkoutIdentity[]) {
  const owned = new Map(records.filter(w => w.profileId === profileId).map(w => [w.id,w]))
  return (id: string): string => {
    const seen = new Set<string>()
    let current = owned.get(id)
    while (current?.mergedIntoId) {
      if (seen.has(current.id)) throw new Error('Workout merge contains a cycle. Restore valid workout records.')
      seen.add(current.id)
      const next = owned.get(current.mergedIntoId)
      if (!next) throw new Error('A merged workout destination is unavailable in this profile.')
      current = next
    }
    return current?.id ?? id
  }
}

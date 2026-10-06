import type { Exercise } from '../schemas/exercise.ts'

// Redirects keep immutable occurrences/results readable. Names never establish
// a merge relationship, and a redirect never crosses the supplied profile.
export function exerciseResolver(profileId: string, exercises: Exercise[]) {
  const records = new Map(exercises.filter(e => e.profileId === profileId).map(e => [e.id, e]))
  return (id: string): string => {
    const seen = new Set<string>()
    let record = records.get(id)
    while (record?.mergedIntoId) {
      if (seen.has(record.id)) throw new Error('Exercise merge contains a cycle. Restore a valid backup or review the exercise records.')
      seen.add(record.id)
      const next = records.get(record.mergedIntoId)
      if (!next) throw new Error('A merged exercise destination is unavailable in this profile.')
      record = next
    }
    return record?.id ?? id
  }
}

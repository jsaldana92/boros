import type { Workout } from '../../schemas/workout'
import { filterExercises, type LibrarySort } from './library'
export const filterWorkouts = (records: Workout[], search: string, sort: LibrarySort, archived = false, tags: string[] = []) => filterExercises(records.map(w => ({ ...w, tagIds: [] })), search, sort, tags, archived)

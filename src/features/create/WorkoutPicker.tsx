import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { workouts } from '../../db/workouts'
import type { Workout } from '../../schemas/workout'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { SearchSort } from './SearchSort'
import { LibraryExerciseCard } from './LibraryExerciseCard'
import { type LibrarySort } from './library'
import { filterWorkouts } from './workout-filter'

export function WorkoutCards({ records, onChoose }: { records: Workout[]; onChoose: (value: Workout) => void }) {
  return <div className="workout-library-grid" role="region" aria-label="Workout catalog">{records.map(value => <article aria-label={`Workout ${value.name}`} key={value.id}><LibraryExerciseCard name={value.name} createdAt={value.createdAt} onClick={() => onChoose(value)} />{value.archivedAt && <small>Archived</small>}</article>)}</div>
}

export function WorkoutPicker({ profileId, onChoose, onClose, onEmpty }: { profileId: string; onChoose: (value: Workout) => void; onClose: () => void; onEmpty?: () => void }) {
  const [search, setSearch] = useState(''), [sort, setSort] = useState<LibrarySort>('az')
  const result = useLiveQuery(async () => { try { return { records: await workouts.library(profileId) } } catch (e) { return { error: (e as Error).message } } }, [profileId])
  const visible = filterWorkouts(result?.records ?? [], search, sort)
  return <ActionDialog title="Workouts" onClose={onClose}>
    <SearchSort noun="workouts" search={search} sort={sort} onSearch={setSearch} onSort={setSort} />
    {result?.error && <p role="alert">{result.error}</p>}
    {!result ? <p role="status">Loading workouts...</p> : <WorkoutCards records={visible} onChoose={onChoose} />}
    {result?.records && !visible.length && <p>{search ? 'No workouts match this search.' : 'No workouts yet.'}</p>}
    {onEmpty && <button className="plan-add-button" onClick={onEmpty}>New empty workout</button>}
  </ActionDialog>
}

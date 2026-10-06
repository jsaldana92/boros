import { useLiveQuery } from 'dexie-react-hooks'
import { plans } from '../../db/plans'
import { workouts } from '../../db/workouts'
import { PlanEditor } from './PlanEditor'
import { workoutToInput, type Workout, type WorkoutInput } from '../../schemas/workout'
import { createId } from '../../lib/browser-crypto'
import { useState } from 'react'

export function WorkoutEditor({ profileId, initial, original, onClose, onSaved, onSave, initialDirty = false }: { profileId: string; initial?: WorkoutInput; original?: Workout; onClose: () => void; onSaved: (name: string) => void; onSave?: (input: WorkoutInput) => Promise<Workout>; initialDirty?: boolean }) {
  const [draft] = useState<WorkoutInput>(() => initial ?? { id: createId(), name: '', exercises: [] })
  const sources = useLiveQuery(async () => { try { return { data: await plans.library(profileId) } } catch (e) { return { error: (e as Error).message } } }, [profileId])
  return <>{sources?.error && <p role="alert">{sources.error}</p>}<PlanEditor workoutMode profileId={profileId} initial={{ name: draft.name, instructions: draft.instructions, notes: draft.notes, days: [draft] }} original={original ? { ...original, days: [workoutToInput(original)] } : undefined} initialDirty={initialDirty} choices={sources?.data?.choices ?? []} tags={sources?.data?.tags ?? []} onClose={onClose} onSaved={onSaved} onSave={async value => {
    const input = { ...value.days[0], name: value.name, instructions: value.instructions, notes: value.notes }
    return onSave ? onSave(input) : workouts.save(profileId, input, original)
  }} /></>
}

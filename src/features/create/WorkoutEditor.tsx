import { useSimilarWorkout } from './use-similar-workout'
import { useLiveQuery } from 'dexie-react-hooks'
import { plans } from '../../db/plans'
import { workouts } from '../../db/workouts'
import { PlanEditor } from './PlanEditor'
import { workoutToInput, type Workout, type WorkoutInput } from '../../schemas/workout'
import { createId } from '../../lib/browser-crypto'
import { useState } from 'react'

export function WorkoutEditor({ profileId, initial, original, onClose, onSaved, onSave, initialDirty = false }: { profileId: string; initial?: WorkoutInput; original?: Workout; onClose: () => void; onSaved: (name: string) => void; onSave?: (input: WorkoutInput, confirmedSimilar?: string) => Promise<Workout>; initialDirty?: boolean }) {
  const [draft] = useState<WorkoutInput>(() => initial ?? { id: createId(), name: '', exercises: [] })
  const similarity=useSimilarWorkout()
  const sources = useLiveQuery(async () => { try { return { data: await plans.library(profileId) } } catch (e) { return { error: (e as Error).message } } }, [profileId])
  return <>{sources?.error && <p role="alert">{sources.error}</p>}<PlanEditor workoutMode profileId={profileId} initial={{ trainingType: draft.trainingType, name: draft.name, instructions: draft.instructions, notes: draft.notes, noteOverride: draft.noteOverride, days: [draft] }} original={original ? { ...original, days: [workoutToInput(original)] } : undefined} initialDirty={initialDirty} choices={sources?.data?.choices ?? []} tags={sources?.data?.tags ?? []} onClose={onClose} onSaved={onSaved} onSave={async value => {
    const input = { ...value.days[0], name: value.name, instructions: value.instructions, notes: value.notes, noteOverride: value.noteOverride }
    return similarity.save(token => onSave ? onSave(input,token) : workouts.save(profileId,input,original,false,token))
  }} />{similarity.dialog}</>
}

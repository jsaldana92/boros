import { MergeExerciseDialog } from './MergeExerciseDialog'
import { CreateLeaveGuard } from './CreateLeaveGuard'
import { useEffect, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { exercises } from '../../db/exercises'
import type { Exercise, ExerciseInput, Tag } from '../../schemas/exercise'
import { PrescriptionEditor } from './PrescriptionEditor'

export function ExerciseEditor({ profileId, initial, original, tags, onClose, onSaved, onMerged }: { profileId: string; initial?: ExerciseInput; original?: Exercise; tags: Tag[]; onClose: () => void; onSaved: (name: string) => void; onMerged: (exercise: Exercise) => void }) {
  const [merging, setMerging] = useState<ExerciseInput>()
  const { setDirty } = useWorkspace()
  useEffect(() => () => setDirty(false), [setDirty])
  return <><CreateLeaveGuard kind="exercise" /><PrescriptionEditor initial={initial} tags={tags} title={original ? 'Edit exercise' : 'Create exercise'} archived={!!original?.archivedAt} onMerge={original && !original.archivedAt && !original.mergedIntoId ? setMerging : undefined} onDirty={setDirty} onClose={onClose} onSubmit={async (input) => {
    const saved = await exercises.save(profileId, input, original)
    setDirty(false); onSaved(saved.name)
  }} />{merging && original && <MergeExerciseDialog profileId={profileId} edited={original} input={merging} onClose={() => setMerging(undefined)} onSaved={record => { setDirty(false); onMerged(record) }} />}</>
}

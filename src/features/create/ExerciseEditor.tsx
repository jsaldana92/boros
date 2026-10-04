import { useEffect } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { exercises } from '../../db/exercises'
import type { Exercise, ExerciseInput, Tag } from '../../schemas/exercise'
import { PrescriptionEditor } from './PrescriptionEditor'

export function ExerciseEditor({ profileId, initial, original, tags, onClose, onSaved }: { profileId: string; initial?: ExerciseInput; original?: Exercise; tags: Tag[]; onClose: () => void; onSaved: (name: string) => void }) {
  const { setDirty } = useWorkspace()
  useEffect(() => () => setDirty(false), [setDirty])
  return <PrescriptionEditor initial={initial} tags={tags} title={original ? 'Edit exercise' : 'Create exercise'} archived={!!original?.archivedAt} onDirty={() => setDirty(true)} onClose={onClose} onSubmit={async (input) => {
    const saved = await exercises.save(profileId, input, original)
    setDirty(false); onSaved(saved.name)
  }} />
}

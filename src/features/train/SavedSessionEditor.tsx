import { useState } from 'react'
import type { SavedSessionEdit } from '../../db/saved-sessions'
import type { CompletedSession } from '../../schemas/session'
import type { WeightUnit } from '../../schemas/profile'
import { SavedSessionController } from './saved-session-controller'
import { SessionEditor } from './TrainPage'

export function SavedSessionEditor({ edit, unit, onClose, onSaved }: { edit: SavedSessionEdit; unit: WeightUnit; onClose: () => void; onSaved: (session: CompletedSession) => void }) {
  const [controller] = useState(() => new SavedSessionController(edit)), initial = controller.record
  return <><h1 id="train-heading" tabIndex={-1}>{initial.source?.kind === 'custom' ? 'Custom Workout' : initial.source?.kind === 'workout' ? 'Standalone Workout' : initial.planName}</h1>
    <SessionEditor initial={initial} editing={controller} unit={unit} onClose={onClose} onCompleted={onSaved} /></>
}

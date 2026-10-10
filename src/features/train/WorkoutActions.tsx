import { useState } from 'react'
import { Menu } from 'lucide-react'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { TextareaField } from '../../components/ui/Field'

/** Uses only the started workout snapshot; never resolves a current template. */
export function WorkoutActions({ instructions, onNote, noteDisabled }: { instructions?: string; onNote: () => void; noteDisabled?: boolean }) {
  const [view, setView] = useState<'menu' | 'instructions'>()
  return <><button aria-label="Workout actions" onClick={() => setView('menu')}><Menu aria-hidden="true" size={20} /></button>
    {view === 'menu' && <ActionDialog title="Workout actions" onClose={() => setView(undefined)}><div className="exercise-action-list"><button disabled={noteDisabled} onClick={() => { setView(undefined); onNote() }}>Note</button><button onClick={() => setView('instructions')}>Instructions</button></div></ActionDialog>}
    {view === 'instructions' && <ActionDialog title="Workout instructions" onClose={() => setView(undefined)}>{instructions?.trim() ? <p className="plain-text">{instructions}</p> : <p>No instructions.</p>}</ActionDialog>}
  </>
}

export function NoteDialog({ value, title, onDirty, onApply, onClose, busy = false, error }: { value: string; title: string; onDirty: (value: boolean) => void; onApply: (value: string) => void; onClose: () => void; busy?: boolean; error?: string }) {
  const [text, setText] = useState(value)
  const close = () => { if (!busy && (text === value || window.confirm('Discard unapplied note changes?'))) onClose() }
  return <ConfirmDialog title={title} confirmLabel="Save" busy={busy} onCancel={close} onConfirm={() => onApply(text)}><TextareaField label="Note" maxLength={20000} value={text} onChange={event => { setText(event.target.value); onDirty(event.target.value !== value) }} />{error && <p role="alert">{error}</p>}</ConfirmDialog>
}

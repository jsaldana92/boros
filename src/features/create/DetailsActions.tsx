import { Menu } from 'lucide-react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'

export function DetailsActionsButton({ label, expanded, onClick }: { label: string; expanded: boolean; onClick: () => void }) {
  return <button type="button" className="icon-button" aria-label={label} aria-haspopup="dialog" aria-expanded={expanded} onClick={onClick}><Menu size={22} aria-hidden="true" /></button>
}

export function DetailsActions({ title, busy, archived, error, onClose, onEdit, onDuplicate, onArchive, onDelete, onMerge }: {
  title: string; busy: boolean; archived: boolean; error: string; onClose: () => void
  onEdit: () => void; onDuplicate: () => void; onArchive: () => void; onDelete: () => void; onMerge?: () => void
}) {
  return <ActionDialog title={title} onClose={onClose}>
    <div className="exercise-action-list"><button disabled={busy} onClick={onEdit}>Edit</button><button disabled={busy} onClick={onDuplicate}>Duplicate</button>{onMerge && <button disabled={busy} onClick={onMerge}>Merge</button>}<button className={archived ? undefined : 'archive-action'} disabled={busy} onClick={onArchive}>{archived ? 'Restore' : 'Archive'}</button><button className="destructive" disabled={busy} onClick={onDelete}>Delete</button></div>
    {error && <p role="alert">{error}</p>}
  </ActionDialog>
}

import { useEffect, useState, useRef } from 'react'
import { libraryDelete, type DeletePreview } from '../../db/library-delete'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

export function DeleteLibraryDialog({ profileId, kind, record, onClose, onDeleted }: { profileId: string; kind: DeletePreview['kind']; record: { id: string; revision: number }; onClose: () => void; onDeleted: () => void }) {
  const [preview, setPreview] = useState<DeletePreview>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false)
  useEffect(() => { let alive = true; libraryDelete.preview(profileId, kind, record.id, record.revision).then(value => { if (alive) setPreview(value) }).catch((e: Error) => { if (alive) setError(e.message) }); return () => { alive = false } }, [profileId, kind, record.id, record.revision])
  return <ConfirmDialog title={preview?.active ? 'Deleting an Active Plan' : `Delete ${kind}?`} confirmLabel="Delete" destructive busy={busy} confirmDisabled={!preview} onCancel={onClose} onConfirm={() => {
    if (!preview || lock.current) return
    lock.current = true; setBusy(true); setError('')
    void libraryDelete.remove(preview).then(onDeleted).catch((e: Error) => setError(e.message)).finally(() => { lock.current = false; setBusy(false) })
  }}><p>{preview?.active ? 'By deleting this plan you will also leave the plan and will no longer be able to complete the workouts or exercises in it.' : kind === 'plan' ? 'Delete this plan and its training history?' : kind === 'workout' ? 'Delete this workout and its standalone history? Copies and results in plans are kept.' : 'Delete this exercise and its standalone results? Copied prescriptions and plan results are kept.'}</p>{!preview && !error && <p role="status">Checking saved data...</p>}{error && <p role="alert">{error}</p>}</ConfirmDialog>
}

import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { captureAnalysis } from '../../db/analysis'
import { startDownload } from './download'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { effectiveProfileName } from '../../schemas/profile'

export function DownloadAnalysis() {
  const { snapshot, dirty } = useWorkspace()
  const [confirmation, setConfirmation] = useState<{ id: string; name: string }>(), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('')
  const worker = useRef<Worker | undefined>(undefined), ticket = useRef(0), locked = useRef(false)
  useEffect(() => () => { ticket.current++; worker.current?.terminate(); locked.current = false }, [])
  const cancel = () => { ticket.current++; worker.current?.terminate(); worker.current = undefined; locked.current = false; setBusy(false); setStatus('Export canceled. Saved data is unchanged.') }
  const download = async () => {
    if (locked.current) return
    setError(''); setStatus('')
    if (dirty) { setError('Save or discard your unsaved Settings edits before exporting. They are not part of saved data.'); return }
    if (!confirmation || confirmation.id !== snapshot.profile.id) { setError('The selected profile changed. Reopen Download to confirm its name.'); return }
    const profileId = confirmation.id, name = confirmation.name, request = ++ticket.current
    setConfirmation(undefined)
    locked.current = true; setBusy(true); setStatus(`Reading saved data for ${name}`)
    const fail = (message: string) => { if (ticket.current !== request) return; worker.current?.terminate(); worker.current = undefined; locked.current = false; setBusy(false); setError(`Export failed. ${message} No download was started; saved data is unchanged.`); setStatus('') }
    try {
      const captured = await captureAnalysis(profileId)
      if (ticket.current !== request) return
      const task = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' }); worker.current = task
      task.onerror = () => fail('The export worker could not load or run. Check the connection and browser worker support, then retry.')
      task.onmessage = (event: MessageEvent<{ kind: string; message: string; filename: string; blob: Blob }>) => {
        if (ticket.current !== request) return
        const result = event.data
        if (result.kind === 'error') { fail(result.message); return }
        if (result.kind === 'progress') { setStatus(`${captured.profile.name}: ${result.message}`); return }
        if (result.kind === 'empty') { setStatus('No saved training history or measurements to export.'); task.terminate(); worker.current = undefined; locked.current = false; setBusy(false); return }
        if (result.kind === 'ready') {
          try { startDownload(result.blob, result.filename); setStatus(`Download started for ${captured.profile.name}. Check your browser downloads; Boros cannot confirm that the file was saved.`); task.terminate(); worker.current = undefined; locked.current = false; setBusy(false) }
          catch (error) { fail((error as Error).message) }
        }
      }
      task.postMessage({ snapshot: captured })
    } catch (error) { fail((error as Error).message) }
  }
  return <div className="backup-export">
    <div className="actions"><button type="button" aria-label="Download analysis CSV" className="primary" disabled={busy} onClick={() => { setError(''); setStatus(''); setConfirmation({ id: snapshot.profile.id, name: effectiveProfileName(snapshot.profile) }) }}>{busy ? 'Preparing export…' : 'Download'}</button>{busy && <button type="button" onClick={cancel}>Cancel export</button>}</div>
    {confirmation && <ConfirmDialog title="Download analysis CSV" confirmLabel="I understand (Download)" onCancel={() => setConfirmation(undefined)} onConfirm={() => void download()}><p>This CSV contains saved training history and measurements for {confirmation.name}, which may be sensitive. It may contain sensitive information and is not password protected. It is for analysis and cannot restore a profile.</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
    <p role="status" aria-live="polite">{status}</p>{!confirmation && error && <p role="alert">{error}</p>}
  </div>
}

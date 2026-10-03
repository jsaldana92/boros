import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { captureProfile } from '../../db/backups'
import packageInfo from '../../../package.json'
import { startDownload } from './download'

export function DownloadData() {
  const { snapshot, dirty } = useWorkspace()
  const [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('')
  const worker = useRef<Worker | undefined>(undefined), ticket = useRef(0), locked = useRef(false)
  useEffect(() => () => { ticket.current++; worker.current?.terminate(); locked.current = false }, [])
  const cancel = () => { ticket.current++; worker.current?.terminate(); worker.current = undefined; locked.current = false; setBusy(false); setStatus('Export canceled. Saved data is unchanged.') }
  const download = async () => {
    if (locked.current) return
    setError(''); setStatus('')
    if (dirty) { setError('Save or discard your unsaved Settings edits before exporting. They are not part of saved data.'); return }
    if (!acknowledged) { setError('Confirm the saved-data scope before exporting.'); return }
    const profileId = snapshot.profile.id, name = snapshot.profile.name, request = ++ticket.current
    locked.current = true; setBusy(true); setStatus(`Reading saved data for ${name}`)
    const fail = (message: string) => { if (ticket.current !== request) return; worker.current?.terminate(); worker.current = undefined; locked.current = false; setBusy(false); setError(`Export failed. ${message} No download was started; saved data is unchanged.`); setStatus('') }
    try {
      const captured = await captureProfile(profileId)
      if (ticket.current !== request) return
      const task = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' }); worker.current = task
      task.onerror = () => fail('The export worker could not run. Retry, and check browser storage/download permissions.')
      task.onmessage = (event: MessageEvent<{ kind: string; message: string; filename: string; blob: Blob }>) => {
        if (ticket.current !== request) return
        const result = event.data
        if (result.kind === 'error') { fail(result.message); return }
        if (result.kind === 'progress') { setStatus(`${captured.profile.name}: ${result.message}`); return }
        if (result.kind === 'ready') {
          try { startDownload(result.blob, result.filename); setStatus(`Download started for ${captured.profile.name}. Check your browser downloads; Boros cannot confirm that the file was saved.`); task.terminate(); worker.current = undefined; locked.current = false; setBusy(false) }
          catch (error) { fail((error as Error).message) }
        }
      }
      task.postMessage({ snapshot: captured, appVersion: packageInfo.version })
    } catch (error) { fail((error as Error).message) }
  }
  return <div className="backup-export">
    <p>Download saved data for <strong>{snapshot.profile.name}</strong>.</p>
    <p>The ZIP contains personal records and photos. It is not password-protected. Restore is not available yet.</p>
    <p id="export-scope">Only committed records are included. Save edits and Apply notes, then wait for “Draft saved locally” in every training tab. Pending or failed autosaves and unsaved forms are excluded; Boros cannot flush another tab’s input.</p>
    <label className="check-label"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} />I understand this exports saved data only.</label>
    <p className="muted">Preparation runs locally. Leaving Settings or switching profiles cancels preparation. Large exports need browser memory; capacity has not been benchmarked.</p>
    <div className="actions"><button type="button" className="primary" aria-describedby="export-scope" disabled={busy} onClick={() => void download()}>{busy ? 'Preparing export…' : 'Download data'}</button>{busy && <button type="button" onClick={cancel}>Cancel export</button>}</div>
    <p role="status" aria-live="polite">{status}</p>{error && <p role="alert">{error}</p>}
  </div>
}

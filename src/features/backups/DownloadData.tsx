import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { captureProfile } from '../../db/backups'
import packageInfo from '../../../package.json'
import { startDownload } from './download'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { effectiveProfileName } from '../../schemas/profile'
import { requireBackupCrypto } from '../../lib/browser-crypto'

export function DownloadData() {
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
      requireBackupCrypto()
      const captured = await captureProfile(profileId)
      if (ticket.current !== request) return
      const task = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' }); worker.current = task
      task.onerror = () => fail('The export worker could not load or run. Check the connection and browser worker support, then retry.')
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
    <div className="actions"><button type="button" className="primary" disabled={busy} onClick={() => { setError(''); setStatus(''); setConfirmation({ id: snapshot.profile.id, name: effectiveProfileName(snapshot.profile) }) }}>{busy ? 'Preparing export…' : 'Download'}</button>{busy && <button type="button" onClick={cancel}>Cancel export</button>}</div>
    {confirmation && <ConfirmDialog title="Downloading data" confirmLabel="I understand (Download)" onCancel={() => setConfirmation(undefined)} onConfirm={() => void download()}><p>Warning: this contains all of the information saved in this website for {confirmation.name}, which may be sensitive. The resulting ZIP file is not password protected. Download at your own discretion.</p>{error && <p role="alert">{error}</p>}</ConfirmDialog>}
    <p role="status" aria-live="polite">{status}</p>{!confirmation && error && <p role="alert">{error}</p>}
  </div>
}

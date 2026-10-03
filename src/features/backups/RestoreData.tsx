import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { restores, StaleRestoreError } from '../../db/restores'
import { RESTORE_LIMITS, type ValidatedBackup } from './restore-format'
import { ownedStores, type RestoreChoice, type RestorePlan } from './restore-plan'
import { requireBackupCrypto } from '../../lib/browser-crypto'
import { displayDateTime } from '../../lib/display-dates'

const labels = { replace: 'Replace this profile', device: 'Merge — prefer this device', import: 'Merge — prefer imported file', new: 'Import under a new name', clear: 'Clear this profile' }
export function RestoreData() {
  const workspace = useWorkspace(), owner = workspace.snapshot.profile
  const [backup, setBackup] = useState<ValidatedBackup>(), [matched, setMatched] = useState<string>(), [choice, setChoice] = useState<RestoreChoice>('new'), [name, setName] = useState('')
  const [plan, setPlan] = useState<RestorePlan>(), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('')
  const worker = useRef<Worker | undefined>(undefined), ticket = useRef(0), locked = useRef(false), heading = useRef<HTMLHeadingElement>(null)
  const [committing, setCommitting] = useState(false)
  useEffect(() => () => { ticket.current++; worker.current?.terminate() }, [])
  useEffect(() => { if (plan || backup) heading.current?.focus() }, [plan, backup])
  const cancel = () => { ticket.current++; worker.current?.terminate(); worker.current = undefined; locked.current = false; setBusy(false); setBackup(undefined); setPlan(undefined); setConfirmed(false); setError(''); setStatus('Canceled. Saved data and selection are unchanged.') }
  const savedOnly = () => { if (workspace.dirty) { setError('Save or discard your unsaved Settings edits before restoring or clearing data.'); return false } return true }
  const upload = async (file: File) => {
    if (locked.current || !savedOnly()) return
    cancel(); setStatus(''); setError('')
    if (!file.size || file.size > RESTORE_LIMITS.compressed) { setError('Choose a Boros ZIP up to 64 MiB.'); return }
    const request = ++ticket.current; locked.current = true; setBusy(true); setStatus('Reading backup locally')
    const fail = (message: string) => { if (ticket.current !== request) return; worker.current?.terminate(); locked.current = false; setBusy(false); setError(`Upload failed. ${message} Saved data is unchanged.`); setStatus('') }
    try {
      requireBackupCrypto()
      const bytes = new Uint8Array(await file.arrayBuffer()); if (ticket.current !== request) return
      const task = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' }); worker.current = task
      task.onerror = () => fail('The validation worker could not run. Try again in a browser with worker support.')
      task.onmessage = async (event: MessageEvent<{ kind: string; message: string; backup: ValidatedBackup }>) => {
        if (ticket.current !== request) return
        if (event.data.kind === 'error') { fail(event.data.message); return }
        if (event.data.kind === 'progress') { setStatus(event.data.message); return }
        if (event.data.kind === 'ready') {
          try {
            const value = event.data.backup, match = await restores.matchingProfile(value)
            if (ticket.current !== request) return
            task.terminate(); worker.current = undefined; locked.current = false; setBusy(false); setBackup(value); setMatched(match?.name); setChoice(match ? 'device' : 'new'); setName(match ? '' : value.data.profile.name); setStatus('ZIP structure, checksums, records, references and photos validated. No data has been written.')
          } catch (e) { fail((e as Error).message) }
        }
      }
      task.postMessage(bytes, [bytes.buffer])
    } catch (e) { fail((e as Error).message) }
  }
  const preview = async (clear = false) => {
    if (locked.current || !savedOnly()) return
    const request = ++ticket.current; locked.current = true; setBusy(true); setError(''); setConfirmed(false); setPlan(undefined)
    try {
      const next = await restores.preview(clear ? undefined : backup, clear ? 'clear' : choice, name, clear ? owner.id : undefined)
      if (ticket.current === request) { setPlan(next); if (clear) { setChoice('clear'); setBackup(undefined) } setStatus('Review the proposed changes. Nothing has been written.') }
    } catch (e) { if (ticket.current === request) setError((e as Error).message) }
    finally { if (ticket.current === request) { locked.current = false; setBusy(false) } }
  }
  const commit = async () => {
    if (!plan || locked.current || !savedOnly()) return
    if (!confirmed) { setError('Confirm the reviewed operation before saving.'); return }
    const request = ++ticket.current
    locked.current = true; setCommitting(true); setBusy(true); setError('')
    try {
      const id = await restores.commit(plan, confirmed)
      if (ticket.current !== request) return
      workspace.useCreated(id, `${plan.choice === 'clear' ? 'Cleared' : 'Imported'} ${plan.result.profile.name}. Changes are saved locally.`)
    } catch (e) {
      setError((e as Error).message)
      if (e instanceof StaleRestoreError) { setPlan(undefined); setConfirmed(false); setStatus('Preview expired. Build a fresh preview to review changed consequences.') }
    } finally { locked.current = false; setCommitting(false); setBusy(false) }
  }
  return <div className="backup-restore">
    <h3>Upload data</h3><p>Choose a Boros backup ZIP. Validation and preview stay in this browser; nothing changes until you confirm.</p>
    <label>Backup ZIP<input type="file" accept=".zip,application/zip" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} /></label>
    <p className="muted">Limits: 64 MiB ZIP, 128 MiB expanded, 4,096 files, 32 MiB per text file (2 MiB manifest), 5 MiB per photo. Use an original Boros export.</p>
    {backup && !plan && <section aria-label="Backup selection"><h3 ref={heading} tabIndex={-1}>Validated backup: {backup.data.profile.name}</h3><p>Exported: {displayDateTime(backup.manifest.exportedAt)}. Profile modified: {displayDateTime(backup.data.profile.updatedAt)}.</p><p>{Object.entries(backup.manifest.counts).map(([key, value]) => `${value} ${key}`).join(' · ')}</p>
      {matched ? <><p>Matches this device: <strong>{matched}</strong>.</p><label>Import choice<select value={choice} disabled={busy} onChange={(e) => setChoice(e.target.value as RestoreChoice)}>{(['replace', 'device', 'import', 'new'] as const).map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label><p>The chosen source determines precedence, regardless of timestamps. A conflicting plan includes its complete history, saved drafts and schedules.</p></> : <p>No name match. This imports as an independent profile.</p>}
      {choice === 'new' && <label>Imported profile name<input maxLength={80} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} /></label>}
      <div className="actions"><button disabled={busy} onClick={() => void preview()}>Preview import</button><button disabled={busy} onClick={cancel}>Cancel</button></div>
    </section>}
    {plan && <section aria-label="Restore preview"><h3 ref={heading} tabIndex={-1}>{labels[plan.choice]}: {plan.targetName ?? plan.result.profile.name}</h3>
      <p>{plan.choice === 'new' ? `New profile: ${plan.result.profile.name}. Existing profiles stay unchanged.` : 'Only this identified profile is affected. Other profiles stay unchanged.'}</p>
      {plan.choice === 'clear' && <p>Deletes this profile’s exercises, tags, plans, schedules, saved drafts, completed logs, measurements and photos, and resets demographics. Keeps its name and unit preferences. Use Download data above before confirming if you need a copy.</p>}
      <p>Removes {plan.counts.sessions.removed} saved sessions, {plan.counts.drafts.removed} saved drafts and {plan.counts.schedules.removed} schedules from this device.</p>
      <p className="muted">Scroll the table horizontally to see all change counts.</p>
      <div className="table-scroll" tabIndex={0} aria-label="Proposed record changes"><table><caption>Changes before saving</caption><thead><tr><th>Records</th><th>Add</th><th>Conflict</th><th>Replace</th><th>Remove</th><th>Skip</th></tr></thead><tbody>{ownedStores.map((key) => <tr key={key}><th scope="row">{key}</th>{Object.values(plan.counts[key]).map((count, i) => <td key={i}>{count}</td>)}</tr>)}</tbody></table></div>
      {plan.conflicts.length > 0 && <details><summary>{plan.conflicts.length} conflicts</summary><ul>{plan.conflicts.map((conflict, i) => <li key={i}>{conflict}</li>)}</ul></details>}
      {plan.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      <p>Close other editing tabs or copy unsaved input before continuing. Old editors cannot save after this operation. No active rest timer is restored.</p>
      <label className="check-label"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />I confirm {labels[plan.choice].toLowerCase()} for {plan.result.profile.name}, including the changes shown above.</label>
      <div className="actions"><button className={plan.choice === 'clear' || plan.choice === 'replace' ? 'destructive' : 'primary'} disabled={busy} onClick={() => void commit()}>{busy ? 'Saving changes…' : 'Confirm and save'}</button><button disabled={busy} onClick={cancel}>Cancel</button></div>
    </section>}
    {!plan && !backup && <><h3>Clear data for {owner.name}</h3><p>Clear this profile’s records and photos. Download data above first if you need a backup. Other profiles will remain.</p><button className="destructive" disabled={busy} onClick={() => void preview(true)}>Clear data</button></>}
    {busy && !committing && <button onClick={cancel}>Cancel preparation</button>}
    <p role="status" aria-live="polite">{status}</p>{error && <p role="alert">{error}</p>}
  </div>
}

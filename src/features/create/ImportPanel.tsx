import { EditorBreadcrumbs } from './EditorBreadcrumbs'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWorkspace } from '../../app/workspace-context'
import { plans } from '../../db/plans'
import { importSession } from '../../db/imports'
import type { ImportKind } from '../../schemas/interchange'
import { formattingInstructions, parseInterchange, toImportDraft, type ImportDraft, type ImportIssue } from './interchange'
import { PrescriptionEditor } from './PrescriptionEditor'
import { PlanEditor } from './PlanEditor'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

export function ImportPanel({ profileId, onClose }: { profileId: string; onClose: (message?: string) => void }) {
  const { setDirty } = useWorkspace()
  const [kind, setKind] = useState<ImportKind>('plan')
  const [text, setText] = useState('')
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [clipboard, setClipboard] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [preview, setPreview] = useState<{ draft: ImportDraft; session: ReturnType<typeof importSession> }>()
  const instructionsRef = useRef<HTMLTextAreaElement>(null)
  const errorsRef = useRef<HTMLDivElement>(null)
  const result = useLiveQuery(async () => {
    try { return { data: await plans.library(profileId), error: '' } }
    catch (error) { return { data: undefined, error: (error as Error).message } }
  }, [profileId, attempt])
  useEffect(() => { return () => setDirty(false) }, [setDirty])
  useEffect(() => { setDirty(!!text.trim() || !!preview) }, [text, preview, setDirty])
  const instructions = formattingInstructions(kind)
  const cancelPreview = () => { setPreview(undefined); requestAnimationFrame(() => document.getElementById('validate-import')?.focus()) }
  return <section className="import-panel" aria-label="Import AI Output">
    {!preview && <EditorBreadcrumbs ancestors={[{ label: 'Create', onSelect: () => onClose() }]} current="AI" title="Import AI Output" />}
    {!preview ? <>
      <p className="muted">Use these instructions with your own request in an external chatbot, then paste its JSON here. Boros does not connect to an AI service.</p>
      <label htmlFor="instruction-kind">Formatting instructions for</label><select id="instruction-kind" value={kind} onChange={(event) => { setKind(event.target.value as ImportKind); setClipboard('') }}><option value="plan">Plan</option><option value="workout">Exercise</option></select>
      <label htmlFor="formatting-instructions">Formatting instructions</label><textarea id="formatting-instructions" className="formatting-instructions" ref={instructionsRef} readOnly value={instructions} />
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(instructions); setClipboard('Formatting instructions copied.') }
        catch { setClipboard('Clipboard unavailable. Select the instructions and copy them manually.'); instructionsRef.current?.focus(); instructionsRef.current?.select() }
      }}>Copy</button><p role="status">{clipboard}</p>
      <label htmlFor="import-json">AI output JSON</label><textarea id="import-json" value={text} spellCheck={false} aria-invalid={issues.length > 0} aria-describedby={issues.length ? 'import-errors' : 'import-help'} onChange={(event) => { setText(event.target.value); setIssues([]) }} />
      <p id="import-help" className="muted">One raw JSON object or one JSON fenced block. Up to 1,000,000 characters. Validation creates no records.</p>
      {issues.length > 0 && <div id="import-errors" ref={errorsRef} role="alert" tabIndex={-1}><p>Fix these fields, then validate again:</p><ul>{issues.map((issue, index) => <li key={index}><code>{issue.path}</code>: {issue.message}</li>)}</ul></div>}
      <div className="actions"><button className="primary" type="button" id="validate-import" onClick={() => {
        const parsed = parseInterchange(text); setIssues(parsed.issues)
        if (parsed.value) setPreview({ draft: toImportDraft(parsed.value), session: importSession(profileId) })
        else requestAnimationFrame(() => errorsRef.current?.focus())
      }}>Validate and preview</button><button type="button" onClick={() => text.trim() ? setConfirm(true) : onClose()}>Close</button></div>
    </> : <>
      <p className="storage-notice">Draft. Nothing is stored until you save. Plans keep every imported prescription. An existing exercise name reuses its library template without changing its defaults. For a new repeated name, the first occurrence becomes the library default. Rename a conflicting plan or standalone exercise before saving.</p>
      {result?.error && <p role="alert">Existing sources could not be loaded. {result.error} <button onClick={() => setAttempt((value) => value + 1)}>Retry sources</button></p>}
      {preview.draft.kind === 'workout'
        ? <PrescriptionEditor ancestors={[{ label: 'Create', onSelect: () => onClose() }, { label: 'AI', onSelect: cancelPreview }]} initial={preview.draft.input} title="Review exercise" tags={result?.data?.tags ?? []} initialDirty onDirty={() => setDirty(true)} onClose={cancelPreview} onSubmit={async (input) => { const saved = await preview.session.saveWorkout(input); setDirty(false); onClose(`Saved ${saved.name}.`) }} />
        : <PlanEditor ancestors={[{ label: 'Create', onSelect: () => onClose() }, { label: 'AI', onSelect: cancelPreview }]} profileId={profileId} initial={preview.draft.input} title="Review plan" initialDirty choices={result?.data?.choices ?? []} tags={result?.data?.tags ?? []} onSave={preview.session.savePlan} onClose={cancelPreview} onSaved={(name) => { setDirty(false); onClose(`Saved ${name}.`) }} />}
    </>}
    {confirm && <ConfirmDialog title="Discard pasted input?" confirmLabel="Discard" onCancel={() => setConfirm(false)} onConfirm={() => onClose()}><p>Your pasted text will be lost. No imported records have been saved.</p></ConfirmDialog>}
  </section>
}

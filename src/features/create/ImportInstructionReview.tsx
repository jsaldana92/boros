import { useState } from 'react'
import type { ImportDraft } from './interchange'
import type { Exercise } from '../../schemas/exercise'
import { importInstructionGroups } from '../../lib/import-instructions'
import { TextareaField } from '../../components/ui/Field'

export function ImportInstructionReview({ draft, library, onApply, onCancel }: { draft: ImportDraft; library: Exercise[]; onApply: (draft: ImportDraft) => void; onCancel: () => void }) {
  const [copy] = useState(() => structuredClone(draft))
  const [choices,setChoices] = useState<Record<number,string>>({}), [defaults,setDefaults] = useState<Record<number,string>>({})
  const [error,setError] = useState('')
  const days = copy.kind === 'plan' ? copy.input.days : copy.kind === 'workout' ? [copy.input] : []
  let groups: ReturnType<typeof importInstructionGroups> = []
  try { groups = importInstructionGroups(days,library) } catch (e) { return <><p role="alert">{(e as Error).message}</p><button onClick={onCancel}>Back to JSON</button></> }
  return <section aria-label="Shared instruction review"><h2>Review shared instructions and defaults</h2>
    {groups.map((g,i) => { const values = [...new Set(g.inputs.map(p => p.instructions ?? ''))], conflict = values.length > 1 || !!g.source && values[0] !== (g.source.instructions ?? ''); return <section key={i}><h3>{g.name}</h3>
      {g.source ? <><p>Existing library instructions will be used. Its notes and prescriptions stay unchanged.</p><p className="plain-text">{g.source.instructions || 'No instructions.'}</p>{conflict && <label className="check-label"><input type="checkbox" checked={choices[i] !== undefined} onChange={e => setChoices(c => { const next = { ...c }; if (e.target.checked) next[i] = g.source!.instructions ?? ''; else delete next[i]; return next })} />Use these library instructions for all linked copies</label>}</> : <>
        {conflict ? <label>Shared instructions for {g.name}<select value={choices[i] ?? '__choose__'} onChange={e => setChoices(c => ({ ...c, [i]: e.target.value }))}><option value="__choose__" disabled>Choose one imported value</option>{values.map(v => <option key={v} value={v}>{v || 'No instructions'}</option>)}</select></label> : <p className="plain-text">{values[0] || 'No instructions.'}</p>}
        <TextareaField label={`Initial library note for ${g.name}`} maxLength={20000} value={defaults[i] ?? g.inputs[0].notes ?? ''} onChange={e => setDefaults(d => ({ ...d,[i]:e.target.value }))} />
        <p className="muted">The first authored occurrence seeds the library default. Editing it here also edits that occurrence; other copied notes are kept.</p>
      </>}
    </section> })}
    {error && <p role="alert">{error}</p>}
    <div className="actions"><button onClick={onCancel}>Back to JSON</button><button onClick={() => {
      for (const [i,g] of groups.entries()) {
        const values = [...new Set(g.inputs.map(p => p.instructions ?? ''))], conflict = values.length > 1 || !!g.source && values[0] !== (g.source.instructions ?? '')
        if (conflict && choices[i] === undefined) { setError(`Choose shared instructions for ${g.name}.`); return }
      }
      const next = structuredClone(copy), nextDays = next.kind === 'plan' ? next.input.days : next.kind === 'workout' ? [next.input] : [], nextGroups = importInstructionGroups(nextDays,library)
      for (const [i,g] of nextGroups.entries()) {
        const instructions = g.source?.instructions ?? choices[i] ?? g.inputs[0].instructions ?? ''
        g.inputs.forEach(p => { p.instructions = instructions; if (p.notes !== undefined) p.noteOverride = true })
        if (!g.source && defaults[i] !== undefined) { g.inputs[0].notes = defaults[i]; g.inputs[0].noteOverride = true }
      }
      // Names resolve only in this explicit import review, then become stable IDs.
      for (const day of nextDays) for (const e of day.exercises) {
        const group = nextGroups.find(g => g.inputs.includes(e.prescription))!
        if (group.source) { e.templateId = group.source.id; e.source = { kind: 'exercise', id: group.source.id } }
      }
      onApply(next)
    }}>Continue to editable preview</button></div>
  </section>
}

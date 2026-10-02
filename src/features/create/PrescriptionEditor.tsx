import { useEffect, useRef, useState } from 'react'
import { tagNameSchema, type ExerciseInput, type Tag } from '../../schemas/exercise'
import { nameKey } from '../../schemas/profile'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, TextareaField } from '../../components/ui/Field'
import { blankSet, parseForm, toForm, type SetFields } from './form'

export function PrescriptionEditor({ initial, tags, title, archived, saveLabel = 'Save workout', initialDirty = false, onDirty, onSubmit, onClose }: { initial?: ExerciseInput; tags: Pick<Tag, 'id' | 'name' | 'archivedAt'>[]; title: string; archived?: boolean; saveLabel?: string; initialDirty?: boolean; onDirty: () => void; onSubmit: (input: ExerciseInput) => Promise<void>; onClose: () => void }) {
  const [dirty, markDirty] = useState(initialDirty)
  const setDirty = (value: boolean) => { markDirty(value); if (value) onDirty() }
  const [form, setForm] = useState(() => toForm(initial))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [tag, setTag] = useState('')
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void }>()
  const formRef = useRef<HTMLFormElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const change = (field: 'name' | 'count' | 'restBetweenSeconds' | 'restAfterSeconds' | 'instructions' | 'notes' | 'tutorialUrl', value: string) => { setForm((current) => ({ ...current, [field]: value })); setDirty(true) }
  const setValue = (index: number, field: keyof SetFields, value: string) => { setForm((current) => ({ ...current, sets: current.sets.map((set, i) => i === index ? { ...set, [field]: value } : set) })); setDirty(true) }
  const applyCount = () => {
    const count = Number(form.count)
    if (!/^\d+$/.test(form.count.trim()) || !Number.isInteger(count) || count < 1 || count > 100) { setErrors((current) => ({ ...current, count: 'Use a whole number from 1 to 100.' })); return }
    const apply = () => { setForm((current) => ({ ...current, sets: Array.from({ length: count }, (_, index) => current.sets[index] ?? blankSet()) })); setErrors({}); setDirty(true) }
    if (count < form.sets.length && form.sets.slice(count).some((set) => Object.values(set).some((value) => value.trim()))) setConfirm({ title: 'Remove customized sets?', message: `Reducing to ${count} sets discards the targets in the removed sets.`, action: apply })
    else apply()
  }
  const addTag = (name: string) => {
    const parsed = tagNameSchema.safeParse(name)
    if (!parsed.success) { setErrors((current) => ({ ...current, tag: parsed.error.issues[0].message })); return }
    if (form.tagNames.length >= 50) { setErrors((current) => ({ ...current, tag: 'Use at most 50 tags.' })); return }
    if (!form.tagNames.some((existing) => nameKey(existing) === nameKey(name))) { setForm((current) => ({ ...current, tagNames: [...current.tagNames, parsed.data] })); setDirty(true) }
    setTag(''); setErrors((current) => ({ ...current, tag: '' }))
  }
  return <section className="exercise-editor">
    <h2 ref={heading} tabIndex={-1}>{title}</h2>
    {archived && <p className="muted">Archived exercise. Editing keeps it archived; restore it from the archived library.</p>}
    <form ref={formRef} noValidate onSubmit={async (event) => {
      event.preventDefault(); if (submitting.current) return; setError('')
      const parsed = parseForm(form); setErrors(parsed.errors)
      if (!parsed.value) { requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return }
      submitting.current = true; setBusy(true)
      try { await onSubmit(parsed.value) }
      catch (e) { setError((e as Error).message) } finally { submitting.current = false; setBusy(false) }
    }}>
      <fieldset disabled={busy}>
        <legend className="sr-only">Exercise prescription</legend>
        <Field label="Exercise name" required maxLength={120} value={form.name} error={errors.name} onChange={(e) => change('name', e.target.value)} />
        <div className="actions count-controls"><Field label="Number of sets" inputMode="numeric" required value={form.count} error={errors.count} onChange={(e) => change('count', e.target.value)} /><button type="button" onClick={applyCount}>Apply set count</button></div>
        <p className="muted">Enter a minimum only for a fixed target. Add a maximum for a range. RIR is optional; 0 is valid.</p>
        <button type="button" onClick={() => {
          const apply = () => { setForm((current) => ({ ...current, sets: current.sets.map(() => ({ ...current.sets[0] })) })); setDirty(true) }
          if (form.sets.slice(1).some((set) => Object.values(set).some((value) => value.trim()) && JSON.stringify(set) !== JSON.stringify(form.sets[0]))) setConfirm({ title: 'Replace set targets?', message: 'This replaces all other set targets with the reps and RIR from set 1.', action: apply })
          else apply()
        }}>Apply set 1 targets to all sets</button>
        {form.sets.map((set, index) => <fieldset className="set-fields" key={index}><legend>Set {index + 1}</legend><div className="prescription-grid">
          {([['repMin', 'Reps minimum'], ['repMax', 'Reps maximum (optional)'], ['rirMin', 'RIR minimum (optional)'], ['rirMax', 'RIR maximum (optional)']] as const).map(([field, label]) => <Field key={field} label={`Set ${index + 1} ${label}`} inputMode="numeric" required={field === 'repMin'} value={set[field]} error={errors[`sets.${index}.${field}`]} onChange={(e) => setValue(index, field, e.target.value)} />)}
        </div></fieldset>)}
        <div className="field-grid"><Field label="Rest between sets (seconds, optional)" inputMode="numeric" value={form.restBetweenSeconds} error={errors.restBetweenSeconds} onChange={(e) => change('restBetweenSeconds', e.target.value)} /><Field label="Rest after exercise (seconds, optional)" inputMode="numeric" value={form.restAfterSeconds} error={errors.restAfterSeconds} onChange={(e) => change('restAfterSeconds', e.target.value)} /></div>
        <p className="muted">Blank rest is unspecified. 0 means no timed rest.</p>
        <TextareaField label="Instructions (optional)" maxLength={20000} value={form.instructions} error={errors.instructions} onChange={(e) => change('instructions', e.target.value)} />
        <TextareaField label="Notes (optional)" maxLength={20000} value={form.notes} error={errors.notes} onChange={(e) => change('notes', e.target.value)} />
        <Field label="YouTube tutorial URL (optional)" type="url" value={form.tutorialUrl} error={errors.tutorialUrl} onChange={(e) => change('tutorialUrl', e.target.value)} />
        <p className="muted">HTTPS YouTube video links only. Videos are never loaded automatically.</p>
        <fieldset className="tag-editor"><legend>Tags (optional)</legend><label>Choose existing tag<select value="" onChange={(e) => { if (e.target.value) addTag(e.target.value) }}><option value="">Select a tag</option>{tags.filter((t) => !t.archivedAt).map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</select></label>
          <div className="actions"><Field label="New tag" value={tag} maxLength={80} error={errors.tag || errors.tagNames} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tag) } }} /><button type="button" onClick={() => addTag(tag)}>Add tag</button></div>
          <p className="muted">Tags are saved with this prescription.</p><div className="tag-list">{form.tagNames.map((name) => <button key={nameKey(name)} type="button" aria-label={`Remove tag ${name}`} onClick={() => { setForm((current) => ({ ...current, tagNames: current.tagNames.filter((value) => value !== name) })); setDirty(true) }}>{name} ×</button>)}</div>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="actions"><button type="submit" className="primary">{busy ? 'Saving...' : saveLabel}</button><button type="button" onClick={() => {
          if (dirty) setConfirm({ title: 'Discard unsaved workout?', message: 'Your unsaved exercise changes will be lost.', action: onClose }); else onClose()
        }}>Cancel editor</button></div>
      </fieldset>
    </form>
    {confirm && <ConfirmDialog title={confirm.title} confirmLabel="Confirm" onCancel={() => setConfirm(undefined)} onConfirm={() => { confirm.action(); setConfirm(undefined) }}><p>{confirm.message}</p></ConfirmDialog>}
  </section>
}

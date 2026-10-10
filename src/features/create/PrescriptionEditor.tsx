import { EditorTitle } from './EditorTitle'
import { TagPills } from './TagPills'
import { RestInput } from '../../components/ui/RestInput'
import { useEffect, useId, useRef, useState } from 'react'
import { tagNameSchema, type ExerciseInput, type Tag } from '../../schemas/exercise'
import { nameKey } from '../../schemas/profile'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, TextareaField } from '../../components/ui/Field'
import { blankSet, parseForm, toForm, type SetFields } from './form'

export function PrescriptionEditor({ initial, tags, title, archived, saveLabel = 'Save', initialDirty = false, onDirty, onSubmit, onClose, onMerge, path = ['Create', 'Exercise'] }: { path?: string[]; initial?: ExerciseInput; tags: Pick<Tag, 'id' | 'name' | 'archivedAt'>[]; title: string; archived?: boolean; saveLabel?: string; initialDirty?: boolean; onDirty: (dirty: boolean) => void; onSubmit: (input: ExerciseInput) => Promise<void>; onClose: () => void; onMerge?: (input: ExerciseInput) => void }) {
  const [form, setForm] = useState(() => toForm(initial))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [tag, setTag] = useState('')
  const [localTags, setLocalTags] = useState(initial?.tagNames ?? [])
  const [tagsExpanded, setTagsExpanded] = useState(() => tags.some(tag => !tag.archivedAt))
  const tagsId = useId()
  const availableTags = [...new Map([...tags.filter((item) => !item.archivedAt).map((item) => item.name), ...localTags].map((name) => [nameKey(name), name])).entries()].map(([id, name]) => ({ id, name }))
  const [baseline] = useState(() => JSON.stringify(toForm(initial)))
  const dirty = initialDirty || JSON.stringify(form) !== baseline || !!tag.trim()
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void }>()
  const formRef = useRef<HTMLFormElement>(null)
  const change = (field: 'name' | 'count' | 'instructions' | 'notes' | 'tutorialUrl', value: string) => { setForm((current) => ({ ...current, [field]: value })) }
  const setValue = (index: number, field: keyof SetFields, value: string) => { setForm((current) => ({ ...current, sets: current.sets.map((set, i) => i === index ? { ...set, [field]: value } : set) })) }
  const applyCount = () => {
    const count = Number(form.count)
    if (!/^\d+$/.test(form.count.trim()) || !Number.isInteger(count) || count < 1 || count > 100) { setErrors((current) => ({ ...current, count: 'Use a whole number from 1 to 100.' })); return }
    const apply = () => { setForm((current) => ({ ...current, sets: Array.from({ length: count }, (_, index) => current.sets[index] ?? blankSet()) })); setErrors({}) }
    if (count < form.sets.length && form.sets.slice(count).some((set) => Object.values(set).some((value) => value.trim()))) setConfirm({ title: 'Remove customized sets?', message: `Reducing to ${count} sets discards the targets in the removed sets.`, action: apply })
    else apply()
  }
  const addTag = (name: string) => {
    const parsed = tagNameSchema.safeParse(name)
    if (!parsed.success) { setErrors((current) => ({ ...current, tag: parsed.error.issues[0].message })); return }
    if (!form.tagNames.some((existing) => nameKey(existing) === nameKey(parsed.data))) {
      if (form.tagNames.length >= 50) { setErrors((current) => ({ ...current, tag: 'Use at most 50 tags.' })); return }
      const canonical = availableTags.find((item) => item.id === nameKey(parsed.data))?.name ?? parsed.data
      setLocalTags((current) => current.some((item) => nameKey(item) === nameKey(canonical)) ? current : [...current, canonical])
      setForm((current) => ({ ...current, tagNames: [...current.tagNames, canonical] }))
    }
    setTagsExpanded(true)
    setTag(''); setErrors((current) => ({ ...current, tag: '' }))
  }
  return <section className="exercise-editor" aria-label={title}>
    <EditorTitle path={path} />
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
        {form.trainingType === 'interval' ? <div className="rest-pair">{(['activeSeconds', 'recoverySeconds'] as const).map(key => <RestInput key={key} label={key === 'activeSeconds' ? 'Active' : 'Rest'} value={form[key]} errors={{ minutes: errors[`${key}.minutes`], seconds: errors[`${key}.seconds`] }} onChange={value => setForm(current => ({ ...current, [key]: value }))} />)}</div> : <><div className="actions count-controls"><Field label="Number of sets" inputMode="numeric" required value={form.count} error={errors.count} onChange={(e) => change('count', e.target.value)} /><button type="button" onClick={applyCount}>Apply</button></div>
        <p className="muted">Enter a minimum only for a fixed target. Add a maximum for a range. RIR is optional; 0 is valid.</p>

        {form.sets.map((set, index) => <fieldset className="set-fields" key={index}><legend>Set {index + 1}</legend><div className="prescription-grid">
          {([['repMin', 'Reps minimum'], ['repMax', 'Reps maximum'], ['rirMin', 'RIR minimum'], ['rirMax', 'RIR maximum']] as const).map(([field, label]) => <Field key={field} label={label} aria-label={`Set ${index + 1} ${label}`} inputMode="numeric" required={field === 'repMin'} value={set[field]} error={errors[`sets.${index}.${field}`]} onChange={(e) => setValue(index, field, e.target.value)} />)}
        </div>{index === 0 && <button className="apply-all" type="button" onClick={() => {
          const apply = () => { setForm((current) => ({ ...current, sets: current.sets.map(() => ({ ...current.sets[0] })) })) }
          if (form.sets.slice(1).some((set) => Object.values(set).some((value) => value.trim()) && JSON.stringify(set) !== JSON.stringify(form.sets[0]))) setConfirm({ title: 'Replace set targets?', message: 'This replaces all other set targets with the reps and RIR from set 1.', action: apply })
          else apply()
        }}>Apply to All</button>}</fieldset>)}
        <div className="rest-pair">{(['restBetweenSeconds', 'restAfterSeconds'] as const).map((key) => <div key={key}><RestInput label={key === 'restBetweenSeconds' ? 'Rest between sets (optional)' : 'Rest after exercise (optional)'} value={form[key]} errors={{ minutes: errors[`${key}.minutes`], seconds: errors[`${key}.seconds`] }} onChange={(value) => { setForm((current) => ({ ...current, [key]: value })) }} /></div>)}</div>
        <p className="muted">Blank rest is unspecified. 0 means no timed rest.</p></>}
        <TextareaField label="Instructions (optional)" maxLength={20000} value={form.instructions} error={errors.instructions} onChange={(e) => change('instructions', e.target.value)} />
        <TextareaField label="Notes (optional)" maxLength={20000} value={form.notes} error={errors.notes} onChange={(e) => change('notes', e.target.value)} />
        <Field label="YouTube tutorial URL (optional)" type="url" value={form.tutorialUrl} error={errors.tutorialUrl} onChange={(e) => change('tutorialUrl', e.target.value)} />
        <p className="muted">HTTPS YouTube video links only. Videos are never loaded automatically.</p>
        <fieldset className="tag-editor"><legend>Tags (optional)</legend><span className="tag-chip">{form.trainingType === 'interval' ? 'Interval' : 'Strength'}</span>
          <div className="tag-filter-heading"><button type="button" aria-expanded={tagsExpanded} aria-controls={tagsId} onClick={() => setTagsExpanded((current) => !current)}>Tags{form.tagNames.length ? ` (${form.tagNames.length})` : ''}</button></div>
          <div id={tagsId} hidden={!tagsExpanded}><TagPills tags={availableTags.map(t => ({ ...t, name: ['strength', 'interval'].includes(nameKey(t.name)) ? `${t.name} (tag)` : t.name }))} selected={form.tagNames.map(nameKey)} onToggle={(id) => {
            if (form.tagNames.some((name) => nameKey(name) === id)) { setForm((current) => ({ ...current, tagNames: current.tagNames.filter((name) => nameKey(name) !== id) })); setErrors((current) => ({ ...current, tag: '' })) }
            else addTag(availableTags.find((item) => item.id === id)!.name)
          }} /></div>
          <div className="actions"><Field label="New tag" value={tag} maxLength={80} error={errors.tag || errors.tagNames} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tag) } }} /><button type="button" onClick={() => addTag(tag)}>Add</button></div>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="actions"><button type="submit" className="primary">{busy ? 'Saving...' : saveLabel}</button>{onMerge && <button type="button" onClick={() => { const parsed = parseForm(form); setErrors(parsed.errors); if (parsed.value) onMerge(parsed.value); else requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()) }}>Merge</button>}<button type="button" onClick={() => {
          if (dirty) setConfirm({ title: 'Discard unsaved exercise?', message: 'Your unsaved exercise changes will be lost.', action: onClose }); else onClose()
        }}>Cancel</button></div>
      </fieldset>
    </form>
    {confirm && <ConfirmDialog title={confirm.title} confirmLabel="Confirm" onCancel={() => setConfirm(undefined)} onConfirm={() => { confirm.action(); setConfirm(undefined) }}><p>{confirm.message}</p></ConfirmDialog>}
  </section>
}

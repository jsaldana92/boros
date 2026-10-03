import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { plans, type PrescriptionChoice } from '../../db/plans'
import { compactGroups, copyExercise, dissolveGroup, joinGroup, moveOccurrence, newDay, planInputSchema, positiveInteger, trainingBlocks, type Plan, type PlanExercise, type PlanInput, type TrainingDay } from '../../schemas/plan'
import type { Tag } from '../../schemas/exercise'
import { Field } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PrescriptionEditor } from './PrescriptionEditor'
import { ExercisePicker } from './ExercisePicker'

function reorder<T>(items: T[], index: number, offset: number) {
  const result = [...items]
  const [item] = result.splice(index, 1); result.splice(index + offset, 0, item)
  return result
}
export function PlanEditor({ profileId, initial, original, choices, tags, onClose, onSaved, onSave, initialDirty = false, title }: { profileId: string; initial?: PlanInput; original?: Plan; choices: PrescriptionChoice[]; tags: Tag[]; onClose: () => void; onSaved: (name: string) => void; onSave?: (input: PlanInput) => Promise<{ name: string }>; initialDirty?: boolean; title?: string }) {
  const { setDirty, dirty } = useWorkspace()
  const [form, setForm] = useState<PlanInput>(() => initial ? structuredClone(initial) : { name: '', days: [newDay(1)] })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [duration, setDuration] = useState(initial?.durationWeeks?.toString() ?? '')
  const [groupNumbers, setGroupNumbers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [picker, setPicker] = useState<string>()
  const [editing, setEditing] = useState<{ dayId: string; exercise: PlanExercise }>()
  const [confirm, setConfirm] = useState<{ title: string; action: () => void }>()
  const heading = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  useEffect(() => { heading.current?.focus(); if (initialDirty) setDirty(true); return () => setDirty(false) }, [setDirty, initialDirty])
  const change = (update: (current: PlanInput) => PlanInput) => { setForm(update); setDirty(true); setErrors({}) }
  const days = (update: (current: TrainingDay[]) => TrainingDay[]) => change((current) => ({ ...current, days: update(current.days) }))
  const updateDay = (dayId: string, update: (day: TrainingDay) => TrainingDay) => days((items) => items.map((day) => day.id === dayId ? update(day) : day))
  const exerciseList = (dayId: string, update: (items: PlanExercise[]) => PlanExercise[]) => updateDay(dayId, (day) => compactGroups({ ...day, exercises: update(day.exercises) }))
  const closeSubeditor = () => { setPicker(undefined); setEditing(undefined); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : heading.current)?.focus()) }
  const count = (value: number) => {
    const apply = () => days((items) => Array.from({ length: value }, (_, index) => items[index] ?? newDay(index + 1)))
    if (value < form.days.length) setConfirm({ title: `Reduce to ${value} training days?`, action: apply }); else apply()
  }
  return <section className="plan-editor" aria-label="Plan editor">
    <h2 ref={heading} tabIndex={-1}>{title ?? (original ? 'Edit Plan' : 'Create Plan')}</h2>
    {original?.archivedAt && <p className="muted">Archived plan. Rename here to resolve a conflict, then restore from the plan list.</p>}
    {picker && <ExercisePicker choices={choices} onClose={closeSubeditor} onChoose={(choice) => { exerciseList(picker, (items) => [...items, copyExercise(choice.prescription, choice.source)]); closeSubeditor() }} />}
    {editing && <PrescriptionEditor initial={editing.exercise.prescription} tags={tags} title="Edit plan exercise" saveLabel="Apply to plan" onDirty={() => setDirty(true)} onClose={closeSubeditor} onSubmit={async (prescription) => { exerciseList(editing.dayId, (items) => items.map((item) => item.id === editing.exercise.id ? { ...item, prescription } : item)); closeSubeditor() }} />}
    <form ref={formRef} hidden={!!picker || !!editing} noValidate onSubmit={async (event) => {
      event.preventDefault(); if (submitting.current) return; setError('')
      const durationWeeks = duration.trim() ? Number(duration) : undefined
      const badGroups = form.days.flatMap((day) => day.exercises.filter((item) => item.groupId && groupNumbers[item.id] !== undefined && !positiveInteger.safeParse(Number(groupNumbers[item.id])).success))
      if (badGroups.length) { setError('Enter a positive whole superset number for each enabled occurrence.'); return }
      if ((!original || original.durationWeeks !== undefined) && durationWeeks === undefined) { setErrors({ durationWeeks: 'Enter a positive whole duration in weeks.' }); return }
      const parsed = planInputSchema.safeParse({ ...form, durationWeeks })
      if (!parsed.success) {
        setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])))
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus()); return
      }
      submitting.current = true; setBusy(true)
      try { const saved = await (onSave ? onSave(parsed.data) : plans.save(profileId, parsed.data, original)); setDirty(false); onSaved(saved.name) }
      catch (e) { setError((e as Error).message) } finally { submitting.current = false; setBusy(false) }
    }}><fieldset disabled={busy}>
      <legend className="sr-only">Plan details</legend>
      <Field label="Plan name" required maxLength={120} value={form.name} error={errors.name} onChange={(e) => change((current) => ({ ...current, name: e.target.value }))} />
      <Field label="Duration (weeks)" required={!original || original.durationWeeks !== undefined} inputMode="numeric" value={duration} error={errors.durationWeeks} onChange={(e) => { setDuration(e.target.value); setDirty(true); setErrors({}) }} />
      {original?.durationWeeks === undefined && original && <p className="muted">Legacy plan: blank keeps its unbounded duration. Enter weeks to set a duration for new schedules. Existing schedules change only through their duration preview.</p>}
      <label>Training days per week<select value={form.days.length} onChange={(e) => count(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <p role="status">{form.days.length} training days; {7 - form.days.length} rest days per week.</p>
      {form.days.map((day, index) => <section className="plan-day" key={day.id} aria-label={`Day ${index + 1}: ${day.name}`} data-day-id={day.id}>
        <h3>Training day {index + 1}</h3>
        <Field label={`Day ${index + 1} name`} required maxLength={120} value={day.name} error={errors[`days.${index}.name`]} onChange={(e) => days((items) => items.map((item) => item.id === day.id ? { ...item, name: e.target.value } : item))} />
        <div className="actions"><button type="button" disabled={index === 0} onClick={() => days((items) => reorder(items, index, -1))}>Move day up</button><button type="button" disabled={index === form.days.length - 1} onClick={() => days((items) => reorder(items, index, 1))}>Move day down</button><button type="button" disabled={form.days.length === 1} onClick={() => setConfirm({ title: `Remove ${day.name || 'this day'}?`, action: () => days((items) => items.filter((item) => item.id !== day.id)) })}>Remove day</button></div>
        {errors[`days.${index}.exercises`] && <p role="alert" tabIndex={-1}>{errors[`days.${index}.exercises`]}</p>}
        {!day.exercises.length && <p className="muted">No exercises in this day.</p>}
        {!!day.groups?.length && <p className="muted">Execution order below matches Train. Joining a group brings its members together. Moving an outer member moves its whole block; inner moves reorder members. Moving to another day leaves the group.</p>}
        {trainingBlocks(day).filter((block) => block.group).map(({ group, members }) => <fieldset className="superset-settings" key={group!.id} aria-label={`Superset ${group!.number} settings`}><legend>Superset {group!.number}</legend>
          <p>{members.map((item) => item.prescription.name).join(' · ')} — {members.length} members</p>
          <Field label={`Rename superset ${group!.number} number`} inputMode="numeric" value={Number.isNaN(group!.number) ? '' : group!.number} onChange={(e) => updateDay(day.id, (current) => ({ ...current, groups: current.groups?.map((item) => item.id === group!.id ? { ...item, number: e.target.value.trim() ? Number(e.target.value) : NaN } : item) }))} />
          <div className="field-grid">{(['restBetweenRoundsSeconds', 'restAfterGroupSeconds'] as const).map((key) => <Field key={key} label={key === 'restBetweenRoundsSeconds' ? 'Rest between rounds (seconds)' : 'Rest after group (seconds)'} inputMode="numeric" value={Number.isNaN(group![key]) ? 'Invalid' : group![key] ?? ''} onChange={(e) => updateDay(day.id, (current) => ({ ...current, groups: current.groups?.map((item) => item.id === group!.id ? { ...item, [key]: e.target.value.trim() ? Number(e.target.value) : undefined } : item) }))} />)}</div>
          <p className="muted">Blank permits manual rest. Zero means no timed rest. Member rest prescriptions are kept but do not run between superset members.</p>
          <button type="button" onClick={() => updateDay(day.id, (current) => dissolveGroup(current, group!.id))}>Dissolve superset {group!.number}</button>
        </fieldset>)}
        <ol className="plan-exercises">{day.exercises.map((exercise, i) => <li key={exercise.id} data-occurrence-id={exercise.id} aria-label={`Exercise ${i + 1}: ${exercise.prescription.name}`}>
          <h4>{i + 1}. {exercise.prescription.name}</h4><p className="muted">{exercise.prescription.sets.length} sets; {exercise.prescription.tagNames.join(', ') || 'No tags'}</p>
          <label className="check-label"><input type="checkbox" checked={!!exercise.groupId} onChange={(e) => { setGroupNumbers((values) => { const next = { ...values }; delete next[exercise.id]; return next }); updateDay(day.id, (current) => joinGroup(current, exercise.id, e.target.checked ? current.groups?.[0]?.number ?? 1 : undefined)) }} />Superset</label>
          {exercise.groupId && <Field label="Superset group number" inputMode="numeric" value={groupNumbers[exercise.id] ?? day.groups?.find((item) => item.id === exercise.groupId)?.number ?? ''} onChange={(e) => { const value = e.target.value; setGroupNumbers((values) => ({ ...values, [exercise.id]: value })); setDirty(true); if (positiveInteger.safeParse(Number(value)).success) { updateDay(day.id, (current) => joinGroup(current, exercise.id, Number(value))); setGroupNumbers((values) => { const next = { ...values }; delete next[exercise.id]; return next }) } }} />}
          <div className="actions"><button type="button" onClick={() => { trigger.current = document.activeElement as HTMLElement; setEditing({ dayId: day.id, exercise }) }}>Edit prescription</button><button type="button" disabled={i === 0} onClick={() => updateDay(day.id, (current) => moveOccurrence(current, exercise.id, -1))}>Move exercise up</button><button type="button" disabled={i === day.exercises.length - 1} onClick={() => updateDay(day.id, (current) => moveOccurrence(current, exercise.id, 1))}>Move exercise down</button><button type="button" disabled={day.exercises.length >= 100} onClick={() => exerciseList(day.id, (items) => [...items, { ...copyExercise(exercise.prescription, exercise.source), ...(exercise.groupId ? { groupId: exercise.groupId } : {}) }])}>Duplicate occurrence</button><button type="button" onClick={() => setConfirm({ title: `Remove ${exercise.prescription.name}?`, action: () => exerciseList(day.id, (items) => items.filter((item) => item.id !== exercise.id)) })}>Remove exercise</button></div>
          <label>Move {exercise.prescription.name} to day<select value="" onChange={(e) => { const destination = e.target.value; if (destination) days((items) => items.map((item) => item.id === day.id ? compactGroups({ ...item, exercises: item.exercises.filter((entry) => entry.id !== exercise.id) }) : item.id === destination ? { ...item, exercises: [...item.exercises, { ...exercise, groupId: undefined }] } : item)); requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-occurrence-id="${exercise.id}"] button`)?.focus()) }}><option value="">Choose destination</option>{form.days.filter((item) => item.id !== day.id).map((item) => <option key={item.id} value={item.id} disabled={item.exercises.length >= 100}>{form.days.indexOf(item) + 1}. {item.name}</option>)}</select></label>
        </li>)}</ol>
        <button type="button" disabled={day.exercises.length >= 100} onClick={() => { trigger.current = document.activeElement as HTMLElement; setPicker(day.id) }}>Add exercise</button>
      </section>)}
      <button type="button" disabled={form.days.length === 7} onClick={() => count(form.days.length + 1)}>Add training day</button>
      {error && <p role="alert">{error}</p>}
      {Object.entries(errors).filter(([path]) => path.includes('.groups.') || path.includes('.groupId')).map(([path, text]) => <p role="alert" tabIndex={-1} key={path}>{path}: {text}</p>)}
      <div className="actions"><button className="primary" type="submit">{busy ? 'Saving...' : 'Save plan'}</button><button type="button" onClick={() => dirty ? setConfirm({ title: 'Discard unsaved plan?', action: onClose }) : onClose()}>Cancel plan editor</button></div>
    </fieldset></form>
    {confirm && <ConfirmDialog title={confirm.title} confirmLabel="Confirm" onCancel={() => setConfirm(undefined)} onConfirm={() => { confirm.action(); setConfirm(undefined); requestAnimationFrame(() => { if (document.activeElement === document.body) heading.current?.focus() }) }}><p>This discards the affected unsaved input. Saved source exercises and other plans are unchanged.</p></ConfirmDialog>}
  </section>
}

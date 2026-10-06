import { Fragment, useEffect, useRef, useState } from 'react'
import { createId } from '../../lib/browser-crypto'
import { CreateLeaveGuard } from './CreateLeaveGuard'
import { EditorTitle } from './EditorTitle'
import { useWorkspace } from '../../app/workspace-context'
import { plans, type PrescriptionChoice } from '../../db/plans'
import { identifySets, planWeeks, uniqueWeekCounts, compactGroups, copyExercise, dissolveGroup, joinGroup, moveOccurrence, newDay, planInputSchema, positiveInteger, trainingBlocks, type Plan, type PlanExercise, type PlanInput, type TrainingDay } from '../../schemas/plan'
import type { Tag } from '../../schemas/exercise'
import { Field, TextareaField } from '../../components/ui/Field'
import { ActionDialog, ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PrescriptionEditor } from './PrescriptionEditor'
import { ExercisePicker } from './ExercisePicker'
import { RestInput } from '../../components/ui/RestInput'
import { parseRest, restFields, type RestFields } from '../../lib/rest-duration'

function reorder<T>(items: T[], index: number, offset: number) {
  const result = [...items]
  const [item] = result.splice(index, 1); result.splice(index + offset, 0, item)
  return result
}
export function PlanEditor({ profileId, initial, original, choices, tags, onClose, onSaved, onSave, initialDirty = false }: { profileId: string; initial?: PlanInput; original?: Plan; choices: PrescriptionChoice[]; tags: Tag[]; onClose: () => void; onSaved: (name: string) => void; onSave?: (input: PlanInput) => Promise<{ name: string }>; initialDirty?: boolean }) {
  const { setDirty, dirty } = useWorkspace()
  const [form, setForm] = useState<PlanInput>(() => initial ? structuredClone(initial) : { name: '', days: [newDay(1)] })
  const [baseline] = useState(() => JSON.stringify(form))
  const [nestedDirty, setNestedDirty] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [unique, setUnique] = useState(!!initial?.weeks)
  const [duration, setDuration] = useState(initial?.durationWeeks?.toString() ?? '')
  const [groupNumbers, setGroupNumbers] = useState<Record<string, string>>({})
  const [groupFields, setGroupFields] = useState<Record<string, string>>({})
  const [groupRests, setGroupRests] = useState<Record<string, RestFields>>({})
  const [moving, setMoving] = useState<{ dayId: string; exerciseId: string }>()
  const [menu, setMenu] = useState<{ dayId: string; exercise: PlanExercise }>()
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [picker, setPicker] = useState<string>()
  const [editing, setEditing] = useState<{ dayId: string; exercise: PlanExercise }>()
  const [confirm, setConfirm] = useState<{ title: string; action: () => void; message?: string; label?: string }>()
  const heading = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  useEffect(() => { if (initialDirty) setDirty(true); return () => setDirty(false) }, [setDirty, initialDirty])
  const entered = initial
    ? JSON.stringify(form) !== baseline || duration !== (initial.durationWeeks?.toString() ?? '') || unique !== !!initial.weeks || Object.keys(groupNumbers).length > 0
    : !!(form.name.trim() || form.instructions?.trim() || form.notes?.trim() || duration.trim()) || planWeeks(form).some((week) => week.days.some((day, index) => day.exercises.length > 0 || day.name !== `Day ${index + 1}`))
  useEffect(() => { setDirty(initialDirty || entered || nestedDirty) }, [initialDirty, entered, nestedDirty, setDirty])
  const change = (update: (current: PlanInput) => PlanInput) => { setForm(update); setErrors({}) }
  const days = (update: (current: TrainingDay[]) => TrainingDay[], weekId?: string) => change((current) => {
    if (!weekId) return { ...current, days: update(current.days) }
    const definitions = planWeeks(current), updated = definitions.map((week) => week.id === weekId ? { ...week, days: update(week.days) } : week)
    return { ...current, days: updated.flatMap((week) => week.days), weeks: updated.map((week) => ({ id: week.id!, dayIds: week.days.map((day) => day.id) })) }
  })
  const updateDay = (dayId: string, update: (day: TrainingDay) => TrainingDay) => days((items) => items.map((day) => day.id === dayId ? update(day) : day))
  const exerciseList = (dayId: string, update: (items: PlanExercise[]) => PlanExercise[]) => updateDay(dayId, (day) => compactGroups({ ...day, exercises: update(day.exercises) }))
  const closeSubeditor = () => { setPicker(undefined); setEditing(undefined); setNestedDirty(false); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : heading.current)?.focus()) }
  const count = (value: number, weekId?: string) => {
    const current = planWeeks(form).find((week) => week.id === weekId)!.days
    const apply = () => days((items) => Array.from({ length: value }, (_, index) => items[index] ?? newDay(index + 1)), weekId)
    if (value < current.length) setConfirm({ title: `Reduce to ${value} training days?`, action: apply }); else apply()
  }
  const populated = (list: TrainingDay[]) => list.some((day, index) => day.exercises.length || day.name !== `Day ${index + 1}`)
  const weekCount = (value: number) => {
    const existing = planWeeks(form)
    const apply = () => change((current) => {
      const definitions = planWeeks(current), weeks = Array.from({ length: value }, (_, index) => definitions[index] ?? { id: createId(), days: [newDay(1)] })
      return { ...current, days: weeks.flatMap((week) => week.days), weeks: weeks.map((week) => ({ id: week.id ?? createId(), dayIds: week.days.map((day) => day.id) })) }
    })
    if (existing.slice(value).some((week) => populated(week.days))) setConfirm({ title: `Reduce to ${value} unique weeks?`, action: apply }); else apply()
  }
  const toggleUnique = () => {
    if (!unique) { setUnique(true); return }
    const apply = () => { setUnique(false); change((current) => ({ ...current, weeks: undefined, days: planWeeks(current)[0].days })) }
    if (planWeeks(form).slice(1).some((week) => populated(week.days))) setConfirm({ title: 'Turn off unique training weeks?', action: apply }); else apply()
  }
  const divisors = uniqueWeekCounts(Number(duration))
  return <section className="plan-editor" aria-label="Plan editor"><CreateLeaveGuard kind="plan" />
    {!picker && !editing && <EditorTitle path={['Create', 'Plan']} headingRef={heading} />}
    {!picker && !editing && original?.archivedAt && <p className="muted">Archived plan. Rename here to resolve a conflict, then restore from the plan list.</p>}
    {picker && <ExercisePicker choices={choices} remaining={100 - (form.days.find((day) => day.id === picker)?.exercises.length ?? 0)} onClose={closeSubeditor} onChoose={(selected) => { exerciseList(picker, (items) => items.length + selected.length <= 100 ? [...items, ...selected.map((choice) => copyExercise(choice.prescription, choice.source))] : items); closeSubeditor() }} />}
    {editing && <PrescriptionEditor path={['Create', 'Plan', 'Exercise']} initial={editing.exercise.prescription} tags={tags} title="Edit plan exercise" saveLabel="Apply" onDirty={setNestedDirty} onClose={closeSubeditor} onSubmit={async (prescription) => { exerciseList(editing.dayId, (items) => items.map((item) => item.id === editing.exercise.id ? { ...item, prescription, ...(item.setIds ? { setIds: prescription.sets.map((_, i) => item.setIds?.[i] ?? createId()) } : {}) } : item)); closeSubeditor() }} />}
    <form ref={formRef} hidden={!!picker || !!editing} noValidate onSubmit={async (event) => {
      event.preventDefault(); if (submitting.current) return; setError('')
      const durationWeeks = duration.trim() ? Number(duration) : undefined
      const badGroups = form.days.flatMap((day) => day.exercises.filter((item) => item.groupId && groupNumbers[item.id] !== undefined && !positiveInteger.safeParse(Number(groupNumbers[item.id])).success))
      if (badGroups.length) { setError('Enter a positive whole superset number for each enabled occurrence.'); return }
      if (unique && (!form.weeks || !divisors.includes(form.weeks.length))) { setErrors({ weeks: 'Choose a unique-week count that divides the duration evenly.' }); return }
      const prepared = { ...form, durationWeeks, ...(unique ? { days: identifySets(form.days) } : {}) }
      setForm(prepared)
      const parsed = planInputSchema.safeParse(prepared)
      const missingDuration = (!original || original.durationWeeks !== undefined) && durationWeeks === undefined
      if (!parsed.success || missingDuration) {
        setErrors({ ...Object.fromEntries(parsed.success ? [] : parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])), ...(missingDuration ? { durationWeeks: 'Enter a positive whole duration in weeks.' } : {}) })
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus()); return
      }
      submitting.current = true; setBusy(true)
      try { const saved = await (onSave ? onSave(parsed.data) : plans.save(profileId, parsed.data, original)); setDirty(false); onSaved(saved.name) }
      catch (e) { setError((e as Error).message) } finally { submitting.current = false; setBusy(false) }
    }}><fieldset disabled={busy}>
      <legend className="sr-only">Plan details</legend>
      <Field label="Plan name" required maxLength={120} value={form.name} error={errors.name} onChange={(e) => change((current) => ({ ...current, name: e.target.value }))} />
      <div className="duration-row"><Field label="Duration (weeks)" required={!original || original.durationWeeks !== undefined} inputMode="numeric" value={duration} error={errors.durationWeeks} onChange={(e) => { setDuration(e.target.value); setErrors({}) }} /><div className="unique-toggle"><span id="unique-weeks-label">Unique training weeks?</span><button type="button" role="switch" aria-labelledby="unique-weeks-label" aria-checked={unique} disabled={!unique && Number(duration) === 1} onClick={toggleUnique}>{unique ? 'On' : 'Off'}</button></div></div>
      {unique && <label>Number of Unique weeks<select aria-label="Number of Unique weeks" aria-invalid={!!errors.weeks} value={form.weeks?.length ?? ''} onChange={(e) => weekCount(Number(e.target.value))}><option value="" disabled>Choose</option>{form.weeks && !divisors.includes(form.weeks.length) && <option value={form.weeks.length} disabled>{form.weeks.length}</option>}{divisors.map((value) => <option key={value} value={value}>{value}</option>)}</select>{errors.weeks && <span role="alert">{errors.weeks}</span>}</label>}
      {original?.durationWeeks === undefined && original && <p className="muted">Legacy plan: blank keeps its unbounded duration. Enter weeks to set a duration for new schedules. Existing schedules change only through their duration preview.</p>}
      {!unique && <label>Training days per week<select value={form.days.length} onChange={(e) => count(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
      <TextareaField label="Instructions" maxLength={20000} value={form.instructions ?? ''} error={errors.instructions} onChange={(e) => change((current) => ({ ...current, instructions: e.target.value }))} />
      <TextareaField label="Note (optional):" maxLength={20000} value={form.notes ?? ''} onChange={(e) => change((current) => ({ ...current, notes: e.target.value }))} />
      {!unique && <p role="status">{form.days.length} training days · {7 - form.days.length} rest days</p>}
      {planWeeks(form).map((week, weekIndex) => <section key={week.id ?? 'repeating'} aria-label={unique ? `Week ${weekIndex + 1}` : undefined}>
      {unique && <><hr /><h3 className="unique-week-heading">Week {weekIndex + 1}</h3><label>Training days for Week {weekIndex + 1}<select aria-label={`Training days for Week ${weekIndex + 1}`} value={week.days.length} onChange={(e) => count(Number(e.target.value), week.id)}>{[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></>}
      {week.days.map((day, index) => <section className="plan-day" key={day.id} aria-label={`Day ${index + 1}: ${day.name}`} data-day-id={day.id}>
        <h3>Training day {index + 1}</h3>
        <Field label={`Day ${index + 1} name`} required maxLength={120} value={day.name} error={errors[`days.${form.days.indexOf(day)}.name`]} onChange={(e) => updateDay(day.id, (item) => ({ ...item, name: e.target.value }))} />
        <div className="actions"><span className="movement-controls"><button type="button" disabled={index === 0} onClick={() => days((items) => reorder(items, index, -1), week.id)} aria-label="Move day up" title="Move day up">Day ↑</button><button type="button" disabled={index === week.days.length - 1} onClick={() => days((items) => reorder(items, index, 1), week.id)} aria-label="Move day down" title="Move day down">Day ↓</button></span><button className="danger" type="button" disabled={week.days.length === 1} onClick={() => setConfirm({ title: `Remove ${day.name || 'this day'}?`, action: () => days((items) => items.filter((item) => item.id !== day.id), week.id) })} aria-label="Delete day">Delete</button></div>
        {errors[`days.${form.days.indexOf(day)}.exercises`] && <p role="alert" tabIndex={-1}>{errors[`days.${form.days.indexOf(day)}.exercises`]}</p>}
        {!day.exercises.length && <p className="muted">No exercises in this day.</p>}
        <ol className="plan-exercises">{day.exercises.map((exercise, i) => { const group = day.groups?.find((item) => item.id === exercise.groupId); return <Fragment key={exercise.id}><li data-occurrence-id={exercise.id} aria-label={`Exercise ${i + 1}: ${exercise.prescription.name}`}>
          <h4>{i + 1}. {exercise.prescription.name}</h4><p className="muted">{exercise.prescription.sets.length} sets; {exercise.prescription.tagNames.join(', ') || 'No tags'}</p>
          <label className="check-label"><input type="checkbox" checked={!!exercise.groupId} onChange={(e) => { setGroupNumbers((values) => { const next = { ...values }; delete next[exercise.id]; return next }); updateDay(day.id, (current) => joinGroup(current, exercise.id, e.target.checked ? current.groups?.find((group) => positiveInteger.safeParse(group.number).success)?.number ?? 1 : undefined)) }} />Superset</label>
          {exercise.groupId && <Field label="Superset group number" inputMode="numeric" value={groupNumbers[exercise.id] ?? day.groups?.find((item) => item.id === exercise.groupId)?.number ?? ''} onChange={(e) => { const value = e.target.value; setGroupNumbers((values) => ({ ...values, [exercise.id]: value })); if (positiveInteger.safeParse(Number(value)).success) { updateDay(day.id, (current) => joinGroup(current, exercise.id, Number(value))); setGroupNumbers((values) => { const next = { ...values }; delete next[exercise.id]; return next }) } }} />}
          <div className="actions occurrence-controls"><span className="movement-controls"><button type="button" disabled={i === 0} onClick={() => updateDay(day.id, (current) => moveOccurrence(current, exercise.id, -1))} aria-label="Move exercise up" title="Move exercise up">↑</button><button type="button" disabled={i === day.exercises.length - 1} onClick={() => updateDay(day.id, (current) => moveOccurrence(current, exercise.id, 1))} aria-label="Move exercise down" title="Move exercise down">↓</button></span><button type="button" aria-label={'Actions for ' + exercise.prescription.name} aria-haspopup="dialog" onClick={() => { trigger.current = document.activeElement as HTMLElement; setMenu({ dayId: day.id, exercise }) }}>☰</button></div>
        </li>
        {group && day.exercises[i + 1]?.groupId !== group.id && <li className="superset-footer"><fieldset className="superset-settings" aria-label={`Superset ${group.number} settings`}><legend>Superset {group.number}</legend>
          <p>{trainingBlocks(day).find((block) => block.id === group.id)?.members.map((item) => item.prescription.name).join(' · ')}</p>
          <Field label="Superset name" inputMode="numeric" value={groupFields[`${group.id}:number`] ?? group.number} onChange={(e) => { const value = e.target.value; setGroupFields((fields) => ({ ...fields, [`${group.id}:number`]: value })); updateDay(day.id, (current) => ({ ...current, groups: current.groups?.map((item) => item.id === group.id ? { ...item, number: value.trim() ? Number(value) : NaN } : item) })) }} />
          <div className="field-grid">{(['restBetweenRoundsSeconds', 'restAfterGroupSeconds'] as const).map((key) => { const value = groupRests[`${group.id}:${key}`] ?? restFields(group[key]); return <RestInput key={key} label={key === 'restBetweenRoundsSeconds' ? 'Rest between rounds' : 'Rest after group'} value={value} errors={parseRest(value).errors} onChange={(next) => { setGroupRests((fields) => ({ ...fields, [`${group.id}:${key}`]: next })); const parsed = parseRest(next); updateDay(day.id, (current) => ({ ...current, groups: current.groups?.map((item) => item.id === group.id ? { ...item, [key]: Object.keys(parsed.errors).length ? NaN : parsed.value } : item) })) }} /> })}</div>
          <p className="muted">Leave blank to choose the rest time while training.</p>
          <button className="danger" type="button" onClick={() => setConfirm({ title: `Delete Superset ${group.number}?`, label: 'Delete', message: 'This removes the grouping and keeps every exercise and prescription. Saved session history is unchanged.', action: () => updateDay(day.id, (current) => dissolveGroup(current, group.id)) })}>Delete</button>
        </fieldset></li>}
        </Fragment> })}</ol>
        <button type="button" disabled={day.exercises.length >= 100} onClick={() => { trigger.current = document.activeElement as HTMLElement; setPicker(day.id) }}>Add exercise</button>
      </section>)}
      <button type="button" disabled={week.days.length === 7} onClick={() => count(week.days.length + 1, week.id)}>Add training day</button></section>)}
      {error && <p role="alert">{error}</p>}
      {Object.entries(errors).filter(([path]) => path.includes('.groups.') || path.includes('.groupId') || path.includes('.prescription.') || path.includes('.setIds')).map(([path, text]) => <p role="alert" tabIndex={-1} key={path}>{path}: {text}</p>)}
      <div className="actions"><button className="primary" type="submit">{busy ? 'Saving...' : 'Save plan'}</button><button type="button" onClick={() => dirty ? setConfirm({ title: 'Discard unsaved plan?', action: onClose }) : onClose()}>Cancel</button></div>
    </fieldset></form>
    {menu && <ActionDialog title={menu.exercise.prescription.name + ' actions'} onClose={() => setMenu(undefined)}>
      <div className="occurrence-menu">
        <button type="button" onClick={() => { setMenu(undefined); setEditing(menu) }}>Edit</button>
        <button type="button" disabled={(form.days.find((day) => day.id === menu.dayId)?.exercises.length ?? 100) >= 100} onClick={() => { exerciseList(menu.dayId, (items) => [...items, { ...copyExercise(menu.exercise.prescription, menu.exercise.source), ...(menu.exercise.templateId ? { templateId: menu.exercise.templateId } : {}), ...(menu.exercise.groupId ? { groupId: menu.exercise.groupId } : {}) }]); setMenu(undefined) }}>Duplicate</button>
        <button type="button" disabled={form.days.length < 2} onClick={() => { setMenu(undefined); setMoving({ dayId: menu.dayId, exerciseId: menu.exercise.id }) }}>Move</button>
        <button type="button" className="danger" onClick={() => { setMenu(undefined); setConfirm({ title: 'Remove ' + menu.exercise.prescription.name + '?', action: () => exerciseList(menu.dayId, (items) => items.filter((item) => item.id !== menu.exercise.id)) }) }}>Delete</button>
      </div>
    </ActionDialog>}
    {moving && <ActionDialog title="Move exercise" onClose={() => setMoving(undefined)} actions={<button onClick={() => setMoving(undefined)}>Cancel</button>}>
      <p>Choose a destination. Moving to another day removes this occurrence from its superset.</p>
      <div className="destination-list">{form.days.filter((day) => day.id !== moving.dayId).map((day) => <button key={day.id} disabled={day.exercises.length >= 100} onClick={() => { const occurrence = form.days.find((item) => item.id === moving.dayId)?.exercises.find((item) => item.id === moving.exerciseId); if (!occurrence) return; days((items) => items.map((item) => item.id === moving.dayId ? compactGroups({ ...item, exercises: item.exercises.filter((entry) => entry.id !== occurrence.id) }) : item.id === day.id ? { ...item, exercises: [...item.exercises, { ...occurrence, groupId: undefined }] } : item)); setMoving(undefined); requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-occurrence-id="${occurrence.id}"] button[aria-haspopup]`)?.focus()) }}>Day {form.days.indexOf(day) + 1}: {day.name}{day.exercises.length >= 100 ? ' (full)' : ''}</button>)}</div>
    </ActionDialog>}
    {confirm && <ConfirmDialog title={confirm.title} confirmLabel={confirm.label ?? "Confirm"} onCancel={() => setConfirm(undefined)} onConfirm={() => { confirm.action(); setConfirm(undefined); requestAnimationFrame(() => { if (document.activeElement === document.body) heading.current?.focus() }) }}><p>{confirm.message ?? "This discards the affected unsaved input. Saved source exercises and other plans are unchanged."}</p></ConfirmDialog>}
  </section>
}

import { useEffect, useRef, useState } from 'react'
import { ZodError } from 'zod'
import { useWorkspace } from '../../app/workspace-context'
import { createId } from '../../lib/browser-crypto'
import { localDateTime, measurementDate, measurementDateInput } from '../../lib/measurement-dates'
import { measurements, measurementRevision } from '../../db/measurements'
import { preparePhoto } from '../profiles/photos'
import { displayNumber, fromKg, toKg, measurementWeightSchema, bodyFatSchema, type Measurement, type PreparedPhoto, type WeightUnit } from '../../schemas/profile'
import { Field } from '../../components/ui/Field'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { BlobImage, SavedPhoto } from './ProgressPhoto'

export function MeasurementEditor({ profileId, preferredUnit, initial, onClose, onSaved }: { profileId: string; preferredUnit: WeightUnit; initial?: Measurement; onClose: () => void; onSaved: () => void }) {
  const { setDirty } = useWorkspace(), [unit] = useState(preferredUnit), [id] = useState(() => initial?.id ?? createId()), [mutationId] = useState(createId)
  const [originalWeight] = useState(() => initial?.weightKg === undefined ? '' : displayNumber(fromKg(initial.weightKg, unit)))
  const [weight, setWeight] = useState(originalWeight), [bodyFat, setBodyFat] = useState(() => initial?.bodyFatPercentage === undefined ? '' : String(initial.bodyFatPercentage))
  const [date, setDate] = useState(() => initial ? measurementDate(initial) : localDateTime().slice(0,10))
  const [photo, setPhoto] = useState<PreparedPhoto | null>(), [error, setError] = useState(''), [errors, setErrors] = useState<Record<string,string>>({}), [busy, setBusy] = useState(false), [dirty, setFormDirty] = useState(false)
  const lock = useRef(false), alive = useRef(true), captured = useRef<ReturnType<typeof measurementDateInput>>(undefined)
  useEffect(() => { alive.current = true; return () => { alive.current = false; setDirty(false) } }, [setDirty])
  useEffect(() => { setDirty(dirty || busy) }, [dirty, busy, setDirty])
  const save = async () => {
    if (lock.current) return
    setError(''); const problems: Record<string,string> = {}
    const numeric = (text: string) => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()) ? Number(text) : NaN
    const weightKg = !weight.trim() ? undefined : initial && weight === originalWeight ? initial.weightKg : toKg(numeric(weight), unit)
    const bodyFatPercentage = !bodyFat.trim() ? undefined : numeric(bodyFat)
    if (weight.trim() && !measurementWeightSchema.safeParse(weightKg).success) problems.weight = 'Enter a weight greater than 0 and at most 1000 kg (2204.62 lb).'
    if (bodyFat.trim() && !bodyFatSchema.safeParse(bodyFatPercentage).success) problems.bodyFat = 'Enter body fat greater than 0 and less than 100%.'
    if (!weight.trim() && !bodyFat.trim()) problems.weight = 'Enter weight or body fat.'
    let time = captured.current
    try { time ??= measurementDateInput(date, initial) } catch (e) { problems.date = (e as Error).message }
    setErrors(problems); if (Object.keys(problems).length) return
    captured.current = time
    lock.current = true; setBusy(true)
    try { await measurements.save(profileId, id, initial ? measurementRevision(initial) : undefined, { ...(weightKg === undefined ? {} : {weightKg}), ...(bodyFatPercentage === undefined ? {} : {bodyFatPercentage}), ...captured.current! }, photo, mutationId); if (alive.current) { setDirty(false); onSaved() } }
    catch (e) { if (alive.current) setError((e as Error).message) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  const fields = <fieldset disabled={busy}>
    <div className="weight-input-row"><Field label="Weight" aria-label={`Weight (${unit})`} inputMode="decimal" value={weight} error={errors.weight} onChange={(e) => { setWeight(e.target.value); setFormDirty(true) }} /><span aria-hidden="true">{unit}</span></div>
    <div className="weight-input-row"><Field label="Body fat" aria-label="Body fat (%)" inputMode="decimal" value={bodyFat} error={errors.bodyFat} onChange={(e) => { setBodyFat(e.target.value); setFormDirty(true) }} /><span aria-hidden="true">%</span></div>
    <Field label="Date" type="date" required value={date} error={errors.date} onChange={e => { setDate(e.target.value); captured.current = undefined; setFormDirty(true) }} />
    {preferredUnit !== unit && <p role="status">This open form keeps {unit} so its input is not reinterpreted.</p>}
    <label className="photo-upload">{initial ? 'Upload new photo' : 'Progress photo (optional)'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file || lock.current) return
      lock.current = true; setBusy(true); setError('')
      try { const next = await preparePhoto(file); if (alive.current) { setPhoto(next); setFormDirty(true) } }
      catch (e) { if (alive.current) setError(e instanceof ZodError ? 'Choose a JPEG, PNG, or WebP, up to 5 MB and 4096 pixels per side.' : (e as Error).message) }
      finally { lock.current = false; if (alive.current) setBusy(false) }
    }} /></label><p className="muted">JPEG, PNG, or WebP, up to 5 MB and 4096 pixels per side.</p>
    {photo ? <BlobImage blob={photo.blob} alt="Selected progress photo preview" /> : photo === undefined && initial?.photoId ? <SavedPhoto profileId={profileId} entryId={initial.id} /> : null}
    {(photo || photo === undefined && initial?.photoId) && <button type="button" onClick={() => { setPhoto(null); setFormDirty(true) }}>Remove photo</button>}
    {error && <p role="alert">{error}</p>}
  </fieldset>
  const close = () => { if (!busy) onClose() }
  const actions = <><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving...' : initial ? 'Update' : 'Save'}</button></>
  return <ActionDialog className="measurement-editor" title={initial ? 'Update Measurements' : 'Log Measurements'} onClose={close} actions={actions}><form noValidate onSubmit={(e) => { e.preventDefault(); void save() }}>{fields}</form></ActionDialog>
}

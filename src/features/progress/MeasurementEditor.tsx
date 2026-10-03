import { createId } from '../../lib/browser-crypto.ts'
import { useEffect, useRef, useState } from 'react'
import { ZodError } from 'zod'
import { useWorkspace } from '../../app/workspace-context'
import { measurements, measurementRevision } from '../../db/measurements'
import { displayNumber, fromKg, measurementSchema, toKg, type Measurement, type PreparedPhoto, type WeightUnit } from '../../schemas/profile'
import { browserZone } from '../../lib/calendar-dates'
import { measurementInstant, measurementDateLabel, measurementTime } from '../../lib/measurement-dates'
import { preparePhoto } from '../profiles/photos'
import { Field } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { BlobImage, SavedPhoto } from './ProgressPhoto'

export function MeasurementEditor({ profileId, preferredUnit, initial, onClose, onSaved }: { profileId: string; preferredUnit: WeightUnit; initial?: Measurement; onClose: () => void; onSaved: () => void }) {
  const { setDirty } = useWorkspace()
  const [unit] = useState(preferredUnit), [zone] = useState(browserZone), [id] = useState(() => initial?.id ?? createId()), [mutationId] = useState(() => createId())
  const [weight, setWeight] = useState(() => initial ? displayNumber(fromKg(initial.weightKg, unit)) : ''), [weightChanged, setWeightChanged] = useState(false)
  const [defaultTime] = useState(() => measurementInstant(initial ? new Date(initial.measuredAt) : undefined))
  const [date, setDate] = useState(defaultTime.measuredLocal.slice(0, 16)), [dateEdited, setDateEdited] = useState(false), [changeTime, setChangeTime] = useState(!initial)
  const [photo, setPhoto] = useState<PreparedPhoto | null>(), [confirmPhoto, setConfirmPhoto] = useState(false), [large, setLarge] = useState(false)
  const [error, setError] = useState(''), [errors, setErrors] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [dirty, dirtyInput] = useState(false)
  const alive = useRef(true), lock = useRef(false), removedPhoto = useRef(false), heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { alive.current = true; heading.current?.focus(); return () => { alive.current = false; setDirty(false) } }, [setDirty])
  useEffect(() => { setDirty(dirty || busy) }, [dirty, busy, setDirty])
  useEffect(() => { if (photo === null && !confirmPhoto && removedPhoto.current) { removedPhoto.current = false; document.getElementById('save-measurement')?.focus() } }, [photo, confirmPhoto])
  const changed = () => { dirtyInput(true); setError('') }
  const hasPhoto = photo ? true : photo === null ? false : !!initial?.photoId
  const save = async () => {
    if (lock.current) return
    setError(''); const validation: Record<string, string> = {}
    let weightKg = initial?.weightKg, time = initial ? { measuredAt: initial.measuredAt, measuredLocal: initial.measuredLocal, timeZone: initial.timeZone, offsetMinutes: initial.offsetMinutes } : undefined
    if (!initial || weightChanged) {
      const numeric = weight.trim() && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(weight.trim()) ? Number(weight) : NaN
      weightKg = toKg(numeric, unit)
      if (!measurementSchema.shape.weightKg.safeParse(weightKg).success) validation.weight = 'Enter a weight greater than 0 and at most 1000 kg (2204.62 lb).'
    }
    if (changeTime) { try { time = dateEdited ? measurementTime(date, zone) : initial ? time : defaultTime } catch (error) { validation.date = (error as Error).message } }
    setErrors(validation)
    if (Object.keys(validation).length) { requestAnimationFrame(() => document.querySelector<HTMLElement>('.measurement-editor [aria-invalid="true"]')?.focus()); return }
    lock.current = true; setBusy(true)
    try {
      await measurements.save(profileId, id, initial ? measurementRevision(initial) : undefined, { weightKg: weightKg!, ...time! }, photo, mutationId)
      if (alive.current) { setDirty(false); onSaved() }
    } catch (error) { if (alive.current) setError((error as Error).message) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  return <section className="measurement-editor"><h2 ref={heading} tabIndex={-1}>{initial ? 'Edit measurement' : 'Add measurement'}</h2>
    <p>Weight ({unit}). Change your preferred unit in Settings.</p>
    {preferredUnit !== unit && <p role="status">The preferred unit changed. This open form keeps {unit} so its input is not reinterpreted.</p>}
    <form onSubmit={(event) => { event.preventDefault(); void save() }}><fieldset disabled={busy}>
      <Field label={`Weight (${unit})`} required inputMode="decimal" value={weight} error={errors.weight} onChange={(e) => { setWeight(e.target.value); setWeightChanged(true); changed() }} />
      {initial && <><p>Measured: {measurementDateLabel(initial)}</p><label className="check-label"><input type="checkbox" checked={changeTime} onChange={(e) => { setChangeTime(e.target.checked); changed() }} />Change measurement date/time</label></>}
      {changeTime && <><Field label="Measurement date/time" type="datetime-local" step="60" required value={date} error={errors.date} onChange={(e) => { setDate(e.target.value); setDateEdited(true); changed() }} /><p className="muted">Time zone: {zone}. Backdated entries are allowed. During a repeated daylight-saving hour, a changed time uses the earlier occurrence.</p></>}
      <label className="photo-upload">Progress photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file || lock.current) return
        lock.current = true; setBusy(true); changed()
        try { const prepared = await preparePhoto(file); if (alive.current) setPhoto(prepared) }
        catch (error) { if (alive.current) setError(error instanceof ZodError ? 'Choose a JPEG, PNG, or WebP, up to 5 MB and 4096 pixels per side.' : (error as Error).message) }
        finally { lock.current = false; if (alive.current) setBusy(false) }
      }} /></label>
      <p className="muted">JPEG, PNG, or WebP, up to 5 MB and 4096 pixels per side. Kept separately from your avatar.</p>
      {hasPhoto && <div className="progress-photo-preview">{photo ? <BlobImage blob={photo.blob} alt="Selected progress photo preview" /> : <SavedPhoto profileId={profileId} entryId={id} />}<div className="actions"><button type="button" onClick={() => setLarge(true)}>View larger photo</button><button type="button" onClick={() => setConfirmPhoto(true)}>Remove progress photo</button></div></div>}
      {photo === null && initial?.photoId && <p>Photo removal is pending. Save measurement to apply it.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button id="save-measurement" className="primary" type="submit">{busy ? 'Working…' : 'Save measurement'}</button></div>
    </fieldset></form>
    {confirmPhoto && <ConfirmDialog title="Remove progress photo?" confirmLabel="Remove photo from entry" onCancel={() => setConfirmPhoto(false)} onConfirm={() => { removedPhoto.current = true; setPhoto(null); setConfirmPhoto(false); changed() }}><p>Save measurement to remove only this entry’s photo. Its weight and measured time are kept. Photos referenced by another entry or an avatar are retained. Canceling this editor keeps the saved photo.</p></ConfirmDialog>}
    {large && <ConfirmDialog title="Progress photo" confirmLabel="Close photo" onCancel={() => setLarge(false)} onConfirm={() => setLarge(false)}>{photo ? <BlobImage blob={photo.blob} alt="Selected progress photo" /> : <SavedPhoto profileId={profileId} entryId={id} />}</ConfirmDialog>}
  </section>
}

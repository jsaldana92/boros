import { useEffect, useRef, useState } from 'react'
import { ZodError } from 'zod'
import { useWorkspace } from '../../app/workspace-context'
import { createId } from '../../lib/browser-crypto'
import { measurementInstant } from '../../lib/measurement-dates'
import { measurements, measurementRevision } from '../../db/measurements'
import { preparePhoto } from '../profiles/photos'
import { displayNumber, fromKg, toKg, measurementSchema, type Measurement, type PreparedPhoto, type WeightUnit } from '../../schemas/profile'
import { Field } from '../../components/ui/Field'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { BlobImage } from './ProgressPhoto'

export function MeasurementEditor({ profileId, preferredUnit, initial, onClose, onSaved }: { profileId: string; preferredUnit: WeightUnit; initial?: Measurement; onClose: () => void; onSaved: () => void }) {
  const { setDirty } = useWorkspace(), [unit] = useState(preferredUnit), [id] = useState(() => initial?.id ?? createId()), [mutationId] = useState(createId)
  const [weight, setWeight] = useState(() => initial ? displayNumber(fromKg(initial.weightKg, unit)) : ''), [changedWeight, setChangedWeight] = useState(false)
  const [photo, setPhoto] = useState<PreparedPhoto>(), [error, setError] = useState(''), [weightError, setWeightError] = useState(''), [busy, setBusy] = useState(false), [dirty, setFormDirty] = useState(false)
  const lock = useRef(false), alive = useRef(true), captured = useRef<ReturnType<typeof measurementInstant>>(undefined), heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { alive.current = true; heading.current?.focus(); return () => { alive.current = false; setDirty(false) } }, [setDirty])
  useEffect(() => { setDirty(dirty || busy) }, [dirty, busy, setDirty])
  const save = async () => {
    if (lock.current) return
    setError(''); setWeightError('')
    const numeric = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(weight.trim()) ? Number(weight) : NaN
    const weightKg = initial && !changedWeight ? initial.weightKg : toKg(numeric, unit)
    if (!measurementSchema.shape.weightKg.safeParse(weightKg).success) { setWeightError('Enter a weight greater than 0 and at most 1000 kg (2204.62 lb).'); return }
    captured.current ??= measurementInstant()
    const time = initial ? { measuredAt: initial.measuredAt, measuredLocal: initial.measuredLocal, timeZone: initial.timeZone, offsetMinutes: initial.offsetMinutes } : captured.current
    lock.current = true; setBusy(true)
    try { await measurements.save(profileId, id, initial ? measurementRevision(initial) : undefined, { weightKg, ...time }, photo, mutationId); if (alive.current) { setDirty(false); onSaved() } }
    catch (e) { if (alive.current) setError((e as Error).message) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  const fields = <fieldset disabled={busy}>
    <div className="weight-input-row"><Field label="Weight" aria-label={`Weight (${unit})`} required inputMode="decimal" value={weight} error={weightError} onChange={(e) => { setWeight(e.target.value); setChangedWeight(true); setFormDirty(true) }} /><span aria-hidden="true">{unit}</span></div>
    {preferredUnit !== unit && <p role="status">This open form keeps {unit} so its input is not reinterpreted.</p>}
    <label className="photo-upload">{initial ? 'Upload new photo' : 'Progress photo (optional)'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file || lock.current) return
      lock.current = true; setBusy(true); setError('')
      try { const next = await preparePhoto(file); if (alive.current) { setPhoto(next); setFormDirty(true) } }
      catch (e) { if (alive.current) setError(e instanceof ZodError ? 'Choose a JPEG, PNG, or WebP, up to 5 MB and 4096 pixels per side.' : (e as Error).message) }
      finally { lock.current = false; if (alive.current) setBusy(false) }
    }} /></label><p className="muted">JPEG, PNG, or WebP, up to 5 MB and 4096 pixels per side.</p>
    {photo && <BlobImage blob={photo.blob} alt="Selected progress photo preview" />}{error && <p role="alert">{error}</p>}
  </fieldset>
  const close = () => { if (!busy) onClose() }
  const actions = <><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : initial ? 'Update' : 'Log Weight'}</button></>
  return initial ? <ActionDialog title="Update Weight" onClose={close} actions={actions}><form onSubmit={(e) => { e.preventDefault(); void save() }}>{fields}</form></ActionDialog> : <section className="measurement-editor"><h2 ref={heading} tabIndex={-1}>Log Weight</h2><form onSubmit={(e) => { e.preventDefault(); void save() }}>{fields}<div className="actions">{actions}</div></form></section>
}

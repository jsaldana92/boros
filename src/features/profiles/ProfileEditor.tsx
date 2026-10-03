import { useEffect, useState } from 'react'
import { profiles, type ProfileSnapshot } from '../../db/profiles'
import { useWorkspace } from '../../app/workspace-context'
import { displayNumber, fromKg, toKg, type HeightUnit, type PreparedPhoto, type WeightUnit } from '../../schemas/profile'
import { preparePhoto } from './photos'
import { Avatar } from './Avatar'

function initialForm(snapshot: ProfileSnapshot) {
  const p = snapshot.profile
  const inches = (p.heightCm ?? 0) / 2.54
  return { name: p.kind === 'guest' ? '' : p.name, age: p.age === undefined ? '' : String(p.age),
    height: p.heightCm === undefined ? '' : displayNumber(p.heightCm), feet: p.heightCm === undefined ? '' : String(Math.floor(inches / 12)), inches: p.heightCm === undefined ? '' : displayNumber(inches % 12),
    weight: snapshot.measurement ? displayNumber(fromKg(snapshot.measurement.weightKg, p.weightUnit)) : '', weightUnit: p.weightUnit, heightUnit: p.heightUnit }
}
export function ProfileEditor({ initial }: { initial: ProfileSnapshot }) {
  const { snapshot: latest, setDirty } = useWorkspace()
  const [baseline, setBaseline] = useState(initial)
  const [form, setForm] = useState(() => initialForm(initial))
  const [heightChanged, setHeightChanged] = useState(false)
  const [weightChanged, setWeightChanged] = useState(false)
  const [photo, setPhoto] = useState<PreparedPhoto | null | undefined>()
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  useEffect(() => () => setDirty(false), [setDirty])
  const change = (field: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [field]: value })); setDirty(true); setStatus('') }
  const numeric = (value: string, label: string) => {
    if (!value.trim()) return undefined
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`)
    return parsed
  }
  const heightCm = () => {
    if (!heightChanged) return baseline.profile.heightCm
    if (form.heightUnit === 'cm') return numeric(form.height, 'Height')
    const feet = numeric(form.feet, 'Feet'), inches = numeric(form.inches, 'Inches')
    if (feet === undefined && inches === undefined) return undefined
    if (feet !== undefined && (!Number.isInteger(feet) || feet < 0) || inches !== undefined && (inches < 0 || inches >= 12)) throw new Error('Use whole nonnegative feet and inches from 0 to less than 12.')
    return ((feet ?? 0) * 12 + (inches ?? 0)) * 2.54
  }
  const weightKg = () => {
    if (!weightChanged) return undefined
    const value = numeric(form.weight, 'Weight')
    return value === undefined ? undefined : toKg(value, form.weightUnit)
  }
  const changeHeightUnit = (unit: HeightUnit) => {
    try {
      const cm = heightCm()
      setForm((current) => ({ ...current, heightUnit: unit, height: cm === undefined ? '' : displayNumber(cm), feet: cm === undefined ? '' : String(Math.floor(cm / 2.54 / 12)), inches: cm === undefined ? '' : displayNumber(cm / 2.54 % 12) }))
      setDirty(true)
      setStatus('')
    } catch (e) { setError((e as Error).message) }
  }
  const changeWeightUnit = (unit: WeightUnit) => {
    try {
      const kg = weightChanged ? weightKg() : latest.measurement?.weightKg
      setForm((current) => ({ ...current, weightUnit: unit, weight: kg === undefined ? '' : displayNumber(fromKg(kg, unit)) }))
      setDirty(true)
      setStatus('')
    } catch (e) { setError((e as Error).message) }
  }
  const reset = (value: ProfileSnapshot) => {
    setBaseline(value); setForm(initialForm(value)); setHeightChanged(false); setWeightChanged(false); setPhoto(undefined); setPhotoError(''); setError(''); setDirty(false)
  }
  const stale = latest.profile.revision !== baseline.profile.revision
  return <form className="profile-form" onSubmit={async (event) => {
    event.preventDefault(); setError(''); setStatus(''); setBusy(true)
    try {
      const age = numeric(form.age, 'Age'), height = heightCm(), weight = weightKg()
      if (age !== undefined && (!Number.isInteger(age) || age < 0 || age > 130)) throw new Error('Age must be a whole number from 0 to 130, or left blank.')
      if (height !== undefined && (height <= 0 || height > 300)) throw new Error('Height must be greater than 0 and at most 300 cm (9 ft 10.11 in).')
      if (weight !== undefined && (weight <= 0 || weight > 1000)) throw new Error('Weight must be greater than 0 and at most 1000 kg (2204.62 lb).')
      await profiles.save(baseline.profile.id, baseline.profile.revision, { name: form.name, age, heightCm: height, weightKg: weight, heightUnit: form.heightUnit, weightUnit: form.weightUnit }, photo)
      reset(await profiles.snapshot(baseline.profile.id)); setStatus('Profile saved.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed. Your input has been kept.') }
    finally { setBusy(false) }
  }}>
    {stale && <p role="status">This profile changed in another tab. Your unsaved input is kept. Review the latest saved values before editing again.</p>}
    <fieldset disabled={busy}>
      <legend className="sr-only">Edit profile</legend>
      <label>Name {baseline.profile.kind === 'guest' && <span className="muted">(leave blank to keep Guest)</span>}<input name="name" maxLength={80} required={baseline.profile.kind === 'named'} value={form.name} onChange={(e) => change('name', e.target.value)} /></label>
      <div className="photo-field"><Avatar blob={photo === null ? undefined : photo?.blob ?? baseline.photo?.blob} name={form.name || 'Guest'} /><label>Profile photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
        setBusy(true); setPhotoError(''); setStatus('')
        try { setPhoto(await preparePhoto(file)); setDirty(true); setStatus('') } catch { setPhotoError('Choose a readable JPEG, PNG, or WebP, up to 5 MB and 4096 pixels per side.') }
        finally { setBusy(false) }
      }} /></label></div>
      <p className="muted">JPEG, PNG, or WebP. Up to 5 MB and 4096 pixels per side. Stored only in this browser.</p>
      {photoError && <p role="alert">{photoError}</p>}
      {(photo || baseline.photo) && photo !== null && <button type="button" onClick={() => { setPhoto(null); setDirty(true); setStatus('') }}>Remove photo</button>}
      <div className="field-grid">
        <label>Age (optional)<input name="age" inputMode="numeric" value={form.age} onChange={(e) => change('age', e.target.value)} /></label>
        <label>Height unit<select value={form.heightUnit} onChange={(e) => changeHeightUnit(e.target.value as HeightUnit)}><option value="cm">cm</option><option value="ft">ft / in</option></select></label>
        {form.heightUnit === 'cm' ? <label>Height (cm, optional)<input inputMode="decimal" value={form.height} onChange={(e) => { change('height', e.target.value); setHeightChanged(true) }} /></label> : <div className="field-grid"><label>Height (feet)<input inputMode="numeric" value={form.feet} onChange={(e) => { change('feet', e.target.value); setHeightChanged(true) }} /></label><label>Height (inches)<input inputMode="decimal" value={form.inches} onChange={(e) => { change('inches', e.target.value); setHeightChanged(true) }} /></label></div>}
        <label>Weight unit<select value={form.weightUnit} onChange={(e) => changeWeightUnit(e.target.value as WeightUnit)}><option value="kg">kg</option><option value="lb">lb</option></select></label>
        <label>Weight ({form.weightUnit}, optional)<input inputMode="decimal" value={weightChanged ? form.weight : latest.measurement ? displayNumber(fromKg(latest.measurement.weightKg, form.weightUnit)) : ''} onChange={(e) => { change('weight', e.target.value); setWeightChanged(true) }} /></label>
      </div>
      <p className="muted">A changed weight adds a dated measurement. Blank keeps the previous weight; changing units preserves the measurement.</p>
      {latest.measurement ? <p className="muted">Last weight recorded: {new Date(latest.measurement.measuredAt).toLocaleString()}</p> : <p className="muted">No recorded weight.</p>}
      {error && <p role="alert">{error}</p>}
      <p role="status">{status}</p>
      <div className="actions"><button className="primary" type="submit">{busy ? 'Saving...' : 'Save profile'}</button><button type="button" onClick={() => { if (window.confirm('Discard your unsaved input and load the latest saved profile?')) { reset(latest); setStatus('Latest saved profile loaded.') } }}>Reload saved profile</button></div>
    </fieldset>
  </form>
}

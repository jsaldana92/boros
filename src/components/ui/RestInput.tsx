import { Field } from './Field'
import type { RestErrors, RestFields } from '../../lib/rest-duration'

export function RestInput({ label, value, onChange, errors = {} }: { label: string; value: RestFields; onChange: (value: RestFields) => void; errors?: RestErrors }) {
  return <fieldset className="rest-input"><legend>{label}</legend><div className="rest-components">
    <Field label="Minutes" aria-label={`${label} minutes`} inputMode="numeric" maxLength={16} value={value.minutes} error={errors.minutes} onChange={(event) => onChange({ ...value, minutes: event.target.value })} />
    <Field label="Seconds" aria-label={`${label} seconds`} inputMode="numeric" maxLength={16} value={value.seconds} error={errors.seconds} onChange={(event) => onChange({ ...value, seconds: event.target.value })} />
  </div></fieldset>
}

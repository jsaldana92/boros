import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export function Field({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId()
  return <div className="field-control"><label htmlFor={id}>{label}</label><input {...props} id={id} aria-invalid={!!error} aria-describedby={[props['aria-describedby'], error ? `${id}-error` : undefined].filter(Boolean).join(' ') || undefined} />{error && <span className="field-error" id={`${id}-error`}>{error}</span>}</div>
}

export function TextareaField({ label, error, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  const id = useId()
  return <div className="field-control"><label htmlFor={id}>{label}</label><textarea {...props} id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />{error && <span className="field-error" id={`${id}-error`}>{error}</span>}</div>
}

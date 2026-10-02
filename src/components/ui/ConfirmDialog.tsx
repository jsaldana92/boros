import { useEffect, useId, useRef, type ReactNode } from 'react'

export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: { title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const dialog = ref.current!
    dialog.showModal()
    return () => { dialog.close(); if (trigger?.isConnected) trigger.focus() }
  }, [])
  return <dialog ref={ref} aria-labelledby={id} aria-describedby={`${id}-body`} onCancel={(e) => { e.preventDefault(); onCancel() }}>
    <h2 id={id}>{title}</h2><div id={`${id}-body`}>{children}</div><div className="actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="primary" onClick={onConfirm}>{confirmLabel}</button></div>
  </dialog>
}

import { useEffect, useId, useRef, type ReactNode } from 'react'

const dialogs: HTMLDialogElement[] = []
let unlockScroll: (() => void) | undefined
function lockScroll() {
  const body = document.body, root = document.documentElement, x = window.scrollX, y = window.scrollY
  const previous = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: root.style.overflow }
  root.style.overflow = 'hidden'
  body.style.position = 'fixed'; body.style.top = `-${y}px`; body.style.left = `-${x}px`; body.style.width = '100%'
  return () => {
    Object.assign(body.style, { position: previous.position, top: previous.top, left: previous.left, width: previous.width })
    root.style.overflow = previous.overflow
    window.scrollTo(x, y)
  }
}

export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, cancelLabel = 'Cancel', destructive = false, busy = false, confirmDisabled = false }: { title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; cancelLabel?: string; destructive?: boolean; busy?: boolean; confirmDisabled?: boolean }) {
  return <ActionDialog title={title} onClose={() => { if (!busy) onCancel() }} actions={<><button type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button><button type="button" disabled={busy || confirmDisabled} className={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>{confirmLabel}</button></>}>{children}</ActionDialog>
}

export function ActionDialog({ title, children, onClose, actions, headerActions, className, hideTitle = false }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode; headerActions?: ReactNode; className?: string; hideTitle?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const dialog = ref.current!
    if (!dialogs.length) unlockScroll = lockScroll()
    dialogs.push(dialog)
    for (const item of dialogs) item.inert = item !== dialog
    dialog.showModal()
    const keepFocus = (event: FocusEvent) => {
      if (dialogs.at(-1) === dialog && !dialog.contains(event.target as Node)) dialog.focus({ preventScroll: true })
    }
    document.addEventListener('focusin', keepFocus)
    return () => {
      document.removeEventListener('focusin', keepFocus)
      dialogs.splice(dialogs.indexOf(dialog), 1)
      const top = dialogs.at(-1)
      if (top) top.inert = false
      dialog.close()
      if (!dialogs.length) { unlockScroll?.(); unlockScroll = undefined }
      if (trigger?.isConnected && (!top || top.contains(trigger))) trigger.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={ref} tabIndex={-1} className={className} aria-modal="true" aria-labelledby={id} aria-describedby={`${id}-body`} onPointerDown={(event) => {
    if (event.target !== ref.current) return
    const box = event.currentTarget.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.preventDefault()
  }} onKeyDown={(event) => {
    const dialog = ref.current!
    if (event.key !== 'Tab' || dialogs.at(-1) !== dialog) return
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, iframe, [tabindex]')).filter((node) => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert]') && node.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (!first) { event.preventDefault(); dialog.focus() }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }} onCancel={(e) => { e.preventDefault(); if (dialogs.at(-1) === ref.current) onClose() }}>
    <div className={hideTitle ? 'sr-only' : 'dialog-heading'}><h2 id={id}>{title}</h2>{headerActions}</div><div id={`${id}-body`}>{children}</div><div className="actions">{actions ?? <button type="button" onClick={onClose}>Close</button>}</div>
  </dialog>
}

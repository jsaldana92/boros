import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

export function CreateLeaveGuard({ kind, enabled = true }: { kind: 'plan' | 'exercise' | 'workout'; enabled?: boolean }) {
  const { dirty, registerLeaveGuard } = useWorkspace(), current = useRef(dirty)
  useLayoutEffect(() => { current.current = dirty }, [dirty])
  const pending = useRef<((value: boolean) => void) | undefined>(undefined), [open, setOpen] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const remove = registerLeaveGuard(async () => {
      if (!current.current) return true
      return new Promise<boolean>((resolve) => { pending.current = resolve; setOpen(true) })
    })
    return () => { remove(); pending.current?.(false); pending.current = undefined }
  }, [enabled, registerLeaveGuard])
  const finish = (leave: boolean) => { setOpen(false); pending.current?.(leave); pending.current = undefined }
  return open ? <ConfirmDialog title={`Leaving ${kind} creation`} confirmLabel="Leave" onCancel={() => finish(false)} onConfirm={() => finish(true)}><p>Leaving this page will lose all information entered.</p></ConfirmDialog> : null
}

import { useEffect, useRef } from 'react'

export function useFocusClearance() {
  const pending = useRef<number | undefined>(undefined)
  const reveal = (control: HTMLElement) => {
    if (pending.current !== undefined) cancelAnimationFrame(pending.current)
    pending.current = requestAnimationFrame(() => {
      pending.current = undefined
      if (document.activeElement !== control || !control.isConnected || control.closest('dialog, .session-actions')) return
      const viewport = window.visualViewport
      const top = viewport?.offsetTop ?? 0, viewportBottom = top + (viewport?.height ?? innerHeight)
      const boundary = document.querySelector('.session-actions') ?? document.querySelector('.main-nav')
      const bottom = Math.min(boundary?.getBoundingClientRect().top ?? viewportBottom, viewportBottom) - 8
      const rect = control.getBoundingClientRect()
      // Move only the obscured distance. Centering fights native keyboard pan.
      const delta = rect.bottom > bottom ? rect.bottom - bottom : rect.top < top + 8 ? rect.top - top - 8 : 0
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' })
    })
  }
  useEffect(() => {
    const resized = () => { const node = document.activeElement; if (node instanceof HTMLElement && node.matches('input, textarea, select')) reveal(node) }
    window.visualViewport?.addEventListener('resize', resized)
    window.addEventListener('resize', resized)
    return () => { window.visualViewport?.removeEventListener('resize', resized); window.removeEventListener('resize', resized); if (pending.current !== undefined) cancelAnimationFrame(pending.current) }
  }, [])
  return reveal
}

import { useLayoutEffect, useRef, type RefObject } from 'react'

// Local to this builder instance; never shared across profiles or reopened forms.
export function useEditorReturn(parent: RefObject<HTMLFormElement | null>, childOpen: boolean) {
  const saved = useRef<{ anchor: HTMLElement; section: HTMLElement; parent: HTMLElement | null; top: number; x: number; y: number; focus: HTMLElement; scrolls: { node: HTMLElement; x: number; y: number }[] } | undefined>(undefined)
  const capture = (focus: HTMLElement) => {
    const anchor = focus.closest<HTMLElement>('[data-occurrence-id], [data-circuit-id], [data-day-id]') ?? focus
    saved.current = { anchor: focus, section: anchor, parent: anchor.closest<HTMLElement>('[data-day-id]'), top: focus.getBoundingClientRect().top, x: scrollX, y: scrollY, focus,
      scrolls: [...(parent.current?.querySelectorAll<HTMLElement>('*') ?? [])].filter(node => node.scrollTop || node.scrollLeft).map(node => ({ node, x: node.scrollLeft, y: node.scrollTop })) }
  }
  useLayoutEffect(() => {
    if (childOpen || !saved.current) return
    // One frame lets a closing confirmation restore its own scroll lock first.
    const frame = requestAnimationFrame(() => {
      const state = saved.current; saved.current = undefined
      if (!state || !parent.current?.isConnected) return
      for (const { node, x, y } of state.scrolls) if (node.isConnected) node.scrollTo(x, y)
      const anchor = state.anchor.isConnected ? state.anchor : state.section.isConnected ? state.section : state.parent?.isConnected ? state.parent : parent.current
      const focus = state.focus.isConnected ? state.focus : anchor.querySelector<HTMLElement>('button, input')
      focus?.focus({ preventScroll: true })
      // Relative occurrence position survives prescription-height changes above it.
      window.scrollTo(state.x, scrollY + anchor.getBoundingClientRect().top - state.top)
    })
    return () => cancelAnimationFrame(frame)
  }, [childOpen, parent])
  return capture
}

import { useLayoutEffect, useRef } from 'react'

// Reserve the action row and fixed navigation before assigning scrolling space.
// Very short visual viewports still allow normal page scrolling to reach fields.
export function useListSpace() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const list = ref.current
    if (!list) return
    const measure = () => {
      const viewport = window.visualViewport?.height ?? window.innerHeight
      const navigation = document.querySelector('.main-nav')?.getBoundingClientRect().height ?? 80
      const actions = list.parentElement?.querySelector(':scope > .actions')?.getBoundingClientRect().height ?? 44
      const top = list.getBoundingClientRect().top + window.scrollY
      list.style.setProperty('--list-space', `${Math.max(90, Math.floor(viewport - top - navigation - actions - 40))}px`)
    }
    const observer = new ResizeObserver(measure)
    if (list.parentElement) observer.observe(list.parentElement)
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure); measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure) }
  }, [])
  return ref
}

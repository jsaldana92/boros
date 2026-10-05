import { useLayoutEffect, useRef, type ReactNode } from 'react'

// Measure actual rows, including wrapping text, instead of clipping fixed-height cards.
export function BoundedGrid({ children, rows, label, className = '' }: { children: ReactNode; rows: number; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current!
    const measure = () => {
      const cards = Array.from(element.children), first = cards[0]?.getBoundingClientRect()
      if (!first) { element.style.removeProperty('max-height'); return }
      let count = 0, top = -Infinity, bottom = first.bottom
      for (const card of cards) {
        const box = card.getBoundingClientRect()
        if (Math.abs(box.top - top) > 2) { count++; top = box.top }
        if (count > rows) break
        bottom = Math.max(bottom, box.bottom)
      }
      element.style.maxHeight = `${bottom - first.top + 12}px`
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element); Array.from(element.children).forEach((card) => observer.observe(card)); measure()
    return () => observer.disconnect()
  }, [children, rows])
  return <div ref={ref} className={`bounded-grid ${className}`} role="region" aria-label={label} tabIndex={0}>{children}</div>
}

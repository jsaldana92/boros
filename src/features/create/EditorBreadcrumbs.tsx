import { useEffect, useRef, type RefObject } from 'react'
import { useWorkspace } from '../../app/workspace-context'

export interface EditorAncestor { label: string; onSelect: () => void; check?: () => boolean }
export function EditorBreadcrumbs({ ancestors, current, title = current, headingRef }: { ancestors: EditorAncestor[]; current: string; title?: string; headingRef?: RefObject<HTMLHeadingElement | null> }) {
  const { allowLeave } = useWorkspace(), localHeading = useRef<HTMLHeadingElement>(null)
  const heading = headingRef ?? localHeading
  useEffect(() => { heading.current?.focus() }, [current, heading])
  return <nav className="editor-breadcrumbs" aria-label="Editor breadcrumbs"><ol>
    {ancestors.map((item, index) => <li key={index}><button type="button" aria-label={`Back to ${item.label}`} onClick={() => { if ((item.check ?? allowLeave)()) item.onSelect() }}>{item.label}</button><span aria-hidden="true">›</span></li>)}
    <li aria-current="page"><h1 ref={heading} tabIndex={-1} aria-label={title}>{current}</h1></li>
  </ol></nav>
}

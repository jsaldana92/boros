import { useEffect, useRef, type RefObject } from 'react'

export function EditorTitle({ path, headingRef }: { path: string[]; headingRef?: RefObject<HTMLHeadingElement | null> }) {
  const local = useRef<HTMLHeadingElement>(null), heading = headingRef ?? local
  const text = path.join(' > ')
  useEffect(() => { heading.current?.focus() }, [text, heading])
  return <h1 className="editor-title" ref={heading} tabIndex={-1}>{text}</h1>
}

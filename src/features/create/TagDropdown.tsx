import { useRef } from 'react'
import { nameKey } from '../../schemas/profile'

export function TagDropdown({ tags, selected, onChoose }: { tags: { id: string; name: string; archivedAt?: string }[]; selected: string[]; onChoose: (name: string) => void }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const close = () => { if (ref.current) { ref.current.open = false; ref.current.querySelector('summary')?.focus() } }
  return <details className="tag-dropdown" ref={ref} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); close() } }}>
    <summary>Choose existing tag</summary>
    <div className="tag-options" role="group" aria-label="Existing tags">
      {tags.filter((tag) => !tag.archivedAt).sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)) || a.id.localeCompare(b.id)).map((tag) => <button type="button" key={tag.id} disabled={selected.some((name) => nameKey(name) === nameKey(tag.name))} onClick={() => { onChoose(tag.name); close() }}>{tag.name}</button>)}
      {!tags.some((tag) => !tag.archivedAt) && <p className="muted">No tags yet.</p>}
    </div>
  </details>
}

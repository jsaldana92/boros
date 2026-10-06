import { nameKey } from '../../schemas/profile'

export function TagPills({ tags, selected, onToggle }: { tags: { id: string; name: string }[]; selected: string[]; onToggle: (id: string) => void }) {
  return <div className="tag-scroll">{[...tags].sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)) || a.id.localeCompare(b.id)).map((tag) => <button type="button" className="tag-toggle" key={tag.id} aria-pressed={selected.includes(tag.id)} onClick={() => onToggle(tag.id)}><span>{tag.name}</span></button>)}</div>
}

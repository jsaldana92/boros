import type { LibrarySort } from './library'
import { useId, useState, type Dispatch, type SetStateAction } from 'react'

export function LibraryFilters({ noun = 'exercises', search, setSearch, sort, setSort, filterTags, setFilterTags, tags }: { noun?: string; search: string; setSearch: (value: string) => void; sort: LibrarySort; setSort: (value: LibrarySort) => void; filterTags: string[]; setFilterTags: Dispatch<SetStateAction<string[]>>; tags: { id: string; name: string }[] }) {
  const [expanded, setExpanded] = useState(false), id = useId()
  return <>
        <div className="library-filters"><label>Search<input aria-label={`Search ${noun}`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label><label>Sort<select aria-label={`Sort ${noun}`} value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)}><option value="az">A–Z</option><option value="za">Z–A</option><option value="newest">Newest added</option><option value="oldest">Oldest added</option></select></label></div>

        <div className="tag-filters"><button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>Tags{filterTags.length ? ` (${filterTags.length})` : ''}</button><div id={id} hidden={!expanded}><p className="muted">ANY selected tag matches.</p><div className="tag-scroll">{tags.map((tag) => <button type="button" className="tag-toggle" key={tag.id} aria-pressed={filterTags.includes(tag.id)} onClick={() => setFilterTags((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])}><span>{tag.name}</span></button>)}</div>{!tags.length && <p className="muted">No tags yet.</p>}</div></div>
        {(search || filterTags.length > 0 || sort !== 'az') && <button type="button" onClick={() => { setSearch(''); setSort('az'); setFilterTags([]) }}>Clear</button>}
  </>
}

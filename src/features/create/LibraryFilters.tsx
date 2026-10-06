import type { LibrarySort } from './library'
import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import { SearchSort } from './SearchSort'
import { TagPills } from './TagPills'

export function LibraryFilters({ noun = 'exercises', search, setSearch, sort, setSort, filterTags, setFilterTags, tags }: { noun?: string; search: string; setSearch: (value: string) => void; sort: LibrarySort; setSort: (value: LibrarySort) => void; filterTags: string[]; setFilterTags: Dispatch<SetStateAction<string[]>>; tags: { id: string; name: string }[] }) {
  const [expanded, setExpanded] = useState(false), id = useId()
  return <>
        <SearchSort noun={noun} search={search} sort={sort} onSearch={setSearch} onSort={setSort} />
        <div className="tag-filters"><div className="tag-filter-heading"><button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>Tags{filterTags.length ? ` (${filterTags.length})` : ''}</button>
          {(search || filterTags.length > 0 || sort !== 'az') && <button type="button" onClick={() => { setSearch(''); setSort('az'); setFilterTags([]) }}>Clear</button>}</div>
          <div id={id} hidden={!expanded}><TagPills tags={tags} selected={filterTags} onToggle={(id) => setFilterTags((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} />{!tags.length && <p className="muted">No tags yet.</p>}</div></div>
  </>
}

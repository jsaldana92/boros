import type { LibrarySort } from './library'
import type { Dispatch, SetStateAction } from 'react'

export function LibraryFilters({ noun = 'exercises', search, setSearch, sort, setSort, filterTags, setFilterTags, tags }: { noun?: string; search: string; setSearch: (value: string) => void; sort: LibrarySort; setSort: (value: LibrarySort) => void; filterTags: string[]; setFilterTags: Dispatch<SetStateAction<string[]>>; tags: { id: string; name: string }[] }) {
  return <>
        <div className="library-filters"><label>{`Search ${noun}`}<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label><label>{`Sort ${noun}`}<select value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)}><option value="az">A–Z</option><option value="za">Z–A</option><option value="newest">Newest added</option><option value="oldest">Oldest added</option></select></label></div>

        <fieldset className="tag-filters"><legend>Filter tags — ANY selected tag matches</legend><div className="tag-list">{tags.map((tag) => <label className="check-label" key={tag.id}><input type="checkbox" checked={filterTags.includes(tag.id)} onChange={(e) => setFilterTags((current) => e.target.checked ? [...current, tag.id] : current.filter((id) => id !== tag.id))} />{tag.name}</label>)}</div>{!tags.length && <p className="muted">No tags yet.</p>}</fieldset>
        {(search || filterTags.length > 0) && <button onClick={() => { setSearch(''); setFilterTags([]) }}>Clear filters</button>}
  </>
}

import type { LibrarySort } from './library'

export function SearchSort({ noun, search, sort, onSearch, onSort }: { noun: string; search: string; sort: LibrarySort; onSearch: (value: string) => void; onSort: (value: LibrarySort) => void }) {
  return <div className="library-filters"><label>Search<input aria-label={`Search ${noun}`} type="search" value={search} onChange={(e) => onSearch(e.target.value)} /></label><label>Sort<select aria-label={`Sort ${noun}`} value={sort} onChange={(e) => onSort(e.target.value as LibrarySort)}><option value="az">A–Z</option><option value="za">Z–A</option><option value="newest">Newest</option><option value="oldest">Oldest</option></select></label></div>
}

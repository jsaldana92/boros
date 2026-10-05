import type { LibrarySort } from './library'

export function PlanBrowseControls({ search, sort, onSearch, onSort }: { search: string; sort: LibrarySort; onSearch: (value: string) => void; onSort: (value: LibrarySort) => void }) {
  return <div className="field-grid"><label>Search<input aria-label="Search plans" type="search" value={search} onChange={(e) => onSearch(e.target.value)} /></label><label>Sort<select aria-label="Sort plans" value={sort} onChange={(e) => onSort(e.target.value as LibrarySort)}><option value="az">A-Z</option><option value="za">Z-A</option><option value="newest">Newest added</option><option value="oldest">Oldest added</option></select></label></div>
}

import type { LibrarySort } from './library'
import { SearchSort } from './SearchSort'

export function PlanBrowseControls({ search, sort, onSearch, onSort }: { search: string; sort: LibrarySort; onSearch: (value: string) => void; onSort: (value: LibrarySort) => void }) {
  return <SearchSort noun="plans" search={search} sort={sort} onSearch={onSearch} onSort={onSort} />
}

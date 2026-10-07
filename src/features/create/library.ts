import { nameKey } from '../../schemas/profile.ts'

export type LibrarySort = 'az' | 'za' | 'newest' | 'oldest'
export function filterExercises<T extends { id: string; nameKey: string; createdAt: string; tagIds: string[]; archivedAt?: string }>(records: T[], search: string, sort: LibrarySort, tagIds: string[], archived: boolean) {
  return records.filter((record) => (archived || !record.archivedAt) && record.nameKey.includes(nameKey(search)) && (!tagIds.length || tagIds.some((id) => record.tagIds.includes(id))))
    .sort((a, b) => {
      const alphabetical = a.nameKey.localeCompare(b.nameKey) || a.id.localeCompare(b.id)
      if (sort === 'az') return alphabetical
      if (sort === 'za') return -alphabetical
      const date = a.createdAt.localeCompare(b.createdAt)
      return (sort === 'newest' ? -date : date) || alphabetical
    })
}

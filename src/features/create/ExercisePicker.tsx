import { displayDateTime } from '../../lib/display-dates'
import { useEffect, useRef, useState } from 'react'
import type { PrescriptionChoice } from '../../db/plans'
import { LibraryFilters } from './LibraryFilters'
import { filterExercises, type LibrarySort } from './library'
import { nameKey } from '../../schemas/profile'

export function ExercisePicker({ choices, onChoose, onClose }: { choices: PrescriptionChoice[]; onChoose: (choice: PrescriptionChoice) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<LibrarySort>('az')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const tags = [...new Map(choices.flatMap((choice) => choice.prescription.tagNames).map((name) => [nameKey(name), { id: nameKey(name), name }])).values()]
  const visible = filterExercises(choices, search, sort, filterTags, false)
  return <section aria-label="Choose exercise" className="exercise-picker">
    <h2 tabIndex={-1} ref={heading}>Choose exercise</h2>
    <p className="muted">Copy from your active library or saved plans. Each copy is independent.</p>
    <LibraryFilters noun="sources" search={search} setSearch={setSearch} sort={sort} setSort={setSort} filterTags={filterTags} setFilterTags={setFilterTags} tags={tags} />
    {!visible.length && <p>No matching sources. Save a library workout or plan first.</p>}
    <ul className="source-list">{visible.map((choice) => <li key={choice.id}><strong>{choice.prescription.name}</strong><p>{choice.label}</p><p className="muted">{choice.prescription.sets.length} sets; added {displayDateTime(choice.createdAt)}</p><button type="button" aria-label={`Copy ${choice.label}`} onClick={() => onChoose(choice)}>Copy to day</button></li>)}</ul>
    <button type="button" onClick={onClose}>Cancel selection</button>
  </section>
}

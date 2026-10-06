import { useRef, useState } from 'react'
import type { PrescriptionChoice } from '../../db/plans'
import { LibraryFilters } from './LibraryFilters'
import { filterExercises, type LibrarySort } from './library'
import { nameKey } from '../../schemas/profile'
import { EditorTitle } from './EditorTitle'

export function ExercisePicker({ choices, onChoose, onClose, remaining, path = ['Create', 'Plan', 'Exercise'] }: { choices: PrescriptionChoice[]; onChoose: (choices: PrescriptionChoice[]) => void; onClose: () => void; remaining: number; path?: string[] }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<LibrarySort>('az')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const submitting = useRef(false)
  const tags = [...new Map(choices.flatMap((choice) => choice.prescription.tagNames).map((name) => [nameKey(name), { id: nameKey(name), name }])).values()]
  const visible = filterExercises(choices, search, sort, filterTags, false)
  const selection = selected.filter((id) => visible.some((choice) => choice.id === id))
  if (selection.length !== selected.length) setSelected(selection)
  const all = visible.length > 0 && visible.every((choice) => selection.includes(choice.id))
  const add = (items: PrescriptionChoice[]) => {
    if (submitting.current || !items.length || items.length > remaining) return
    submitting.current = true
    onChoose(items)
  }
  return <section aria-label="Choose exercise" className="exercise-picker">
    <EditorTitle path={path} />
    <LibraryFilters noun="exercises to add" search={search} setSearch={setSearch} sort={sort} setSort={setSort} filterTags={filterTags} setFilterTags={setFilterTags} tags={tags} />
    <div className="actions selection-actions"><label className="check-label"><input type="checkbox" disabled={!visible.length} checked={all} onChange={() => setSelected(all ? [] : visible.map((choice) => choice.id))} />Select All</label><button type="button" disabled={!selection.length || selection.length > remaining} onClick={() => add(visible.filter((choice) => selection.includes(choice.id)))}>Add selected</button></div>
    {selection.length > remaining && <p role="alert">Select at most {remaining} more exercises for this workout.</p>}
    {!visible.length && <p>No matching exercises.</p>}
    <div className="exercise-list" role="region" aria-label="Available exercises">{visible.map((choice) => <div className="exercise-selection-row" key={choice.id}>
      <label className="check-label"><input type="checkbox" checked={selection.includes(choice.id)} onChange={(event) => setSelected(event.target.checked ? [...selection, choice.id] : selection.filter((id) => id !== choice.id))} />{choice.prescription.name}</label>
      <button type="button" disabled={!remaining} aria-label={'Add ' + choice.prescription.name} onClick={() => add([choice])}>Add</button>
    </div>)}</div>
    <button type="button" onClick={onClose}>Cancel selection</button>
  </section>
}

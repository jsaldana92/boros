import type { ExerciseInput } from '../../schemas/exercise.ts'

const rangeText = ({ min, max }: { min: number; max: number }) => min === max ? String(min) : `${min}–${max}`
const targetText = (set: ExerciseInput['sets'][number]) => `${rangeText(set.reps)} reps${set.rir ? ` · ${rangeText(set.rir)} RIR` : ''}`

export function prescriptionSummary(sets: ExerciseInput['sets']) {
  const targets = sets.map(targetText), count = `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`
  return targets.every((value) => value === targets[0])
    ? { summary: `${count} · ${targets[0]}`, details: [] }
    : { summary: count, details: targets.map((target, index) => `Set ${index + 1}: ${target}`) }
}

import { isRepeatCircuit, repeatCircuitSchema, legacyCircuitSchema, type RepeatCircuit } from './circuit.ts'
import type { TrainingDay, PlanExercise } from './plan.ts'

// Deterministic occurrence mapping, not an authentication/security identifier.
// IDs are checked against all preserved identities before accepting conversion.
function mappedId(id: string, index: number, circuit: boolean) {
  const mask = circuit ? 0x4a748519abcdef12785a87654321bcden : 0x986527abfedc0987234a12345678bcden
  const hex = ((BigInt('0x' + id.replaceAll('-', '')) ^ mask) + BigInt(index)).toString(16).padStart(32, '0').slice(-32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

/** Editable templates only. Never apply to started drafts or saved history. */
export function convertIntervalDay<T extends TrainingDay>(input: T): T {
  if (input.trainingType !== 'interval' || !input.circuits?.some(c => !isRepeatCircuit(c))) return structuredClone(input)
  const day = structuredClone(input)
  day.circuits = day.circuits!.map(c => isRepeatCircuit(c) || !('sets' in c || 'roundsPerSet' in c || 'restBetweenSetsSeconds' in c) ? repeatCircuitSchema.parse(c) : c)
  const circuits: RepeatCircuit[] = [], exercises: PlanExercise[] = []
  const used = new Set([day.id, ...day.exercises.map(e => e.id), ...day.circuits!.map(c => c.id)])
  const unique = (id: string) => { if (used.has(id)) throw new Error(`Legacy Interval conversion has an identity collision in ${day.name}. The original record was preserved.`); used.add(id); return id }
  for (const original of day.circuits!) {
    if (isRepeatCircuit(original)) { circuits.push(original); exercises.push(...original.exerciseIds.map(id => day.exercises.find(e => e.id === id)!)); continue }
    const old = legacyCircuitSchema.parse(original), sections: { count: number; rest: number }[] = []
    // With a positive rest, only the final execution of each old set owns it.
    // Chunk preceding rounds into zero-rest circuits of at most eleven executions.
    const append = (count: number, rest: number) => {
      let remaining = count - (rest > 0 ? 1 : 0)
      while (remaining > 0) { const n = Math.min(11, remaining); sections.push({ count: n, rest: 0 }); remaining -= n }
      if (rest > 0) sections.push({ count: 1, rest })
    }
    if (!old.restBetweenSetsSeconds) append(old.sets * old.roundsPerSet, old.restAfterCircuitSeconds)
    else for (let set = 0; set < old.sets; set++) append(old.roundsPerSet, set === old.sets - 1 ? old.restAfterCircuitSeconds : old.restBetweenSetsSeconds)
    for (const [index, section] of sections.entries()) {
      const occurrences = old.exerciseIds.map(id => {
        const source = day.exercises.find(e => e.id === id)
        if (!source) throw new Error(`Legacy Interval conversion is missing an exercise in ${day.name}. The original record was preserved.`)
        return { ...structuredClone(source), id: index ? unique(mappedId(id, index, false)) : id }
      })
      circuits.push({ id: index ? unique(mappedId(old.id, index, true)) : old.id, name: sections.length === 1 ? old.name : `${old.name.slice(0, 110)} (${index + 1})`, exerciseIds: occurrences.map(e => e.id), repeat: section.count - 1, restAfterCircuitSeconds: section.rest })
      exercises.push(...occurrences)
    }
  }
  return { ...day, circuits, exercises }
}

import { copyExercise, newDay, type PlanInput } from '../../src/schemas/plan.ts'

export function groupedPlan(libraryId = crypto.randomUUID()): PlanInput {
  const exercise = (name: string, count: number) => copyExercise({ name, sets: Array.from({ length: count }, (_, i) => ({ reps: { min: i + 5, max: i + 8 }, ...(i === 1 ? {} : { rir: { min: i, max: i + 1 } }) })), tagNames: ['Group'], restBetweenSeconds: 91, restAfterSeconds: 92, notes: `${name} original`, instructions: '<b>Plain instructions</b>' }, { kind: 'exercise', id: libraryId })
  const first = crypto.randomUUID(), second = crypto.randomUUID()
  return { name: 'Two-week supersets', durationWeeks: 2, days: [{ ...newDay(1), name: 'Mixed day', groups: [{ id: first, number: 1, restBetweenRoundsSeconds: 0 }, { id: second, number: 2, restBetweenRoundsSeconds: 20, restAfterGroupSeconds: 0 }], exercises: [exercise('Squat', 2), ...[exercise('Squat', 3), exercise('Row', 2), exercise('Press', 1)].map((item) => ({ ...item, groupId: first })), ...[exercise('Curl', 1), exercise('Raise', 2)].map((item) => ({ ...item, groupId: second }))] }] }
}
export function groupedAI() {
  const input = groupedPlan()
  return { schemaVersion: 2, kind: 'plan', plan: { name: input.name, durationWeeks: input.durationWeeks, trainingDaysPerWeek: 1, days: input.days.map((day) => ({ name: day.name, supersets: day.groups!.map((group) => ({ number: group.number, restBetweenRoundsSeconds: group.restBetweenRoundsSeconds ?? null, restAfterGroupSeconds: group.restAfterGroupSeconds ?? null })), exercises: day.exercises.map((item) => ({ name: item.prescription.name, sets: item.prescription.sets, restBetweenSetsSeconds: item.prescription.restBetweenSeconds, restAfterExerciseSeconds: item.prescription.restAfterSeconds, instructions: item.prescription.instructions, tags: item.prescription.tagNames, superset: day.groups?.find((group) => group.id === item.groupId)?.number ?? null })) })) } }
}

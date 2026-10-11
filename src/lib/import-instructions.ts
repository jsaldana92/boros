import { exerciseResolver } from './exercise-identity.ts'
import type { ExerciseInput, Exercise } from '../schemas/exercise.ts'
import type { TrainingDay } from '../schemas/plan.ts'
import { nameKey } from '../schemas/profile.ts'
import { assertSameTrainingType } from '../schemas/training-type.ts'
import { templateReference } from './template-ownership.ts'

export function importInstructionGroups(days: TrainingDay[], library: Exercise[]) {
  const groups = new Map<string, { name: string; inputs: ExerciseInput[]; source?: Exercise }>()
  for (const day of days) for (const e of day.exercises) {
    const key = nameKey(e.prescription.name), ref = templateReference(e)
    const direct = ref && library.find(x => x.id === ref)
    const source = ref ? library.find(x => x.id === (direct ? exerciseResolver(direct.profileId,library)(ref) : ref)) : library.find(x => !x.archivedAt && !x.mergedIntoId && x.nameKey === key)
    if (source) assertSameTrainingType(e.prescription, source)
    const identity = source?.id ?? key
    let group = groups.get(identity)
    if (!group) { group = { name: e.prescription.name, inputs: [], source }; groups.set(identity, group) }
    if (group.inputs.length) assertSameTrainingType(group.inputs[0], e.prescription)
    group.inputs.push(e.prescription)
  }
  return [...groups.values()]
}
export function assertImportInstructions(days: TrainingDay[], library: Exercise[]) {
  for (const group of importInstructionGroups(days,library)) {
    const choices = new Set(group.inputs.map(p => p.instructions ?? ''))
    if (choices.size > 1 || group.source && [...choices][0] !== (group.source.instructions ?? '')) throw new Error(`Resolve shared instructions for ${group.name} in the import preview. Its library instructions were not changed.`)
  }
}

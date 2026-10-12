import type { TrainingDay } from '../schemas/plan.ts'
import type { Workout } from '../schemas/workout.ts'
import { templateReference } from './template-ownership.ts'
import { exerciseResolver, type ExerciseIdentity } from './exercise-identity.ts'
import { trainingTypeOf } from '../schemas/training-type.ts'

const stable = (value: unknown) => JSON.stringify(value, (_key,v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v)
export function workoutComparison(day: TrainingDay, resolve: (id: string) => string, authored = false) {
  const orderedGroups = [...new Set(day.exercises.flatMap(e => e.groupId ? [e.groupId] : []))].map(id => day.groups!.find(g => g.id === id)!)
  const groups = new Map(orderedGroups.map((g,i)=>[g.id,i]))
  return stable({ type:trainingTypeOf(day), postWorkoutRestSeconds:day.postWorkoutRestSeconds,
    ...(authored ? { notes:day.notes, instructions:day.instructions } : {}),
    groups:orderedGroups.map(g=>({ restBetweenRoundsSeconds:g.restBetweenRoundsSeconds, restAfterGroupSeconds:g.restAfterGroupSeconds, ...(authored?{number:g.number}:{}) })),
    exercises:day.exercises.map(e=>{
      const p=e.prescription, reference=templateReference(e)
      return { identity:reference ? resolve(reference) : `unlinked:${e.id}`, group:e.groupId ? groups.get(e.groupId) : undefined,
        sets:p.sets, activeSeconds:p.trainingType==='interval'?p.activeSeconds:undefined,recoverySeconds:p.trainingType==='interval'?p.recoverySeconds:undefined,
        restBetweenSeconds:p.restBetweenSeconds,restAfterSeconds:p.restAfterSeconds,
        ...(authored?{name:p.name,notes:p.notes,instructions:p.instructions,tags:[...p.tagNames].sort(),tutorialUrl:p.tutorialUrl}:{}) }
    }),
    circuits:day.circuits?.map(({id:_id,exerciseIds,name,...c})=>({...c,...(authored?{name}:{}),exercises:exerciseIds.map(id=>day.exercises.findIndex(e=>e.id===id))})),
  })
}
export function similarWorkouts(profileId: string, input: TrainingDay, records: Workout[], identities: ExerciseIdentity[], ownId?: string, authored = false) {
  const resolve=exerciseResolver(profileId,identities), key=workoutComparison(input,resolve,authored)
  return records.filter(w=>w.profileId===profileId && w.id!==ownId && !w.archivedAt && !w.mergedIntoId && workoutComparison(w,resolve,authored)===key).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))
}
export const similarityToken = (records: Workout[]) => stable(records.map(w=>[w.id,w.revision]))
export class SimilarWorkoutError extends Error {
  matches: Workout[]; token: string
  constructor(matches: Workout[]) { super('Similar workout exists'); this.matches=matches; this.token=similarityToken(matches) }
}

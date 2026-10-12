import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { SimilarWorkoutError } from '../../lib/workout-comparison'
import { displayRunDate } from '../../lib/run-progress'

export function useSimilarWorkout() {
  const [similar,setSimilar]=useState<SimilarWorkoutError>()
  const reply=useRef<(value:boolean)=>void>(undefined)
  useEffect(()=>()=>reply.current?.(false),[])
  const save = async <T,>(action:(token?:string)=>Promise<T>):Promise<T> => {
    let token:string|undefined
    for(;;) {
      try { return await action(token) } catch(e) {
        if(!(e instanceof SimilarWorkoutError)) throw e
        setSimilar(e)
        const confirmed=await new Promise<boolean>(resolve=>{reply.current=resolve})
        reply.current=undefined;setSimilar(undefined)
        if(!confirmed)throw new Error('Save canceled. Your workout is kept.')
        token=e.token
      }
    }
  }
  const dialog=similar && <ConfirmDialog title="Similar workout exists" confirmLabel="Save" onCancel={()=>reply.current?.(false)} onConfirm={()=>reply.current?.(true)}><ul className="similar-workouts">{similar.matches.map(w=><li key={w.id}><strong>{w.name}</strong><small>Added: {displayRunDate(w.createdAt.slice(0,10))}</small></li>)}</ul></ConfirmDialog>
  return {save,dialog}
}

import { useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { WorkoutPicker } from './WorkoutPicker'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { createId } from '../../lib/browser-crypto'
import { trainingTypeOf } from '../../schemas/training-type'
import { workouts } from '../../db/workouts'
import type { Workout } from '../../schemas/workout'

export function MergeWorkoutDialog({ profileId, source, onClose, onSaved }: { profileId: string; source: Workout; onClose: () => void; onSaved: (value: Workout) => void }) {
  const [selected,setSelected] = useState<Workout>(), [switched,setSwitched] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState('')
  const operation=useRef(createId()), locked=useRef(false)
  const from=switched ? selected : source, into=switched ? source : selected
  return <><WorkoutPicker profileId={profileId} trainingType={trainingTypeOf(source)} excludeId={source.id} onClose={onClose} onChoose={w=>{setSelected(w);setSwitched(false);setError('');operation.current=createId()}} />
    {selected && <ConfirmDialog title="Merging Workouts?" confirmLabel="Merge" busy={busy} onCancel={()=>setSelected(undefined)} onConfirm={async()=>{
      if(locked.current)return;locked.current=true;setBusy(true);setError('')
      try { onSaved(await workouts.merge(profileId,from!,into!,operation.current)) } catch(e) { setError((e as Error).message) } finally {locked.current=false;setBusy(false)}
    }}><p>Merging these two workouts will combine both into only one.</p><div className="merge-direction"><strong>Merge: {from?.name}</strong><ArrowDown aria-hidden="true" size={32} strokeWidth={1.75}/><strong>Into: {into?.name}</strong><button disabled={busy} onClick={()=>{setSwitched(v=>!v);operation.current=createId()}}>Switch</button></div>{error&&<p role="alert">{error}</p>}</ConfirmDialog>}
  </>
}

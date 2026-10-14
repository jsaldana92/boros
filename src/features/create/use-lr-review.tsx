import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { LRConfirmationError, previewLR, type LRApprovals, type LRPreview } from '../../db/lr-conversion'

export function useLRReview(profileId?: string) {
  const approvals=useRef<LRApprovals>({}),reply=useRef<(value:boolean)=>void>(undefined)
  const [preview,setPreview]=useState<LRPreview>()
  useEffect(()=>()=>reply.current?.(false),[])
  const confirm=async(p: LRPreview)=>{
    setPreview(p)
    const yes=await new Promise<boolean>(resolve=>{reply.current=resolve})
    reply.current=undefined;setPreview(undefined)
    if(yes)approvals.current[p.id]=p.token
    return yes
  }
  const toggle=async(id:string|undefined,mode:boolean)=>{
    if(!id||!profileId)return true
    const p=await previewLR(profileId,{id,mode})
    return !p || !p.results || confirm(p)
  }
  const save=async<T,>(action:(approvals:LRApprovals)=>Promise<T>):Promise<T>=>{
    for(;;)try{return await action(approvals.current)}catch(e){
      if(!(e instanceof LRConfirmationError))throw e
      if(!await confirm(e.preview))throw new Error('Save canceled. Your changes are kept.')
    }
  }
  const dialog=preview&&<ConfirmDialog title={preview.results ? preview.mode?'Turn on L/R Distinction?':'Turn off L/R Distinction?' : 'L/R Distinction differs'} confirmLabel="Proceed" onCancel={()=>reply.current?.(false)} onConfirm={()=>reply.current?.(true)}><p>{preview.results ? preview.mode?'Previous results will be copied to both Left and Right. Each side will start with the same weight, reps, and RIR.':'Previous left and right results will be combined into one result per set. The higher-weight result will be kept, using reps to break a tie. The other result will be removed.' : `Use ${preview.mode?'Yes':'No'} for ${preview.name} and its linked copies?`}</p></ConfirmDialog>
  return {toggle,save,dialog,approvals}
}

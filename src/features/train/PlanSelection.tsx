import { useRef, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { weekly } from '../../db/weekly'
import type { Plan } from '../../schemas/plan'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { PlanCard } from '../create/PlanCard'

export function PlanSelection({ plans, activeIds, onClose }: { plans: Plan[]; activeIds: Set<string>; onClose: () => void }) {
  const { snapshot } = useWorkspace(), profileId = snapshot.profile.id
  const lock = useRef(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const available = plans.filter((plan) => !plan.archivedAt && !activeIds.has(plan.id))
  const close = () => { if (!lock.current) onClose() }
  return <ActionDialog title="Add Plan" onClose={close} actions={<button disabled={busy} onClick={close}>Cancel</button>}>
    {!available.length && <p>No more available plans. Create a plan in Create.</p>}
    {available.map((plan) => <PlanCard key={plan.id} plan={plan} disabled={busy} onClick={() => {
      if (lock.current) return; lock.current = true; setBusy(true); setError('')
      weekly.addPlan(profileId, plan.id).then(onClose).catch((e: Error) => setError(e.message)).finally(() => { lock.current = false; setBusy(false) })
    }} />)}
    {error && <p role="alert">{error}</p>}
  </ActionDialog>
}

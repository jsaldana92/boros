import { useEffect, useState } from 'react'
import { useWorkspace } from '../../app/workspace-context'
import { profiles } from '../../db/profiles'
import type { Plan } from '../../schemas/plan'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

export function PlanSelection({ plans, onClose }: { plans: Plan[]; onClose: () => void }) {
  const { snapshot, setDirty, allowLeave } = useWorkspace()
  const [baseline] = useState(snapshot.profile)
  const [selected, setSelected] = useState(() => (baseline.selectedPlanIds ?? []).filter((id) => plans.some((p) => p.id === id)))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => () => setDirty(false), [setDirty])
  const close = () => { if (!busy && allowLeave()) { setDirty(false); onClose() } }
  const save = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await profiles.selectPlans(baseline.id, baseline.revision, selected); setDirty(false); onClose() }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <ConfirmDialog title="Select Plans" confirmLabel={busy ? 'Saving…' : 'Save selection'} onCancel={close} onConfirm={() => void save()}>
    <p>Select plans to show in Train. This does not change schedules, drafts or history.</p>
    {!plans.length && <p>No available plans. Create a plan in Create first.</p>}
    <fieldset disabled={busy}><legend className="sr-only">Plans for Train</legend>{plans.map((plan) => <label className="check-label" key={plan.id}><input type="checkbox" checked={selected.includes(plan.id)} onChange={(e) => { const checked = e.target.checked; setSelected((ids) => checked ? [...ids, plan.id] : ids.filter((id) => id !== plan.id)); setDirty(true) }} />{plan.name}</label>)}</fieldset>
    {error && <p role="alert">{error}</p>}
  </ConfirmDialog>
}

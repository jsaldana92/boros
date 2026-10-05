import { planSubtitle } from './plan-subtitle'
import { useState } from 'react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { trainingBlocks, type Plan, type PlanExercise } from '../../schemas/plan'
import { DetailsActions, DetailsActionsButton } from './DetailsActions'
import { prescriptionSummary } from './prescription-summary'

function ExerciseSummary({ exercise, grouped = false }: { exercise: PlanExercise; grouped?: boolean }) {
  const { summary, details } = prescriptionSummary(exercise.prescription.sets)
  const Heading = grouped ? 'h5' : 'h4'
  return <div className="plan-details-exercise">
    <Heading>{exercise.prescription.name}</Heading>
    <p className="prescription-summary">{summary}</p>
    {!!details.length && <ol className="prescription-summary varying-targets">{details.map((detail, index) => <li key={index}>{detail}</li>)}</ol>}
  </div>
}

export function PlanDetails({ plan, busy, error, onClose, onEdit, onDuplicate, onArchive }: {
  plan: Plan; busy: boolean; error: string; onClose: () => void
  onEdit: () => void; onDuplicate: () => void; onArchive: () => void
}) {
  const [actions, setActions] = useState(false)
  const instructions = !!plan.instructions?.trim(), note = !!plan.notes?.trim()
  return <>
    <ActionDialog title={plan.name} className="plan-details" onClose={onClose}
      headerActions={<DetailsActionsButton label="Plan actions" expanded={actions} onClick={() => setActions(true)} />}>
      <div className="plan-details-meta"><p>{planSubtitle(plan)}</p></div>
      {plan.days.map((day) => <section className="plan-details-day" key={day.id} aria-label={day.name}>
        <hr /><h3>{day.name}</h3>
        {trainingBlocks(day).map((block) => block.group
          ? <section className="plan-details-superset" key={block.id} aria-label={`Superset ${block.group.number}`}><h4>Superset {block.group.number}</h4><div className="plan-superset-members">{block.members.map((exercise) => <ExerciseSummary key={exercise.id} exercise={exercise} grouped />)}</div></section>
          : <ExerciseSummary key={block.id} exercise={block.members[0]} />)}
      </section>)}
      {(instructions || note) && <hr />}
      {instructions && <section aria-label="Instructions"><h3>Instructions</h3><p className="plain-text">{plan.instructions}</p></section>}
      {note && <section aria-label="Note"><h3>Note</h3><p className="plain-text">{plan.notes}</p></section>}
    </ActionDialog>
    {actions && <DetailsActions title="Plan actions" busy={busy} archived={!!plan.archivedAt} error={error} onClose={() => setActions(false)} onEdit={onEdit} onDuplicate={onDuplicate} onArchive={onArchive} />}
  </>
}

import { IntervalSequence } from '../train/IntervalSequence'
import { intervalPhases } from '../../schemas/interval-session'
import { trainingTypeName, trainingTypeOf } from '../../schemas/training-type'
import { planSubtitle } from './plan-subtitle'
import { useState } from 'react'
import { ActionDialog } from '../../components/ui/ConfirmDialog'
import { planWeeks, trainingBlocks, type Plan, type PlanExercise, type TrainingDay } from '../../schemas/plan'
import { DetailsActions, DetailsActionsButton } from './DetailsActions'
import { prescriptionSummary } from './prescription-summary'

function ExerciseSummary({ exercise, grouped = false }: { exercise: PlanExercise; grouped?: boolean }) {
  if (exercise.prescription.trainingType === 'interval') return <div className="plan-details-exercise"><h4>{exercise.prescription.name}</h4><p>{exercise.prescription.activeSeconds}s active &middot; {exercise.prescription.recoverySeconds}s rest</p></div>
  const { summary, details } = prescriptionSummary(exercise.prescription.sets)
  const Heading = grouped ? 'h5' : 'h4'
  return <div className="plan-details-exercise">
    <Heading>{exercise.prescription.name}</Heading>
    <p className="prescription-summary">{summary}</p>
    {!!details.length && <ol className="prescription-summary varying-targets">{details.map((detail, index) => <li key={index}>{detail}</li>)}</ol>}
  </div>
}

export function PlanDetails({ plan, busy, error, onClose, onEdit, onDuplicate, onArchive, onDelete }: {
  plan: Plan; busy: boolean; error: string; onClose: () => void
  onEdit: () => void; onDuplicate: () => void; onArchive: () => void; onDelete: () => void
}) {
  const [actions, setActions] = useState(false)
  const instructions = !!plan.instructions?.trim(), note = !!plan.notes?.trim()
  return <>
    <ActionDialog title={plan.name} className="plan-details" onClose={onClose}
      headerActions={<DetailsActionsButton label="Plan actions" expanded={actions} onClick={() => setActions(true)} />}>
      <div className="plan-details-meta"><p>{planSubtitle(plan)}</p><p>{trainingTypeName(trainingTypeOf(plan))}</p></div>
      {planWeeks(plan).map((week, index) => <div key={week.id ?? index}>{plan.weeks && <><hr /><h3 className="unique-week-heading">Week {index + 1}</h3></>}{week.days.map((day) => <section className="plan-details-day" key={day.id} aria-label={day.name}>
        <hr /><h3>{day.name}</h3>
        <WorkoutSummary day={day} />
      </section>)}</div>)}
      {(instructions || note) && <hr />}
      {instructions && <section aria-label="Instructions"><h3>Instructions:</h3><p className="plain-text">{plan.instructions}</p></section>}
      {note && <section aria-label="Note"><h3>Note:</h3><p className="plain-text">{plan.notes}</p></section>}
    </ActionDialog>
    {actions && <DetailsActions title="Plan actions" busy={busy} archived={!!plan.archivedAt} error={error} onClose={() => setActions(false)} onEdit={onEdit} onDuplicate={onDuplicate} onArchive={onArchive} onDelete={onDelete} />}
  </>
}

export function WorkoutSummary({ day }: { day: TrainingDay }) {
  return <>{day.trainingType === 'interval' ? <>{day.circuits?.map(c => <section key={c.id}><h3>{c.name}</h3><IntervalSequence phases={intervalPhases(day).filter(p => p.circuitId === c.id)} /></section>)}{day.postWorkoutRestSeconds !== undefined && <p>Post-workout rest: {day.postWorkoutRestSeconds}s</p>}</> : trainingBlocks(day).map(block => block.group ? <section className="plan-details-superset" key={block.id}><h3>Superset {block.group.number}</h3><div className="plan-superset-members">{block.members.map(exercise => <ExerciseSummary key={exercise.id} exercise={exercise} grouped />)}</div></section> : <ExerciseSummary key={block.id} exercise={block.members[0]} />)}{day.instructions?.trim() && <section><h3>Instructions:</h3><p className="plain-text">{day.instructions}</p></section>}{day.notes?.trim() && <section><h3>Note:</h3><p className="plain-text">{day.notes}</p></section>}</>
}

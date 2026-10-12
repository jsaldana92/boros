import { workoutResolver } from '../../lib/workout-identity.ts'
import Papa from 'papaparse'
import type { AnalysisSnapshot } from '../../db/analysis.ts'
import type { CompletedSession } from '../../schemas/session.ts'
import type { OccurrenceOutcome, Schedule } from '../../schemas/schedule.ts'
import { intervalPhases, phaseActivity } from '../../schemas/interval-session.ts'
import { exerciseResolver } from '../../lib/exercise-identity.ts'
import { templateReference } from '../../lib/template-ownership.ts'
import { fromKg, displayNumber, effectiveProfileName } from '../../schemas/profile.ts'
import { spreadsheetCell } from './csv.ts'

export const ANALYSIS_COLUMNS = ('username,date,time,type,plan,workout,circuit,exercise,reps_target,reps,weight,rir_target,rir,exercise_time_target,exercise_time,plan_instructions,plan_notes,workout_instructions,workout_notes,exercise_instructions,exercise_notes,youtube_link,' +
  'session_id,plan_instance_id,workout_occurrence_id,exercise_id,exercise_occurrence_id,set_number,circuit_execution,weight_unit,status,performed_at_utc,time_source,circuit_id,phase_id,workout_status,time_zone,workout_id').split(',')
export type AnalysisRow = Record<string, string | number>
const optional = (text?: string) => text === undefined || text === '' ? 'None' : text
const target = (range?: { min: number; max: number }) => range ? range.min === range.max ? String(range.min) : `${range.min}-${range.max}` : 'None'
const seconds = (ms?: number) => ms === undefined ? 'None' : String(ms / 1000)

export function analysisRows(snapshot: AnalysisSnapshot): AnalysisRow[] {
  const { profile, timeZone } = snapshot, resolve = exerciseResolver(profile.id, snapshot.identities), resolveWorkout = workoutResolver(profile.id,snapshot.workoutIdentities)
  const rows: AnalysisRow[] = [], format = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  const dateFields = (at: string, basis: string) => {
    const parts = Object.fromEntries(format.formatToParts(new Date(at)).map(p => [p.type,p.value]))
    return { date: `${parts.day}/${parts.month}/${parts.year}`, time: `${parts.hour}:${parts.minute}:${parts.second}`, performed_at_utc: new Date(at).toISOString(), time_source: basis, time_zone: timeZone }
  }
  const append = (record: CompletedSession | OccurrenceOutcome, schedule?: Schedule) => {
    const saved = 'completedAt' in record ? record : undefined, marker = saved ? undefined : record as OccurrenceOutcome
    const day = record.day, planned = !!(saved?.sourcePlanId ?? schedule?.planId), at = saved?.completedAt ?? marker!.recordedAt
    const draft = saved && snapshot.drafts.find(d => d.id === saved.draftId && d.profileId === profile.id)
    const workoutId = saved?.source?.workoutId ?? day.publishedWorkoutId ?? day.sourceWorkoutId
    const common: AnalysisRow = { workout_id: workoutId ? resolveWorkout(workoutId) : 'None',
      ...dateFields(at, saved ? 'session_completed_at' : 'outcome_recorded_at'), username: effectiveProfileName(profile), type: day.trainingType ?? 'strength',
      plan: planned ? record.planName ?? 'None' : 'NA', workout: day.name,
      plan_instructions: planned ? optional(record.planInstructions) : 'NA', plan_notes: planned ? optional(record.planNotes) : 'NA',
      workout_instructions: optional(day.instructions), workout_notes: optional(saved ? saved.notes : day.notes),
      session_id: saved?.id ?? 'NA', plan_instance_id: saved?.occurrence?.scheduleId ?? schedule?.id ?? 'NA', workout_occurrence_id: saved?.occurrenceKey ?? marker?.ref.key ?? 'NA',
      workout_status: marker?.status === 'skipped' ? 'Skipped' : 'Completed',
    }
    const exerciseFields = (id: string) => {
      const e = day.exercises.find(e => e.id === id), ref = e && templateReference(e)
      return { exercise: e?.prescription.name ?? 'None', exercise_id: ref ? resolve(ref) : 'None', exercise_occurrence_id: id, exercise_instructions: optional(e?.prescription.instructions), exercise_notes: optional(saved ? saved.exercises.find(x => x.id === id)?.notes : e?.prescription.notes), youtube_link: optional(e?.prescription.tutorialUrl) }
    }
    if (day.trainingType !== 'interval') {
      day.exercises.forEach(e => e.prescription.sets.forEach((set,index) => {
        const actual = saved?.exercises.find(x => x.id === e.id)?.sets[index], input = draft?.input.exercises.find(x => x.id === e.id)?.sets[index]
        const skipped = marker?.status === 'skipped' || !!actual?.skipped && input?.skipped === true
        // A legacy skipped result with no finalized input cannot prove intent.
        const missing = skipped ? 'Skipped' : 'None'
        rows.push({ ...common, ...exerciseFields(e.id), circuit: 'NA', circuit_id: 'NA', phase_id: 'NA', circuit_execution: 'NA', set_number: index + 1,
          reps_target: target(set.reps), rir_target: target(set.rir), reps: actual && !actual.skipped ? actual.reps : missing,
          weight: actual && !actual.skipped ? displayNumber(fromKg(actual.weightKg, profile.weightUnit)) : missing, weight_unit: profile.weightUnit,
          rir: actual && !actual.skipped ? actual.rir ?? 'None' : missing, exercise_time_target: 'NA', exercise_time: 'NA',
          status: marker?.status === 'completed' ? 'Marked complete' : skipped ? 'Skipped' : actual && !actual.skipped ? 'Recorded' : 'Unrecorded',
        })
      }))
      return
    }
    const state = saved?.interval, phases = state?.phases ?? intervalPhases(day)
    const order = new Map(intervalPhases(day).map((p,i) => [p.id,i]))
    for (const active of phases.filter(p => p.kind === 'active').sort((a,b) => (order.get(a.id) ?? order.size + phases.indexOf(a)) - (order.get(b.id) ?? order.size + phases.indexOf(b)))) {
      const recovery = phases.find(p => p.kind === 'recovery' && p.exerciseId === active.exerciseId && p.circuitId === active.circuitId && p.repetition === active.repetition && p.set === active.set && p.round === active.round)
      const a = state && phaseActivity(state, active), r = state && recovery && phaseActivity(state,recovery)
      const skipped = marker?.status === 'skipped' || !!a?.skipped
      const status = marker?.status === 'completed' ? 'Marked complete' : skipped ? 'Skipped' : a?.completed && (!recovery?.durationSeconds || r?.completed) ? 'Recorded' : (a?.elapsedMs ?? 0) > 0 || (r?.elapsedMs ?? 0) > 0 ? 'Partial' : a?.elapsedMs === 0 ? 'Unstarted' : 'Unknown'
      const copied = day.exercises.find(e => e.id === active.exerciseId), copyRef = copied && templateReference(copied)
      const replaced = active.templateId && copyRef && resolve(active.templateId) !== resolve(copyRef)
      rows.push({ ...common, ...exerciseFields(active.exerciseId!), ...(replaced ? { exercise_instructions: 'None', youtube_link: 'None', exercise_notes: 'None' } : {}), ...(a?.startedAt ? dateFields(a.startedAt, 'phase_started_at') : {}),
        circuit: active.circuitName, exercise: active.exerciseName!, exercise_id: active.templateId ? resolve(active.templateId) : exerciseFields(active.exerciseId!).exercise_id,
        circuit_id: active.circuitId, phase_id: active.id, circuit_execution: active.repetition === undefined ? `${active.set}.${active.round}` : active.repetition + 1,
        set_number: 'NA', reps_target: 'NA', reps: 'NA', weight: 'NA', weight_unit: 'NA', rir_target: 'NA', rir: 'NA',
        exercise_time_target: `${active.durationSeconds}, ${recovery?.durationSeconds ?? 0}`,
        exercise_time: skipped ? 'Skipped' : marker ? 'None' : `${seconds(a?.elapsedMs)}, ${seconds(r?.elapsedMs)}`, status,
      })
    }
  }
  // Session chronology with stable ties; inside each session preserve prescription order.
  const records = snapshot.sessions.filter(s => s.profileId === profile.id).map(session => ({ at: session.completedAt, id: session.id, session }))
  const markers = snapshot.schedules.filter(s => s.profileId === profile.id).flatMap(schedule => (schedule.outcomes ?? []).filter(o => o.status !== 'pending' && !records.some(r => r.session.occurrenceKey === o.ref.key)).map(outcome => ({ at: outcome.recordedAt, id: outcome.id, outcome, schedule })))
  for (const item of [...records,...markers].sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
    if ('session' in item) append(item.session); else append(item.outcome, item.schedule)
  }
  return rows
}
export function analysisCsv(snapshot: AnalysisSnapshot) {
  const rows = analysisRows(snapshot)
  return { count: rows.length, csv: Papa.unparse({ fields: ANALYSIS_COLUMNS, data: rows.map(row => ANALYSIS_COLUMNS.map(key => spreadsheetCell(row[key] ?? 'None'))) }, { newline: '\r\n' }) }
}

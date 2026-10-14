import type { SessionDraft, CompletedSession } from './session.ts'
import { recordedSetSchema, resultInputSchema } from './strength-results.ts'

// Evidence-only metadata repair. Never infer a side from an exercise name, copy
// an unsided result, collapse sides, or rewrite an explicit mode.
export function inferRecordedLR(record: SessionDraft | CompletedSession) {
  const draft = 'input' in record, results = draft ? record.input.exercises : record.exercises
  let changed = false
  for (const occurrence of record.day.exercises) {
    const p = occurrence.prescription
    if (p.trainingType === 'interval' || p.lrDistinction !== undefined) continue
    const sets = results.find(e => e.id === occurrence.id)?.sets ?? []
    if (sets.some(set => 'sides' in set && !!set.sides && (draft ? resultInputSchema : recordedSetSchema).safeParse(set).success)) {
      p.lrDistinction = true; changed = true
    }
  }
  return changed
}

import type { Schedule } from '../schemas/schedule.ts'
import type { CompletedSession, SessionDraft } from '../schemas/session.ts'

// A removed selection, archived template or Stop Scheduling is NOT a Leave record.
// Keep ambiguous ownership and any completed history. Used on startup and restore.
export function closedRunDraftIds(runs: Schedule[], drafts: SessionDraft[], sessions: CompletedSession[]) {
  return drafts.filter((draft) => !draft.finalizedAt && !sessions.some((session) => session.profileId === draft.profileId && (session.id === draft.id || session.draftId === draft.id)) && runs.some((run) =>
    !!run.closedAt && Number.isFinite(Date.parse(run.closedAt)) && run.profileId === draft.profileId && run.id === draft.occurrence?.scheduleId && run.planId === draft.sourcePlanId,
  )).map((draft) => draft.id)
}

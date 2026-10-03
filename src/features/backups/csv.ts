import Papa from 'papaparse'
import type { BackupData } from '../../schemas/backup.ts'
import type { TrainingDay } from '../../schemas/plan.ts'
import type { ExerciseInput } from '../../schemas/exercise.ts'

type Row = Record<string, unknown>
type Table = { fields: string[]; rows: Row[] }
export function spreadsheetCell(value: unknown) {
  return typeof value === 'string' && /^[\s\uFEFF]*(?:[=+\-@＝＋－＠]|\t|\r|\n)/u.test(value) ? `'${value}` : value
}
export function csvTables(data: BackupData) {
  const current = data.backupSchemaVersion >= 2
  const tables: Record<string, Table> = {}
  const table = (name: string, fields: string, rows: Row[] = []) => { tables[name] = { fields: fields.split(','), rows }; return tables[name].rows }
  const scope = 'profileId,ownerKind,ownerId,scheduleRevisionId,sourcePlanId,dayId,dayOrder'
  table('profiles', 'id,kind,name,nameKey,age,heightCm,weightUnit,heightUnit,photoId,revision,createdAt,updatedAt', [data.profile as unknown as Row])
  table('tags', 'profileId,id,name,nameKey,archivedAt,createdAt,updatedAt', data.tags as unknown as Row[])
  const libraries = table('library_exercises', 'profileId,id,name,nameKey,activeNameKey,revision,archivedAt,restBetweenSeconds,restAfterSeconds,instructions,notes,tutorialUrl,createdAt,updatedAt')
  const librarySets = table('library_sets', 'profileId,libraryExerciseId,setOrder,repsMin,repsMax,rirMin,rirMax')
  const tagLinks = table('exercise_tags', 'profileId,libraryExerciseId,tagId,tagOrder')
  table('plans', 'profileId,id,name,nameKey,activeNameKey,revision,archivedAt,createdAt,updatedAt' + (current ? ',durationWeeks' : ''), data.plans as unknown as Row[])
  const days = table('days', `${scope},name`)
  const prescriptions = table('prescriptions', `${scope},exerciseOccurrenceId,exerciseOrder,name,sourceKind,sourceId,sourceDayId,sourceOccurrenceId,restBetweenSeconds,restAfterSeconds,instructions,notes,tutorialUrl${current ? ',groupId,sourceLibraryId' : ''}`)
  const groups = current ? table('supersets', `${scope},groupId,number,blockOrder,restBetweenRoundsSeconds,restAfterGroupSeconds`) : []
  const prescriptionSets = table('prescription_sets', `${scope},exerciseOccurrenceId,exerciseOrder,setOrder,repsMin,repsMax,rirMin,rirMax`)
  const prescriptionTags = table('prescription_tags', `${scope},exerciseOccurrenceId,exerciseOrder,tagOrder,tagName`)
  table('schedules', 'profileId,id,planId,revision,timeZone,startWeek,stoppedFrom,createdAt,updatedAt' + (current ? ',durationWeeks,endDate' : ''), data.schedules as unknown as Row[])
  if (current) table('schedule_duration_changes', 'profileId,scheduleId,id,effectiveFrom,durationWeeks,endDate', data.schedules.flatMap((schedule) => (schedule.durationChanges ?? []).map((change) => ({ ...change, profileId: data.profile.id, scheduleId: schedule.id }))))
  const revisions = table('schedule_revisions', 'profileId,scheduleId,id,revisionOrder,planId,planRevision,planName,effectiveFrom,effectiveUntil,needsRepair,createdAt')
  const assignments = table('schedule_assignments', 'profileId,scheduleId,scheduleRevisionId,assignmentOrder,dayId,weekday')
  const event = 'occurrenceKey,scheduleId,scheduleRevisionId,scheduledDate,scheduledWeek,timeZone'
  const drafts = table('drafts', `profileId,id,sourcePlanId,sourceDayId,planName,revision,activeSourceKey,startedAt,updatedAt,finalizedAt,${event}`)
  const draftResults = table('draft_results', 'profileId,draftId,sourcePlanId,dayId,exerciseOccurrenceId,exerciseOrder,setOrder,loadText,repsText,rirText,unit,skipped')
  const sessions = table('sessions', `profileId,id,draftId,sourcePlanId,sourceDayId,planName,revision,partial,startedAt,completedAt,loggedAt,${event}`)
  const sessionResults = table('session_results', 'profileId,sessionId,sourcePlanId,dayId,exerciseOccurrenceId,exerciseOrder,setOrder,skipped,weightKg,load,unit,reps,rir')
  const notes = table('notes', 'profileId,ownerKind,ownerId,scheduleRevisionId,sourcePlanId,dayId,exerciseOccurrenceId,noteKind,text')
  table('progress', 'profileId,id,weightKg,measuredAt,measuredLocal,timeZone,offsetMinutes,loggedAt,updatedAt,revision,photoId,lastMutationId', data.measurements as unknown as Row[])
  table('assets', 'profileId,id,path,mediaType,bytes,width,height,role,createdAt', data.assets as unknown as Row[])
  const assetRefs = table('asset_references', 'profileId,ownerKind,ownerId,photoId')
  const writeSets = (target: Row[], context: Row, sets: ExerciseInput['sets']) => sets.forEach((set, i) => target.push({ ...context, setOrder: i + 1, repsMin: set.reps.min, repsMax: set.reps.max, rirMin: set.rir?.min, rirMax: set.rir?.max }))
  const snapshotDays = (context: Row, list: TrainingDay[]) => list.forEach((day, d) => {
    const parent = { profileId: data.profile.id, ...context, dayId: day.id, dayOrder: d + 1 }
    days.push({ ...parent, name: day.name })
    const blocks = [...new Set(day.exercises.map((item) => item.groupId ?? item.id))]
    for (const group of day.groups ?? []) groups.push({ ...parent, ...group, groupId: group.id, blockOrder: blocks.indexOf(group.id) + 1 })
    day.exercises.forEach((exercise, e) => {
      const link = { ...parent, exerciseOccurrenceId: exercise.id, exerciseOrder: e + 1 }, p = exercise.prescription, source = exercise.source
      prescriptions.push({ ...link, ...p, groupId: exercise.groupId, sourceLibraryId: source?.kind === 'exercise' ? source.id : source?.libraryId, sourceKind: source?.kind, sourceId: source?.id, sourceDayId: source?.kind === 'plan' ? source.dayId : undefined, sourceOccurrenceId: source?.kind === 'plan' ? source.occurrenceId : undefined })
      writeSets(prescriptionSets, link, p.sets)
      p.tagNames.forEach((tagName, t) => prescriptionTags.push({ ...link, tagOrder: t + 1, tagName }))
      if (p.notes !== undefined) notes.push({ ...link, noteKind: 'prescription', text: p.notes })
    })
  })
  for (const exercise of data.exercises) {
    libraries.push(exercise as unknown as Row); writeSets(librarySets, { profileId: data.profile.id, libraryExerciseId: exercise.id }, exercise.sets)
    exercise.tagIds.forEach((tagId, i) => tagLinks.push({ profileId: data.profile.id, libraryExerciseId: exercise.id, tagId, tagOrder: i + 1 }))
    if (exercise.notes !== undefined) notes.push({ profileId: data.profile.id, ownerKind: 'library', ownerId: exercise.id, noteKind: 'prescription', text: exercise.notes })
  }
  for (const plan of data.plans) snapshotDays({ ownerKind: 'plan', ownerId: plan.id, sourcePlanId: plan.id }, plan.days)
  for (const schedule of data.schedules) schedule.revisions.forEach((revision, i) => {
    revisions.push({ ...revision, profileId: data.profile.id, scheduleId: schedule.id, planId: schedule.planId, revisionOrder: i + 1 })
    revision.mapping.forEach((mapping, a) => assignments.push({ ...mapping, profileId: data.profile.id, scheduleId: schedule.id, scheduleRevisionId: revision.id, assignmentOrder: a + 1 }))
    snapshotDays({ ownerKind: 'schedule_revision', ownerId: schedule.id, scheduleRevisionId: revision.id, sourcePlanId: schedule.planId }, revision.days)
  })
  for (const [kind, records, target, results] of [['draft', data.drafts, drafts, draftResults], ['session', data.sessions, sessions, sessionResults]] as const) for (const record of records) {
    const ref = record.occurrence
    target.push({ ...record, scheduleId: ref?.scheduleId, scheduleRevisionId: ref?.scheduleRevisionId, scheduledDate: ref?.scheduledDate, scheduledWeek: ref?.scheduledWeek, timeZone: ref?.timeZone })
    const context = { profileId: data.profile.id, ownerKind: kind, ownerId: record.id, sourcePlanId: record.sourcePlanId, dayId: record.day.id }
    snapshotDays(context, [record.day])
    const input = 'input' in record ? record.input : record
    notes.push({ ...context, noteKind: 'session', text: input.notes })
    input.exercises.forEach((exercise, e) => {
      notes.push({ ...context, exerciseOccurrenceId: exercise.id, noteKind: 'exercise', text: exercise.notes })
      exercise.sets.forEach((set, s) => results.push({ profileId: data.profile.id, [`${kind}Id`]: record.id, sourcePlanId: record.sourcePlanId, dayId: record.day.id, exerciseOccurrenceId: exercise.id, exerciseOrder: e + 1, setOrder: s + 1, ...set, ...('load' in set && typeof set.load === 'string' ? { loadText: set.load, repsText: set.reps, rirText: set.rir } : {}) }))
    })
  }
  for (const record of [data.profile, ...data.measurements]) if (record.photoId) assetRefs.push({ profileId: data.profile.id, ownerKind: record === data.profile ? 'profile' : 'measurement', ownerId: record.id, photoId: record.photoId })
  // Empty tables still carry stable headers. Null/undefined produce blank cells; 0 stays 0.
  return Object.entries(tables).map(([name, table]) => {
    const text = Papa.unparse({ fields: table.fields, data: table.rows.map((row) => table.fields.map((field) => spreadsheetCell(row[field]))) }, { newline: '\r\n', escapeFormulae: false })
    return { path: `csv/${name}.csv`, rows: table.rows.length, text: '\uFEFF' + (table.rows.length ? text : text.replace(/\r\n$/, '')) }
  })
}

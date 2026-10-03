import { createId } from '../../lib/browser-crypto.ts'
import { currentInterchangeSchema, legacyInterchangeSchema, interchangeExample, type ImportKind, type Interchange, type InterchangeExercise } from '../../schemas/interchange.ts'
import type { ExerciseInput } from '../../schemas/exercise.ts'
import { copyExercise, type PlanInput } from '../../schemas/plan.ts'

export const maxImportCharacters = 1_000_000
export interface ImportIssue { path: string; message: string }
const fieldPath = (path: (string | number)[]) => path.reduce<string>((text, part) => typeof part === 'number' ? `${text}[${part}]` : text ? `${text}.${part}` : part, '') || '$'
export function parseInterchange(text: string): { value?: Interchange; issues: ImportIssue[] } {
  if (text.length > maxImportCharacters) return { issues: [{ path: '$', message: 'Use at most 1,000,000 characters.' }] }
  let json = text.trim()
  if (json.startsWith('```')) {
    const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(json)
    if (!fenced) return { issues: [{ path: '$', message: 'Paste only raw JSON or one JSON fenced block, without surrounding prose or extra blocks.' }] }
    json = fenced[1]
  }
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return { issues: [{ path: '$', message: 'Invalid JSON. Paste one complete JSON object, with no prose or additional code blocks. Check quotes, commas, and brackets.' }] } }
  const version = raw && typeof raw === 'object' && 'schemaVersion' in raw ? raw.schemaVersion : undefined
  if (version !== 1 && version !== 2) return { issues: [{ path: 'schemaVersion', message: 'Supported AI schema versions are 1 and 2.' }] }
  const parsed = (version === 1 ? legacyInterchangeSchema : currentInterchangeSchema).safeParse(raw)
  if (parsed.success) return { value: parsed.data, issues: [] }
  return { issues: parsed.error.issues.flatMap((issue) => issue.code === 'unrecognized_keys' ? issue.keys.map((key) => ({ path: fieldPath([...issue.path, key]), message: 'Unknown field. Remove it; IDs and ownership fields are not accepted.' })) : [{ path: fieldPath(issue.path), message: issue.message }]) }
}
function toExercise(value: InterchangeExercise): ExerciseInput {
  return {
    name: value.name,
    sets: value.sets.map((set) => ({ reps: { ...set.reps }, ...(set.rir === null ? {} : { rir: { ...set.rir } }) })),
    ...(value.restBetweenSetsSeconds === null ? {} : { restBetweenSeconds: value.restBetweenSetsSeconds }),
    ...(value.restAfterExerciseSeconds === null ? {} : { restAfterSeconds: value.restAfterExerciseSeconds }),
    ...(value.instructions ? { instructions: value.instructions } : {}),
    ...(value.youtubeUrl === null ? {} : { tutorialUrl: value.youtubeUrl }),
    tagNames: [...value.tags],
  }
}
export type ImportDraft = { kind: 'workout'; input: ExerciseInput } | { kind: 'plan'; input: PlanInput }
export function toImportDraft(value: Interchange): ImportDraft {
  if (value.kind === 'workout') return { kind: 'workout', input: toExercise(value.workout) }
  return { kind: 'plan', input: { name: value.plan.name, ...('durationWeeks' in value.plan ? { durationWeeks: value.plan.durationWeeks } : {}), days: value.plan.days.map((day) => {
    const groups = 'supersets' in day ? day.supersets.map((group) => ({ id: createId(), number: group.number, ...(group.restBetweenRoundsSeconds === null ? {} : { restBetweenRoundsSeconds: group.restBetweenRoundsSeconds }), ...(group.restAfterGroupSeconds === null ? {} : { restAfterGroupSeconds: group.restAfterGroupSeconds }) })) : undefined
    return { id: createId(), name: day.name, ...(groups ? { groups } : {}), exercises: day.exercises.map((exercise) => ({ ...copyExercise(toExercise(exercise)), ...('superset' in exercise && exercise.superset !== null ? { groupId: groups!.find((group) => group.number === exercise.superset)!.id } : {}) })) }
  }) } }
}
export function formattingInstructions(kind: ImportKind) {
  const example = interchangeExample(kind)
  return `Format my request as a Boros ${kind}. Return ONLY one raw JSON object: no explanation, Markdown, or code fences. Preserve my requested exercises, order, sets, reps, RIR, and rest targets. Do not invent missing targets; if a required target is unknown, ask me to specify it before producing the final JSON.

Exact public contract (schemaVersion 2):
Envelope: { "schemaVersion": 2, "kind": "${kind}", "${kind}": ${kind === 'plan' ? 'Plan' : 'Exercise'} }. Include exactly that matching payload.
Plan: { "name": string, "durationWeeks": positive integer, "trainingDaysPerWeek": integer 1-7, "days": Day[] }. Ask for duration when unknown; never infer it from the name.
Day: { "name": string, "exercises": PlanExercise[], "supersets": Superset[] }.
PlanExercise: all Exercise fields plus "superset": positive integer|null. Null means standalone. Repeated exercise names are separate occurrences; repeat the complete prescription for each.
Superset: { "number": positive integer, "restBetweenRoundsSeconds": nonnegative integer|null, "restAfterGroupSeconds": nonnegative integer|null }.
Every non-null membership must reference one declared superset number in that day; each group needs at least two members. Numbers are unique within a day and never join different days. Keep each group's members contiguous in execution order. Rounds run up to the largest member set count; shorter members simply stop. Never fabricate sets to match counts. Group rest replaces member rest during the group; preserve original member prescriptions. Use null for unspecified group rest and 0 for explicit zero. Omitted superset defaults to null, omitted supersets to [], omitted group rest to null. No superset field on a standalone workout envelope.
Exercise: { "name": string, "sets": Set[], "restBetweenSetsSeconds": integer|null, "restAfterExerciseSeconds": integer|null, "instructions": string, "youtubeUrl": string|null, "tags": string[] }.
Set: { "reps": { "min": integer, "max": integer }, "rir": { "min": integer, "max": integer }|null }.

No extra fields at ANY object level. Never include IDs, profile/ownership fields, revisions, timestamps, or internal database fields. Notes are not a field in this public format; the user may add notes in the preview. Older schemaVersion 1 payloads remain accepted; old plans require the owner to enter duration in the preview before saving.
Names are nonempty, at most 120 characters; trim outer whitespace. Each plan has exactly trainingDaysPerWeek ordered days and 1-100 exercises per day. Each exercise has 1-100 ordered sets. Reps are positive integers; RIR and rests are nonnegative integers. All numbers must be safe integers (at most 9007199254740991); range max must be >= min, and equal bounds mean a fixed target. Use seconds for all rest durations. Never convert a missing value to zero; zero is an explicit target.
Use null for missing RIR/rest and unknown tutorials. Never invent a tutorial URL. Only include a user-supplied or known supported HTTPS YouTube video URL; otherwise null. Supported hosts: youtube.com, www.youtube.com, m.youtube.com, youtu.be; paths: watch?v=, shorts/, live/, embed/, or shortened video ID (11 characters). No credentials or alternate hosts.
Include plain-text instructions and string tags when available; otherwise instructions is "" and tags is []. Instructions allow at most 20,000 characters; at most 50 tags per exercise, each 1-80 characters. Omitted optional rir/rest/youtubeUrl default to null; omitted instructions defaults to ""; omitted tags defaults to []. Null is not valid for instructions or tags. Escape newlines inside JSON strings. Do not output HTML to be rendered or executable code.

The following is a valid illustrative example of the exact format, NOT a prescription to copy into my requested workout/plan. Replace it with my requested content:
${JSON.stringify(example, null, 2)}`
}

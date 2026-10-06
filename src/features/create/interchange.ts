import { createId } from '../../lib/browser-crypto.ts'
import { currentInterchangeSchema, v3InterchangeSchema, v2InterchangeSchema, legacyInterchangeSchema, interchangeExample, type ImportKind, type Interchange, type InterchangeExercise } from '../../schemas/interchange.ts'
import type { ExerciseInput } from '../../schemas/exercise.ts'
import { copyExercise, identifySets, type TrainingDay, type PlanInput } from '../../schemas/plan.ts'

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
  try { raw = JSON.parse(json) } catch { return { issues: [{ path: '$', message: /[“”]/.test(json)
    ? 'Invalid JSON. Curly quotes cannot delimit JSON property names or strings. Ask for the complete result in one json code block with straight ASCII double quotes (U+0022), then copy the code directly. Legitimate punctuation inside valid strings is preserved; no automatic quote replacement is performed.'
    : 'Invalid JSON. Paste one complete JSON object, with no prose or additional code blocks. Check straight double quotes, commas, and brackets.' }] } }
  const version = raw && typeof raw === 'object' && 'schemaVersion' in raw ? raw.schemaVersion : undefined
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4) return { issues: [{ path: 'schemaVersion', message: 'Supported AI schema versions are 1, 2, 3 and 4.' }] }
  const parsed = (version === 1 ? legacyInterchangeSchema : version === 2 ? v2InterchangeSchema : version === 3 ? v3InterchangeSchema : currentInterchangeSchema).safeParse(raw)
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
    ...('notes' in value && typeof value.notes === 'string' ? { notes: value.notes } : {}),
    tagNames: [...value.tags],
  }
}
export type ImportDraft = { kind: 'workout'; input: ExerciseInput } | { kind: 'plan'; input: PlanInput }
export function toImportDraft(value: Interchange): ImportDraft {
  if (value.kind === 'workout') return { kind: 'workout', input: toExercise(value.workout) }
  type PublicDay = Extract<Interchange, { kind: 'plan' }>['plan'] extends infer P ? P extends { days: (infer D)[] } ? D : P extends { weeks: { days: (infer D)[] }[] } ? D : never : never
  const convert = (day: PublicDay): TrainingDay => {
    const groups = 'supersets' in day ? day.supersets.map((group) => ({ id: createId(), number: group.number, ...(group.restBetweenRoundsSeconds === null ? {} : { restBetweenRoundsSeconds: group.restBetweenRoundsSeconds }), ...(group.restAfterGroupSeconds === null ? {} : { restAfterGroupSeconds: group.restAfterGroupSeconds }) })) : undefined
    return { id: createId(), name: day.name, ...(groups ? { groups } : {}), exercises: day.exercises.map((exercise) => ({ ...copyExercise(toExercise(exercise)), ...('superset' in exercise && exercise.superset !== null ? { groupId: groups!.find((group) => group.number === exercise.superset)!.id } : {}) })) }
  }
  const plan = value.plan, definitions = 'weeks' in plan ? plan.weeks.map((week) => ({ id: createId(), days: identifySets(week.days.map(convert)) })) : undefined
  return { kind: 'plan', input: { name: plan.name, ...('instructions' in plan && plan.instructions !== undefined ? { instructions: plan.instructions } : {}), ...('notes' in plan && plan.notes !== undefined ? { notes: plan.notes } : {}), ...('durationWeeks' in plan ? { durationWeeks: plan.durationWeeks } : {}), ...(definitions ? { weeks: definitions.map((week) => ({ id: week.id, dayIds: week.days.map((day) => day.id) })) } : {}), days: definitions ? definitions.flatMap((week) => week.days) : 'days' in plan ? plan.days.map(convert) : [] } }
}

export function formattingInstructions(kind: ImportKind) {
  const example = interchangeExample(kind)
  const planContract = kind === 'plan' ? `Plan repeating mode: { "mode": "repeating", "name": string, "durationWeeks": positive integer, "trainingDaysPerWeek": integer 1-7, "days": Day[] }.
Plan unique mode: { "mode": "unique", "name": string, "durationWeeks": positive integer, "uniqueWeekCount": integer >=2, "weeks": Week[] }.
Both plan modes allow optional "instructions" and "notes" strings, each at most 20,000 characters; never combine them.
Week: { "trainingDaysPerWeek": integer 1-7, "days": Day[] }. Each week must contain exactly its declared day count. weeks must contain exactly uniqueWeekCount ordered definitions, and uniqueWeekCount must divide durationWeeks evenly. A one-week plan uses repeating mode. Different definitions may have different day counts. Never invent missing weeks. Do not include global days or trainingDaysPerWeek in unique mode. Ask for duration when unknown; never infer it from the name.
Plan instructions are optional plain text, at most 20,000 characters. Omit when unavailable; do not invent instructions, copy notes, or combine exercise instructions. Keep plan instructions separate from each exercise's instructions. Null is not valid.
Day: { "name": string, "exercises": PlanExercise[], "supersets": Superset[] }.
PlanExercise: all Exercise fields plus "superset": positive integer|null. Null means standalone. Repeated exercise names are separate occurrences; repeat the complete prescription for each.
Superset: { "number": positive integer, "restBetweenRoundsSeconds": nonnegative integer|null, "restAfterGroupSeconds": nonnegative integer|null }.
Every non-null membership must reference one declared superset number in that day; each group needs at least two members. Numbers are unique within a day and never join different days. Keep each group's members contiguous in execution order.
Superset execution example: A has 2 sets of 20 reps; B has 2 sets of 8 reps.
Round 1: A × 20 → B × 8 → rest between rounds.
Round 2: A × 20 → B × 8 → rest after the group.
There is no timed rest between members within a round. Group restBetweenRoundsSeconds applies only between rounds; restAfterGroupSeconds applies only after the final round, including when the group ends the session. Never add both rests after the final round. Member standalone rest settings do not create breaks between superset members; preserve those original prescriptions.
Rounds run up to the largest member set count; shorter members simply stop and are omitted from later rounds. Never fabricate sets to match counts. Missing rest remains unspecified (null); zero explicitly means no timed rest. Do not invent rest durations unless I authorize choosing them. Omitted superset defaults to null, omitted supersets to [], omitted group rest to null.
` : 'This is a standalone Workout payload. Do not include plan, day, duration, group or superset fields.\n'
  return `Format my request as a Boros ${kind}.
Return the complete result inside exactly one \`\`\`json code block.
Use valid JSON with straight ASCII double quotes (U+0022) around property names and string values. Do not use curly quotation marks as JSON delimiters, comments, or trailing commas.
Preserve the requested exercises and targets. Include the complete object without truncation, placeholders, or text outside the code block.
Preserve my requested order, sets, reps, RIR, and rest targets. Do not invent missing targets or rest durations unless I authorize choosing them; if a required target is unknown, ask me to specify it before producing the final JSON.

Exact public contract (schemaVersion 4):
Envelope: { "schemaVersion": 4, "kind": "${kind}", "${kind}": ${kind === 'plan' ? 'Plan' : 'Exercise'} }. Include exactly that matching payload.
${planContract}Exercise: { "name": string, "sets": Set[], "restBetweenSetsSeconds": integer|null, "restAfterExerciseSeconds": integer|null, "instructions": string, "youtubeUrl": string|null, "tags": string[] }.
Set: { "reps": { "min": integer, "max": integer }, "rir": { "min": integer, "max": integer }|null }.

No extra fields at ANY object level. Never include IDs, profile/ownership fields, revisions, timestamps, or internal database fields. Optional exercise "notes" is a plain-text string of at most 20,000 characters. Older schemaVersion 1, 2 and 3 repeating payloads remain accepted; schemaVersion 1 plans require the owner to enter duration in the preview before saving.
Names are nonempty, at most 120 characters; trim outer whitespace. Each repeating plan or unique-week definition has exactly trainingDaysPerWeek ordered days and 1-100 exercises per day. Each exercise has 1-100 ordered sets. Reps are positive integers; RIR and rests are nonnegative integers. All numbers must be safe integers (at most 9007199254740991); range max must be >= min, and equal bounds mean a fixed target. Use seconds for all rest durations. Never convert a missing value to zero; zero is an explicit target.
Use null for missing RIR/rest and unknown tutorials. Never invent a tutorial URL. Only include a user-supplied or known supported HTTPS YouTube video URL; otherwise null. Supported hosts: youtube.com, www.youtube.com, m.youtube.com, youtu.be; paths: watch?v=, shorts/, live/, embed/, or shortened video ID (11 characters). No credentials or alternate hosts.
Include plain-text exercise instructions and string tags when available; otherwise exercise instructions is "" and tags is []. Instructions allow at most 20,000 characters; at most 50 tags per exercise, each 1-80 characters. Omitted optional rir/rest/youtubeUrl default to null; omitted exercise instructions defaults to ""; omitted tags defaults to []. Null is not valid for instructions or tags. Escape newlines inside JSON strings. Do not output HTML to be rendered or executable code.

The following is a valid illustrative example of the exact format, NOT a prescription to copy into my requested workout/plan. Replace it with my requested content:
${JSON.stringify(example, null, 2)}`
}

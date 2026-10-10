import { convertIntervalDay } from '../../schemas/interval-conversion.ts'
import type { IntervalInterchange as V7IntervalInterchange } from '../../schemas/interval-interchange-v7.ts'
import { v6IntervalInterchangeSchema, v7IntervalInterchangeSchema, v8StrengthInterchangeSchema, v7StrengthInterchangeSchema } from '../../schemas/interchange.ts'
import { z } from 'zod'
import { intervalInterchangeSchema, type IntervalInterchange } from '../../schemas/interval-interchange.ts'
import type { TrainingType } from '../../schemas/training-type.ts'
import type { WorkoutInput } from '../../schemas/workout.ts'
import { createId } from '../../lib/browser-crypto.ts'
import { strengthInterchangeSchema, currentInterchangeSchema, v4InterchangeSchema, v3InterchangeSchema, v2InterchangeSchema, legacyInterchangeSchema, interchangeExample, type ImportKind, type Interchange, type InterchangeExercise } from '../../schemas/interchange.ts'
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
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7 && version !== 8) return { issues: [{ path: 'schemaVersion', message: 'Supported AI schema versions are 1, 2, 3, 4, 5, 6, 7 and 8.' }] }
  const parsed = (version === 8 ? ((raw as { trainingType?: string }).trainingType === 'interval' ? intervalInterchangeSchema : v8StrengthInterchangeSchema) : version === 7 ? ((raw as { trainingType?: string }).trainingType === 'interval' ? v7IntervalInterchangeSchema : v7StrengthInterchangeSchema) : version === 6 ? ((raw as { trainingType?: string }).trainingType === 'interval' ? v6IntervalInterchangeSchema : strengthInterchangeSchema) : version === 1 ? legacyInterchangeSchema : version === 2 ? v2InterchangeSchema : version === 3 ? v3InterchangeSchema : version === 4 ? v4InterchangeSchema : currentInterchangeSchema).safeParse(raw)
  if (parsed.success) return { value: parsed.data, issues: [] }
  return { issues: parsed.error.issues.flatMap((issue) => issue.code === 'unrecognized_keys' ? issue.keys.map((key) => ({ path: fieldPath([...issue.path, key]), message: 'Unknown field. Remove it; IDs and ownership fields are not accepted.' })) : [{ path: fieldPath(issue.path), message: issue.message }]) }
}
function toExercise(value: InterchangeExercise): ExerciseInput {
  return {
    trainingType: 'strength', name: value.name,
    sets: value.sets.map((set) => ({ reps: { ...set.reps }, ...(set.rir === null ? {} : { rir: { ...set.rir } }) })),
    ...(value.restBetweenSetsSeconds === null ? {} : { restBetweenSeconds: value.restBetweenSetsSeconds }),
    ...(value.restAfterExerciseSeconds === null ? {} : { restAfterSeconds: value.restAfterExerciseSeconds }),
    ...(value.instructions ? { instructions: value.instructions } : {}),
    ...(value.youtubeUrl === null ? {} : { tutorialUrl: value.youtubeUrl }),
    ...('notes' in value && typeof value.notes === 'string' ? { notes: value.notes } : {}),
    tagNames: [...value.tags],
  }
}
export type ImportDraft = { kind: 'exercise'; input: ExerciseInput } | { kind: 'workout'; input: WorkoutInput } | { kind: 'plan'; input: PlanInput }
export function toImportDraft(value: Interchange): ImportDraft {
  if (value.schemaVersion === 6 || value.schemaVersion === 7 || value.schemaVersion === 8) {
    if (value.trainingType === 'interval') return toIntervalDraft(value.schemaVersion === 6 ? { ...value, schemaVersion: 7 } : value)
    const { trainingType: _type, ...legacy } = value; return toImportDraft({ ...legacy, schemaVersion: 5 } as z.infer<typeof currentInterchangeSchema>)
  }
  if (value.kind === 'exercise') return { kind: 'exercise', input: toExercise(value.exercise) }
  if (value.kind === 'workout' && value.schemaVersion !== 5) return { kind: 'exercise', input: toExercise(value.workout) }
  type PublicDay = Extract<Exclude<Interchange, { schemaVersion: 6 | 7 | 8 }>, { kind: 'plan' }>['plan'] extends infer P ? P extends { days: (infer D)[] } ? D : P extends { weeks: { days: (infer D)[] }[] } ? D : never : never
  const convert = (day: PublicDay): TrainingDay => {
    const groups = 'supersets' in day ? day.supersets.map((group) => ({ id: createId(), number: group.number, ...(group.restBetweenRoundsSeconds === null ? {} : { restBetweenRoundsSeconds: group.restBetweenRoundsSeconds }), ...(group.restAfterGroupSeconds === null ? {} : { restAfterGroupSeconds: group.restAfterGroupSeconds }) })) : undefined
    return { id: createId(), trainingType: 'strength', name: day.name, ...('instructions' in day && typeof day.instructions === 'string' ? { instructions: day.instructions } : {}), ...('notes' in day && typeof day.notes === 'string' ? { notes: day.notes } : {}), ...(groups ? { groups } : {}), exercises: day.exercises.map((exercise) => ({ ...copyExercise(toExercise(exercise)), ...('superset' in exercise && exercise.superset !== null ? { groupId: groups!.find((group) => group.number === exercise.superset)!.id } : {}) })) }
  }
  if (value.kind === 'workout') return { kind: 'workout', input: { ...convert(value.workout), instructions: value.workout.instructions, notes: value.workout.notes } }
  const plan = value.plan, definitions = 'weeks' in plan ? plan.weeks.map((week) => ({ id: createId(), days: identifySets(week.days.map(convert)) })) : undefined
  return { kind: 'plan', input: { trainingType: 'strength', name: plan.name, ...('instructions' in plan && plan.instructions !== undefined ? { instructions: plan.instructions } : {}), ...('notes' in plan && plan.notes !== undefined ? { notes: plan.notes } : {}), ...('durationWeeks' in plan ? { durationWeeks: plan.durationWeeks } : {}), ...(definitions ? { weeks: definitions.map((week) => ({ id: week.id, dayIds: week.days.map((day) => day.id) })) } : {}), days: definitions ? definitions.flatMap((week) => week.days) : 'days' in plan ? plan.days.map(convert) : [] } }
}

function strengthFormattingInstructions(kind: ImportKind) {
  const example = interchangeExample(kind)
  const planContract = kind !== 'exercise' ? `Plan repeating mode: { "mode": "repeating", "name": string, "durationWeeks": positive integer, "trainingDaysPerWeek": integer 1-7, "days": Day[] }.
Plan unique mode: { "mode": "unique", "name": string, "durationWeeks": positive integer, "uniqueWeekCount": integer >=2, "weeks": Week[] }.
Both plan modes allow optional "instructions" and "notes" strings, each at most 20,000 characters; never combine them.
Week: { "trainingDaysPerWeek": integer 1-7, "days": Day[] }. Each week must contain exactly its declared workout count. weeks must contain exactly uniqueWeekCount ordered definitions, and uniqueWeekCount must divide durationWeeks evenly. A one-week plan uses repeating mode. Different definitions may have different workout counts. Never invent missing weeks. Do not include global days or trainingDaysPerWeek in unique mode. Ask for duration when unknown; never infer it from the name.
Plan instructions are optional plain text, at most 20,000 characters. Omit when unavailable; do not invent instructions, copy notes, or combine exercise instructions. Keep plan instructions separate from each exercise's instructions. Null is not valid.
Day (one workout; keep the literal days and trainingDaysPerWeek keys): { "name": string, "exercises": PlanExercise[], "supersets": Superset[] }.
PlanExercise: all Exercise fields plus "superset": positive integer|null. Null means standalone. Repeated exercise names are separate occurrences; repeat the complete prescription for each.
Superset: { "number": positive integer, "restBetweenRoundsSeconds": nonnegative integer|null, "restAfterGroupSeconds": nonnegative integer|null }.
Every non-null membership must reference one declared superset number in that workout; each group needs at least two members. Numbers are unique within a workout and never join different workouts. Keep each group's members contiguous in execution order.
Superset execution example: A has 2 sets of 20 reps; B has 2 sets of 8 reps.
Round 1: A × 20 → B × 8 → rest between rounds.
Round 2: A × 20 → B × 8 → rest after the group.
There is no timed rest between members within a round. Group restBetweenRoundsSeconds applies only between rounds; restAfterGroupSeconds applies only after the final round, including when the group ends the session. Never add both rests after the final round. Member standalone rest settings do not create breaks between superset members; preserve those original prescriptions.
Rounds run up to the largest member set count; shorter members simply stop and are omitted from later rounds. Never fabricate sets to match counts. Missing rest remains unspecified (null); zero explicitly means no timed rest. Do not invent rest durations unless I authorize choosing them. Omitted superset defaults to null, omitted supersets to [], omitted group rest to null.
` : 'This is one standalone Exercise. Use kind exercise and payload exercise. Do not include plan, day, duration, group or superset fields.\n'
  const collectionContract = kind === 'workout' ? planContract.slice(planContract.indexOf('Day (one workout;')) : planContract
  const workoutContract = kind === 'exercise' ? '' : 'Workout: { "name": string, "exercises": PlanExercise[], "supersets": Superset[] }. Optional instructions and notes are separate strings (at most 20,000 characters). A reusable Workout has 1-100 exercises; no plan duration or week fields.\n'
  return `Format my request as a Boros ${kind}.
Return the complete result inside exactly one \`\`\`json code block.
Use valid JSON with straight ASCII double quotes (U+0022) around property names and string values. Do not use curly quotation marks as JSON delimiters, comments, or trailing commas.
Preserve the requested exercises and targets. Include the complete object without truncation, placeholders, or text outside the code block.
Preserve my requested order, sets, reps, RIR, and rest targets. Do not invent missing targets or rest durations unless I authorize choosing them; if a required target is unknown, ask me to specify it before producing the final JSON.

Exact public contract (schemaVersion 5):
Envelope: { "schemaVersion": 5, "kind": "${kind}", "${kind}": ${kind === 'plan' ? 'Plan' : kind === 'workout' ? 'Workout' : 'Exercise'} }. Include exactly that matching payload.
${collectionContract}${workoutContract}Exercise: { "name": string, "sets": Set[], "restBetweenSetsSeconds": integer|null, "restAfterExerciseSeconds": integer|null, "instructions": string, "youtubeUrl": string|null, "tags": string[] }.
Set: { "reps": { "min": integer, "max": integer }, "rir": { "min": integer, "max": integer }|null }.

No extra fields at ANY object level. Never include IDs, profile/ownership fields, revisions, timestamps, or internal database fields. Optional exercise "notes" is a plain-text string of at most 20,000 characters. Older schemaVersion 1-4 payloads remain accepted under their original contracts: kind workout means ONE exercise only in those versions. Version 5 workout means a collection; never mix version shapes. schemaVersion 1 plans require the owner to enter duration in the preview before saving.
Names are nonempty, at most 120 characters; trim outer whitespace. Each repeating plan or unique-week definition has exactly trainingDaysPerWeek ordered workouts in the literal days array and 1-100 exercises per workout. Each exercise has 1-100 ordered sets. Reps are positive integers; RIR and rests are nonnegative integers. All numbers must be safe integers (at most 9007199254740991); range max must be >= min, and equal bounds mean a fixed target. Use seconds for all rest durations. Never convert a missing value to zero; zero is an explicit target.
Use null for missing RIR/rest and unknown tutorials. Never invent a tutorial URL. Only include a user-supplied or known supported HTTPS YouTube video URL; otherwise null. Supported hosts: youtube.com, www.youtube.com, m.youtube.com, youtu.be; paths: watch?v=, shorts/, live/, embed/, or shortened video ID (11 characters). No credentials or alternate hosts.
Include plain-text exercise instructions and string tags when available; otherwise exercise instructions is "" and tags is []. Instructions allow at most 20,000 characters; at most 50 tags per exercise, each 1-80 characters. Omitted optional rir/rest/youtubeUrl default to null; omitted exercise instructions defaults to ""; omitted tags defaults to []. Null is not valid for instructions or tags. Escape newlines inside JSON strings. Do not output HTML to be rendered or executable code.

The following is a valid illustrative example of the exact format, NOT a prescription to copy into my requested exercise/plan. Replace it with my requested content:
${JSON.stringify(example, null, 2)}`
}

function toIntervalDraft(value: IntervalInterchange | V7IntervalInterchange): ImportDraft {
  const exercise = (e: z.infer<typeof import('../../schemas/interval-interchange.ts').publicIntervalExercise>): ExerciseInput => ({ trainingType: 'interval', name: e.name, sets: [], activeSeconds: e.activeSeconds, recoverySeconds: e.recoverySeconds, instructions: e.instructions, notes: e.notes, tutorialUrl: e.youtubeUrl ?? undefined, tagNames: e.tags })
  const workout = (w: z.infer<typeof import('../../schemas/interval-interchange.ts').publicIntervalWorkout> | z.infer<typeof import('../../schemas/interval-interchange-v7.ts').publicIntervalWorkout>): TrainingDay => {
    const circuits = w.circuits.map(c => ({ ...c, id: createId(), occurrences: c.exercises.map(e => copyExercise(exercise(e))) }))
    return convertIntervalDay({ id: createId(), trainingType: 'interval', name: w.name, instructions: w.instructions, notes: w.notes, postWorkoutRestSeconds: w.postWorkoutRestSeconds, exercises: circuits.flatMap(c => c.occurrences), circuits: circuits.map(c => ({ id: c.id, name: c.name, exerciseIds: c.occurrences.map(e => e.id), ...('repeat' in c ? { repeat: c.repeat } : { roundsPerSet: c.roundsPerSet, sets: c.sets, restBetweenSetsSeconds: c.restBetweenSetsSeconds }), restAfterCircuitSeconds: c.restAfterCircuitSeconds })) })
  }
  if (value.kind === 'exercise') return { kind: 'exercise', input: exercise(value.exercise) }
  if (value.kind === 'workout') return { kind: 'workout', input: workout(value.workout) }
  const p = value.plan, weeks = p.mode === 'unique' ? p.weeks.map(w => ({ id: createId(), days: w.days.map(workout) })) : undefined
  return { kind: 'plan', input: { trainingType: 'interval', name: p.name, instructions: p.instructions, notes: p.notes, durationWeeks: p.durationWeeks, ...(weeks ? { weeks: weeks.map(w => ({ id: w.id, dayIds: w.days.map(d => d.id) })) } : {}), days: weeks ? weeks.flatMap(w => w.days) : p.mode === 'repeating' ? p.days.map(workout) : [] } }
}
export function formattingInstructions(kind: ImportKind, type: TrainingType = 'strength') {
  if (type === 'strength') return 'Training type is Strength. The envelope requires trainingType: "strength"; timed circuits and Interval fields are not supported in this contract.\n' + strengthFormattingInstructions(kind).replaceAll('schemaVersion 5', 'schemaVersion 8').replaceAll('"schemaVersion": 5', '"schemaVersion": 8, "trainingType": "strength"')
  const exercise = { name: 'Sprint', activeSeconds: 20, recoverySeconds: 10, tags: [], youtubeUrl: null }, workout = { name: 'Intervals', circuits: [{ name: 'Circuit 1', exercises: [exercise], repeat: 1, restAfterCircuitSeconds: 0 }] }
  const example = intervalInterchangeSchema.parse({ schemaVersion: 8, trainingType: 'interval', kind, [kind]: kind === 'exercise' ? exercise : kind === 'workout' ? workout : { name: 'Interval plan', mode: 'repeating', durationWeeks: 2, trainingDaysPerWeek: 1, days: [workout] } })
  return `Format my request as one complete Boros Interval ${kind}. Return exactly one complete JSON object in exactly one json fenced code block, with straight ASCII double quotes, no comments, trailing commas, prose or truncation. Never invent missing durations or targets unless I authorize choosing them; ask first. No mixed Strength content.
Envelope: { "schemaVersion": 8, "trainingType": "interval", "kind": "${kind}", "${kind}": ${kind} }.
Exercise: name, activeSeconds (positive integer), recoverySeconds (nonnegative integer), tags (0-50 strings, 1-80 characters), youtubeUrl (supported HTTPS YouTube video URL or null). Optional instructions and notes are separate plain-text strings up to 20,000 characters. Names are 1-120 characters. Durations are seconds, at most 86,400. Missing is not zero. No reps, weights, RIR or Strength supersets.
Workout: name, optional instructions/notes, optional postWorkoutRestSeconds (nonnegative whole seconds; omitted or 0 means none), circuits (1-100). Circuit: name, exercises (ordered Exercise objects), repeat (integer 0-10; additional executions, defaults to 0), restAfterCircuitSeconds (explicit nonnegative integer seconds). 0 repeats executes once, 1 twice, 10 eleven times. Up to 100 exercise occurrences per workout. Each active interval retains its own recovery, including the last exercise. Rest after circuit follows EVERY execution, including the final one. All repetitions of a circuit finish before the next circuit. Post-workout rest runs once in continuous mode after all circuits and rests, never in circuit-only mode. Rests remain distinct and additive. No Interval sets, roundsPerSet or restBetweenSetsSeconds, nested circuits, references or IDs. Strength set fields are unchanged.
Plan repeating: name, mode:"repeating", durationWeeks (positive whole number), trainingDaysPerWeek (1-7), days (matching ordered Workout objects). Plan unique: name, mode:"unique", durationWeeks, uniqueWeekCount (at least 2, dividing durationWeeks), weeks (exactly that many {trainingDaysPerWeek,days} definitions). Definitions may have different workout counts. Plans optionally have instructions and notes. Never mix unique/repeating fields. Do not invent duration or missing weeks.
Execution: one silent five-second preparation per timer start, then the compiled circuit sequence. Repeat 1 of a 90-second exercise/recovery sequence with 30-second circuit rest takes 240 seconds before preparation: 90 + 30 + 90 + 30. The next 150-second circuit with 30-second rest plus 60-second workout rest makes 480 seconds, or 485 including preparation. Zero rests skip immediately. Never infer or combine different rests.
No unknown fields at any level, IDs, ownership, revisions, timestamps, HTML or code. Preserve requested names/order/text/targets. Do not invent YouTube URLs.
Illustrative schema-checked example only, replace with my requested content:
${JSON.stringify(example, null, 2)}`
}

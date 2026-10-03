import { createId } from '../../lib/browser-crypto.ts'
import { interchangeSchema, interchangeExample, type ImportKind, type Interchange, type InterchangeExercise } from '../../schemas/interchange.ts'
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
  const parsed = interchangeSchema.safeParse(raw)
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
  return { kind: 'plan', input: { name: value.plan.name, days: value.plan.days.map((day) => ({ id: createId(), name: day.name, exercises: day.exercises.map((exercise) => copyExercise(toExercise(exercise))) })) } }
}
export function formattingInstructions(kind: ImportKind) {
  const example = interchangeExample(kind)
  return `Format my request as a Boros ${kind}. Return ONLY one raw JSON object: no explanation, Markdown, or code fences. Preserve my requested exercises, order, sets, reps, RIR, and rest targets. Do not invent missing targets; if a required target is unknown, ask me to specify it before producing the final JSON.

Exact public contract (schemaVersion 1):
Envelope: { "schemaVersion": 1, "kind": "${kind}", "${kind}": ${kind === 'plan' ? 'Plan' : 'Exercise'} }. Include exactly that matching payload.
Plan: { "name": string, "trainingDaysPerWeek": integer 1-7, "days": Day[] }.
Day: { "name": string, "exercises": Exercise[] }.
Exercise: { "name": string, "sets": Set[], "restBetweenSetsSeconds": integer|null, "restAfterExerciseSeconds": integer|null, "instructions": string, "youtubeUrl": string|null, "tags": string[] }.
Set: { "reps": { "min": integer, "max": integer }, "rir": { "min": integer, "max": integer }|null }.

No extra fields at ANY object level. Never include IDs, profile/ownership fields, revisions, timestamps, or internal database fields. Notes are not a field in this public format; the user may add notes in the preview.
Names are nonempty, at most 120 characters; trim outer whitespace. Each plan has exactly trainingDaysPerWeek ordered days and 1-100 exercises per day. Each exercise has 1-100 ordered sets. Reps are positive integers; RIR and rests are nonnegative integers. All numbers must be safe integers (at most 9007199254740991); range max must be >= min, and equal bounds mean a fixed target. Use seconds for all rest durations. Never convert a missing value to zero; zero is an explicit target.
Use null for missing RIR/rest and unknown tutorials. Never invent a tutorial URL. Only include a user-supplied or known supported HTTPS YouTube video URL; otherwise null. Supported hosts: youtube.com, www.youtube.com, m.youtube.com, youtu.be; paths: watch?v=, shorts/, live/, embed/, or shortened video ID (11 characters). No credentials or alternate hosts.
Include plain-text instructions and string tags when available; otherwise instructions is "" and tags is []. Instructions allow at most 20,000 characters; at most 50 tags per exercise, each 1-80 characters. Omitted optional rir/rest/youtubeUrl default to null; omitted instructions defaults to ""; omitted tags defaults to []. Null is not valid for instructions or tags. Escape newlines inside JSON strings. Do not output HTML to be rendered or executable code.

The following is a valid illustrative example of the exact format, NOT a prescription to copy into my requested workout/plan. Replace it with my requested content:
${JSON.stringify(example, null, 2)}`
}

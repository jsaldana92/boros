# Boros AI interchange v10: Strength L/R Distinction

The current formatting prompt emits **schemaVersion 10** for Strength and Interval.
Strength exercise objects add `lrDistinction`: a real JSON `true`/`false` boolean,
defaulting to false when omitted. Prompts request an explicit value. It applies
to any movement with separate Left/Right results, not just arms; names never infer
it. Interval objects reject the field. New and repeated imported exercises can
be reviewed in the shared editor; conflicting modes require an explicit choice,
and existing historical conversion is separately confirmed at Save. Nothing is
converted at validation or preview. Other exercise/workout fields retain v8 meanings. A unique
plan uses `mode:"unique"`, positive integer `durationWeeks`, `uniqueWeekCount`
(1 through duration), and that many ordered `weeks` objects. Every type contains
`programWeeks`, `trainingDaysPerWeek` (1–7), and its ordered workout `days`.
`programWeeks` is a nonempty array of positive integers: each program week from 1
through duration must occur exactly once across the types. Types may have different
workout counts. There is **no repeating-cycle or divisibility rule** in v9.

For example, a five-week plan can assign `[1,2,4]` to the first type and `[3,5]`
to the second. The editor labels these Week Type 1 / Week Type 2 and lists the
assigned actual weeks; Train still displays actual Week 1 through Week 5.
Transient editor gaps are allowed, but Save validates full coverage and no empty
types. Imports generate stable local type/workout identities and preserve the map.

Versions 1–8 validate with their original contracts, including their original
cycle/count rules. After validation, finite editable cyclic plans expand to an
equivalent explicit map. This never changes historical schedule/session snapshots
or invents a finite duration for unbounded legacy data. No public payload accepts
internal IDs or merge metadata.

Within the save transaction, equivalent active workouts can be reused for plan
publication while retaining independent plan occurrences. Automatic reuse requires
equivalent authored content as well as prescriptions/canonical exercise identities.
Standalone workout imports use the same **Similar workout exists** confirmation as
manual saves; Cancel writes nothing, Save keeps the authored independent record.
Existing workout redirects are honored; no imported name implicitly merges history.

## Previous v8 contract: circuit repetitions (historical)

The v8 envelope uses `schemaVersion: 8`, `trainingType`, `kind`, and exactly
one matching `exercise`, `workout` or `plan` payload. Strict raw JSON or a single
complete json fence, useful field paths, plain text, HTTPS tutorial validation,
preview-only editing and transactional Save remain unchanged. Strength retains
its existing sets/reps/RIR and superset contract.

Notes and instructions already exist in v8; no public field/version was added for
analysis export. Imported copied notes remain independent. For a new repeated
exercise name, the first occurrence in the ordered editable preview seeds the
library default; differing notes expose that choice in an editable review. Existing
library defaults are retained. Conflicting shared instructions require an explicit
preview choice, including acknowledgment of an existing library's authoritative
value. Saves recheck instructions/type/identity inside the existing atomic transaction;
conflicts and retries never silently overwrite a library or duplicate publication.
Internal note provenance fields are not accepted in public AI JSON. Prompts still
require exactly one complete copyable json fenced object. They now ask for consistent
shared instructions and reflect the current ten-second timer preparation.

An Interval circuit has `name`, ordered `exercises`, `repeat` (integer 0-10,
default 0 when omitted), and `restAfterCircuitSeconds` (integer 0-86,400).
`repeat` means additional executions. Every execution includes each positive
exercise recovery and circuit rest, including the final execution. Separate
positive consecutive rests are valid. V8 rejects Interval `sets`, `roundsPerSet`
and `restBetweenSetsSeconds`, including contradictory payloads containing both
models. Exercise targets still require positive active seconds and explicit
nonnegative recovery seconds. Optional postWorkoutRestSeconds is continuous-only.
Preparation is an execution feature, never AI-prescribed.

```json
{"schemaVersion":8,"trainingType":"interval","kind":"workout","workout":{
  "name":"Sprint Madness","postWorkoutRestSeconds":60,"circuits":[
    {"name":"Starting slow","repeat":1,"restAfterCircuitSeconds":30,"exercises":[
      {"name":"Push-up","activeSeconds":20,"recoverySeconds":10},
      {"name":"Sprint","activeSeconds":20,"recoverySeconds":10},
      {"name":"Pull-up","activeSeconds":10,"recoverySeconds":20}]},
    {"name":"Sprint madness","repeat":0,"restAfterCircuitSeconds":30,"exercises":[
      {"name":"High knees","activeSeconds":50,"recoverySeconds":10},
      {"name":"Backwards jog","activeSeconds":50,"recoverySeconds":10},
      {"name":"Full sprint","activeSeconds":20,"recoverySeconds":10}]}
  ]}}
```

This is 480 seconds before preparation, 485 including it. Circuit-only totals are
245 and 185 seconds. Repeating and unique-week plans use these same workouts.
New AI payloads retain limits of 100 circuits/occurrences and 10,000 active phases
per workout. Legacy conversion may need extra stored circuit sections and copied
occurrences; it preserves the validated activity limit without truncation.

Original v6 and v7 Interval contracts are frozen in separate schemas. They parse
strictly before explicit lossless conversion: zero-rest rounds are chunked into
at most eleven executions; a positive old between-set/final rest belongs to a
separate last execution, never every prior round. V6 continues to reject v7's
post-workout rest. V1-v5 retain their historical Strength meaning. No type, target,
missing value or duration is guessed. See the [migration record](interval-repeat-verification.md).

## Historical v7 contract (superseded by v8 above)

# Boros AI interchange v7: Strength and Interval

The Import screen provides separate **Strength** and **Interval** formatting
prompts for Plan, Workout and Exercise. Every current envelope requires
`schemaVersion: 7`, `trainingType: "strength" | "interval"`, `kind`, and exactly
one matching payload. It accepts raw JSON or exactly one complete `json` fenced
block, with straight ASCII quotes and no surrounding text. The prompt requires
asking about missing targets instead of inventing them. IDs, ownership, results,
unknown fields, mixed training types and partial/truncated data are rejected with
field paths before any write.

Strength v7 retains the v5 exercise/set/superset and repeating/unique-week rules.
Workouts inside a v6/v7 Strength plan also accept separate optional plain-text
`instructions` and `notes` (up to 20,000 characters each). Those new fields are not
accepted in older plan versions. Every saved nested prescription gets an explicit
Strength discriminator.

Interval v7 uses these exact shapes:

- Exercise: `name`, positive integer `activeSeconds`, nonnegative integer
  `recoverySeconds`; optional `instructions`, `notes`, `youtubeUrl` (supported
  HTTPS YouTube URL or null), and `tags`. Seconds are at most 86,400. Missing
  recovery is an error; explicit 0 advances immediately.
- Circuit: `name`, ordered complete `exercises`, positive integer `roundsPerSet`
  and `sets` (1-100 each), required nonnegative `restBetweenSetsSeconds` and
  `restAfterCircuitSeconds`. No Circuit library or nested circuits.
- Workout: `name`, optional `instructions`/`notes` and `postWorkoutRestSeconds`, `circuits` (1-100). Limit 100
  exercise occurrences and 10,000 repeated active phases per workout.
- Plan: `name`, `mode`, positive `durationWeeks`, optional instructions/notes.
  Repeating uses `trainingDaysPerWeek` (1-7) and matching `days` of Workout objects.
  Unique uses `uniqueWeekCount` (at least 2, dividing durationWeeks) and matching
  `weeks`, each with its own trainingDaysPerWeek and days. Do not mix modes.

Example:

```json
{
  "schemaVersion": 7,
  "trainingType": "interval",
  "kind": "workout",
  "workout": {
    "name": "Sprint intervals",
    "postWorkoutRestSeconds": 60,
    "circuits": [{
      "name": "Sprint circuit",
      "roundsPerSet": 5,
      "sets": 3,
      "restBetweenSetsSeconds": 0,
      "restAfterCircuitSeconds": 0,
      "exercises": [{ "name": "Sprint", "activeSeconds": 20, "recoverySeconds": 10, "tags": [], "youtubeUrl": null }]
    }]
  }
}
```

Validation uses the same typed prescription/circuit rules as manual builders.
Preview editing is local until Save; plan publication, exercise matching and tags
commit together. Name matches never silently cross training types. Versions 1-5
retain their original strict contracts and always mean Strength; versions 1-4
`kind: "workout"` still mean one exercise. No durations are manufactured.

V7 adds only the optional workout-level `postWorkoutRestSeconds` for Interval
workouts, including copies inside plan days/weeks. It is an integer 0-86,400;
absence/zero means none. It is never inferred from exercise or circuit rests.
Each active phase has recovery; sets contain rounds. Between-set rest is additive
only between sets. Every circuit's positive post-circuit rest follows its final
set, including the last circuit. Post-workout rest follows the final circuit rest
only in continuous execution; circuit-only execution never runs it. Preparation
is an execution feature, not an AI-prescribed field.

Original v6 Interval shapes remain strict and reject this newly introduced field.
V6 Strength remains supported unchanged. Unknown-field and single-fence rules
apply to both old and new contracts. Previews share the manual editor fields.

## Historical v5 and earlier contract notes

# AI formatting and Create refinements

The application generates authoritative instructions from
`src/features/create/interchange.ts` and schema-checked examples in
`src/schemas/interchange.ts`. The current public contract is **AI v5**, with
strict v1-v4 readers. Database v6 adds the independent workout collection; backups
use the separate v11 format with strict v1-v10 compatibility.

Every v5 envelope has exactly `schemaVersion: 5`, `kind: "plan" | "workout" | "exercise"`,
and exactly the matching payload. No internal IDs are accepted.

`kind: "exercise"` contains one movement and its ordered sets. `kind: "workout"`
contains `{ name, exercises, supersets? , instructions?, notes? }`, with 1-100
ordered exercise prescriptions and the same contiguous group rules as plan workouts.
Workout instructions and notes are separate optional plain text, up to 20,000
characters. A workout has no duration, week count or plan identity. The editable
workout preview uses the shared builder. One save atomically creates the workout,
missing exercise templates and tags, reusing existing normalized exercise names
without overwriting their defaults. Repeated prescriptions retain their own IDs.

**Legacy meaning is frozen:** in schema versions 1-4, `kind: "workout"` and the
`workout` payload mean one exercise. Versions 5 and 6 use that kind for a collection.
Dispatch uses explicit version and kind; hybrid envelopes fail, with no guesses
or silent reinterpretation. Legacy previews therefore remain exercise editors.

For a plan, `name` and a finite positive safe-integer `durationWeeks` are required.
Optional `instructions` and `notes` are separate plain-text strings, each at most
20,000 characters; null is invalid. The required `mode` chooses exactly one shape:

- `"repeating"`: `trainingDaysPerWeek` (1-7) and ordered `days` of exactly that length.
- `"unique"`: `uniqueWeekCount` (at least 2) and ordered `weeks` of exactly that
  length. Each week has its own `trainingDaysPerWeek` (1-7) and matching `days`.
  `uniqueWeekCount` must divide `durationWeeks`; global `days` or a global day
  count are forbidden. A one-week plan therefore uses repeating mode.

Workouts (the literal `days` array) retain their ordered exercise snapshots and declared supersets. Exercise
prescriptions support heterogeneous ordered `sets`, positive rep ranges,
optional RIR including zero, group membership, optional integer rest seconds
including zero, instructions, optional notes, tags, and validated HTTPS YouTube
URLs. All optional v1-v3 defaults remain: missing RIR/rest/tutorial becomes null
in the public parsed object and stays absent internally, never zero. Exercise
notes are an optional v4 string, at most 20,000 characters. Unknown fields at any
level, reversed ranges, missing definitions and mismatched counts fail with field
paths. No partial import or inferred cycle is saved.

The editable preview generates local week/day/exercise/set UUIDs. It uses the
same plan builder and custom navigation warning; cancel writes nothing. Final
save remains one profile-owned transaction for plans, templates and tags. The
ordered unique weeks repeat through actual program weeks, without duplicating
the definition records. Existing library defaults are not overwritten.

Historical contracts stay frozen: v1 plans have no duration and require it in the
preview; v2 adds finite duration and groups; v3 adds optional plan instructions.
Those versions keep their original fields and reject v4 mode/weeks/notes fields.
Standalone `workout` behavior is unchanged, with optional notes added only in v4.
New generated examples and prompts use v4, retain the complete-object rule, and
never infer duration or missing targets from names.

Both Plan and Exercise prompts use this initial-response instruction:

> Return the complete result inside exactly one \`\`\`json code block.
> Use valid JSON with straight ASCII double quotes (U+0022) around property names and string values. Do not use curly quotation marks as JSON delimiters, comments, or trailing commas.
> Preserve the requested exercises and targets. Include the complete object without truncation, placeholders, or text outside the code block.

Required unknown targets must be clarified before generating the final JSON.
Examples illustrate the schema; they are not prescribed targets. The envelope's
kind and payload must match. The legacy literal `kind: "workout"` and payload key `workout` represent a standalone exercise; only Plan supports
workout/group membership and rest fields. No IDs or unsupported fields are accepted.
All rests use integer seconds in JSON; UI Minutes/Seconds inputs convert exactly.

For a Plan superset with A: 2 sets × 20 and B: 2 sets × 8:

1. A × 20 → B × 8 → `restBetweenRoundsSeconds`.
2. A × 20 → B × 8 → `restAfterGroupSeconds`.

There is no timed member break. Member standalone rests stay in the prescription
but do not add breaks inside the group. The final round has only post-group rest,
including when it ends the session. With unequal set counts, shorter members stop;
later rounds contain only members with an existing prescribed set. No sets are
invented. Missing/null rest remains unspecified, zero explicitly means no timed
rest, and the model must not choose durations without the user's authorization.

The parser still accepts a raw JSON object or one fenced JSON block. It rejects
surrounding prose, multiple blocks, unsupported/unknown fields and malformed JSON
without writes. A malformed smart-quote delimiter receives guidance to request a
complete fenced result and copy straight delimiters directly. Valid string text
such as `“Breathe” — don’t rush` remains intact; there is no automatic Unicode
quote replacement or fragment extraction.

Copy failure leaves selectable instructions visible. A validated **Draft** is
editable but unsaved and remains bound to its original profile. Apply changes
to the in-memory preview; Save exercise / Save plan persists it. Failed saves retain
the preview. Successful plan saves atomically create standalone templates, tags
and independent plan snapshots. Valid identities win; otherwise an active normalized
exercise name reuses its template without overwriting defaults. A new repeated name
uses its first occurrence as the template default. Every varied plan prescription
is preserved. Superset membership and rests remain local to the plan/day.

This supersedes the earlier plan-sourced catalog. Existing plans are repaired at
initialization/profile selection and through validated restore, without reimport
or clearing data. Earliest retained snapshots supply missing defaults; original AI
defaults may no longer be recoverable. Legacy provenance and Progress identities
remain separate from the new defaults reference. Library Edit opens the standalone
editor and saves directly.

In legacy v1-v4, the discriminator and payload key remain `workout` for one
Exercise. V5 uses `exercise` for that object and `workout` for a collection.

## Historical UI terminology revision (2026-10-05; superseded by v5 above)

Workout now means an ordered collection of exercises. This changes generated
instruction prose, not schema v4 or its strict older readers. `days`, `dayId`,
`trainingDaysPerWeek` and the legacy standalone-exercise `kind: "workout"` value
retain their published meanings. Examples/IDs and user-authored text are not
rewritten. Backup schema v10 and IndexedDB v5 are unchanged.


### Exercise merges (2026-10-06)

AI v5 is unchanged. Normalized-name matching for new imports uses only active,
surviving library templates. Retired merge-source records are excluded from matching
and picker choices. Existing explicit source references remain valid through the
profile-owned redirect chain; importing/editing a prescription never rewrites older
snapshots or infers a merge from its name. Library merging is a separate confirmed
operation in Create > Exercises, documented in [merge verification](exercise-merge-verification.md).

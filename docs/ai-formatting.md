# AI formatting and Create refinements

The application generates authoritative instructions from
`src/features/create/interchange.ts` and schema-checked examples in
`src/schemas/interchange.ts`. The current public contract is **AI v4**, with
strict v1/v2/v3 readers. Database v5 remains unchanged; backups use their
separate v10 format with strict v1-v9 compatibility.

Every v4 envelope has exactly `schemaVersion: 4`, `kind: "plan" | "workout"`,
and the matching `plan` or `workout` payload. No internal IDs are accepted.

For a plan, `name` and a finite positive safe-integer `durationWeeks` are required.
Optional `instructions` and `notes` are separate plain-text strings, each at most
20,000 characters; null is invalid. The required `mode` chooses exactly one shape:

- `"repeating"`: `trainingDaysPerWeek` (1-7) and ordered `days` of exactly that length.
- `"unique"`: `uniqueWeekCount` (at least 2) and ordered `weeks` of exactly that
  length. Each week has its own `trainingDaysPerWeek` (1-7) and matching `days`.
  `uniqueWeekCount` must divide `durationWeeks`; global `days` or a global day
  count are forbidden. A one-week plan therefore uses repeating mode.

Days retain their ordered exercise snapshots and declared supersets. Exercise
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
kind and payload must match. Workout is a standalone exercise; only Plan supports
day/group membership and rest fields. No IDs or unsupported fields are accepted.
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

The public discriminator and payload key remain `workout`; UI terminology is
Exercise. No public JSON fields or stored compatibility fields were renamed.

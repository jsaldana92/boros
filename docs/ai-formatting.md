# AI formatting and Create refinements

The application generates the authoritative instructions from
`src/features/create/interchange.ts` and schema-validated examples in
`src/schemas/interchange.ts`. The public contract is **AI v3**, with strict
legacy v1/v2 compatibility. Database v5 is unchanged. Backups now use schema 7
with strict schemas 1–6 reading.

AI v3 adds optional `plan.instructions`: plain text, at most 20,000 characters;
null is invalid. Omission stays absent, and blank is allowed. It is separate
from exercise instructions, plan notes and session notes. Prompts forbid
inventing it or combining/copying exercise instructions or notes. The editable
plan preview labels this field **Instructions**. Saved plans, duplicates,
new frozen training snapshots and JSON/CSV backups preserve it. Editing the
plan does not rewrite historical snapshots. Notes remain outside this strict
public format and may be added separately in the preview.

Version 1 and 2 payloads retain their original allowed fields and do not accept
plan instructions; use v3 when supplying that field. Older plans with no field
continue to load without manufactured text. Version 1 still requires duration
entry in the preview. The public workout shape is unchanged apart from the
v3 envelope. Examples and both generated prompts use the current version.

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

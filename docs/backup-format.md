# Boros profile backup, schema 1

Implemented by Phase 8. This is separate from the external AI interchange format.
Restore, rename/new-profile import, replacement, merge, and profile Clear Data are
not implemented. No export/import/export round trip has been verified.

## Archive layout and authority

```text
manifest.json
data.json
csv/profiles.csv
csv/tags.csv
csv/library_exercises.csv
csv/library_sets.csv
csv/exercise_tags.csv
csv/plans.csv
csv/days.csv
csv/prescriptions.csv
csv/prescription_sets.csv
csv/prescription_tags.csv
csv/schedules.csv
csv/schedule_revisions.csv
csv/schedule_assignments.csv
csv/drafts.csv
csv/draft_results.csv
csv/sessions.csv
csv/session_results.csv
csv/notes.csv
csv/progress.csv
csv/assets.csv
csv/asset_references.csv
photos/<asset UUID>.jpg|png|webp
```

`data.json` plus the manifest and photo bytes are the authoritative restore source.
CSVs are readable views; do not reconstruct nested records from them. JSON retains
saved strings exactly, stable IDs, object values, optional fields, and array order.
An undefined optional property is omitted by JSON serialization; no missing value
is replaced with zero. Explicit nulls remain null (schema 1 allows null for optional
profile age/height/photo reference). Current UI services ordinarily omit those
fields rather than write null. Record timestamps/revisions are not regenerated.

`src/schemas/backup.ts` defines the executable payload/manifest schema and required
reference checks. Database version stays 5: exporting adds no tables, migrations,
or writes. The manifest separately records backup schema `1`, database schema `5`,
and the real `package.json` app name/version (`boros`, currently `0.0.0`). That
package value is not an invented release number.

## Manifest

| Field | Meaning |
| --- | --- |
| `format`, `backupSchemaVersion` | `boros-profile-backup`, 1; independent of AI/database versions |
| `databaseSchemaVersion`, `app` | Actual supported source database version and package name/version |
| `profile` | The captured profile's ID, name, and Guest/named kind; no active-profile selection reference |
| `snapshotAt` | UTC timestamp at the end of the consistent read transaction |
| `exportedAt` | UTC timestamp when the manifest is built from that captured snapshot |
| `snapshotPolicy`, `exclusions` | Saved-data scope and intentionally omitted browser/transient state |
| `counts` | Root records: profiles (1), tags, exercises, plans, schedules, drafts, sessions, measurements, assets |
| `csvRows` | Data rows per CSV path, excluding headers; nested record totals are reflected here |
| `inventory` | Every payload file's safe path, media type, uncompressed byte length and lowercase SHA-256 |
| `assets` | Photo metadata from data.json, plus each file's SHA-256 |
| `authoritative`, `checksum` | Authority and checksum-coverage declarations |

SHA-256 covers the exact uncompressed bytes of **every file except manifest.json**:
data.json, all CSVs (including their UTF-8 BOM), and photos. The manifest has no
self-referential checksum. These hashes detect corruption; they are not a digital
signature or proof of authenticity. Directory entries are not generated.

Paths use fixed names and validated UUIDs, never profile/exercise names. Photo
extensions derive from stored MIME type. Each asset ID gets one file even when
several records refer to it; different asset IDs remain separate even if their
bytes happen to match. Original stored bytes are exported without recompression
or resizing. ZIP compression is STORE for images and DEFLATE for text.

## Canonical data and relationships

| Key | Fields and relationships |
| --- | --- |
| `profile` | ID, kind, name/nameKey, optional age/heightCm/photoId, weightUnit/heightUnit, revision, createdAt/updatedAt. Current weight is derived, never a copied field. |
| `tags` | Profile-owned ID, name/nameKey, creation/update time, optional archivedAt. |
| `exercises` | Profile-owned library ID, name keys, archive/revision/timestamps, ordered sets, tagIds, optional rest/instructions/notes/tutorial URL. |
| `plans` | Profile-owned ID, name keys, archive/revision/timestamps, ordered days and exercise occurrences. Each occurrence has its own ID, a complete prescription and optional provenance source. |
| `schedules` | Profile-owned ID and planId, revision, stored IANA zone/startWeek, optional stoppedFrom, timestamps, ordered revision history. Each revision retains ID, effectiveFrom/exclusive effectiveUntil, creation time, planRevision/name, complete days, mapping and optional needsRepair. |
| `drafts` | Profile-owned ID, sourcePlanId/sourceDayId, revision, activeSourceKey if unfinished, planName/day snapshot, raw input/results/applied notes, startedAt/updatedAt and optional finalizedAt/occurrence metadata. Finalized drafts are retained too. |
| `sessions` | Profile-owned ID/draftId, source plan/day, revision, frozen day/prescription snapshot, actual exercise/set results and notes, partial flag, startedAt/completedAt/loggedAt, optional occurrence metadata. |
| `measurements` | Profile-owned ID, weightKg, measuredAt/loggedAt and optional updatedAt/revision/photoId/local-time/zone/offset/mutation metadata. Legacy omissions remain omitted. |
| `assets` | Profile-owned photo ID, original role/creation time/dimensions, MIME mediaType, bytes and safe archive path. Replaces the non-JSON Blob value; profile.photoId and measurement.photoId refer here. |

Every owned record's profileId equals the exported profile ID. Required tag,
plan, schedule/revision, finalized-draft/session and photo references must resolve.
Invalid/missing required records abort the entire export with a record-specific
error; records are never silently dropped to produce an apparently complete ZIP.
Session results must agree with their frozen prescription and finalized draft.

Array positions are meaningful, independent of IDs. A library exercise ID is not
a plan/session exercise-occurrence ID. Copied prescriptions include ordered sets,
per-set rep/RIR ranges, tag **names**, and optional instructions, notes, tutorial
and rest fields. Their optional `source` is provenance, not live content: a source
plan day/occurrence may have been removed or changed. These informational pointers
do not invalidate a self-contained historical snapshot or replace it with current
library data. Required plan-family parents are still included, even if archived.

Occurrence identity retains `scheduleId:dayId:scheduledDate`, scheduledWeek,
timeZone and scheduleRevisionId. Session/draft occurrenceKey agrees with that
reference. Do not generate/export an infinite calendar: schedules and revision
intervals reconstruct ordinary dates, while retained draft/session identities
preserve started exceptions after a remap/stop. Old snapshot day IDs need not be
present in the current edited plan.

All profile-owned photo records are included, even if currently unreferenced;
export is not cleanup. Asset references are separate from the asset's original
role, so shared avatar/progress references remain possible and intact.

## Units, dates and missing values

- Height is canonical centimeters; 1 inch = 2.54 cm. Weight is canonical kg;
  1 lb = 0.45359237 kg. Display preferences are saved on the profile.
- Prescribed sets use positive integer reps min/max and optional nonnegative
  integer RIR min/max. Equal bounds are fixed targets. Rest fields are seconds;
  absent means unspecified, while 0 explicitly means no timed rest.
- Draft results preserve raw load/reps/RIR strings, including incomplete input,
  and their recording unit. Completed results retain canonical weightKg and the
  actual entered load/unit/reps/optional RIR. A skipped set has only skipped=true;
  missing results are not fabricated zeros.
- Event timestamps use UTC ISO strings. startedAt means session start,
  completedAt means explicit completion, loggedAt means record creation, and
  updatedAt means last record mutation. MeasuredAt is when weight was measured,
  distinct from when entered/edited. Latest weight uses measuredAt then greatest
  ID on ties, not ZIP/array/insertion order.
- Scheduled dates/week/effective boundaries are local civil YYYY-MM-DD in the
  saved schedule IANA zone, not UTC instants. Measurement local/zone/offset context
  is retained when present. Legacy records without it are not assigned a guessed
  zone. offsetMinutes follows JavaScript getTimezoneOffset (UTC minus local).

## CSV presentation and joins

All 21 tables exist, including header-only empty tables. Files use UTF-8 with BOM,
comma delimiters, CRLF separators, and Papa Parse quoting for commas, quotes and
multiline text. Blanks mean missing/null/empty text; CSV alone cannot distinguish
those three. Numeric zero is `0`, false is `false`; numeric data is not prefixed.

Dangerous **string** cells receive one leading apostrophe if they begin with
`=`, `+`, `-`, `@`, their full-width counterparts, tab/CR/LF, including after leading
whitespace. This protection is CSV presentation only; JSON retains exact text.
Literal strings that already start with an apostrophe remain untouched. Do not
remove CSV protection or treat CSV text as commands. Spreadsheet applications
may apply their own date/number formatting; use text import where exact display
matters. Actual spreadsheet behavior remains a manual check.

| Tables | Join/order semantics |
| --- | --- |
| profiles, tags, library_exercises, plans, schedules, progress, assets | Original IDs, ownership, state and timestamps; nested arrays appear in child tables |
| library_sets, exercise_tags | libraryExerciseId; 1-based setOrder/tagOrder; tagId links tags |
| days, prescriptions, prescription_sets, prescription_tags | Context is profileId + ownerKind + ownerId + optional scheduleRevisionId. ownerKind is plan, schedule_revision, draft or session. Then join dayId and exerciseOccurrenceId; dayOrder/exerciseOrder/setOrder/tagOrder are 1-based. sourcePlanId links the plan family. |
| schedule_revisions, schedule_assignments | scheduleId; revision ID and 1-based revisionOrder preserve history; scheduleRevisionId links assignments. assignmentOrder is 1-based; weekday is 0 Monday through 6 Sunday. |
| drafts, draft_results | draftId, sourcePlanId/dayId, exerciseOccurrenceId and 1-based exercise/set order; loadText/repsText/rirText deliberately stay raw strings |
| sessions, session_results | sessionId plus sourcePlanId/dayId and exerciseOccurrenceId/order; canonical kg, recording load/unit, actual reps/RIR and skipped state |
| notes | Same owner context; noteKind is prescription, session or exercise. Includes saved/applied notes, not uncommitted note-dialog input. |
| asset_references | profileId + ownerKind (profile or measurement) + ownerId → photoId |

See the stable column lists in `src/features/backups/csv.ts` for each CSV's exact
header. Prescription snapshots are exported separately for each owner/revision;
do not join only by occurrence ID across historical snapshots.

## Consistency, exclusions and download behavior

The selected profile ID is captured before the first await. One read-only Dexie
transaction reads that profile and all eight owned stores, including Blob values.
Competing writes cannot produce a mixture of incompatible versions. Hashing,
Blob byte reads, CSV creation, ZIP compression and validation happen afterward in
a worker. The generated ZIP is reopened and its inventory, manifest, canonical
payload, counts, CRC and SHA-256 checks are verified before download starts.

Export includes only committed database state. The UI requires acknowledging
this scope, tells users to save/apply notes and wait for **Draft saved locally**
in every tab, and blocks when the current Settings form is dirty. It cannot flush
another tab's pending/failed autosave. Commits before the snapshot are included;
later commits are not. A captured snapshot stays bound to its original owner.

Browser-wide theme, storage-notice acknowledgement and active-profile selection
are excluded, along with navigation/sessionStorage, object URLs, active rest
timers, interval state, unsaved editor forms and unapplied notes. No application
credentials, environment files or machine paths are read. User-authored text
remains exact; it is not filtered for strings that happen to resemble a path.

The download name is `Boros-<sanitized profile name>-<UTC timestamp>.zip`.
Names are never archive paths. The ZIP is personal and unencrypted. Duplicate
clicks are locked; progress names real preparation stages and compression progress.
Cancel, leaving Settings, or switching profiles terminates preparation and ignores
late results. Export makes no source writes even on failure. The UI says
**Download started**, not that the browser saved the file. Download object URLs
are revoked after 60 seconds (or released with the document on teardown).

Worker processing keeps packaging off the UI thread, but snapshots, bytes, ZIP
and validation buffers occupy memory. There is no tested large-data capacity
promise, streaming download, or automatic photo resizing. Browser download
permissions and physical mobile save-sheet behavior still need manual checks.

## Phase 9 compatibility boundary

The single-profile scope, stable IDs/nameKeys and explicit relationships support
an independent new-profile import (new profile ID, consistent ownership rewrite),
full replacement, or rename under an unused normalized name. Profile-owned
compound keys permit retained internal IDs; any remapped IDs require all foreign
keys, occurrence keys and active-source indexes to be rebuilt consistently.

Plan-family membership is explicit: plan → days/prescriptions → schedules and
their complete revision snapshots → drafts/sessions/associated notes, via planId
and sourcePlanId. Future whole-family precedence selects one complete conflicting
family, including its unique logs, rather than unioning losing history. Library
exercises/tags and independent progress/assets are separate; references still
needed by winning records must survive. Stable-ID then normalized-name matching
and ambiguity checks are Phase 9 responsibilities. The contract preserves nulls
for future precedence, archive state, name keys, revision metadata and original
text; it does not choose a merge winner.

The current generated-archive checker is **not** an untrusted upload validator.
Phase 9 must add archive/expansion/file-count limits, unsafe/duplicate path checks,
unsupported-version handling, full schema/reference checks, reviewable conflict
previews, revision rechecks and atomic restore transactions. Only then can a
semantic export → import → export round trip be claimed verified.

Implementation references: [Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction()),
[JSZip asynchronous generation](https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html),
and [Papa Parse CSV serialization](https://www.papaparse.com/docs#unparse).

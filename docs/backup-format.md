# Boros profile backup, schema 12 (schemas 1-11 supported)

Current exports pair **backup v12 / database v6**. V12 adds optional `mergedIntoId`,
`mergedAt`, and `mergeOperationId` to retained library exercise records and columns
of `csv/library_exercises.csv`. All original prescription/text/tag/timestamp fields
remain on the retired source. There are still 32 CSV tables. No database migration
or data rewrite is needed: these are optional record fields in the existing store.

Merge relationships are profile-owned, explicit stable-ID redirects. Sources are
excluded from normal library/archive selection and cannot be edited/restored as
active records. Readers follow chains (A into B, B into C resolves A/B to C) without
rewriting historical names, prescriptions, occurrence/set IDs, notes or results.
Validation rejects self-links, cycles, missing/foreign destinations and incomplete
merge metadata. Profile clear includes these records in the existing exercise store.

Exercise restore matching now uses **IDs only**, for every supported input version.
An unrelated same-name exercise is not an identity match; conflicting active names
require a separate profile or name resolution. Plans/workouts/tags keep their existing
matching rules. Matching exercise IDs use reviewed precedence; an existing retired
device identity is never reactivated by a pre-merge imported record. Its redirect
survives even when imported metadata wins. If selected redirects would create a
cycle, restore rejects the preview rather than silently breaking a relationship.
Replacing a plan family never removes unrelated library redirects or standalone history.

Strict backup v1-v10/database v5 and v11/database v6 archives remain readable. Original
JSON, inventory, CSV headers, photo bytes and SHA-256 checksums validate before
promotion to v12. Only v1-v10 receive an empty workout collection; v11 workouts and
standalone sessions stay intact. Older schemas reject the new merge fields.

V11 adds `workouts`: profile-owned, revisioned, archivable templates with normalized
active names, stable root/occurrence/group/set IDs, timestamps, ordered exercise
prescriptions, and optional instructions/notes. Plan and session day snapshots
can retain `sourceWorkoutId`; each copy gets independent execution IDs. Existing
exercise provenance remains explicit. `csv/workouts.csv` adds the library inventory;
`days.csv` adds source workout/instructions/notes and uses ownerKind `workout` for
library prescriptions. The current archive has **32 CSV tables**. V1-v10 fields
and headers are frozen.

Standalone/custom drafts and sessions carry `source: { kind: "workout", workoutId }`
or `{ kind: "custom", workoutId? }` plus a captured `timeZone`. They omit plan and
occurrence metadata; validation rejects hybrids and missing referenced workouts.
Only an unfinished custom draft may have zero exercises. Finalized draft/session
source, time context, snapshots and actual results must agree. Draft/session CSVs
add `sourceKind`, `sourceWorkoutId`, and `completionTimeZone`. Results/private notes
remain separate from reusable prescriptions.

Workout libraries merge independently by stable ID/normalized name with the selected
precedence, remapping copied source references. They do not belong to plan families.
Standalone draft/session pairs merge by session ID only, never workout ID/name/date;
reimport is idempotent. Replacing a conflicting plan family retains unrelated
standalone records and workouts. New-name/replace/clear includes the new collection
in the existing reviewed, atomic profile operation. Clearing one profile never
clears another. Checksums and photo verification are unchanged.

Export was implemented in Phase 8; reviewed restore and profile Clear Data in
Phase 9. These formats are separate from AI v5. The following older format notes
remain historical descriptions; v12 includes their supported fields.

Group 4 Progress statistics are derived from the existing canonical sessions,
prescription snapshots, source references and measurements. Graph selection,
computed counts/extrema, colors and drill-down state are not persisted or added
to archives. Group 4 itself did not change the format; its tests
verify underlying records and derived results through new/replace/both-merge
restoration. See [Group 4 verification](group4-verification.md) for analytics rules.

Schema 4 introduced optional `templateId` to prescription occurrences and to
`csv/prescriptions.csv`. It records the reusable defaults reference for repaired
legacy plans while keeping `source` provenance intact. Export retains the field in
all saved snapshots. Current-plan template references must resolve; historical
snapshots retain their original provenance and need not track the current library.
The strict v1/v2/v3 field sets and CSV columns remain frozen; they reject this v4
field. Original ZIP bytes, hashes, CSV tables, relationships and photos are checked
before any compatibility transformation. SHA-256 verification is unchanged.

Schema 5 adds optional plan `notes` and program metadata inside existing schedule
records: `kind: "unscheduled"`, `identity: "program-week"`, `excludedWeeks`,
`weekMoves`, and `outcomes`. Keeping each run and its markers together makes status
changes and movements atomic and preserves the existing family-based restore
rules. No store/index change or eager database rewrite is required. Old schedules
retain their date-based occurrence keys. New unassigned weekly runs use
`scheduleId:dayId:week-N`; occurrence references retain `programWeek` and
`unscheduled: true` as well as their week, zone and revision. Their internal date
is a generation coordinate, not a claimed assigned weekday or performance date.

Schema 6 adds optional `closedAt` (an ISO UTC timestamp) to schedules and a
`closedAt` column to `csv/schedules.csv`. A closed run must also have `stoppedFrom`.
It is distinct from Stop Scheduling: the latter preserves unfinished sessions.
Closure permanently forbids resuming/writing that run while retaining completed
sessions, finalized drafts and explicit historical outcomes. No database schema
upgrade or historical-result rewrite is needed. Schema 1–5 fields/CSV inventories
remain strict and unchanged; original CRC/SHA-256 verification happens before
promotion to the current in-memory envelope.

Schema 7 adds optional plain-text `instructions` to plans and optional
`planInstructions` to schedule revisions, occurrence outcomes, training drafts
and completed sessions. Each allows at most 20,000 characters. They preserve
the distinction from plan notes, exercise instructions and session notes;
omitted fields stay absent. Historical snapshots remain frozen when the plan
changes. A finalized draft and its session must agree on plan instructions.
Existing family-based new/replace/device/import restore choices preserve the
winning snapshots, without merging text from another family.

Readable `csv/plans.csv` adds `instructions`. `csv/schedule_revisions.csv`,
`csv/occurrence_outcomes.csv`, `csv/drafts.csv` and `csv/sessions.csv` add
`planInstructions`. The same 28 linked tables remain; string-only spreadsheet
formula protection applies, while authoritative JSON retains exact text/newlines.
Strict schema 1–6 field sets and CSV columns are frozen. Original CRC/SHA-256,
CSV and asset validation precedes envelope promotion; no instructions are
invented, no records reset, and the source archive is never rewritten.

Schema 8 adds optional run `hiddenAt` (UTC timestamp), `occurrenceExceptions`
(frozen occurrence references), and revision-level `unscheduled: true`.
Hidden runs remain in statistics and exports; this flag never archives a template.
When an unscheduled run gains a Calendar assignment, its old revisions retain
their unscheduled classification. Old results/outcomes/drafts are not relabeled.
The run-level kind describes its current or final association; closing a scheduled
run retains that association for Previous Plans.

Reassignment exceptions replace one training day in its saved week. Their original
date, key, zone, program week, and revision/day references are validated, including
uniqueness per run/day/week. They preserve recorded work while untouched days move.
ID remapping during restore remaps exception schedule IDs and keys together.
Reset removes the run's prior history/markers/exceptions/gaps and gives its retained
prescription a fresh revision ID. End keeps closure/history; Delete removes the
selected run family. These operations create no archive tombstones or timers.

`csv/schedules.csv` adds `hiddenAt`, `csv/schedule_revisions.csv` adds `unscheduled`,
and `csv/occurrence_exceptions.csv` adds a linked table, for **29 CSV tables**.
Strict v1–v7 field sets and CSV layouts remain frozen; those versions reject
v8-only fields. Absent optional fields stay absent. IndexedDB stays `boros` v5;
no store, index, database name, eager migration, or reset is introduced.

Schema 9 adds optional session-only `structure` to drafts and completed sessions:
`{ amended: boolean, exercises: [{ id, sets: [{ id, round }] }] }`. Exercise entries
match the frozen day order; every set has a UUID and a positive, ordered round.
The arrays match prescription/result counts. Round numbers permit unequal
supersets to append all new member sets in one new final round without fabricating
intermediate results. Existing prescriptions and set IDs cannot be overwritten by
an amendment. New sessions allocate identities at start; legacy sessions acquire
them only when amended. Older stored records are not eagerly rewritten.

The draft's frozen `day` contains the full amended prescriptions, independent
exercise occurrences and source-library references. `amended: true` keeps a
structure-only draft recoverable after Clear. Completion copies the same structure
into history; draft/session metadata must agree. New-profile restore retains set
and occurrence IDs within the new profile scope. Existing family merge rules and
source-reference remapping apply unchanged. Plan definitions and AI v3 do not gain
session-only fields. Statistics include the added results; program day totals do
not increase.

`csv/session_structure.csv` adds owner kind/ID, amendment flag, occurrence ID, set
order, set ID and round: **30 CSV tables** in v9. Strict v1-v8 schemas/CSV layouts
remain frozen and reject the new fields. CRC/SHA-256, linked snapshots, photo bytes
and original version-specific CSV checks run before envelope promotion. Active
count-up/countdown timers and the Settings return pointer remain excluded from
backups. IndexedDB stays `boros` v5: no store/index migration or reset.

Schema 10 adds optional `weeks: [{ id, dayIds }]` to a plan and each frozen
schedule revision. It is an ordered cycle of at least two definitions. Each
`dayIds` array owns 1-7 ordered days; concatenating the arrays must exactly equal
the flattened `days` array, with no omissions, duplicates or foreign references.
Absent `weeks` retains the original single repeating lineup and legacy unbounded
behavior. Unique cycles require a finite duration divisible by their count.

Cycle prescription occurrences carry ordered `setIds` UUIDs, one per target.
Week, day, group, occurrence and set identities are unique within the prescription.
New session structures reuse prescribed set identities; session additions append
fresh identities without changing the plan. Legacy snapshots remain untouched.
Mappings retain `dayId`/`weekday` entries, validated independently inside each
unique week; Monday may be used in multiple definitions. Actual program week is
resolved after excluding postponed gaps, independently of definition index and
calendar date. New cycle runs use distinct `scheduleId:dayId:week-N` keys; old keys
remain unchanged. Revisions, protected exceptions, drafts, frozen outcomes and
completed sessions retain their existing reference and checksum validation.

Readable v10 exports have **31 CSV tables**. `unique_weeks.csv` links owner kind,
plan/run ID, schedule revision ID, week UUID/order, and day UUID/order.
`prescription_sets.csv` adds `setId` for stable target correspondence; older
snapshots leave it blank. Existing assignment rows join to definitions through
their day IDs. Original v1-v9 fields, table inventories and columns remain frozen;
v9 rejects cycle-only fields. Validation of original bytes, CRC, SHA-256, CSVs
and photos happened before promotion to v10 (now to v12 as described above). Restore
retains whole-plan-family precedence and internal references; no browser data is
cleared or eagerly rewritten. The cycle revision kept `boros` v5; the Workout
revision now adds only the v6 workout store. Timers and navigation preferences remain excluded.

After merge precedence and identity remapping, restore removes only unfinished
drafts whose exact profile/run/source-plan belongs to an explicitly closed run,
and which are not linked to completed history. The preview reports this as
**Closed-run compatibility cleanup**, with adjusted added/removed counts. Repeated
restore cannot bring back resumable closed-run drafts. Selection, archiving, names
and `stoppedFrom` alone never imply closure; ambiguous old drafts stay intact.
Normal startup/profile selection applies the same idempotent rule transactionally,
including any matching persisted timer. Backups still exclude timer state.

An outcome has its own UUID, reference, frozen day/name, status (`skipped`,
`completed`, or corrected `pending`), revision, `recordedAt` and `updatedAt`.
These timestamps describe marking/correction, never performed exercises. Markers
do not contain results. Pending corrections retain marker identity and remain
protected from week movement. Active markers cannot overlap a draft/session.
Validation checks ownership, reference keys, program week, zone, unique markers,
and excluded-week consistency. Gaps are sorted unique Monday labels. Civil-date
endings include gaps, including the duration-change history. Move records retain
their UUID, original week, direction and recorded timestamp.

The canonical JSON contains complete snapshots. New linked CSVs are
`program_runs`, `occurrence_outcomes`, `excluded_weeks`, and `week_moves`; the plans
CSV adds `notes`. Manifest counts additionally include outcomes and excluded weeks.
Restore remaps run references and keys together if a schedule ID collides, retaining
all markers, gaps, revisions, snapshots and actual completion timestamps. Merge
priorities still apply to whole plan families; they never merge competing run
histories by name. Strict older field sets and CSV inventories remain frozen;
new weekly fields cannot be smuggled into an older envelope.

After validation and merge/identity mapping, the restore preview materializes
missing templates from current plans in its proposed result. The counts and warning
show this transformation before confirmation; atomic commit saves that exact result.
Repeated merges reuse valid IDs or active normalized names and do not multiply
templates. Deterministic legacy template IDs reuse the first occurrence UUID in
the separate template keyspace, or preserve a recorded missing explicit template
UUID. Conflicting identities fail visibly instead of guessing. New template/tag
timestamps use the repair instant; existing timestamps and prescriptions stay exact.
Changed plan links increment the plan revision. History is never joined by name or
rewritten by this repair; ordinary restore ownership/merge mappings still apply.
Original AI defaults may no longer be recoverable after edits. Defaults come from
the earliest retained active plan snapshot (created time, ID, day/occurrence order),
then archived plans; archived-only templates stay archived. A valid existing
template is reused without overwriting defaults. This supersedes the old catalog
projection and does not require a database reset, new database version or reimport.

## Archive layout and authority

```text
manifest.json
data.json
csv/profiles.csv
csv/train_selections.csv
csv/tags.csv
csv/library_exercises.csv
csv/library_sets.csv
csv/exercise_tags.csv
csv/plans.csv
csv/days.csv
csv/prescriptions.csv
csv/prescription_sets.csv
csv/prescription_tags.csv
csv/supersets.csv
csv/schedules.csv
csv/program_runs.csv
csv/occurrence_outcomes.csv
csv/occurrence_exceptions.csv
csv/excluded_weeks.csv
csv/week_moves.csv
csv/schedule_duration_changes.csv
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
reference checks. Exporting itself performs no migrations or writes. The current
manifest records backup schema `12`, database schema `6`,
and the real `package.json` app name/version (`boros`, currently `0.0.0`). That
package value is not an invented release number.

## Manifest

| Field | Meaning |
| --- | --- |
| `format`, `backupSchemaVersion` | `boros-profile-backup`, 10 for new exports; independent of AI/database versions |
| `databaseSchemaVersion`, `app` | Actual supported source database version and package name/version |
| `profile` | The captured profile's ID, name, and Guest/named kind; no active-profile selection reference |
| `snapshotAt` | UTC timestamp at the end of the consistent read transaction |
| `exportedAt` | UTC timestamp when the manifest is built from that captured snapshot |
| `snapshotPolicy`, `exclusions` | Saved-data scope and intentionally omitted browser/transient state |
| `counts` | Root records: profiles (1), tags, exercises, plans, schedules, drafts, sessions, measurements, assets; v5 also counts nested outcomes and excluded weeks |
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
| `profile` | ID, kind, name/nameKey, optional age/heightCm/photoId/timeZone/selectedPlanIds, weightUnit/heightUnit, revision, createdAt/updatedAt. Current weight is derived, never a copied field. Train selections are unique UUID references to owned plans, including archived ones. |
| `tags` | Profile-owned ID, name/nameKey, creation/update time, optional archivedAt. |
| `exercises` | Profile-owned library ID, name keys, archive/revision/timestamps, ordered sets, tagIds, optional rest/instructions/notes/tutorial URL. |
| `plans` | Profile-owned ID, name keys, archive/revision/timestamps, optional instructions/notes and durationWeeks (absent means legacy unbounded), ordered days and exercise occurrences. Each occurrence has its own ID, complete prescription, optional provenance source and groupId. Days optionally contain groups with stable ID, positive day-local number and optional restBetweenRoundsSeconds/restAfterGroupSeconds. |
| `schedules` | Profile-owned ID and planId, revision, stored IANA zone/startWeek, optional stoppedFrom, timestamps, ordered revision history; optional durationWeeks/inclusive endDate and ordered durationChanges. Each duration change has a stable ID, Monday effectiveFrom and optional durationWeeks/endDate. Each prescription revision retains ID, effectiveFrom/exclusive effectiveUntil, creation time, planRevision/name, complete days/groups, mapping and optional needsRepair. |
| `drafts` | Profile-owned ID, sourcePlanId/sourceDayId, revision, activeSourceKey if unfinished, planName/day snapshot, raw input/results/applied notes, startedAt/updatedAt and optional finalizedAt/occurrence metadata. Finalized drafts are retained too. |
| `sessions` | Profile-owned ID/draftId, source plan/day, revision, frozen day/prescription snapshot, actual exercise/set results and notes, partial flag, startedAt/completedAt/loggedAt, optional occurrence metadata. |
| `measurements` | Profile-owned ID, weightKg, measuredAt/loggedAt and optional updatedAt/revision/photoId/local-time/zone/offset/mutation metadata. Legacy omissions remain omitted. |
| `assets` | Profile-owned photo ID, original role/creation time/dimensions, MIME mediaType, bytes and safe archive path. Replaces the non-JSON Blob value; profile.photoId and measurement.photoId refer here. |

Every owned record's profileId equals the exported profile ID. Required tag,
plan, schedule/revision, finalized-draft/session and photo references must resolve.
Invalid/missing required records abort the entire export with a record-specific
error; records are never silently dropped to produce an apparently complete ZIP.
Session results and optional planInstructions must agree with their frozen
prescription and finalized draft. Schedule revisions, outcomes, drafts and
sessions may contain optional planInstructions independent of the current plan.

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

## Group 2 compatibility and linked CSV additions

Schema 2 extends every day snapshot (plan, schedule revision, draft and session)
with optional `groups`; occurrences optionally reference a day-local `groupId`.
Groups require unique IDs and positive numbers, at least two contiguous members,
and safe nonnegative integer rest seconds when present. Group number changes do
not change IDs. Array order defines execution; unequal sets remain untouched.
Session results reference occurrence IDs, never library IDs, group numbers or
names. Optional plan-copy provenance now carries `libraryId` when known, so
later analytics need not guess identity by name. Unknown provenance stays unknown.

`csv/supersets.csv` links profile, owner kind/ID, schedule revision, plan and day
to group ID/number, execution block order and group rest. `prescriptions.csv`
adds `groupId` and `sourceLibraryId`; existing occurrence IDs/order link each member
and its sets/results. `plans.csv` adds durationWeeks; `schedules.csv` adds frozen
durationWeeks/endDate; `schedule_duration_changes.csv` links each boundary change
to its owning schedule and effective date. Schema 1 CSV headers and inventory
remain exactly the earlier contract (without these columns/tables).

New plans require positive duration, but backups and existing v5 records may omit
it. Absence remains unbounded, never defaulted to a made-up number. Schedule end
dates must equal start Monday plus duration×7−1 civil days. Duration changes are
validated in increasing Monday order and select the applicable boundary without
rewriting earlier occurrences. Started/completed exceptions remain valid beyond
a later end date. Plan edits do not alter the frozen schedule boundary.

Upload accepts versions 1-12 with matching manifest/data versions: v1-v10
require database v5, and v11-v12 require database v6. It checks original ZIP paths/limits, CRC, byte lengths and SHA-256 inventory
before validating records against the version-specific strict field set, linked
references, CSV inventory/counts and original assets. Only after all checks pass,
v1-v11 canonical data is cloned with a v12 envelope (empty workouts only for v1-v10); no group/duration/preference,
historical week, closure, hidden flag, exception or plan instructions are invented and
the source ZIP/manifest bytes are not rewritten. Unsupported future versions fail.
The returned manifest remains the original validated version for provenance.
Checksums and photo decoding are never bypassed.

### Group 3 profile preferences

Schema 3 adds optional profile `timeZone` (supported IANA identifier) and
`selectedPlanIds` (unique, owned plan UUIDs). `csv/profiles.csv` adds `timeZone`;
`csv/train_selections.csv` has profileId, planId and selectionOrder. There are
24 linked CSVs. The v1 and v2 schemas freeze their original strict profile fields
and CSV contracts; they reject new preferences masquerading as an old version.

Archived selections remain valid references and stay hidden in Train until the
plan is restored. An explicit selection save replaces the list with checked,
usable plans. Missing/foreign references fail canonical validation, rather than
silently choosing an unrelated plan. Independent import keeps child plan IDs in
the new ownership scope; merges remap imported selection IDs through the same
plan-root map used by the winning family. Device/import precedence chooses the
entire profile's preferences. Replacement uses the imported preferences.

A validated older archive retains missing preferences until restore preview.
The proposed profile initializes only a missing time zone from the browser zone;
it does not invent a Train selection. Existing time zones are preserved, including
all schedule and measurement zones. This documented preference default is an
additional permitted semantic round-trip normalization for legacy profiles.
The committed operation remains one atomic, stale-checked ownership rotation.
Clear Data removes selections with plans but retains the time zone and units.

Whole-plan-family precedence is unchanged. Group/occurrence IDs are scoped by the
winning plan/day and its snapshots; they remain together through root ownership,
plan/schedule/draft identity remapping. Optional library provenance is remapped
when its library participates. Matching by name does not merge occurrence results
or groups from unrelated families. Both precedence modes and v2 round trips are
covered by Group 2 tests; legacy v1 validation/transform has a separate fixture.

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
this scope, tells users to save/apply notes and wait until **Saving...** disappears without an error
in every tab, and blocks when the current Settings form is dirty. It cannot flush
another tab's pending/failed autosave. Commits before the snapshot are included;
later commits are not. A captured snapshot stays bound to its original owner.

Browser-wide theme, Sound, storage-notice acknowledgement and active-profile selection
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

## Upload validation and limits (Phase 9)

Settings → Data → **Backup ZIP** accepts an original Boros schema 1-10/database v5 or schema 11-12/database v6
export. Unsupported versions explain that the user must update Boros or choose a
supported export. Import never guesses at a future schema or reads AI interchange
as a backup. Parsing, hashing, CSV row checks and image decoding run in a worker,
with progress and cancellation. Nothing is written during validation or preview.

| Limit | Maximum |
| --- | --- |
| Uploaded/compressed ZIP | 64 MiB |
| Total expanded payload, including manifest | 128 MiB |
| Archive entries | 4,096 |
| Each canonical JSON/CSV file | 32 MiB |
| Manifest | 2 MiB |
| Each image | 5 MiB; declared/decoded dimensions at most 4,096 per side |

These are rejection limits, **not a benchmarked capacity guarantee**. Original
exports exceeding them cannot currently be restored by this version; retain the
ZIP and use a version supporting its size. Export does not silently omit records
to satisfy restore limits. The worker and planner still hold snapshots/buffers in
memory; cancellation terminates the worker. No streaming-to-disk claim is made.

Raw central-directory and local headers are inspected **before JSZip loads the
archive**. They must agree on names, offsets, lengths, compression and CRC; entries
must be contiguous without hidden/overlapping data. Supported ZIP features are
classic single-disk STORE/DEFLATE, with no encryption, ZIP64, extra fields, data
descriptors, directory entries or symlinks. This is the subset emitted by the
installed Boros exporter; repackaged archives can be rejected. Only exact
`manifest.json`, `data.json`, known `csv/*.csv`, and UUID `photos/*` paths are
accepted. Absolute/traversal/backslash/unknown paths and duplicates/collisions
after NFKC/case normalization are rejected, never sanitized into another name.

Expansion checks count **actual streamed bytes** per file and in total, not just
directory sizes. CRC, byte lengths and SHA-256 inventory checks cover every payload;
file lists, profile identity, record counts, CSV row counts and asset metadata must
agree. Schema/reference checks include profile ownership, unique IDs/names/indexes,
required parents/assets, complete occurrence metadata, finalized-draft/session
agreement and historical prescriptions. Images require supported signatures and
successful decoding matching their metadata. Canonical JSON/assets alone create
records; CSVs are checked for integrity/structure/counts but never reconstruct data.
Checksums are integrity checks, not proof of a trusted author. Strings remain inert
React text. Upload does not render imported HTML, embed tutorials or fetch links.

## Preview, matching and family precedence

Profiles match by the existing NFKC, trimmed/collapsed-whitespace, lowercase name
key. A source profile ID never selects an existing target. An unmatched or renamed
profile imports independently; a new name must be unused after normalization.
For a name match, choices are **Replace this profile**, **Merge — prefer this
device**, **Merge — prefer imported file**, **Import under a new name**, and
**Cancel**. Export/modified timestamps are context only; chosen precedence wins.

The preview names the target and shows additions, conflicts, replacements,
removals and skipped records by store, with explicit session/draft/schedule removal
counts. A replacement counts all removed and newly restored records. Merge family
children count as removed/added, while matching plan/library/tag/measurement roots
count as replaced. All operations require the confirmation checkbox and **Confirm
and save**. Cancel, navigating away or switching profiles before commit writes
nothing. Dirty Settings edits must be saved or discarded first.

Plans match by stable ID first, normalized name second. Library exercises match by stable ID only (see the v12 rules above). If they
point to different candidates, names have multiple archived candidates, or multiple
incoming records identify one target, preview reports ambiguity; use an independent
new name or resolve the records first. Tags use their profile-scoped normalized
names and ID matching, with the same ambiguity protection.

Plan-family membership is plan → ordered days/prescriptions → schedules and all
revision snapshots → drafts/completed sessions/associated notes, using `planId`
and `sourcePlanId`. **Prefer this device** keeps the entire local matching family
and skips the entire imported family, including unique imported logs. **Prefer
imported file** removes the entire matching local family, including unique local
logs/drafts/schedules, and installs the imported family. Histories are never unioned
inside a conflict. Both modes retain unrelated local families and add nonconflicting
imported families. Libraries and tags are independent of family ownership.

Selected profile fields win as a complete source, including explicit nulls.
Measurements merge distinct IDs; matching IDs use selected precedence and appear
as conflicts with their actual dates. Differing date/origin metadata is called out;
distinct IDs sharing the same nonempty `lastMutationId` are an ambiguity requiring
separate import/review. Equal dates alone do not cause deduplication. Current weight
continues to use the existing latest-measurement service, including its ID tie rule.

Only photos referenced by winning profile/measurement records are installed.
Shared references remain; genuinely unreferenced photos are pruned. If local and
imported winning records require different bytes/metadata under one photo ID, the
imported asset receives a deterministic ID and its winning references are remapped.
Repeated identical merges create no extra records or remapped photo copies.

## Identity, concurrency and transaction boundary

Each committed restore/merge/replacement or Clear Data receives a fresh **local
profile ID**. For an existing target, its old ownership ID is retired in the same
transaction, preserving the selected logical profile/name but invalidating old
editors. All owned records move to the new compound-key scope. This deliberate
ownership remap avoids revision-number reuse letting an old tab overwrite restored
records, and prevents even delayed *new-record* saves recreating cleared data.
Existing services already check owner existence inside their transactions; no new
database version, migration, revision rewriting or browser-wide preference reset
is needed. Old tabs keep mounted form input with a recovery banner and can copy it,
then **Reopen workspace**. They cannot save into the replacement.

Internal record IDs remain unchanged when safe. Name matches map imported root
IDs to the matched local root ID. Child schedule/draft collisions with unrelated
retained families use deterministic SHA-256-derived UUIDs, independent of each new
ownership ID; unresolved collisions are explicit errors. Schedule references,
session/draft links, occurrence keys and active-source keys are rebuilt together.
Optional prescription provenance IDs are remapped if their source participates;
missing historical provenance remains optional. Frozen prescriptions, day IDs,
order, results, units, null/absent/zero distinctions, timestamps, schedule zones and
revision history are not reconstructed from the current library.

`buildRestorePlan` is a pure function of captured snapshots, choice, supplied ID
and time. The service keeps a private copy of that exact reviewed operation.
All incoming and required retained images are validated/decoded before the live
transaction. Commit opens one Dexie read/write transaction over the existing stores,
rechecks the complete target records and photo bytes, verifies name uniqueness,
retires the previous ownership scope, writes all selected records/assets, removes
only the affected profile's timer, and selects the result. Other profiles, theme and
storage-notice settings remain unchanged. A failure rolls everything back.

The byte-level concurrency check uses `Dexie.waitFor` for bounded Blob reads/SHA-256
inside the already-locked transaction; image decoding/ZIP parsing do not occur there.
Its default 60-second timeout aborts without partial writes. This adds CPU/locking
cost for large targets and remains part of the unbenchmarked capacity limitation.
Any changed target, including a same-size photo replacement, rejects the preview;
the user must rebuild it and confirm the changed consequences. Repeated clicks share
an in-flight operation/success receipt. After reload, existing normalized names and
stable record matching prevent an identical merge producing extra copies.

Clear Data uses the same preview, confirmation, stale-state checks, ownership
retirement and atomic transaction. It identifies the selected profile, offers
Download data first, deletes its owned records/assets/timer and demographic fields,
and retains its name/kind, time zone and weight/height unit preferences as an empty usable
workspace. It is separate from clearing one training draft. Cancel changes neither
records nor selection. Once Confirm and save starts, it is an atomic commit, not a
cancelable preparation step.

The verified semantic round trip allows only the new profile/ownership ID, requested
display name/nameKey/kind changes, regenerated manifest/export metadata and the
documented pruning of unreferenced photos. The representative round-trip fixture
references every asset, so every original image byte is compared. Independent merge
tests assert whole-family winners and unique losing logs; round-trip success alone
does not establish merge correctness. See TODO.md for exact current checks and the
still-unverified physical-device/accessibility checks. Phase 10's measured dataset,
complete UI-created round trip, network audit and native Windows WebKit Blob-storage
blocker are recorded in [phase10-verification.md](phase10-verification.md). Edge and
Firefox results must not be extrapolated to physical Safari or unlimited capacity.

## Moving between website addresses

Group 1 compatibility note: export/import and deterministic identity remapping still
use SHA-256 with full-precision records. A secure-UUID fallback does not provide
`crypto.subtle`, repair HTTPS or waive any checksum. Missing Web Crypto reports a
compatibility/valid-HTTPS requirement before a download or import commit; workers
retain the same guard. Do not clear an HTTP workspace when fixing the production
certificate. HTTP and HTTPS are separate origins, so retained records may need
recovery from their original origin in a supported secure environment. If hashing
is unavailable there, do not promise that this importer/exporter can run insecurely.

Localhost development, preview and `https://boros-app.com` have separate origin
storage. Scheme, host and port determine that boundary; changing a path alone
does not isolate data. Publishing static files does not upload or migrate records.
Profiles have no passwords or server copy, and clearing browser/site data can
remove them. Do not delete the source to test a move.

1. At the source address, save pending work and select the intended profile.
   Settings → Data → acknowledge saved-data scope → Download data. Confirm the
   actual original ZIP is present/readable on disk; “Download started” cannot
   confirm filesystem success. Repeat separately for each desired profile.
2. At the verified target address, use Settings → Data → Backup ZIP. Select the
   original schema 1-10/database v5 or schema 11-12/database v6 ZIP; do not unpack/repackage it or import CSVs.
   Review validation and counts. Prefer **Import under a new name** with an unused
   name if a name conflict exists; merge/replace have the destructive whole-family
   semantics documented above. Review, acknowledge and Confirm and save.
3. Reload the target. Check the profile, plans, saved sessions and unfinished draft,
   dates/time zones, notes, units, current weight and original photos. Re-export and
   compare records/photo bytes with the documented identity exceptions. Verify an
   unrelated target profile is unchanged. Retain the source and original ZIP until
   this is established. Theme/navigation/timers do not migrate.

Use isolated disposable contexts for release testing; do not clear an owner's
browser data. Photo-backed restore in Blob-capable WebKit/Safari remains a Phase 10
gate, and physical save sheets/real quota behavior remain unverified. Limits above
still apply: an oversized export may need a future compatible importer. This
procedure promises neither automatic sync nor offline cold start. Current release
readiness and the owner checklist are in [release-preparation.md](release-preparation.md).

Implementation references: [Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction()),
[JSZip asynchronous generation](https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html),
and [Papa Parse CSV serialization](https://www.papaparse.com/docs#unparse).
Upload safeguards also follow [JSZip load behavior](https://stuk.github.io/jszip/documentation/api_jszip/load_async.html),
[bounded stream access](https://stuk.github.io/jszip/documentation/api_zipobject/internal_stream.html),
and [Dexie transaction keep-alive](https://dexie.org/docs/Dexie/Dexie.waitFor()).

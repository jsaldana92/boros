# Boros

A React / TypeScript / Vite workout tracker. Phases 1-9 provide a themed shell with single-address navigation,
local profiles/settings, photos, dated weights, and an exercise library with
Create Workout, manual plans, validated external AI paste imports, training drafts/timers, saved-session review, recurring calendar schedules, Progress weight history/charts/photos, complete profile ZIP export, reviewed restore/merge/replace/rename, and profile Clear Data. See TODO.md for
the authoritative plan and verification record.

## Local development

Use Node 22 (verified with 22.19.0), run `npm ci` from the committed lockfile,
then `npm run dev`. Use **http://127.0.0.1:5173** consistently.
The port is strict so Vite cannot silently move browser data to another
origin. An existing project dev server can be reused by local browser tests.

## Checks

- `npm run test:data` - isolated IndexedDB service tests (Node 22).
- `npm run typecheck` — TypeScript project checks.
- `npm run lint` — existing Oxlint configuration.
- `npm run build` — TypeScript checks and production bundle in `dist`.
- `npm run test:browser` — Playwright smoke tests against development.
- `npm run test:browser:preview` — run after build; tests production preview.
- `npm run test:browser:static` - run after build; full suite on plain static root and project-subpath mounts without SPA rewrites.
- `npm run preview` — serve `dist` at http://127.0.0.1:4173.

Browser tests use an installed Microsoft Edge browser, desktop and phone
viewports, and save screenshots in ignored `test-results`. Install Edge if it
is unavailable. These checks do not cover real iOS Safari or Android devices.
Development and preview are different origins; local data will not be
shared between them.

Phase 10 adds `playwright.engines.config.ts` (Firefox/WebKit production checks)
and `playwright.capacity.config.ts` (one disposable larger-profile experiment).
Commands, dataset sizes, timings and engine limitations are in
[the Phase 10 verification record](docs/phase10-verification.md). The full Windows
WebKit run currently fails native IndexedDB Blob storage, so photo/restore coverage
there is **pending**, not passed. Use TODO.md's current handoff for final totals.

## Support configuration

Production builds read the owner's supplied
`VITE_KOFI_URL=https://ko-fi.com/jhonatansaldana` from `.env.production`.
For development, set the same public value in `.env.local` if wanted; otherwise
Support stays unavailable. Shell environment variables and `.env.local` can override
the production value, including with an empty value: check the actual built Settings
link after changing configuration. Restart development or rebuild for changes.
Blank/invalid values retain an honest unavailable state. Valid links open only on
click, in a new tab with `noopener noreferrer`; no automatic embed or request.

## Implementation notes

The existing React, Router, Lucide, Vite, TypeScript, and Oxlint setup is reused.
Tailwind 4 uses its [official Vite integration](https://tailwindcss.com/docs/installation/using-vite).
React Router memory routing keeps every screen at the same public address;
relative build assets support deployment beneath a path. Shared shell components live in
`src/components/layout`; navigation and configuration live in `src/app`.
Implemented feature modules live in `src/features`; database operations remain in services.

## Single-address navigation and static hosting

Train, Create, Calendar, Progress, and Settings use the same public address.
Navigation controls are buttons, so modified clicks, new-tab actions, and copied
link addresses cannot expose nonexistent server routes. Routing and guarded
navigation are centralized in `src/app/`; feature screens do not construct URLs.

The last successfully opened screen is stored as one allowlisted screen ID in
`sessionStorage` (`boros.navigation.screen`). Refresh in the same tab restores
that screen. Missing, invalid, or inaccessible storage falls back to Train.
This preference contains no records or form input: unsaved Create/Settings/Calendar/Progress editors are not
recovered on refresh. Successfully saved training drafts are recovered separately
from IndexedDB using Resume in Train. Existing discard confirmations and browser-unload warnings
remain in place. Canceling navigation preserves the current screen and preference.

Internal navigation adds no browser history entries. Browser Back/Forward moves
between visited websites/documents and may leave Boros. Settings offers an in-app
return to the previous internal screen, or Train when opened directly or after
refresh. Copied/bookmarked addresses open Boros, not a particular screen; the
receiving tab's valid preference determines its initial screen.

Old top-level `#/train`, `#/create`, `#/calendar`, `#/progress`, and `#/settings`
addresses are recognized at startup and take priority over the remembered screen.
Their hashes are removed with history replacement while retaining the actual
hosting path and any existing query. Unknown hashes open Train and are removed.

Deploy the contents of `dist` at either a custom-domain root (`/`) or a GitHub
Pages project directory (for example `/your-project/`). Keep Vite's relative
`base: './'` and serve the directory's `index.html` at its trailing-slash address.
No domain or project directory is hardcoded in the app, and no SPA rewrite or
custom 404 page is needed. Screen-specific server paths intentionally do not exist.
`tests/static-server.mjs` is only a verification host; it mounts the same build at
`/` and `/project-check/` and returns 404 for missing files and screen paths.

Navigation preferences are separate from the versioned IndexedDB records.
Browser storage remains origin-specific; changing host, protocol, or port does
not transfer data between origins.

## Local persistence and migrations

`src/db/database.ts` defines IndexedDB database `boros`, schema version 5 (additive schedules store and optional unique occurrence indexes on drafts/sessions; all v1-v4 records retained).
Profiles use UUIDs and unique normalized names (NFKC, trimmed/collapsed
whitespace, lowercase). Photos and measurements use `[profileId, id]` keys.
Plans, schedules, drafts, and sessions retain this same owner boundary. Profile photos are JPEG/PNG/WebP blobs, capped at 5 MB and 4096px
per side, decoded before saving; temporary object URLs are revoked.

Height is canonical centimeters; dated measurements store kilograms, with
1 lb = 0.45359237 kg and 1 inch = 2.54 cm. Current weight is the latest dated
measurement, never a second copy on the profile. Blank weight input keeps the
previous measurement. Unit-only saves do not create or alter measurements.
Age is optional (integer 0-130), height is optional (>0 to 300 cm), and weight
is optional (>0 to 1000 kg). No optional measurements are fabricated.

Profile writes compare a revision inside the same read/write transaction as
profile, avatar, and measurement changes. Stale writes are rejected and keep
form input. Reload saved profile requires confirmation before discarding edits.
Each open tab keeps its selected profile; selection is remembered for the next
load. Switching in another tab cannot redirect the current form's save.
Appearance and the storage-notice preference are browser-wide IndexedDB settings.

Preserve the v1 declaration. Future schema changes must append a numbered
Dexie version and, when transforming records, a transactional `.upgrade()`, preserve IDs and
records, and test upgrades from a populated older database. Never delete the
database or create an empty replacement as error recovery. Initialization only
creates Guest when all tables are empty. Errors leave records in place and
provide retry. See [Dexie migrations](https://dexie.org/docs/Version/Version.upgrade()).

Service tests create only uniquely named `boros-test-*` fake databases.
Playwright uses fresh isolated browser contexts, never the owner's browser
profile. No test clears existing user data. Real-device keyboards and Safari
are still separate manual checks.

## Exercise library

Create Workout saves ordered per-set reps/RIR, optional rest in seconds,
instructions, notes, tutorial links, and profile-owned tags. Blank maxima mean
fixed targets. Blank optional RIR/rest remains unspecified; zero is a real
value. Increasing set count keeps existing values. Removing populated sets or
replacing customized targets requires confirmation.

The editor supports 1-100 sets, exercise names up to 120 characters, up to 50
tags with names up to 80 characters, and up to 20,000 characters each for
instructions/notes. Numbers must be safe integers; reps are positive and
RIR/rest are nonnegative. No prescription defaults or medical advice are added.

Search uses the shared normalized-name key. Sort by name or creation time;
multiple tag filters match ANY selected tag. Active exercise names are unique
within a profile. Archived names may be reused, but restore is rejected if an
active name conflicts: edit/rename the archived record before restoring it.
Duplicates begin as editable, unsaved copies with a suggested unused name and
receive a new UUID only on Save workout.

Exercise and inline-tag writes are one transaction. Tags reuse normalized names
within the owner profile. Exercise edits/archive/restore use revision checks;
errors retain input and do not claim success. For a stale exercise, cancel the
editor (confirm discard only after reviewing/copying anything needed), then
reopen View / edit to load the latest record. Plan copies and started/saved session prescriptions are independent snapshots.

YouTube links support HTTPS watch?v=, youtu.be, shorts, live, and embed video URLs
with an 11-character video ID on the explicitly supported YouTube hosts. They
are plain external links: no preview, fetch, or embed happens automatically.
Instructions and notes render as plain text.

Database v2 adds only `exercises` and `tags`. Both use `[profileId, id]` keys;
active exercise names and tag names have unique compound indexes. Archived
exercises omit the active-name index key. The migration test starts with a
populated v1 database and checks profiles, settings, measurement records, and
photo bytes after upgrade. If an older tab closes its database connection for
an upgrade, reload that tab; never delete its database as a workaround.

## Manual plans

Create Plan builds 1-7 ordered training days and displays `7 - days` rest days.
Day count is derived from the actual day array, never saved as a second number.
Name each day and add at least one exercise before saving. Incomplete input may
remain in the editor; validation or a failed write preserves it. Plan/day names
allow up to 120 characters, and each day supports up to 100 exercise occurrences.
Prescription limits are the same as the library editor.

Choose exercises from the active profile's active library and saved active plans.
Source labels identify the plan, day position/name, and occurrence position when
names repeat. Shared search, A-Z/Z-A, date sorting, and ANY-match tag filters work
together. Date sorting uses the source exercise's or source plan's creation date.
Each choice copies the full prescription, including tag names and optional fields,
into a new occurrence. Optional provenance IDs record the source; they are never
used to render or update a saved prescription. Repeated selections are independent.
The same picker includes imported plans and standalone imported workouts.

Use day/exercise move buttons and the destination-day selector to change order.
Renaming, editing, and moving retain IDs; added occurrences and duplicated plans
receive new IDs for their contents. Removing days/exercises or reducing the day
count requires confirmation. The shared prescription editor applies changes to the
unsaved plan; Save plan commits the entire plan. Editing/archiving a source cannot
change another saved plan. Plan-specific tag edits stay inside the snapshot and
do not rename or create library tag records.

Plans have profile-scoped unique normalized active names, revisions, timestamps,
and archive state. Duplicate plan starts an editable copy with an unused suggested
name; Save plan assigns a new plan ID. Archived records remain editable/restorable.
If restoration conflicts with an active name, rename the archived plan before
restoring it. A stale save fails and retains input: copy any needed edits, cancel
the editor, and reopen the saved plan to load its latest revision.

Dexie v3 adds only `plans`, keyed by `[profileId, id]` with a unique active-name
index. Days and occurrences are nested in one record so validation and the revision
check precede a single transactional write. Prior stores are not rewritten; tests
verify populated v1 and v2 upgrades, including photo bytes. Initialization also
checks for orphaned plan records before creating Guest. Schema extensions follow
[Dexie's versioned store declarations](https://dexie.org/docs/Version/Version.stores()).

All editing stays at the same public address. Unsaved-change confirmations and
native browser-unload warnings apply to the plan and its nested prescription
editor. Drafts are held in memory, not recovered after refresh. No scheduling,
progress or backup workflow is provided by the manual plan builder. Training is described below.

## External AI formatting and paste import

In Create, open **Import AI Output**, choose Plan or Single workout, and use
**Copy Formatting Instructions** with your own request in an external chatbot.
The instructions include a schema-validated illustrative example. They remain
selectable if clipboard permission is unavailable. Boros has no AI connection
and sends no prompt or pasted data to an external provider. Examples are never
saved automatically; review generated targets yourself before saving.

Paste one raw JSON object or one JSON fenced block (up to 1,000,000 characters).
Validation accepts the complete payload or reports field paths such as
`plan.days[1].exercises[0].sets[2].reps.max`. Surrounding prose, multiple blocks,
wrong versions/types, unknown fields at every level, invalid ranges, and unsupported
tutorial links fail without writes or loss of pasted text. There is no fragment
extraction or numeric type coercion. Pasted HTML/code is inert plain text; tutorial
URLs are never automatically fetched or embedded.

The public v1 contract in `src/schemas/interchange.ts` is separate from database
schema v5. Its fully populated shape is:

```ts
type Range = { min: number; max: number }
type Exercise = {
  name: string
  sets: { reps: Range; rir: Range | null }[]
  restBetweenSetsSeconds: number | null
  restAfterExerciseSeconds: number | null
  instructions: string
  youtubeUrl: string | null
  tags: string[]
}
type Plan = {
  name: string
  trainingDaysPerWeek: number
  days: { name: string; exercises: Exercise[] }[]
}
type Interchange =
  | { schemaVersion: 1; kind: 'plan'; plan: Plan }
  | { schemaVersion: 1; kind: 'workout'; workout: Exercise }
```

Exactly one matching payload is required. No IDs, ownership fields, revisions,
timestamps, provenance, or notes are accepted in this format; notes can be added
in the preview. Name, sets/reps, and the plan/day structure are required. Names
are trimmed, nonempty, and at most 120 characters. Plans have 1-7 ordered days,
exactly matching `trainingDaysPerWeek`, with 1-100 exercises per day. Exercises
have 1-100 ordered sets. All numbers are safe integers; reps are positive, RIR
and rest are nonnegative, and `max >= min`. Equal bounds mean a fixed target.
Rest uses seconds. Instructions allow 20,000 characters, and tags allow up to
50 strings of 1-80 characters. Tutorial URLs follow the supported HTTPS YouTube
rules described above.

Omitted `rir`, either rest field, or `youtubeUrl` defaults to `null`; omitted
`instructions` defaults to `""`; omitted `tags` defaults to `[]`. Null instructions
or tags are invalid. Missing RIR/rest remains unspecified internally; explicit
zero survives unchanged. Numeric strings, missing range bounds, and empty sets
are errors, not repaired values. Example minimal workout using these defaults:

```json
{"schemaVersion":1,"kind":"workout","workout":{"name":"Example","sets":[{"reps":{"min":5,"max":8}}]}}
```

Only a fully valid payload opens an **unsaved import preview** using the existing
workout/plan editors. Canceling a preview creates no artifact or tags and returns
to the original pasted JSON. Confirming discard loses preview edits. Closing the
import asks before discarding pasted text. Navigation and browser-unload guards
also apply; drafts are memory-only and do not recover after reload.

Final saves revalidate edited values and bind to the preview's original profile.
Active name conflicts require renaming or cancellation, never overwriting.
Workouts become library exercises; plans retain independent nested snapshots
without creating library exercises. Final import saves resolve/create normalized
profile tags in the same transaction as the artifact. This registers imported
plan tags for reuse; subsequent manual plan-only tag edits retain the existing
snapshot-only behavior. Local UUIDs identify all imported records. One artifact
creation UUID is reused across retries: simultaneous saves or an uncertain prior
commit return the existing artifact without duplicating or overwriting it. Failed
writes roll back artifact/tags, retain edited input, and allow retry.

No database migration, new dependency, backup merge, scheduling, training, or
progress feature is introduced by the import workflow. Automated tests use only
isolated databases/contexts. Physical-device keyboards, Safari/Firefox, screen
readers, actual clipboard permissions on those devices, live Ko-fi, real storage
exhaustion, and large-data performance still need the checks recorded in TODO.md.

## Training, persistent drafts, and session history

Train lists the active profile's saved active plans and unfinished sessions.
Choose a plan/day and Start session, or Resume an unfinished session. Starting
the same day reuses its unfinished draft, including across tabs. After completion,
starting another session is a deliberate action. Archived/changed source plans
do not prevent resuming an existing draft from the unfinished list.

Each start copies the complete training-day prescription: names, order, set
targets, rest, instructions, tutorial, tags, notes, and source references. Later
source edits/archiving cannot rewrite drafts or completed logs. Drafts/sessions
use stable profile-owned IDs and revisions. Database v4 adds only `drafts`,
`sessions`, and `restTimers`; the populated v3 migration test checks every prior
store and photo bytes. Initialization also checks these stores before creating
Guest, so orphaned records never cause silent replacement.

Set rows show their own reps/RIR targets, actual load/repetitions, and optional
actual RIR. Zero is an explicit result; blanks remain missing. Load accepts
nonnegative decimal numbers; actual repetitions/RIR require nonnegative whole
numbers, bounded by safe numeric representation. Partial/invalid input can be
retained in a draft with field errors, but cannot become completed results.
Either correct an incompatible partly entered set or explicitly mark it skipped.
No results are fabricated. Session and exercise Note icons open editable dialogs;
Apply places the note in the autosaved draft. The information icon shows plain-text
instructions and an optional validated external tutorial link. There are no inline
instructions/tag chips or unit selectors in Train.

Weight units belong in Settings. A draft keeps each load's original input/unit;
display conversion uses the canonical kg value and shows up to six decimal places.
Changing the preferred display unit alone never rewrites the stored measurement.
Editing a load records that new value in the current preferred unit. Completed
sets store both canonical kilograms and the explicitly recorded load/unit, and
history displays the recording unit even if Settings later changes. Different sets
may have different recording units without changing their meaning.

### Autosave and concurrent tabs

Results and applied notes autosave after **400 ms without further edits**, plus
the database write time. Wait for **Draft saved locally** before relying on
recovery. Pending, saving, and failed feedback are distinct; failures keep current
input and offer Retry draft save. Unapplied note text stays in its dialog and is
protected by discard/unload prompts, but is not persisted until Apply and a
successful autosave. Abrupt termination can lose input inside this window.

The draft controller in `src/features/train/draft-controller.ts` serializes
autosaves, Save, Clear, and timer actions for one immutable profile/draft identity.
Save incorporates the latest current input even before debounce expires. Clear
waits for already queued work and resets the current draft; old autosaves cannot
recreate cleared values. Navigation with unpersisted input requires confirmation.
Confirmed departure cancels scheduled work; a transaction already in flight may
finish, always for its original owner/draft. No delayed write can follow the
currently selected profile into a different workspace.

Every result update/Clear compares the draft revision inside its write transaction.
Stale tabs keep their input and report the conflict. Copy any needed edits, choose
Reload saved draft, and confirm to discard local edits and load the latest version.
The app never merges stale results automatically. Completed drafts reject further
updates, Clear, or new timers. Services live in `src/db/sessions.ts`; transaction
success means the write committed, following [Dexie's transaction semantics](https://dexie.org/docs/Dexie/Dexie.transaction()).

### Rest timers

REST controls occur between consecutive sets and after an exercise's final set
before the next exercise. Each uses its own prescribed duration in seconds.
Missing rest offers manual duration entry; explicit zero is labeled no timed rest.
One active timer exists per local database, with an owning profile/draft, unique
token, configured duration, and UTC end timestamp. Starting another timer replaces
it. Switching profiles hides another profile's timer; stop/reset require its owner
and current token. Returning to the owning draft restores the timer.

Remaining seconds are calculated from the end timestamp, refreshed on display ticks
and visibility changes. Backgrounding/reload does not extend the duration. Stop,
reset, Clear, and completion are persisted. An expired timer displays Rest finished
until stopped, reset, or replaced. This is an on-screen timer, not a background
alarm/notification service; changing the device clock can affect the countdown.

### Completion, partial sessions, and Clear

Save and Clear sit together above bottom navigation. Save requires at least one
valid recorded set. If any sets are blank or explicitly skipped, a confirmation
reports recorded/omitted counts; accepting records the omitted sets as skipped
and marks the session Partial. Cancel keeps input. Incompatible partially entered
sets must first be corrected or explicitly skipped.

The complete snapshot/results/notes and draft finalization commit in one transaction,
which also clears that draft's timer. The draft ID is the completion identity:
double clicks, retries after uncertain success, and competing tabs return one saved
log. Success appears only after commit. `startedAt` records session start,
`completedAt` captures the confirmed Save action, and `loggedAt` records the log
write time, all UTC. Starting through Calendar also records its occurrence reference;
starting through Train's plan/day selectors remains explicitly unscheduled.

Clear confirms its exact scope: reset only the open draft's results, session/exercise
notes, and timer while retaining its prescription. It does not delete logs, plans,
library exercises, or another draft. A failed Clear rolls back completely and keeps
recoverable input. Saved sessions are read-only: Train's history shows snapshot
targets, actual recorded units/results, skipped sets, notes, partial status, and
timestamps. Completed-session editing/deletion is not implemented.

Physical-phone keyboards/safe areas, Safari/Firefox, screen readers, actual storage
exhaustion, and large-data performance remain unverified. The build currently emits
Vite's advisory for a 531.63 kB minified JavaScript chunk (159.80 kB gzip);
code splitting/performance measurement remains future work. No warning threshold
was suppressed. Progress UI and backup workflows remain future phases.

## Calendar and recurring schedules

Calendar opens in Monday–Sunday week view, with Day, Month, Today, Previous,
Next, and a date input for direct navigation. There is no rolling history cutoff.
Wide screens show seven columns; narrow screens use chronological cards with
reachable controls above the bottom navigation. Completed events stay actionable,
greyed and struck through with explicit Completed/Partial text. Past uncompleted
events remain Missed / incomplete. Clear in Train resets input, never calendar
history. All screens still use the same public address and static-hosting rules.

**Add Plan** selects an active plan, a Monday start date, and one distinct weekday
per stable training-day ID. A preview lists training and rest days before saving.
Schedules repeat until explicitly stopped; a duration in a plan name has no effect.
Multiple schedules can use the same plan, with independent IDs and completions.
When schedules coexist in a zone, event labels show their short schedule IDs.

### Dates and time zones

Creation stores the browser's IANA time-zone identifier. It never follows a later
device-zone change automatically. Calendar defaults to the first stored schedule's
zone (the browser zone when none exist). **Displayed time zone** selects which
zone's schedules appear; other schedules remain listed with their own zones.
Today, view boundaries, and missed/incomplete status use that displayed context.
Refresh restores Calendar as a screen, then defaults to week view and Today;
the selected date, view, and open editor are not persisted as navigation state.

Events are all-day Gregorian civil dates (`YYYY-MM-DD`), separate from UTC start,
completion, and log timestamps. `src/lib/calendar-dates.ts` uses calendar field
arithmetic on a UTC carrier solely to avoid host-zone DST changes; it does not
interpret those carriers as scheduled instants, truncate instants to date keys,
or divide elapsed milliseconds into weeks. Schedule-local Today uses explicit
`timeZone`, Gregorian calendar, Latin numbering, and `formatToParts`, as specified
by [ECMA-402 DateTimeFormat](https://tc39.es/ecma402/#sec-intl.datetimeformat.prototype.formattoparts).
The browser's IANA data supplies DST/zone rules; no ambiguous local clock time
needs conversion because schedules have no time of day. Supported date labels
span years 0001–9999; views clamp only at that format boundary. No timezone package
or FullCalendar dependency was needed for these all-day views.

### Occurrences, history, and schedule changes

Occurrences are generated only for the requested range. Their identity is the
schedule UUID + stable training-day UUID + scheduled local date, scoped to the
profile. Drafts/logs also retain scheduled week, stored zone, and schedule revision
ID. Calendar opens/resumes that exact draft or opens its saved details in Train.
Unscheduled drafts and logs are never adopted by a schedule. Completion comes
only from a committed log; partial completion counts, and a late save keeps its
original scheduled date alongside the actual completion timestamp. A new week
has new identities and does not reset or erase anything.

Database v5 preserves all existing records and adds `schedules` plus optional
unique `[profileId+occurrenceKey]` indexes on drafts and sessions. Missing keys
leave legacy unscheduled data separate. Start and completion transactions enforce
one draft/log per occurrence across retries and competing tabs. Existing revision
checks, autosave, timers, snapshots, error recovery, and profile boundaries remain.
The populated v4 migration test compares all ten old stores and photo bytes.

Schedule revisions retain a complete plan/day/mapping snapshot, effective start,
exclusive end, source plan revision, creation timestamp, and stable revision ID.
**Edit mapping / refresh plan** explicitly copies current prescriptions and defaults
to the next Monday in the schedule's zone (or its later start week). Future
revisions may supersede pending revisions, but their metadata is retained.
Ordinary plan edits do not automatically change scheduled prescriptions; use this
action to apply them to future dates. Archiving a source plan does not stop an
existing schedule; use **Stop Scheduling** separately.

Changing plan day IDs/count atomically adds a needs-repair segment from the next
schedule-local Monday. Affected future dates show a mapping warning until explicitly
remapped; earlier missed/history dates remain reconstructable. A later repair date
intentionally leaves the intervening period blocked, rather than guessing mappings.
Started drafts and saved sessions always retain their original prescriptions.

**Stop Scheduling** previews an inclusive cutoff (default next local Monday;
Today or a later date may be chosen). It removes future unstarted events without
deleting earlier occurrences, drafts, or logs. Remap/stop previews list affected
unfinished drafts and require checking **Keep these sessions on their original
dates, with all entered data**. Those retained exceptions remain visible, resumable,
and completable, including after their original day is removed. Cancel leaves all
input untouched; there is no implicit draft deletion or reassignment.

Preview-to-save checks cover schedule revision, source plan revision, and affected
draft IDs/revisions in one transaction. A conflict rejects the save and keeps form
input. Cancel the preview and preview again for changed drafts/plans; when the
schedule itself changed, copy needed choices, cancel the editor, and reopen it.
Creation reuses one UUID across retries. Failed writes keep the preview open;
success is shown only after commit. Schedule-editor input remains memory-only,
protected by navigation/unload warnings; refresh is not editor recovery.

Calendar tests use isolated contexts/databases: dates, DST, device-zone changes,
v4 preservation, remap/repair/stop history, concurrent start/save, rollback,
overlapping schedules, partial/late completion, reload, and profile isolation.
See TODO.md for exact run results and physical-device/browser checks still pending.

## Progress weights and photos (Phase 7)

Progress adds dated weights, optional photos, chronological history, and a simple
SVG chart. Add measurement defaults to the current instant; a local date/time
field permits backdating. Edit keeps the entry ID and measured time unless
**Change measurement date/time** is selected. Confirmed entry deletion removes
the entry and only its unshared photo. Removing a photo in the editor is staged:
confirm **Remove photo from entry**, then **Save measurement** to commit it.
Canceling the editor keeps the saved photo and weight.

The existing measurements table is the single weight source. Current weight uses
the greatest measured timestamp, then greatest ID for tied timestamps (the
existing IndexedDB index order). Backdated entries stay in history without
replacing a newer current weight. Correction/deletion recalculates the latest,
including **No recorded weight** when none remain. Settings and Progress observe
the same saved records. A changed Settings weight appends through the shared
measurement service, retaining its established timestamp of now or 1 ms after
the previous latest measurement, whichever is later. Blank Settings weight keeps
the previous entry; unit-only changes add nothing. Kilograms remain canonical;
untouched weight/photo edits preserve the original value without conversion drift.

Database version remains **5**: no new table/index or migration is needed.
Measurements add optional revision, update time, mutation ID, photo reference,
and measured-local/time-zone/offset fields. Existing records remain readable
without rewriting them (revision defaults to 1, update time to creation time).
Measured time is separate from creation/update time. New records retain a UTC
instant and validated local wall time/IANA zone/offset; history retains that zone
after a device-zone change. Legacy records without context are explicitly shown
in UTC. Default timestamps retain the exact instant during repeated DST hours;
explicitly entered ambiguous times use the earlier occurrence, and nonexistent
local times are rejected. These native date semantics follow
[MDN's Date documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_components_and_time_zones).

Measurement edits/deletes compare revisions transactionally. Every measurement
mutation also increments its owner's profile revision, so an already-open stale
Settings form cannot overwrite a newer measurement with unrelated edits. Its
untouched weight display updates live; explicitly edited input is retained until
save/reload. Conflict messages explain how to reopen the latest record; copy
needed input before discarding it. One entry/mutation UUID pair is reused for
save retries. Failed writes preserve form/photo input, with no success notice.
Editor input is memory-only and guarded on navigation/unload; refresh restores
the screen, not the unsaved editor. Each editor keeps its opening weight unit.

Progress photos use the existing decoded JPEG/PNG/WebP checks (5 MB, 4096px per
side), local profile-owned blobs, and explicit measurement references. They do
not change the avatar. Entry/asset/reference writes and cleanup share one
transaction; replaced/deleted assets survive while any measurement or avatar
still refers to them. No upload or external image fetch occurs. Full photo blobs
load only when an editor/viewer opens; previews revoke object URLs on replacement
and unmount. Photos are not resized or thumbnailed. Delayed decoding cannot move
input into another profile.

The chart uses elapsed measurement time horizontally, explicit endpoint dates
and weight units, and every recorded point, including irregular/repeated dates.
Coincident points can overlap; history retains every record with accessible exact
values, canonical kilograms, dates, and record details. Empty and single-entry
states work in both themes. History reads all profile measurements. Phase 10
measured a 730-entry history; see its verification record for timings and limits.

Phase 7 checks passed: `npm run build`, `npm run typecheck`, `npm run lint`,
`git diff --check`, and `npm run test:data` (66/66). Full development and production
preview each passed 96 tests with two expected static-only skips; the final focused
Progress development suite passed 10/10. Plain-static root/project hosting passed
196/196 with no skips. The first full development run exposed a final-entry
deletion focus race; it was corrected and the full rerun passed. Vite retains its
bundle-size advisory: 547.10 kB minified / 163.88 kB gzip JavaScript.

Exact verification commands and remaining manual checks are recorded in TODO.md.
Physical phones, Safari/Firefox, screen readers/voice control, live Ko-fi,
real storage exhaustion, background-device behavior, and large-data performance
remain unverified. Phase 7 results above are historical; current export behavior
and Phase 8 results follow.

## Download complete profile data (Phase 8)

In Settings → Data, confirm the displayed profile and saved-data scope, then choose
**Download data**. The ZIP contains personal records/photos and is not encrypted
or password-protected. The app reports **Download started**; check your browser's
downloads to confirm the file was saved. Filenames include a sanitized profile
name and UTC export timestamp.

Backup schema **1** is separate from AI interchange and database schema **5**.
The archive contains `manifest.json`, authoritative `data.json`, 21 linked CSVs,
and original photo files. App version comes from the actual package.json value,
currently `0.0.0`. See [the backup contract](docs/backup-format.md) for the full
layout, fields, units, joins, timestamp meanings, and Phase 9 compatibility rules.

Export includes the selected profile's preferences, tags, active/archived library
exercises and plans, ordered prescriptions and historical snapshots, schedules
and all mapping revisions, saved unfinished/finalized drafts, completed full/partial
sessions/results/notes, measurements, and photo references/assets. Stable IDs and
canonical units are preserved. Shared photos are written once per asset ID.
Browser-wide appearance/selection/notice preferences, active timers, navigation,
object URLs, unsaved forms, unapplied notes and pending/failed autosaves are excluded.

Before exporting, save edits/apply notes and wait for **Draft saved locally** in
every training tab. Boros cannot flush another tab's pending input; the UI requires
acknowledging that only committed records are included and blocks dirty Settings
forms. One read-only transaction captures the chosen profile and all owned records.
A worker then validates references, reads photo bytes, serializes CSV/JSON, hashes,
compresses and reopens the ZIP for validation. Concurrent edits cannot mix record
versions. Missing required references abort export without changing source data.

Each payload file has a SHA-256 checksum and byte size in the manifest; the manifest
itself is excluded to avoid a self-referential checksum. CSVs use UTF-8 and proper
quoting, with formula-like string cells protected even after leading whitespace.
JSON text stays exact; genuine numeric zero stays numeric. Blank CSV cells represent
missing/null/empty text, so CSVs are not a restore format. Photo bytes are unchanged.

Preparation shows actual stages and compression progress; repeated clicks are
locked. **Cancel export**, leaving Settings, or switching profiles cancels preparation.
The captured owner cannot change mid-export. Download object URLs are revoked
after 60 seconds. Export makes no database writes. Packaging runs in a worker,
but the snapshot/archive still require memory; no large-data capacity is promised.

Phase 8 verification passed: build, typecheck, lint, diff checks, data tests **73/73**,
focused export browser tests **8/8**, and full development and production preview
each **104 passed / 2 expected static-only skips**. Plain-static root/project hosting
passed **212/212**, including worker loading and actual ZIP downloads. Main
JavaScript is **552.25 kB minified / 165.76 kB gzip**, plus a **197.72 kB** export worker;
Vite's existing >500 kB advisory remains. No dependency/configuration/schema changes.

Still unverified: physical phone download/save sheets, Safari/Firefox, screen-reader
announcements and voice control, real spreadsheet rendering/formula handling,
large-data/memory capacity, actual storage exhaustion, background-device behavior,
and the live Ko-fi destination. Exact manual checks are in TODO.md.

The Phase 8 results above are historical. Restore was not implemented or round-trip
verified at that checkpoint; Phase 9 behavior and verification follow.

## Upload, merge, replace and clear profile data (Phase 9)

In **Settings → Data → Backup ZIP**, choose an original Boros export. Validation
runs locally and reports progress; it checks paths, versions, schemas, counts,
CRC/SHA-256, required relationships and decoded image assets. User text stays plain
text; no links are fetched and nothing is sent to a server. AI paste imports are
separate. Validation and preview make no database changes.

Uploads are limited to **64 MiB compressed, 128 MiB expanded, 4,096 entries,
32 MiB per JSON/CSV, 2 MiB manifest, and 5 MiB per photo (4,096 pixels per side)**.
Actual decompressed bytes are bounded. Unsafe/duplicate/normalized-colliding paths,
unsupported ZIP features, future versions and broken references are rejected.
Use the original ZIP: repackaging may introduce unsupported entries/features.
These are limits, not a tested capacity promise; larger exports need a future
compatible importer. See [the full contract](docs/backup-format.md).

An unmatched profile name imports independently. A normalized name match offers:

- **Replace this profile**: replace only the identified profile after confirmation.
- **Merge — prefer this device**: keep each matching local plan and its whole family,
  skipping the matching imported history, including unique imported logs.
- **Merge — prefer imported file**: replace each matching local plan and its whole
  family, removing even unique local logs/drafts/schedules shown in the preview.
- **Import under a new name**: require an unused name and create an independent profile.
- **Cancel**: keep records and selection unchanged.

Both merge modes retain unrelated plans and import nonconflicting items. Reusable
library exercises/tags are independent of plan families. Matching progress IDs use
chosen precedence; distinct measurements stay distinct even on the same date.
Selected profile fields include explicit nulls. Current weight comes from the
latest dated measurement. Timestamps provide context, not automatic precedence.
ID/name ambiguities require separate import or corrected names, never a silent guess.

Review additions, conflicts, replacements, removals and skips, then check the
confirmation box and choose **Confirm and save**. Dirty Settings forms must be saved
or discarded first. Cancel, leaving Settings or switching profiles during preparation
abandons the temporary upload. A started commit is atomic; a write failure rolls
everything back. A stale preview requires a fresh preview and confirmation.

Restore/merge/replace and Clear Data retire the affected **internal profile ID** and
rewrite owned record keys to a fresh local ID. Safe internal record IDs, histories,
units and timestamps remain; remapped references are consistent and repeat merges
do not add copies. This deliberately blocks stale editors and delayed autosaves,
even if imported revision numbers match. Copy unsaved work from other tabs before
confirming. Old tabs preserve their input and offer **Reopen workspace**, but cannot
save into the replacement. Rest timers are not restored. Theme and other profiles
are preserved; the successful result becomes active only after commit.

**Clear data** previews the selected profile's entire deletion scope and points to
Download data first. Confirmation removes its exercises, tags, plans, schedules,
drafts, completed logs, measurements, photos/timer and demographics. Its name and
unit preferences remain as an empty workspace. This is separate from training's
draft Clear. Cancel leaves records and selection untouched.

An isolated export → renamed-profile import → export comparison passed for canonical
records, relationships and image bytes. Independent tests also verify both merge
family rules, unique logs, asset collisions, null/zero values, repeated imports,
stale previews, competing tabs, delayed saves and transaction rollback. Current
Phase 9 checks: build/typecheck/lint pass, data **90/90**, focused development restore
browser **14/14**, full development **118 passed / 2 expected static-only skips**.
Full production preview passed **118 tests / 2 expected static-only skips**;
plain-static root/project hosting passed **240/240**, without SPA rewrites. Phase 9
is complete; see TODO.md for the full handoff. Main bundle: **579.00 kB / 174.33 kB gzip**, export worker
**197.72 kB**, import worker **200.83 kB**; the existing Vite advisory remains.

Those Phase 9 results are historical. Phase 10 adds the complete manual/AI training,
progress/photo and semantic restore journey, Firefox/Windows WebKit engine runs,
and measured larger-data checks. Current results and remaining owner checks are in
TODO.md and [docs/phase10-verification.md](docs/phase10-verification.md).

Screens now load on demand. Loading and failed-screen states keep shell navigation
available; only a successfully opened screen changes the session preference. A
failed chunk can be recovered by reloading after checking the connection or by
choosing another screen. This preserves single-address navigation and the actual
root/project deployment path; no server rewrites or 404 workaround are needed.
The entry chunk is 274.59 kB (88.01 kB gzip), with additional shared/route chunks;
Vite's former >500 kB warning is resolved. This is not an offline cold-start promise.

Phase 10 remains **verification pending** for photo/restore checks in a Blob-capable
WebKit/Safari environment. Physical-phone, screen-reader/voice-control, live Ko-fi,
spreadsheet, real-quota and background-device checks remain explicit owner checks.
Phase 11 and published-origin verification are separate. The working
`gh-pages -d dist --cname boros-app.com --nojekyll` deployment command, its exact
6.1.1 dependency pin and relative Vite base are preserved; this work did not publish.

## Existing release process and current readiness

The public repository is [jsaldana92/boros](https://github.com/jsaldana92/boros);
the intended address is [https://boros-app.com/](https://boros-app.com/).
`npm run deploy` runs `predeploy` (`npm run build`) before
`gh-pages -d dist --cname boros-app.com --nojekyll`. The pinned CLI publishes to
`origin`'s `gh-pages` branch and generates `CNAME`/`.nojekyll`. Do not add a duplicate
`public/CNAME`, replace the hosting setup, or change the relative Vite base.
Publishing is an owner action; this preparation did not commit, push or deploy.

As of 2026-10-03, Phase 10 is **Verification pending** for Blob-capable WebKit/Safari
photo/restore coverage and Phase 11 is **In progress, preparation only**. Independent
Edge/Node requests to the custom domain fail certificate hostname validation;
the deployment branch also contains a different bundle from this local candidate.
The Ko-fi URL was supplied during Group 1 and is now configured for production;
its automated live visit encounters a Cloudflare challenge. These checks have not
passed simply because a site already exists. See [release preparation](docs/release-preparation.md) for evidence,
the single current owner checklist, exact commit/deploy commands and live smoke test.

Run `node scripts/release-audit.mjs` after building to record SHA-256 for every
output file and the whole inventory. After owner deployment, run
`node scripts/release-audit.mjs --url https://boros-app.com/` and require the tested
fingerprint and every remote resource to match. This checks actual HTTPS bytes,
including lazy chunks/workers; it does not replace the browser smoke test.

Data is stored locally without passwords or a remote recovery service. Anyone
using the same browser can select its profiles, and clearing site data can remove
them. Development (`127.0.0.1:5173`), preview (`127.0.0.1:4173`), static tests and
production each own separate origin storage. A new host, scheme or port gets a
different database; a path alone on the same origin is not a storage boundary.
Deployment does not upload or migrate records. Export each desired profile from
the old address, then import its original ZIP at the new one, preferably under a
new name. Verify reload, plans/sessions/photos and another profile before retiring
the source. Follow the [cross-origin procedure](docs/backup-format.md#moving-between-website-addresses).

Restore supports original **backup schema 1 / database schema 5** exports, not CSV
reconstruction, future schemas or arbitrary repackaged ZIPs. The size/entry/photo
limits and whole-family merge behavior above remain in force. An export can exceed
restore limits; keep the original ZIP. Memory/device limits, physical phone/AT and
real quota checks remain documented limitations. Local storage does not guarantee
offline cold start or a background timer alarm.

## Group 1 compatibility and owner revisions

Group 1 centralizes secure UUID creation: native `randomUUID` when supported, or
UUID v4 using `crypto.getRandomValues`. Existing IDs/data are never regenerated.
Unsupported secure randomness shows a compatibility error; ordinary storage errors
retain storage-specific handling. Backup export/restore still requires Web Crypto
SHA-256 and never skips checksum validation. Clipboard failure retains manual copy.
The compatibility fallback does **not** fix HTTPS or trust an invalid certificate.

The owner reports HTTPS with Chrome's red strikethrough, loading after an explicit
warning bypass. The certificate covers `*.github.io`, not `boros-app.com`; clean
Edge/Node sessions reject that hostname mismatch. A separate HTTP probe reproduces
the missing-UUID startup error without establishing the API state of the owner's
bypassed HTTPS session. The required Pages certificate/enforcement checks and exact
remaining evidence are in [Group 1 verification](docs/group1-verification.md).

The header now uses the owner's proportional snake/wordmark PNGs and an avatar-only
Settings button with an accessible name/tooltip. Both brand images use guarded Train
navigation. Height/weight units stay beside inputs; Age remains separate. Filters
are compact; displayed date/time values stop at minutes, while stored timestamps,
time-zone context and backups keep their original precision on unrelated edits.
Groups 2–4 (supersets/duration, Calendar/Train, Progress redesign) are recorded in
TODO.md and **not implemented**. No Group 1 deployment was performed.

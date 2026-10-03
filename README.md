# Boros

A React / TypeScript / Vite workout tracker. Phases 1-6 provide a themed shell with single-address navigation,
local profiles/settings, photos, dated weights, and an exercise library with
Create Workout, manual plans, validated external AI paste imports, training drafts/timers, saved-session review, and recurring calendar schedules. Progress screens and backup tools are not implemented yet. See TODO.md for
the authoritative plan and verification record.

## Local development

Run `npm install`, then `npm run dev`. Use **http://127.0.0.1:5173** consistently.
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

## Support configuration

Copy `.env.example` to `.env.local`. Set `VITE_KOFI_URL` only when the owner's
actual HTTPS `ko-fi.com` page is supplied. Restart development or rebuild for
changes to take effect. Blank or invalid values leave Support disabled with an
explanation. Valid links open a new tab with `noopener noreferrer`.

## Implementation notes

The existing React, Router, Lucide, Vite, TypeScript, and Oxlint setup is reused.
Tailwind 4 uses its [official Vite integration](https://tailwindcss.com/docs/installation/using-vite).
React Router memory routing keeps every screen at the same public address;
relative build assets support deployment beneath a path. Shared shell components live in
`src/components/layout`; navigation and configuration live in `src/app`.
Feature modules will be created as their phases begin.

## Single-address navigation and static hosting

Train, Create, Calendar, Progress, and Settings use the same public address.
Navigation controls are buttons, so modified clicks, new-tab actions, and copied
link addresses cannot expose nonexistent server routes. Routing and guarded
navigation are centralized in `src/app/`; feature screens do not construct URLs.

The last successfully opened screen is stored as one allowlisted screen ID in
`sessionStorage` (`boros.navigation.screen`). Refresh in the same tab restores
that screen. Missing, invalid, or inaccessible storage falls back to Train.
This preference contains no records or form input: unsaved Create/Settings editors are not
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
reopen View / edit to load the latest record. Plan copies are independent snapshots; session snapshots belong to a later phase.

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

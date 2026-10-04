# Boros

A React / TypeScript / Vite workout tracker. Phases 1-9 provide a themed shell with single-address navigation,
local profiles/settings, photos, dated weights, and an exercise library with
Create exercise, manual plans, validated external AI paste imports, training drafts/timers, saved-session review, recurring calendar schedules, Progress body-weight charts/photos and plan/workout analytics, complete profile ZIP export, reviewed restore/merge/replace/rename, and profile Clear Data. See TODO.md for
the authoritative plan and verification record.

The latest local revision adds weekly Train programs, explicit day outcomes,
reviewed program-week movement, and timer completion feedback. Existing profile
records and session snapshots remain independent. Database v5 stays in place;
backup v5 preserves weekly records and reads strict v1-v4 archives. See
[Train redesign verification](docs/train-weekly-verification.md) for exact results
and remaining device checks. The earlier [deployment-persistence investigation](docs/deployment-persistence-verification.md)
is still unresolved. This candidate has not been published.

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
- `npm run test:browser:updates` - after [release-fixture preparation](docs/deployment-persistence-verification.md#same-context-update-regression), retain the same browser context/data across old deployed files and two new builds.
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

Normal deployments must retain browser records. The reported post-deployment
loss is still under investigation: actual-release updates preserve data in the
local same-context tests, but affected-device before/after evidence is pending.
See [findings, repeatable tests and recovery checks](docs/deployment-persistence-verification.md).
`scripts/storage-diagnostics.js` is a read-only DevTools diagnostic for that
investigation; it is not loaded by the app and never resets a database.

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

In Create, the compact **Workout**, **Plan** and **AI** cards open their builders.
Create exercise saves ordered per-set reps/RIR, optional rest in seconds,
instructions, notes, tutorial links, and profile-owned tags. Blank maxima mean
fixed targets. Blank optional RIR/rest remains unspecified; zero is a real
value. Increasing set count keeps existing values. Removing populated sets or
replacing customized targets requires confirmation.

Every rest editor (including plan/AI prescriptions, supersets and manual Train
timers) uses **Minutes / Seconds**. Minutes are nonnegative whole numbers; seconds
are whole numbers from 0–59. Both blank means unspecified; one blank component is
zero only when the other is supplied. Explicit zero remains zero. Existing 75
seconds displays as 1 minute / 15 seconds; 180 displays as 3 / 0. The total must
remain a safe integer. Saved records and JSON still use integer seconds.

The editor supports 1-100 sets, exercise names up to 120 characters, up to 50
tags with names up to 80 characters, and up to 20,000 characters each for
instructions/notes. Numbers must be safe integers; reps are positive and
RIR/rest are nonnegative. No prescription defaults or medical advice are added.

Search uses the shared normalized-name key. Sort by name or creation time;
multiple tag filters match ANY selected tag. Active exercise names are unique
within a profile. Archived names may be reused, but restore is rejected if an
active name conflicts: edit/rename the archived record before restoring it.
Duplicates begin as editable, unsaved copies with a suggested unused name and
receive a new UUID only on Save exercise.

The library contains independent, profile-owned templates. This supersedes the
earlier plan-sourced catalog projection. Open a card and choose Edit to save its
instructions, notes and targets directly with **Save exercise**. Plan occurrences
keep their own IDs and prescription snapshots. Changing library defaults affects
future additions; editing an occurrence affects only its parent plan.

Name-only cards use a bounded scrolling list. Search, sort and the
collapsed-by-default **Tags** disclosure combine; multiple tags match ANY.
Expanded pills occupy at most three rows with horizontal scrolling. Collapsing
retains the filter; **Clear** resets search, sort and selected tags.

AI plan imports save templates, tags and the plan atomically. Valid existing
identities win; otherwise an active normalized name reuses a template without
changing its defaults. A new repeated name uses its first occurrence as the
default; every plan variation is retained. Groups and group rests stay plan-local.

Existing plans are repaired during workspace initialization/profile selection,
inside an owner-scoped transaction. Active plans precede archived plans; oldest
creation time, stable plan ID and day/occurrence order choose missing defaults
from retained snapshots. Archived-only plans create archived templates. Valid
references stay intact; conflicting dangling identities surface an error. No
render-time writes or reset. Repair is idempotent across reloads and concurrent tabs.

An optional occurrence `templateId` identifies repaired defaults separately from
historical `source` provenance. Progress keeps its existing identity rules;
histories are never joined by name. Plans keep prescriptions, occurrence IDs,
groups and timestamps; changed links increment revision to reject stale editors.
Schedules, drafts and completed sessions are not rewritten. Original AI defaults
cannot be reconstructed after unrecorded edits. See [backup compatibility](docs/backup-format.md)
for validated restore repair and schema 4, with strict schemas 1–3 still readable.

Exercise and inline-tag writes are one transaction. Tags reuse normalized names
within the owner profile. Exercise edits/archive/restore use revision checks;
errors retain input and do not claim success. For a stale exercise, cancel the
editor (confirm discard only after reviewing/copying anything needed), then
open its card and choose Edit to load the latest record. Plan copies and started/saved session prescriptions are independent snapshots.

YouTube links support HTTPS watch?v=, youtu.be, shorts, live, and embed video URLs
with an 11-character video ID on the explicitly supported YouTube hosts. Opening
a saved library exercise's details loads its YouTube player; library cards,
editors and import previews do not load videos. The trusted iframe URL uses only
the validated video ID and fixed options: no autoplay, standard controls, inline
playback and fullscreen. The referrer policy sends the site's origin, not profile,
note or workout data. Closing details or opening the editor disposes of the
player. Opening the actions popup also disposes of it; returning to details
loads a fresh, paused player. Train retains its explicit external tutorial link.
Instructions and Note are separate plain-text sections with preserved line breaks.
Physical-device playback/app-opening behavior remains a manual check.

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

Choose from the active profile's active standalone library. Rows show a checkbox,
name and **Add**. Add copies only that row and closes the picker, regardless of
other checked rows. **Add selected** copies selected defaults once each in displayed
sort order and closes. Each addition gets an independent occurrence ID; intentional
repeats remain supported. These actions update the draft, which needs **Save plan**.

**Select All** includes all search/tag-filtered results, including offscreen rows.
Partial selection appears unchecked; clicking selects all, and clicking when all
are selected clears all. Zero results disable Select All; zero selections or more
than the day's remaining 100-occurrence capacity disable Add selected. Changing
filters drops excluded selections; sorting retains identities. Cancel inserts
nothing. Clear resets only the associated search, sort and tag controls.

Each Create screen has one plain-text title: **Create**, **Create > Plan**,
**Create > Plan > Exercise**, or **Create > Exercise** (the AI input screen uses
**Create > AI**). Titles contain no navigation controls. Save/Apply/Cancel/Close
retain their existing unsaved-change guards. Library details use the shared native
modal, locking background interaction/scroll; **Exercise actions** opens a second
modal with Edit, Duplicate and Archive (Restore for archived records). Escape
closes the top popup, returning focus to its opener. Library actions affect only
the standalone template; plans and history keep their snapshots.
Adjacent arrows and an occurrence popup expose **Edit, Duplicate, Move, Delete**
in that order, with red Delete. Day sections are lighter than nested cards in both
themes. Public addresses and existing dirty-form/unload protections are unchanged.

Use the adjacent day/exercise arrows to change order. **Move** opens a dialog of
other training days; choose a destination or use Cancel/Escape. Full days are
disabled. Cancel restores focus to the occurrence action button; a successful move focuses the moved
occurrence. Moving a member to another day makes it standalone.
Renaming, editing, and moving retain IDs; added occurrences and duplicated plans
receive new IDs for their contents. Removing days/exercises or reducing the day
count requires confirmation. The shared prescription editor applies changes to the
unsaved plan; Save plan commits the entire plan. Editing/archiving a source cannot
change another saved plan. Plan-specific tag edits stay inside the snapshot and
do not rename or create library tag records.

Plan cards show a bold name and a smaller training-day/rest-day/duration summary.
Legacy unbounded plans are labeled honestly. Open a card for Edit, Duplicate or
Archive; archived cards retain Restore. Actions use keyboard-accessible dialogs
with Escape and focus restoration.

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

In Create, open **AI**, choose Plan or Single workout, and use **Copy** with your
own request in an external chatbot.
The instructions include a schema-validated illustrative example. They remain
selectable if clipboard permission is unavailable. Boros has no AI connection
and sends no prompt or pasted data to an external provider. Examples are never
saved automatically; review generated targets yourself before saving.

Both prompts request the complete result inside exactly one fenced `json` block,
with straight ASCII double quotes (U+0022), no comments/trailing commas,
truncation/placeholders or outside prose. Unknown required targets must be clarified,
not invented. The Plan prompt explains superset execution; the standalone Workout
prompt does not introduce group fields. See [AI formatting notes](docs/ai-formatting.md).

Paste one raw JSON object or one JSON fenced block (up to 1,000,000 characters).
Validation accepts the complete payload or reports field paths such as
`plan.days[1].exercises[0].sets[2].reps.max`. Surrounding prose, multiple blocks,
wrong versions/types, unknown fields at every level, invalid ranges, and unsupported
tutorial links fail without writes or loss of pasted text. There is no fragment
extraction or numeric type coercion. Pasted HTML/code is inert plain text; parsing
and import previews never fetch or embed tutorials. After saving, explicitly
opening library exercise details may load the authorized YouTube player.
Malformed smart-quote delimiters produce copying/formatting guidance; Boros never
globally replaces Unicode quotation marks. Valid Unicode punctuation inside
strings is preserved. **Draft** is an unsaved preview bound to the profile that
opened it. Applying a prescription only changes that preview; saving makes it
appear in the real collections. Refresh does not recover unsaved editor input.

The public v2 contract in `src/schemas/interchange.ts` is separate from database
schema v5 and backup schema v5. Valid v1 payloads remain accepted; a v1 plan requires
the owner to supply duration in the editable preview. Nothing is inferred from its
name. The v2 shape is:

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
  durationWeeks: number // positive safe integer, required for new plans
  trainingDaysPerWeek: number
  days: {
    name: string
    exercises: (Exercise & { superset: number | null })[]
    supersets: { number: number; restBetweenRoundsSeconds: number | null; restAfterGroupSeconds: number | null }[]
  }[]
}
type Interchange =
  | { schemaVersion: 2; kind: 'plan'; plan: Plan }
  | { schemaVersion: 2; kind: 'workout'; workout: Exercise }
```

Exactly one matching payload is required. No IDs, ownership fields, revisions,
timestamps, provenance, or notes are accepted in this format; notes can be added
in the preview. Name, sets/reps, and the plan/day structure are required. Names
are trimmed, nonempty, and at most 120 characters. Each superset number is a positive
integer unique within its day, declared in `supersets`, and referenced by at least
two contiguous occurrences. Numbers never join different days. Repeated exercise
names are allowed and receive separate local occurrence IDs. Missing membership
defaults to null; missing groups default to []; group rest defaults to null. Unknown
fields, missing membership declarations and interleaved groups are rejected.
Plans have 1-7 ordered days,
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
{"schemaVersion":2,"kind":"workout","workout":{"name":"Example","sets":[{"reps":{"min":5,"max":8}}]}}
```

Only a fully valid payload opens an **unsaved import preview** using the existing
workout/plan editors. Canceling a preview creates no artifact or tags and returns
to the original pasted JSON. Confirming discard loses preview edits. Closing the
import asks before discarding pasted text. Navigation and browser-unload guards
also apply; drafts are memory-only and do not recover after reload.

Final saves revalidate edited values and bind to the preview's original profile.
Conflicting plan or standalone-exercise names require renaming or cancellation.
Standalone imports create library exercises. Plan imports atomically create or
reuse library templates and retain independent nested snapshots, following the
default-selection rules above. Final saves resolve/create normalized profile tags
in the same transaction as templates and the plan. This registers imported
plan tags for reuse; subsequent manual plan-only tag edits retain the existing
snapshot-only behavior. Local UUIDs identify all imported records. One artifact
creation UUID is reused across retries: simultaneous saves or an uncertain prior
commit return the existing artifact without duplicating or overwriting it. Failed
writes roll back templates/plan/tags, retain edited input, and allow retry.

No database migration, new dependency, backup merge, scheduling, training, or
progress feature is introduced by the import workflow. Automated tests use only
isolated databases/contexts. Physical-device keyboards, Safari/Firefox, screen
readers, actual clipboard permissions on those devices, live Ko-fi, real storage
exhaustion, and large-data performance still need the checks recorded in TODO.md.

## Training, persistent drafts, and session history

Train's **Add Plan** card opens the same plan cards used in Create. One click
appends immediately and closes the popup; duplicate additions are harmless. Cards
remain visible with one selection and show the saved plan note truncated to one
line. **Remove from Train** removes only the selection. Plans, runs and history
remain. An archived selected ID stays remembered for restoration.

Opening a plan shows its full note, a Monday-Sunday week range and vertical day
cards. Arrow buttons change weeks; the date-range button opens a date picker.
Scheduled cards show weekday and Pending, Due Today, Past Due, Completed or Skipped
using the schedule's saved time zone. Unscheduled weekly programs show Pending,
Completed or Skipped without assigned weekdays. Their first activation saves the
profile-local Monday and time zone, duration and independent prescription snapshot.
Old unscheduled sessions remain available under history/unfinished sessions with
no inferred week. Separate runs have an explicit context selector and short ID;
their occurrences are never combined in the Train detail view.

**Start** resumes an occurrence's existing draft. **Skip** and **Mark as Complete**
write explicit outcome markers, not sessions or invented exercise results. A
marked day stays reviewable and can be corrected to Pending. A saved session is
review-only; an unfinished draft must be resumed or explicitly discarded before
choosing a marker. The discard confirmation is separate from draft Clear.
Calendar uses the same outcomes. Unassigned weekly work has its own weekly section,
not an invented assigned weekday. Progress counts manual completions as completed
days and explicit skips as skipped days; exercise statistics still use recorded
sets only. Excluded weeks do not count as skipped or completed.

**Move Training to Next Week** previews and confirms a one-week delay of that
program week and the remainder. The vacated Monday-Sunday week is excluded;
program week numbers stay with their content and finite endings extend. Previous
Week appears only when safe: it can reuse the preceding excluded week or the free
week before the program's start. Saved sessions, any occurrence markers (including
corrected markers) and drafts anywhere in the affected remainder block movement.
Moves recheck revisions and conflicts atomically, preserve actual timestamps and
leave independent runs alone. No destructive weekly reset exists.

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
the database write time. Wait until **Saving...** disappears without an error before relying on
recovery. Saving and failed feedback remain visible; failures keep current
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
Supersets instead expose exactly one boundary after each round: inter-round rest
before the next round, post-group rest after the final round even when it ends
the session. There is no timed rest between members and no double final boundary.
Missing rest offers manual duration entry; explicit zero is labeled no timed rest.
One active timer exists per local database, with an owning profile/draft, unique
token, configured duration, and UTC end timestamp. Starting another timer replaces
it. Switching profiles hides another profile's timer; stop/reset require its owner
and current token. Returning to the owning draft restores the timer.

Remaining time and circular progress derive from the saved UTC end timestamp;
display animation never determines elapsed time. The popup has Stop and Reset;
closing it keeps the timer running and its compact control can reopen it. Durations
below a minute use seconds; longer durations use minutes and seconds, with missing
and explicit-zero values preserved.

Settings **Sound** is a browser-wide preference, Off by default. Off attempts one
short vibration; On plays the supplied public/rest-complete.mp3 three times,
advancing on media ended events. REST/Reset attempts to unlock media in the user
gesture. The relative asset URL supports root and project-subpath hosting. Normal
device media volume applies. One transactional completion claim prevents duplicate
alerts across tabs; token/generation guards cancel repetitions on Stop, Reset,
replacement, leaving the owning session or changing profile. Restoring an already
expired timer displays completion without replaying an old alert. A late unlock
promise cannot interrupt completion playback.

Visible completion remains when media/vibration is unavailable. No background,
lock-screen or iPhone vibration guarantee is made; there are no push services or
artificial background keep-alives. Changing the device clock can affect countdowns.

### Completion, partial sessions, and Clear

Save occupies the first row above bottom navigation, with Back and Clear below. Back confirms when results or notes exist, finishes pending autosave and keeps the draft. A failed flush keeps the editor and recoverable input open. Save requires at least one
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
starting through Train now records the selected scheduled or unscheduled weekly occurrence. Legacy sessions keep their original unassigned context.

Clear confirms its exact scope: reset only the open draft's results, session/exercise
notes, and timer while retaining its prescription. It does not delete logs, plans,
library exercises, or another draft. A failed Clear rolls back completely and keeps
recoverable input. Saved sessions are read-only: Train's history shows snapshot
targets, actual recorded units/results, skipped sets, notes, partial status, and
timestamps. Completed-session editing/deletion is not implemented.

Current automated results and the exact outstanding phone/audio/accessibility
checks are in [Train weekly verification](docs/train-weekly-verification.md).
Progress and backup workflows are implemented. Earlier phase measurements and
browser limitations remain historical; local automation does not establish
physical keyboard, sound, vibration, quota or suspended-device behavior.

## Calendar and recurring schedules

Calendar opens to the current named month with complete Monday–Sunday weeks,
dim adjacent-month dates and actionable events. Previous/Next advances calendar
months. Day/week views retain their own navigation, with Today and a date input.
There is no rolling history cutoff. Scheduled dates use the visible date range.
Unassigned programs appear separately for the containing weeks, including every
unassigned day when Calendar is in day view; no assigned weekday is implied.
Wide screens show seven columns; narrow screens use chronological cards with
reachable controls above the bottom navigation. Completed events stay actionable,
greyed and struck through with explicit Completed/Partial text. Past uncompleted
events show Due Today or Past Due in their own schedule time zone. Clear in Train resets input, never calendar
history. All screens still use the same public address and static-hosting rules.

**Add Plan** selects an active plan, a Monday start date, and one distinct weekday
per stable training-day ID. A preview lists training/rest days and the inclusive
start/end dates before saving. New plans require duration in weeks. A two-week plan
starting Monday 2024-12-30 ends Sunday 2025-01-12; no next-week occurrences are
generated. Civil-date arithmetic respects the schedule's recorded zone. Legacy
records without duration remain unbounded; a duration in a plan name has no effect.
Schedules freeze their effective duration/end date. Editing a plan or refreshing
its prescriptions does not change an existing schedule's duration. **Review plan
duration** explicitly previews that change, anchored to the original start week
and applied only from a selected Monday. Earlier missed dates stay incomplete;
started/completed sessions remain on their original dates with frozen prescriptions.
Multiple schedules can use the same plan, with independent IDs and completions.
When schedules coexist, event labels show their short schedule IDs and saved zones.
Calendar schedules existing plans only; create plans in Create.

### Dates and time zones

Profile Settings stores a validated IANA **Time zone** for new schedules and Calendar
Today. New profiles use the browser zone. An older profile missing this preference
receives it once at startup or profile selection; only its profile revision/update
time changes. Reviewed legacy imports initialize the missing preference in their
proposed new profile. Neither operation rewrites schedules, logs or measurements.
Existing schedules keep their original zones when this preference or device zone
changes. Calendar displays all zones together on each schedule's saved local date,
with a read-only zone label. Event lateness uses the schedule zone, while Today
and the default month use the profile preference. No editable zone is in Calendar.
Refresh restores Calendar as a screen, then defaults to month view and Today;
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

Progress provides dated weights, optional photos and a selectable SVG graph.
The graph is the primary display; its selector exposes every saved measurement. Add measurement defaults to the current instant; a local date/time
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

The graph uses actual measured time horizontally, numeric weight ticks in the
selected unit, angled date labels, and colored points. Click a point, use the
labeled selector/Previous/Next controls, or focus the graph and use arrows/Home/End.
Every overlapping entry remains selectable at its real date/value. Selected-entry
actions retain correction, confirmed deletion and photo viewing. There is no
visible history/debug dump; all underlying measurements remain in local storage
and backups. Full photo blobs load only on explicit editor/viewer entry.

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

Backup schema **4** (strict v1/v2/v3 reading retained) is separate from AI interchange and database schema **5**.
The archive contains `manifest.json`, authoritative `data.json`, 24 linked CSVs,
and original photo files. App version comes from the actual package.json value,
currently `0.0.0`. See [the backup contract](docs/backup-format.md) for the full
layout, fields, units, joins, timestamp meanings, and Phase 9 compatibility rules.

Export includes the selected profile's preferences, tags, active/archived library
exercises and plans, ordered prescriptions and historical snapshots, schedules
and all mapping revisions, saved unfinished/finalized drafts, completed full/partial
sessions/results/notes, measurements, and photo references/assets. Stable IDs and
canonical units are preserved. Shared photos are written once per asset ID.
Profile time-zone and Train selections are included. Browser-wide appearance/active-profile/notice preferences, active timers, navigation,
object URLs, unsaved forms, unapplied notes and pending/failed autosaves are excluded.

Before exporting, save edits/apply notes and wait until **Saving...** disappears without an error in
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
drafts, completed logs, Train selections, measurements, photos/timer and demographics. Its name,
time zone and unit preferences remain as an empty workspace. This is separate from training's
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
photo/restore coverage and Phase 11 remains **In progress**. The owner reports the
public site works and HTTPS is resolved. Earlier Edge/Node certificate failures
are historical. The changed Group 3 candidate has local verification; no new
independent production certificate/runtime or artifact comparison is claimed here.
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

Restore supports original **backup schemas 1 and 2 / database schema 5** exports, not CSV
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
That Group 1 handoff predates Groups 2–4 below. No Group 1 deployment was performed.

## Group 2: supersets, repeated occurrences and duration

Create Plan accepts a duration in weeks and repeated copies of a library exercise.
Each occurrence has its own stable ID, prescription, notes and results. Enable
**Superset** on members and give them the same positive group number within the
day. Groups need at least two members to save. Joining shows the resulting order
immediately. **Superset name** changes the positive numeric display number without
changing the internal group ID; changing an occurrence's membership number joins
or creates a group. Inner member movement changes member order; moving a group's
outer member past its boundary moves the block. Moving a member to another day
makes it standalone. Remove/duplicate occurrences or dissolve a group without
changing the remaining prescriptions. Plan duplication creates new day, group and
occurrence IDs; source-library provenance is retained when known. Group controls
sit immediately after their last member. Their red **Delete** action asks for
confirmation, dissolves only the grouping, and keeps exercises, prescriptions
and historical session snapshots. Blank-rest help reads “Leave blank to choose
the rest time while training.”

Train runs one group round at a time, in the displayed member order. Unequal set
counts use the largest count; a member appears only when it has that prescribed
set. There are no invented sets. Member Note and Information controls stay
available, and weight-unit labels follow Settings. Optional group rest applies
between rounds and after the final round, including the last block. Blank permits manual
duration; explicit zero means no timed rest. Original member rest prescriptions
remain stored but are not applied between group members. The existing single
persistent timer, autosave, Clear, partial/full Save, stale-write guards and frozen
history remain in use. Group 2 established the saved group-round snapshots
used by Group 4 analytics below.

Database schema stays **v5**, with optional nested additions and no record rewrite.
Group 2 introduced AI and backup contracts **v2**, with validated v1 compatibility. Backups retain
stable group membership/order, repeated results, original time precision and
schedule boundary history. See [backup format](docs/backup-format.md) and
[Group 2 verification](docs/group2-verification.md) for contracts, decisions and
actual checks. The owner reports HTTPS resolved on 2026-10-03; this is owner
verification, not a new automated production smoke test. No hosting changes or
deployment were performed here.

## Group 3: profile zones, month Calendar and selected Train plans

The behavior above adds optional `timeZone` and `selectedPlanIds` profile fields;
IndexedDB remains **v5**, with no store migration. Both preference writes share
the profile revision check, so a concurrent Settings/selection save is rejected
and keeps recoverable input. Stored dates, timestamps and units remain intact.
Group 3 introduced **backup v3** (now superseded by v5 above), retaining strict v1/v2 reading and checksum/asset
verification. Selected plan IDs follow independent ownership and plan-root merge
remapping; the chosen whole-profile merge precedence also chooses preferences.
Clear Data clears selections and retains the time zone and units. AI remains v2.

See [Group 3 verification](docs/group3-verification.md) for actual checks and the
remaining owner checklist. Group 4 is described below. HTTPS remains
owner-confirmed resolved; these tasks do not publish changes.

## Group 4: Progress by body weight, plan and workout

Progress separates Body weight, Plans and Workouts. Scroll or use Previous/Next
through plan cards, including archived plans with history. Plan views show
training-day and exercise completions, then exercise/superset drill-downs. The
alphabetical Workouts grid shows the same statistics across all plans. Names wrap
in three columns, with two columns below 341px. Back controls remain inside the
single public address. Refresh returns to Progress's overview, not its drill-down.

Training-day totals count distinct completed scheduled occurrences or unscheduled
sessions; partial sessions count and retain their marker. Exercise totals count
each performed occurrence with at least one recorded set. Superset members count
separately, without counting the group again. Drafts and skipped work do not count.
Statistics use saved actual results and completion instants, not today's targets,
scheduled dates or import time. Starting/latest show all set weight/repetition
pairs from the earliest/latest qualifying session, including repeated occurrences.
Equal completion times use stable session-ID order. Min/max ties retain the
first matching set in chronological, occurrence and set order. Zero is valid;
missing/skipped sets are omitted. Historical kg/lb values compare canonically
and convert for display without changing saved values. Scheduled completion dates
use their stored zone; unscheduled sessions use the profile zone because they
have no historical zone field.

Library IDs and explicit saved plan-occurrence references join exercise history;
names never do. Unknown legacy links stay separate. Supersets match by ordered
member identities and multiplicity, retaining historical compositions. Each
member has its own graph and statistics. Graph point selectors preserve every
set, even exact overlaps, and link to saved session details/notes. The optional
additional weight/reps/date graph is deferred. Current statistics are derived
locally; Group 4 did not change database v5, then-current backups v3 or AI v2.
The template-ownership revision introduced backups v4 with v1/v2/v3 reading;
the subsequent Train revision writes v5 and also retains strict v4 reading.

See [Group 4 verification](docs/group4-verification.md) for exact identity rules,
checks, performance observations and remaining owner checks. Next is integrated
verification of Groups 1–4 and the final published-version smoke test. Overall
release acceptance and publication remain separate.

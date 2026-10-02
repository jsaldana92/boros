# Boros

A React / TypeScript / Vite workout tracker. Phases 1-3 provide a themed shell with single-address navigation,
local profiles/settings, photos, dated weights, and an exercise library with
Create Workout, plus manual plan creation and editing. Training sessions and backup tools are not implemented yet. See TODO.md for
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
This preference contains no records or form input: unsaved editors are not
recovered on refresh. Existing discard confirmations and browser-unload warnings
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

`src/db/database.ts` defines IndexedDB database `boros`, schema version 3 (additive plan store; v1/v2 records retained).
Profiles use UUIDs and unique normalized names (NFKC, trimmed/collapsed
whitespace, lowercase). Photos and measurements use `[profileId, id]` keys.
Plans retain this same owner boundary; future schedules and sessions must also retain it. Profile photos are JPEG/PNG/WebP blobs, capped at 5 MB and 4096px
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
The same picker will include AI-created plans after Phase 4 implements import.

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
training/timers, AI import, progress, or backup workflow is provided by this phase.

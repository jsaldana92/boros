# Boros — shared implementation plan

Updated: 2026-10-05
Status: Unique-week cycles are implemented and pass available local verification: build/typecheck/lint, 213/213 data tests, 564/564 static browser checks, Firefox 20/20 and retained-context updates 6/6. Physical release gates and production persistence investigation remain open.
Current scope: repeating unique-week definitions throughout Create/Calendar/Train/Progress, AI v4, backup v10 and custom Create navigation warnings. Preserve earlier uncommitted amendments; no commit, push, deploy or hosting changes.

This file belongs in the Boros project root, beside `package.json`. It is the shared specification, checklist, and handoff record for the owner, ChatGPT, and Codex. The repository copy is authoritative. When continuing in a chat without repository access, provide the latest copy and the relevant source files or diff.

## 1. Working agreement

- Read this file and any applicable `AGENTS.md` before editing. Inspect the actual repository; do not assume that earlier setup instructions were executed.
- Work on the requested phase, or the next incomplete phase when asked to continue. Implement the smallest complete dependency group; there is no arbitrary file-count limit.
- Before editing, state the phase, intended behavior, and expected files. Expand that list when a necessary dependency is discovered and explain why.
- Preserve unrelated work. Do not reset the repository, replace existing project configuration wholesale, or upgrade dependencies without a concrete need.
- Use the installed package versions and their official documentation. Install additional packages only when needed by the active phase. Keep the lockfile current.
- Build complete behavior, including persistence, validation, loading/empty/error states, and required confirmations. A visual placeholder does not complete a feature.
- Use reusable UI controls and feature services. Avoid putting the entire application or all database operations in `App.tsx`.
- Add meaningful tests for data integrity, parsing, time boundaries, and destructive operations. Routine styling changes do not need tests that merely reproduce the implementation.
- Run the applicable checks for the change. Record commands and results, including failures. Never label an unrun check as passed.
- Update this file after each implementation group: task checkboxes, phase status, validation evidence, remaining work, and the next concrete step.
- A phase is complete only when its acceptance checks pass. If implementation is finished but a required browser check is outstanding, mark it `Verification pending`.
- Continue through routine, reversible implementation choices. Ask only when a missing answer materially changes scope, behavior, or a destructive action.
- Do not publish the site, push commits, or invent an external service URL as part of a coding phase. Release actions follow the owner's instructions.

Checkboxes mean verified completion, not intent. Phase states: `Not started`, `In progress`, `Verification pending`, `Complete`, or `Blocked` with a concrete reason.

## 2. Product scope

Boros is a React single-page workout tracker. Its static website is shared, but each browser stores its own profiles, plans, workout logs, progress photos, and settings locally. Multiple profiles can exist in the same browser, without passwords.

Navigation consists of Train, Create, Calendar, and Progress in fixed bottom tabs. The avatar-only entry opens Settings; Support appears only inside Settings and opens the owner's configured Ko-fi page in a new tab.

The user can create everything manually. For AI assistance, Boros supplies formatting instructions that users append to their own prompt in an external chatbot. Users paste the resulting structured output into Boros, validate it, edit a preview, and save it locally.

### Confirmed exclusions

- No QR code syncing, device pairing, or automatic cross-device sync.
- No OpenAI/Anthropic login, API keys, provider integration, embedded chatbot, or token billing.
- No application backend, cloud profile database, password system, or remote photo storage.
- No requirement for a PWA, install prompt, or offline cold start in the initial release. Local data storage alone does not guarantee that an unloaded website can open without a connection.
- No automatically generated workout or medical advice from Boros itself.

### Terminology

| Term                      | Meaning                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Exercise / custom workout | A reusable movement, such as High Bar Squats or Big Cheek Pulls. The UI may retain the requested label `Create Workout`. |
| Training day              | An ordered group of exercises within a plan.                                                                             |
| Plan                      | A named collection of training days, such as Get Buff for the Summer.                                                    |
| Session                   | A performed training day with actual weights, repetitions, notes, and timestamps.                                        |
| Scheduled occurrence      | One training day assigned to a specific calendar date and schedule.                                                      |
| Profile                   | A local data owner; it is not an authenticated account.                                                                  |

## 3. Initial defaults and data rules

These defaults make implementation concrete. They are design choices, not additional owner requirements; record any later changes in the decision log.

### Profiles and local storage

- Use IndexedDB for user records and image blobs. Small interface preferences may use local storage; do not store the main dataset or photos there.
- Allow use without completing a profile form by creating a persistent Guest workspace. Naming that workspace converts it into a named profile without losing data.
- A named profile requires a nonempty display name. Age, height, weight, and photos are optional; no fabricated demographic values.
- Default weight unit: kg, with a visible kg/lb selector. Support cm and ft/in input for height. Store measurements with explicit units or documented canonical conversions.
- Identify records using stable IDs, never names or array positions. Scope every user-owned query and write to a profile.
- Recommended key strategy: `(profileId, id)` for profile-owned records. This allows a restored copy under a new profile to retain internal record IDs safely. If another design is used, fully remap references on import.
- Trim names and compare a documented normalized key for conflicts: Unicode normalization, collapsed whitespace, and case-insensitive comparison. Preserve the display name. Block duplicate active profile/plan/library-exercise names within their respective scope so import matching is unambiguous.
- Local profiles are convenience separation, not a security boundary. Anyone with access to the browser can select them. Do not claim encryption or password protection.
- Show a storage notice during first use and in settings: data belongs to this browser and website address; clearing site/browser data may remove it; private browsing is unsuitable for durable records; downloaded backups are the recovery method.
- Surface storage failures without reporting a successful save. Keep recoverable form/draft data when a write fails.

### Prescriptions, drafts, and history

- A repeating plan contains 1-7 ordered training days. A unique-week plan has ordered definitions with 1-7 days each and a finite duration divisible by its definition count (at least two). Rest days are `7 - trainingDaysPerWeek` for that definition; variable compact counts use numeric ranges.
- An exercise requires a name and at least one prescribed set. Set count and repetition targets are the only mandatory numeric inputs.
- Each prescribed set has positive integer `reps.min` and `reps.max`; equal values mean a fixed target. Reject reversed ranges.
- Each set may have an RIR range with nonnegative integer bounds. RIR 0 is valid. Missing RIR is unknown, not 0.
- Rest between sets and rest after an exercise are optional nonnegative integer seconds. Missing rest is unspecified; 0 explicitly means no timed rest.
- Instructions, notes, YouTube URL, and tags are optional. Support choosing existing tags and creating new ones.
- Opening saved Create-library exercise details explicitly authorizes a validated YouTube iframe. No autoplay, background-card/editor/import-preview loading, arbitrary iframe HTML or transmission of profile/notes/results. Close/editor/action-menu transitions dispose of the player; older no-embed handoffs remain historical. Train's external tutorial link stays unchanged.
- Store per-set targets, not a single string that must be reparsed during training. The form can apply a target to all sets and then override individual sets.
- Copy an exercise prescription into a plan entry when adding it. Keep an optional source exercise ID, but editing the library exercise must not silently change existing plans.
- Store a complete prescription snapshot in a started session and its completed log. Later plan edits or archiving must not rewrite historical exercise names, targets, tags, units, or instructions.
- Autosave training drafts locally. `Save` explicitly creates a completed session; `Clear` confirms before deleting only that draft's entered results/notes and resetting it to its prescription.
- Plan/library removal should archive records needed by history or schedules. Explicit profile clearing and confirmed import replacement have separate deletion semantics.

### Calendar and dates

- Weeks run Monday–Sunday. Compute date keys using calendar-aware operations, not elapsed milliseconds divided by seven days.
- A schedule records the browser's IANA time zone when created, its start-week date, and its training-day-to-weekday mapping. Retain it internally across device imports; do not add timezone annotations to the current UI.
- New plans require duration in weeks. New schedules repeat for that many Monday–Sunday weeks anchored to their selected start week, unless stopped earlier. Existing records without duration remain unbounded. A duration mentioned in a name is never interpreted as a schedule length. Existing schedule durations change only through explicit preview/confirmation; earlier missed dates and started/completed sessions remain.
- Map each training day once per week to a distinct weekday within that schedule; remaining weekdays are rest days. Separate schedules may coexist.
- Identify occurrences by schedule ID, stable training day ID, and scheduled local date. Store the scheduled week/date separately from the actual completion timestamp.
- `Save` from a scheduled occurrence completes that occurrence only. An unscheduled session does not silently complete a calendar item.
- Completion is derived from saved sessions for the occurrence. A new week has new occurrences; never erase last week's logs or reset a global completion flag.
- Store actual event timestamps in UTC and retain relevant time-zone/date context. Distinguish `startedAt`, `completedAt`, and `loggedAt`, even when the latter two happen almost together.
- Editing scheduled plan contents preserves prior session snapshots. If training day IDs/count change, require the schedule mapping to be repaired before generating affected future occurrences; do not silently drop assignments.

## 4. Architecture and dependencies

Inspect `package.json` before making changes. The agreed stack is Vite, React, TypeScript, and Tailwind CSS, using free packages as needed:

| Area                 | Intended tool / boundary                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Local database       | Dexie and dexie-react-hooks; versioned schema and transactions                                      |
| Navigation           | React Router; existing hash routing replaced in Phase 2.5 with internal navigation at one URL       |
| UI                   | Tailwind, reusable shadcn/ui components where useful, Lucide icons                                  |
| Forms and validation | React Hook Form and Zod; shared domain schemas                                                      |
| Calendar and dates   | FullCalendar Standard free components where useful, date-fns, explicit time-zone handling           |
| Backups              | JSZip, Papa Parse, versioned JSON restore payload, image files                                      |
| Verification         | Repository's existing tools; add Vitest/Testing Library and a small browser suite only where needed |

Do not assume date-fns alone handles every required time-zone conversion. Choose and document a supported approach during the calendar phase. Avoid paid calendar plugins and unnecessary global state libraries. Database records are authoritative; temporary form state belongs in forms, and draft persistence has a defined save boundary.

### Suggested locations

| Path                                           | Responsibility                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/main.tsx`, `src/App.tsx`, `src/index.css` | Entry point, app composition, global styling                                          |
| `src/app/`                                     | Providers, routing, app configuration                                                 |
| `src/components/ui/`                           | Shared buttons, fields, dialogs, tabs, feedback                                       |
| `src/components/layout/`                       | Navigation, page shell, profile selector                                              |
| `src/features/profiles/`                       | Profile forms, selection, settings, storage notice                                    |
| `src/features/progress/`                       | Weight entries, photos, history/chart                                                 |
| `src/features/train/`                          | Session selection, exercise rows, timers, drafts, completion                          |
| `src/features/create/`                         | Exercise/plan builders, library filters, AI paste/import preview                      |
| `src/features/calendar/`                       | Views, scheduling, occurrence calculations                                            |
| `src/features/backups/`                        | Export/import, validation, preview, merge/replace operations                          |
| `src/db/`                                      | IndexedDB schema, migrations, profile-scoped persistence services                     |
| `src/schemas/`                                 | Domain schemas, AI interchange schema, backup schema                                  |
| `src/lib/`                                     | Small shared utilities for dates, units, names, IDs, URLs                             |
| `tests/`                                       | Cross-feature tests, fixtures, backup round trips, browser smoke tests                |
| `docs/`                                        | Add only when needed for a detailed schema or decision that would overwhelm this file |
| `TODO.md`                                      | This plan and the current implementation checkpoint                                   |

Do not create empty placeholder source files for every future feature. Create real files as their phase begins. Preserve useful existing organization when it already serves these responsibilities.

### Data model checklist

| Entity            | Minimum responsibilities                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Profile           | ID, name/name key, optional demographics, current weight, units, profile photo reference, settings, timestamps              |
| Exercise template | Profile scope, ID, name, ordered sets, rest values, instructions, optional tutorial, tags, timestamps, archive state        |
| Plan              | Profile scope, ID, name, ordered training days and exercise snapshots, revision, timestamps, archive state                  |
| Tag               | Profile scope, ID, display name/name key; references resolve within the profile                                             |
| Session draft     | Profile scope, ID, source plan/day/occurrence, prescription snapshot, entered results, notes, timestamps, revision          |
| Completed session | Stable ID, profile scope, immutable snapshot, actual sets and units, notes, occurrence reference, completion/log timestamps |
| Schedule          | Profile scope, ID, plan reference, effective dates, time zone, weekday assignments, mapping revisions                       |
| Progress entry    | Profile scope, ID, measurement date/time, weight and unit, optional photo reference, timestamps                             |
| Photo asset       | Profile scope, ID, local blob, content type, dimensions, size, role/reference                                               |

Nested prescriptions are acceptable; do not normalize every set into its own database table without a demonstrated benefit. Export can flatten nested data into linked CSV tables.

## 5. Phase overview

| Phase | Deliverable                                                       | Depends on        | Status      |
| ----- | ----------------------------------------------------------------- | ----------------- | ----------- |
| 0     | Verified setup and responsive app shell                           | Existing scaffold | Complete    |
| 1     | Local database, Guest workspace, profiles/settings                | 0                 | Complete    |
| 2     | Exercise library and Create Workout                               | 1                 | Complete    |
| 2.5   | Single-address navigation and refresh recovery                    | 2                 | Complete |
| 3     | Manual plan builder and plan editing                              | 2                 | Complete |
| 4     | AI formatting instructions, strict paste import, editable preview | 3                 | Complete |
| 5     | Training, rest timers, draft recovery, saved sessions             | 3                 | Complete |
| 6     | Calendar scheduling and weekly completion                         | 5                 | Complete |
| 7     | Progress weights/photos and profile synchronization               | 1, 5              | Complete |
| 8     | Complete ZIP/CSV/JSON export                                      | 1–7               | Complete |
| 9     | Backup restore, overwrite, merge, rename, and clear data          | 8                 | Complete |
| 10    | Integrated verification and usability polish                      | 0–9               | Verification pending |
| 11    | Static deployment and release smoke test                          | 10                | In progress — preparation only |

The default implementation order is numerical. Dependencies describe actual coupling, not permission to skip unfinished work. Phases are feature boundaries, not claims that each will fit into one prompt or session.

## Phase 0 — Inspect setup and create the app shell

Goal: the existing project starts reliably and exposes the intended navigation.

- [x] Inspect repository status, package scripts, source files, installed dependencies, and applicable instructions. Record what already works.
- [x] Verify React/TypeScript/Vite and configure Tailwind for the installed version. Preserve existing working configuration.
- [x] Establish the feature folders and shared layout as needed; replace only irrelevant starter demo content.
- [x] Add Train, Create, Calendar, and Progress routes plus a profile/settings entry. Mark unfinished pages clearly without fake persisted data.
- [x] Add the Support link configuration point. When a real Ko-fi URL is supplied, open it in a new tab with `noopener noreferrer`; until then show an honest unavailable state.
- [x] Build a readable responsive shell for phone and desktop, including keyboard focus and active navigation states.
- [x] Confirm route refresh behavior and the local development origin. Use the same origin consistently while testing local data.
- [x] Record actual development, build, lint, and type-check commands from the repository.

Acceptance: the app loads, navigation works, direct route refresh works, mobile navigation is usable, and the production build passes. No user data features are claimed complete.

## Phase 1 — Database, Guest workspace, and profiles

Goal: local records have a reliable owner and survive reloads.

- [x] Define the domain types and validation rules needed now; record future entity relationships without implementing future screens.
- [x] Add a versioned IndexedDB database and a documented migration approach. A future migration must not wipe existing data silently.
- [x] Create/load a persistent Guest workspace and track the active profile.
- [x] Implement named profile creation, selection, editing, and Guest-to-profile conversion.
- [x] Add optional age, height, weight, profile photo, and measurement-unit preferences.
- [x] Handle raster photo input with validated formats/size limits and local blobs; release object URLs when no longer needed.
- [x] Show the local-storage warning and explain that profiles do not have passwords.
- [x] Keep profile queries and writes isolated; handle empty, unavailable, and failed storage states.
- [x] Choose a concurrent-tab policy for writes: detect stale revisions/conflicts or otherwise prevent silent overwrites.
- [x] Add the minimal dated-measurement table/service now so settings weight changes use the same source as the later progress feature. Do not maintain unrelated weight copies that can drift; the history/photo/chart interface comes in Phase 7.

Acceptance: create two profiles, switch between them, refresh, and confirm their settings/photos remain separate. Guest data survives reload and naming. Invalid demographic entries show useful field errors. A failed write is not reported as saved.

## Phase 2 — Exercise library and Create Workout

Goal: users can create reusable exercises with every supported prescription field.

- [x] Build Create Workout with name, set count, per-set rep target/range, optional per-set RIR, rest between sets, rest after exercise, instructions, tutorial link, and tags.
- [x] Make only name, set count, and rep targets required. Provide clearly labeled optional fields and preserve explicit zero values.
- [x] Let users apply a rep/RIR prescription to all sets, then customize individual sets.
- [x] Create/select tags and prevent confusing duplicate tag names within a profile.
- [x] Add edit, duplicate, and archive operations with clear naming behavior.
- [x] Add search, A–Z/Z–A sorting, newest/oldest sorting, and tag filters. Default multiple selected tags to ANY match and label that behavior.
- [x] Validate tutorial links as supported HTTPS YouTube URLs; never execute imported HTML or fetch while editing/importing. The 2026-10-04 owner refinement authorizes embedding only after opening saved library details.
- [x] Save creation/update timestamps and retain stable IDs when editing.

Acceptance: create a three-set exercise with different rep/RIR targets, reopen it, and recover the same data. Missing optional values stay missing. All requested filters work together. Other profiles cannot see the exercise.

## Phase 2.5 — Single-address navigation

Goal: all Boros screens use one public address. With a configured custom domain,
Train, Create, Calendar, Progress, and Settings all display `https://boros-app.com/`.
The domain is illustrative until the owner supplies and configures it.

This phase supersedes earlier hash-routing requirements. Previous handoff entries
describe the implementation tested at that time; retain them as historical records.
Complete Phase 2.5 after Phase 2 and before Phase 3.

### Navigation behavior

- [x] Replace hash routing with React Router's memory routing, reusing existing
      route components and navigation where practical.
- [x] Keep the address unchanged when switching screens: no screen-specific
      pathname, hash, or query parameter.
- [x] Support both a custom-domain root and GitHub Pages project subpaths.
      Preserve the deployment base path; never hardcode the illustrative domain.
- [x] Keep routing configuration and navigation helpers in `src/app/` so a
      future move to URL-based routing does not require rewriting feature logic.
- [x] Preserve the four bottom tabs, Settings entry, active-screen indicators,
      document titles, keyboard focus handling, and accessible navigation.
- [x] Preserve unsaved-edit confirmations, profile isolation, stale-write
      protection, and recoverable form input.

### Opening and refreshing

- [x] Open Train on first use in a browser tab.
- [x] Remember the last successfully opened top-level screen in `sessionStorage`
      and restore it after refresh in that browser tab.
- [x] Validate the remembered screen against an allowlist. Missing, invalid, or
      unavailable session storage falls back to Train without blocking the app.
- [x] Store only navigation information in this preference. Do not place profile
      records, photos, or form contents in session storage.
- [x] Persist the destination only after navigation succeeds; canceling an
      unsaved-edit confirmation must leave the remembered screen unchanged.
- [x] Restore screen selection only. This phase does not promise recovery of
      unsaved editor contents; retain existing warnings and save behavior.
- [x] Handle existing top-level `/#/...` bookmarks once at startup: select a
      recognized screen, then remove the legacy hash without adding a history entry.
      Unknown legacy routes fall back to Train.
- [x] Keep skip-to-content behavior accessible without leaving a hash in the
      address bar.

### History and future routing

- [x] Internal screen changes do not create browser Back/Forward entries.
      Browser Back may leave Boros; retain existing unsaved-change unload warnings.
- [x] Provide a clear in-app return action from Settings. Bottom tabs remain
      available for switching screens.
- [x] Document that copied/bookmarked URLs open Boros, not a particular screen.
- [x] Keep any existing in-app back actions consistent with internal navigation.
- [x] Do not add server rewrite rules or a custom 404 workaround for this mode.
      Future clean path URLs require a separately planned hosting/routing change.

### Verification and documentation

- [x] Update existing navigation tests to match this behavior. Do not retain
      assertions that require hashes or browser history between screens.
- [x] Verify all five screens keep the same address in development and production
      preview, including refreshing each screen and opening a fresh browser context.
- [x] Verify legacy hash entry, invalid remembered screens, unavailable session
      storage, and cancellation of navigation with unsaved edits.
- [x] Verify profile/settings/exercise persistence and profile isolation remain
      intact. Use isolated test data; do not clear existing user records.
- [x] Check production assets and navigation at both `/` and a representative
      project subpath using static hosting without an SPA rewrite fallback.
- [x] Run build, type checks, lint, and affected browser tests. Carry forward
      previously unverified physical-device and browser-engine checks.
- [x] Update README, current checkpoint, decision log, and handoff with actual
      behavior and verification. Preserve previous verification records.

Acceptance: switching screens never changes the address; refresh restores the
last valid top-level screen in the current browser tab; fresh use opens Train.
Existing data and unsaved-edit protections remain intact. The production build
works under a root or project subpath without server route rewrites.

## Phase 3 — Manual plans and editing

Goal: users can assemble and fully edit ordered training days.

- [x] Build Create Plan with name, training days/week, and visible rest-day count.
- [x] Create exactly the requested number of named/numbered training days and assign stable IDs.
- [x] Select exercises from the custom library and from exercises already inside plans, including AI-created plans once available.
- [x] Reuse the name/date/tag filters from the exercise library.
- [x] Add/remove/reorder exercises within a day and move them between days. Provide accessible move controls even if drag-and-drop is added.
- [x] Edit every prescription field within a plan without silently changing the source exercise or other plans.
- [x] Add/remove/reorder training days and validate the plan before saving. Warn before discarding populated days.
- [x] Support plan edit, duplicate, and archive actions. Plans that share exercises must remain independent.
- [x] Require at least one exercise per training day when saving a usable plan; allow an incomplete form to remain open while editing.

Acceptance: save and reopen a four-day plan, change one copied exercise, and confirm the library and other plans are unchanged. Day/exercise order survives reload. Invalid plans cannot be saved as usable plans.

## Phase 4 — External AI formatting and paste import

Goal: AI output becomes an editable plan/exercise only after strict validation.

- [x] Define a versioned public interchange schema shared by prompt generation, parser validation, preview, and import tests.
- [x] Provide Copy Formatting Instructions for both a plan and a single workout. Clipboard failure must leave selectable text available.
- [x] Tell the external model to produce only the specified JSON, preserve requested targets, include tags/instructions when available, and use `null` for missing optional values or unknown tutorials.
- [x] Accept raw JSON or one fenced JSON block. Reject ambiguous multiple blocks, surrounding prose, malformed JSON, wrong versions, wrong types, unknown fields, and invalid nested values with useful errors.
- [x] Do not execute pasted code, render raw HTML, or silently guess/rewrite invalid structures. Report errors using paths such as `plan.days[1].exercises[0].sets[2].reps.max`.
- [x] Validate the entire payload before opening an editable preview. No database writes occur on parse failure or preview cancellation.
- [x] Reuse the manual builders for preview/editing; generate internal IDs locally and apply the same naming/tag rules.
- [x] Save the whole validated import atomically and clearly explain duplicate-name resolution.
- [x] Add fixtures for valid plans/workouts, heterogeneous sets, missing optional fields, malicious text/links, malformed ranges, and mismatched day counts.

Implemented public interchange contract: `schemaVersion: 1`, `kind: "plan" | "workout"`, and exactly one matching payload (`plan` or `workout`). A plan has `name`, `trainingDaysPerWeek`, and ordered `days`; a day has `name` and `exercises`. Each exercise has `name`, ordered `sets`, nullable `restBetweenSetsSeconds`/`restAfterExerciseSeconds`, `instructions`, nullable `youtubeUrl`, and string `tags`. A set has `reps: { min, max }` and nullable `rir: { min, max }`. Omitted `rir`, rest fields, and `youtubeUrl` default to null; omitted instructions to an empty string; omitted tags to an empty array. Null instructions/tags are invalid. Unknown fields at every object level are rejected, including IDs/ownership/notes. Notes can be added in the preview. The number of sets is the array length, and the number of days must equal `trainingDaysPerWeek`. Names and prescriptions reuse existing limits; parsing is capped at 1,000,000 characters, with a visible error rather than truncation. Full shape and examples are in README and `src/schemas/interchange.ts`.

Acceptance: a valid four-day payload produces the same editable structure as a manually built plan. Invalid input gives an actionable error and leaves the database unchanged. Editing and canceling the preview does not create hidden records.

## Phase 5 — Train, timers, drafts, and saved sessions

Goal: users can perform and reliably record a complete training day.

- [x] Allow selecting a saved plan and training day. Scheduled-day entry points remain assigned to Phase 6.
- [x] Render exercises in their planned order, with set rows from first to last and a concise prescription summary.
- [x] Add session-level and exercise-level Note buttons with editable text.
- [x] Show each set's weight, kg/lb unit, actual repetitions, target repetitions, and target RIR. Actual RIR may remain optional.
- [x] Allow zero load for bodyweight/unloaded work and distinguish blank results from recorded zero. Prevent invalid negative values and incompatible partially entered sets from becoming completed results.
- [x] Add REST controls between sets and between exercises, using their respective durations. Unspecified rest can be entered manually; do not invent a prescribed duration.
- [x] Use a single active rest timer with a stored end timestamp, visible remaining time, and stop/reset controls. Recalculate after tab backgrounding instead of relying on interval ticks alone.
- [x] Persist drafts as users enter results/notes; show save failures and resume the correct draft after reload/profile switching.
- [x] On Save, validate entries, explain incomplete sets, and let users explicitly save a partial session with omitted sets recorded as skipped. Require at least one recorded set; do not fabricate results.
- [x] Snapshot prescriptions and write session completion plus draft finalization in one transaction. Repeated clicks/retries must not duplicate a session.
- [x] Treat an explicitly saved partial session as completed with a visible partial marker. Selected-occurrence association/completion remains assigned to Phase 6; Phase 5 creates no calendar flags.
- [x] Add Clear with a confirmation that describes its draft-only scope. Cancel preserves all input; confirm clears entered results/notes and any active timer owned by that draft.
- [x] Provide a way to review saved session details, including actual results, notes, and timestamps.

Acceptance: complete an exercise, use both timer types, reload mid-session, and recover inputs. Save twice rapidly and get one log. Edit the source plan and confirm the log remains unchanged. Canceling Clear preserves the draft. A storage failure retains recoverable input and does not mark completion.

## Phase 6 — Calendar and weekly completion

Goal: a recurring weekly plan connects to the correct completed training sessions.

- [x] Add week view by default, day/month views, Today, and previous/next navigation without an arbitrary history window.
- [x] Add Plan flow: select plan, choose starting week, assign each training day to a distinct weekday, and preview the schedule.
- [x] Calculate occurrences only for the displayed/relevant date range; do not pre-create infinite future database rows.
- [x] Show scheduled training days and their completed/incomplete state in Calendar and Train.
- [x] Connect a started session to its stable occurrence identity. Retrying/reopening that occurrence must not accidentally create duplicate completion records.
- [x] Grey out and strike through completed training days for the relevant week while keeping their saved details readable.
- [x] Leave other training days active. The next week's occurrences start incomplete automatically without deleting or modifying previous logs.
- [x] Leave missed prior occurrences visible as missed/incomplete history; do not silently move them into a different week.
- [x] Define schedule edits with effective dates/revisions so changing a future mapping does not rewrite historical occurrences.
- [x] Handle plan-day removal/count changes with an explicit remapping flow; preserve completed sessions and their prior schedule context.
- [x] Stop/remove future scheduling without deleting historical sessions. Support separate schedules without confusing their occurrence IDs.
- [x] Test Sunday/Monday, year boundaries, leap days, daylight-saving changes, and reading a stored schedule after a browser device-zone change. No backup import was implemented to test this.

Acceptance: schedule four days, save one, and see only that occurrence crossed out. Visit the next week and see fresh incomplete days; revisit the prior week and see its completion/history. A future mapping edit changes future occurrences while prior session dates stay intact.

## Phase 7 — Progress and profile measurements

Goal: users can track body weight/photos and see a consistent current weight.

- [x] Add dated weight entries with optional progress photos, stored locally and scoped to the active profile.
- [x] Show chronological history and a simple weight-over-time chart with explicit units.
- [x] Support reviewing, correcting, and deleting a progress entry/photo with appropriate confirmation for deletion.
- [x] Derive current profile weight from the latest measurement timestamp, not insertion/import order. Use a deterministic tie-breaker when timestamps match.
- [x] A weight change in settings creates/updates a dated measurement through the same service; progress and profile must not disagree.
- [x] Backdated/imported earlier measurements must not replace a more recent weight. Correcting/deleting the latest entry recalculates current weight from the remaining records.
- [x] Keep the permanent profile photo separate from progress photos unless the user explicitly chooses a photo as the profile photo.
- [x] Validate image size/type, manage previews, and remove unused photo blobs without deleting shared references.

Acceptance: add several out-of-order measurements and see the latest measured weight in the profile. Switch units, edit/delete the latest entry, and confirm the correct remaining value. Progress photos never silently replace the profile photo, and other profiles remain isolated.

## Phase 8 — Download complete profile data

Goal: one ZIP is both human-readable and sufficient for a complete restore.

- [x] Implement Download Data for the active profile and clearly identify that scope.
- [x] Define a versioned backup contract with a manifest, complete `data.json`, linked CSV tables, and photo files.
- [x] Include profile/settings, tags, exercise templates, plans, training days, prescriptions, schedules/mapping history, drafts, completed sessions/actual sets, notes, progress entries, photos, archive states, and timestamps.
- [x] Flatten readable CSVs for profiles, exercises, tags/relationships, plans, days, plan exercises/sets, schedules, sessions/session exercises/session sets, and progress as needed. Include IDs, foreign keys, order, explicit units, and date/time meanings.
- [x] Make `data.json` plus the manifest/assets authoritative for restore. CSV is the readable export, not a lossy source for reconstructing nested relationships.
- [x] Escape commas, quotes, and multiline notes correctly; protect spreadsheet-facing string cells from formula execution without altering the canonical JSON values.
- [x] Record schema/app version, export time, profile name/ID, record counts, and an asset inventory/checksums in the manifest.
- [x] Read a consistent snapshot and generate the archive before reporting success. Export failure must not modify the source data.
- [x] Do not export secrets or machine-specific local URLs. Explicitly exclude transient timer ticks/UI state; preserve relevant training draft results.
- [x] Use a recognizable filename containing the profile name and export timestamp; warn that the downloaded ZIP contains personal data/photos and is not password-protected.
- [x] Validate a representative archive independently against the backup schema before marking export complete.

Acceptance: export a profile containing all feature types and open its CSV/JSON/photo files. Confirm IDs, order, ranges, units, notes, timestamps, and image references are preserved. Export another profile and confirm no cross-profile records appear. Full round-trip verification completes in Phase 9.

## Phase 9 — Upload, replace, merge, rename, and clear

Goal: imports are reviewable and atomic, with exactly the promised conflict behavior.

### Validation and preview

- [x] Accept the supported ZIP format, validate manifest/version/structure/assets/references, and reject unsupported future versions with an actionable message.
- [x] Define and enforce archive limits for compressed size, expanded size, entry count, and individual images. Reject unsafe paths and duplicate/ambiguous entries.
- [x] Use canonical JSON for restore; never execute imported HTML/scripts or treat CSV formulas as program instructions.
- [x] Parse into temporary memory/staging and show profile name, counts, conflicts, replacements, and errors before writing live data.
- [x] Match profile names using the same normalized key as profile creation. A new name imports as a separate profile with an independent profile ID.
- [x] If an imported ID conflicts with another local identity, resolve it within the selected profile or remap references safely; never overwrite an unrelated profile because IDs happen to match.

### Required choices when a profile name matches

| Choice                       | Required result                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Replace this profile         | After explicit confirmation, replace all data belonging to that one profile with the validated backup. Preserve other profiles. |
| Merge — prefer this device   | Keep the local version of each conflicting record/family; import nonconflicting items from the file.                            |
| Merge — prefer imported file | Replace conflicting record/families with their imported versions; retain unrelated local items and import nonconflicting items. |
| Import under a new name      | Require an unused name and import an independent profile; existing profiles remain untouched.                                   |
| Cancel                       | Make no live-data changes.                                                                                                      |

Never label the file automatically as `older` or this device as `newer`: either can contain newer information. Display the actual export/modified dates as context, but the user's chosen source decides precedence.

### Conflict and relationship rules

- [x] Match plans/library exercises by stable ID first and normalized name second. If ID and name resolve to different candidates, report an ambiguity; do not guess.
- [x] For a conflicting plan, treat its days, exercise prescriptions, schedules, drafts, completed sessions, and associated notes as one plan family.
- [x] Prefer this device: keep the entire local plan family and skip the matching imported family, including its unique session logs. This is the owner's requested whole-plan priority rule, not a union of session histories.
- [x] Prefer imported file: remove the matching local plan family and restore the entire imported family, including its history. Preview how many local logs/drafts/schedules will be removed.
- [x] For identical records, deduplicate by stable identity. Reimporting the same backup must not keep creating duplicate records.
- [x] Keep reusable library exercises/tags independent of a plan family's ownership. Removing a losing plan family must not delete a library item, photo, or record still required by another retained record.
- [x] Plan prescriptions and session snapshots remain self-contained when their original library exercise differs or is archived. Maintain/remap references consistently.
- [x] For profile fields, the selected precedence source wins conflicting values, including explicit nulls. For progress and independent records, merge distinct IDs and apply precedence to same-ID conflicts; recalculate current weight afterward.
- [x] If divergent progress records refer to the same logical measurement, surface a conflict where identifiable; do not erase legitimate distinct measurements merely because their dates match.
- [x] Import assets required by winning records, preserve assets still in use, and remove only genuinely unreferenced assets.
- [x] Apply the complete chosen operation in one IndexedDB transaction after validation. A failure or cancellation must leave the live profile unchanged.
- [x] Handle stale concurrent changes between preview and commit by rebuilding/reconfirming the affected preview rather than applying an outdated destructive plan.

### Clear Data

- [x] Provide Clear Data in profile settings with an explicit summary of what will be deleted and an opportunity to download a backup.
- [x] Require confirmation and clear only the selected profile's records/assets. Return to an empty usable workspace while preserving other profiles.
- [x] Cancel leaves data and selection unchanged. Never label clearing a workout draft as clearing profile data.

Acceptance: verify new-name import, each precedence mode, full replacement, rename, and cancellation using two profiles with overlapping plan names and different logs. Test repeated imports, malformed ZIPs, missing photos, interrupted/failed writes, and deletion counts. Complete an export → import → export semantic comparison, allowing only intentional identity remapping and export metadata differences. Other profiles must remain byte/semantically unchanged as appropriate.

## Phase 10 — Integrated verification and usability

Goal: the complete workflow is usable and the data rules hold across features.

- [x] Run production build, type checks, lint, data and affected browser/static suites; resolve introduced regressions. Exact full-suite and targeted follow-up results are in the Phase 10 handoff; the Windows WebKit environment blocker remains separate below.
- [x] Cover meaningful domain cases: validation, per-set ranges, unit conversion, immutable history, duplicate-save prevention, weekly boundaries, parser failures, backup precedence, and transaction rollback (90 isolated data tests plus existing browser interaction suites).
- [x] Run the complete Guest → named → exercise → manual four-day plan → schedule → training/rests/notes → completion/history → progress/photo → export → renamed restore journey; include AI plans, unfinished draft recovery, exact canonical/image comparison and another unchanged profile.
- [x] Confirm AI imports and manual plans use the same editor, training UI, scheduling, history and persistence path.
- [x] Check automated phone/desktop layouts, keyboard access, labels, focus, dialogs, readable errors and textual completion states in both themes; fix WebKit trigger focus and obscured training fields. Physical-device/accessibility-user checks remain below.
- [x] Verify refresh, profile switching, simultaneous/stale tabs, failed/pending saves and restore/merge/clear ownership protection. This does not claim suspended-device recovery or real quota exhaustion.
- [x] Check user text/filenames/imports remain inert; background loading stays local. Current owner-authorized library-detail embeds and explicit Train tutorial links are intercepted in automated tests; real desktop playback is checked separately.
- [x] Preserve explicit-click Train tutorial/Support links; opening Create-library details now authorizes its validated player. Unavailable Support checked; actual Ko-fi content remains unverified.
- [x] Verify existing image bounds, on-demand display, object URL cleanup and larger-archive progress. Original photo bytes remain uncompressed by Boros; no resizing is claimed.
- [x] Exercise the documented 100-exercise/20-plan/500-session/730-measurement/12-JPEG dataset; record exact environment, sizes and timings in docs/phase10-verification.md.
- [x] Confirm storage, saved-only backup, destructive previews and commit-only success wording. Replace obsolete unbenchmarked-capacity wording without promising a maximum.
- [x] No production demo records or fake feature actions found. Remove unused @hookform/resolvers, react-hook-form and date-fns (plus their now-unused transitive package); preserve the user's gh-pages 6.1.1 pin and deployment scripts.
- [ ] Complete photo-bearing profile/progress/restore verification in a Blob-capable WebKit/Safari environment. Native Windows WebKit Blob writes fail independently of Boros; do not mark this as passed.

Acceptance: the full journey passes, critical data-integrity tests pass, and remaining limitations are recorded explicitly. No known defect remains that can silently corrupt/erase data or misreport a successful save/restore.

## Phase 11 — Static release

Goal: publish the tested SPA at a stable address when the owner authorizes deployment.

- [ ] Finish live Support acceptance: the real Ko-fi URL is supplied and configured for production, and protected opening passes local browser checks. Owner confirmation of the account page remains pending behind its Cloudflare challenge.
- [x] Inspect and prepare the existing GitHub Pages release: public `jsaldana92/boros`, `origin`/`gh-pages`, `dist`, CLI-generated CNAME for `boros-app.com` and `.nojekyll`; retain exact gh-pages 6.1.1 and current scripts. Owner reports HTTPS resolved on 2026-10-03; earlier hostname failure is historical. No new independent production check is claimed.
- [x] Document local setup, actual scripts, supported backup versions, storage scope, single-address navigation, and release steps in README and docs/release-preparation.md.
- [x] Produce the release build and verify unchanged-address navigation, remembered-screen refresh, asset paths, and startup at both static root and project subpath. Current Group 3 candidate: 312/312 static browser checks and 23/23 resource hashes per mount. Earlier release/Group 1 results remain historical. No screen-specific server routes are required.
- [x] Explain separate origin ownership and the original-ZIP export/import procedure; preserve source records until target reload, photos/history and isolation are checked.
- [ ] Deploy only when instructed, then run the short release smoke test on the published origin.
- [ ] Create a profile, save/reopen a plan/session, reload, export a backup, and confirm persistence from the published site. Check a phone-sized viewport and the Support link.
- [ ] Record the release URL/version, verification date, and known limitations.

Preparation evidence is in docs/release-preparation.md; the current candidate fingerprint and verification are in docs/group2-verification.md.
Phase 11 remains incomplete: Phase 10's required Safari check, live Ko-fi acceptance,
and the changed Group 3 artifact's separately authorized publication/smoke are pending.
The owner's HTTPS resolution and working published site are recorded without claiming a fresh automated production check.

Acceptance: the published app passes the release smoke test, data survives reload at its stable address, and backups work. Offline cold start remains outside the release promise unless separately implemented and verified.

## Owner revisions — Groups 1–4 (approved 2026-10-03)

These owner requirements supersede conflicting earlier UI/default requirements.
Historical phase handoffs remain evidence of the behavior verified at those dates,
not authority to omit these revisions. Implement one requested dependency group at
a time; Groups 2–4 below are **not implemented** by Group 1.

### Group 1 — Compatibility, Support, branding and general controls

Status: **Verification pending** for live Support acceptance. Application/local checks are complete; HTTPS is subsequently owner-confirmed resolved. Earlier diagnosis is preserved in the historical handoff.

- [x] Centralize every application UUID path on native randomUUID or secure getRandomValues UUID v4; retain IDs, ownership, records and schema. No Math.random/time/counter fallback. Data tests cover missing/throwing sources and atomic rollback.
- [x] Report unsupported random/hash APIs as compatibility issues; retain genuine storage errors, input recovery and strict backup checksums. Preserve manual clipboard fallback.
- [x] Verify native/missing-randomUUID startup, existing IDs, saved records and isolation after reload through the browser and complete import/training/photo/restore journey.
- [x] Configure the supplied `https://ko-fi.com/jhonatansaldana` via the existing Vite mechanism in the production build; verify explicit protected new-tab opening. Actual production bundle and popup destination/flags checked locally; remote account content is a separate check below.
- [x] Use the actual owner snake.png/logo.png, preserved aspect ratios and both themes; avatar-only Settings with accessible name/tooltip; either brand image returns to Train through the existing guard at one address.
- [x] Pair height/weight units beside their inputs, keep Age separate at phone widths, remove the requested weight explanation, and compact sorting/filter controls without reducing touch targets or labels.
- [x] Show minute precision in ordinary date/time fields/displays while preserving exact saved UTC/zone context on unrelated edits and full backup precision; deliberate date edits choose a minute explicitly.
- [x] Finish build/type/lint/data and affected static/browser verification, record actual results and update the candidate fingerprint. Exact runs, fixture corrections and remaining environment limits are in the latest handoff and docs/group1-verification.md.
- [x] Diagnose HTTPS separately: owner Chrome bypass report and independent default-validation Edge/Node observations establish a certificate hostname mismatch. No security warning bypass, certificate-validation change or checksum weakening in this work.
- [x] Owner reports HTTPS resolved and the site working (2026-10-03). No hosting mutation or warning bypass by this task. A fresh independent certificate/SAN/API/mixed-content capture is not claimed; retain that capture in the next release smoke.
- [ ] Owner confirms the live Ko-fi account page. Automated live navigation reaches a valid TLS response but a Cloudflare 403 challenge, not verified account content.

### Group 2 — Supersets and plan duration (complete in available local checks)

Compatibility decisions: retain IndexedDB v5 and all existing records without a migration; nested group/duration fields need no new index. AI contract v2 supports v1 with duration entered in preview. Backup v2 accepts strict v1 archives only after original integrity/structure validation, preserving absent duration as unbounded. Supersets have stable internal UUIDs distinct from editable day-local numbers. Duration changes on existing schedules require an explicit preview and apply from a selected Monday without rewriting earlier dates or started/completed snapshots.

- [x] Permit repeated occurrences of the same exercise in a day, including standalone plus superset occurrences; each occurrence owns a stable ID, prescription, notes and results. Known library provenance is retained through plan copies.
- [x] Add per-exercise Superset toggle and positive-integer group number in the plan editor. Matching numbers group at least two exercises within that training day only; never join days/plans by a number alone. Stable group UUIDs survive renumbering; joining shows actual execution order immediately.
- [x] Define unequal-set handling, member order, invalid one-member groups and rest between rounds/after the group. Rounds use the largest set count and omit shorter members without inventing sets; blank rest permits manual duration, zero remains explicit. Preserve standalone member rests without applying them between members.
- [x] Train presents “Superset 1”, member/prescription summary, then ordered rounds: Set 1 A weight/reps, B weight/reps, REST; Set 2 likewise. Support more than two members. Preserve per-member notes/info, read-only weight units, single timer, autosave/Clear/partial and full Save, revision/profile/retry guards and immutable history.
- [x] Support group/member movement, removal, dissolution and duplication without prescription loss; copied plans get new day/group/occurrence IDs. Incomplete groups remain editable but cannot be saved until repaired.
- [x] Support supersets in manual creation and AI v2 instructions, strict parser and editable preview. Keep workout v1/v2; legacy AI plans require owner-entered duration in preview. Unsupported fields/versions and contradictory memberships report paths before writes.
- [x] Require positive duration for new plans and bound newly created schedules to exactly that many calendar weeks. Preserve legacy unbounded records. Freeze schedule duration/end dates; existing schedule changes use a separate review/confirmation and effective Monday while preserving earlier missed dates and started/completed snapshots.
- [x] Update schemas, occurrence identity, all plan/schedule/session snapshots and readable history together. Keep database v5; no index/migration or record rewrite needed. Verify populated-store reopen and photo preservation.
- [x] Export backup v2 JSON/manifest/linked CSVs and restore both v1/v2. Validate original v1 archive integrity/strict fields/assets before changing only the in-memory envelope. Verify duration-history/group round trips, repeated results, both whole-family merge priorities and root remapping.
- [x] Verify build/type/lint, data 108/108, static browsers 296/296, development Group 2 8/8, Firefox 138 passes + 2 cleanup-failure reruns passing (2 expected skips), and 23/23 resource hashes per static mount. Actual commands and initial failures are in docs/group2-verification.md. Physical/Safari/manual release gates remain explicitly unverified.

### Group 3 — Calendar and Train (complete in available local checks)

- [x] Move editable time-zone preference to profile Settings; existing schedules retain their recorded zone and dates when the preference changes.
- [x] Remove Calendar's Create Plan action; retain Add Plan for existing plans. Default to the current calendar month with complete Monday–Sunday weeks and dim adjacent-month dates while retaining events.
- [x] Inspect/reuse the existing distinct-weekday mapping and preview before changing it. Add Plan maps each training day to a distinct Monday–Sunday weekday and repeats for the explicit plan duration.
- [x] Train empty state: “Train” and “No active plan(s) selected.” Preserve access to saved history through the redesigned Progress flow; coordinate that move with Group 4 rather than hiding existing history prematurely.
- [x] Persist active-plan selection per profile. One selected plan opens directly; multiple selected plans show selectable cards and clear internal Back navigation.
- [x] Scheduled cards show last completed workout date and next pending scheduled date, with PAST DUE (red), DUE TODAY, COMPLETED or ON GOING status pills.
- [x] Define status precedence using actual pending/completed occurrences. An expired plan with missed sessions is not automatically completed; do not infer history from display names.
- [x] Preserve draft recovery, partial completion, notes, timers, edit guards and immutable session history at every drill-down level; keep the public address unchanged.

### Group 4 — Progress redesign (complete in available local checks)

- [x] Body weight: make the graph primary; remove the visible history/debug dump, canonical values, IDs and technical timestamps. Remove “Vertical scale...” and “One recorded point. Coincident points may overlap...” copy.
- [x] Add numeric Y-axis labels, angled X-axis dates, prominent colored points and clearer section dividers. Keep entry/correction/deletion/photos and accessible record selection; never delete underlying history.
- [x] Plan progress: horizontal selectable plan-card carousel, completed-day/workout counts with explicit counting rules, then exercise/superset drill-down.
- [x] Exercise details show starting/latest actual weights and reps, minimum/maximum recorded weights with associated reps/dates, and a weight-by-date graph.
- [x] Workout progress: alphabetically arranged saved exercises/supersets in three columns with readable responsive behavior; equivalent statistics across plans.
- [x] Aggregate by reliable exercise identity, never name equality alone. Define legacy/unlinked records without silently merging unrelated movements; use completed-session actual results, convert units, exclude blank/skipped sets and retain valid zero loads.
- [x] Define multiple-set and tied-date presentation. For supersets use separate member sections/graphs/dividers without combining different exercises' loads. Distinguishable point colors need accessible labels; an additional repetition graph is optional.
- [x] Keep saved-session history reachable through Progress and add Back controls at each level without changing the public URL. Add integrity, accessible graph and navigation tests before calling the redesign complete.

Implementation checkboxes above describe completed code changes. Final acceptance results are
recorded in the current Group 4 handoff and [verification record](docs/group4-verification.md).
Next: integrated verification of Groups 1–4 and final published-version smoke,
with publication and overall release acceptance remaining separate owner actions.

### Owner refinements — Create and AI formatting (historical local verification; catalog superseded below)

- [x] Both prompts request one complete fenced `json` result with ASCII delimiters; preserve the public contract, raw/fenced parser compatibility, strict validation and clipboard fallback. Explain smart delimiters without replacing valid Unicode punctuation.
- [x] Plan-only superset execution instructions explain A20/B8 rounds, unequal counts and optional/zero rest. Train now offers exactly one post-group boundary after the final round even when it ends the session; no timed breaks between members.
- [x] Shared Minutes/Seconds input for prescriptions, AI previews, group rests and manual Train timers. Canonical integer seconds, missing/zero distinction and validation limits remain intact.
- [x] Group footers follow their last member; numeric “Superset name,” concise help and confirmed red Delete keep prescriptions/IDs/history. Adjacent arrows, short labels and a Move destination dialog preserve guards, limits, focus and grouping constraints.
- [x] Compact Workout/Plan/AI action cards, dividers, short filters, ANY-match pressed tag pills, scrolling name-only exercise cards and accessible source/action dialogs. Plan cards summarize training/rest days and duration and expose lifecycle actions through a dialog.
- [x] Read-only catalog includes already-saved AI/manual plan prescriptions without reimport or template writes. Explicit source identity plus full prescription and archive state define presentation buckets; repeated unlinked prescriptions deduplicate only within their saved plan. All sources remain editable in their exact owning context; history identities stay unchanged.
- [x] Focused data tests and browser checks cover contracts/Unicode, rest round trips, catalog scope/identity, source editing, group boundaries/footer/deletion, movement, focus, both themes and dirty guards. Data **126/126**, focused Edge **8/8**; build/typecheck/lint passed.
- [x] Complete root/project static suite **344/344**, strengthened focused static **16/16**, focused Firefox rerun **8/8** after two test-setup failures in the **88-pass** regression run, capacity **1/1**, final handoff and diff checks. Exact runs and limitations: [Create verification record](docs/create-refinements-verification.md). No physical-device or release gate is marked passed by these local checks.

### Owner refinements — standalone templates and Create/editor (2026-10-04; complete in available local checks)

- [x] Main library and picker read real profile-owned templates; direct library edits save without entering a plan. Independent occurrence snapshots, repeated IDs, groups, notes and completed history remain separate.
- [x] AI plan save atomically creates/reuses templates, tags and linked snapshots. Existing valid identities win; normalized active names reuse defaults unchanged; first occurrence supplies a new repeated name's default. Preview explains the rule. Public AI v2/legacy v1 `workout` contract stays intact.
- [x] Idempotent transactional repair at workspace initialization/profile selection, never render. Active/oldest retained plan defaults precede archived defaults; valid links and historical provenance stay intact. Changed links invalidate stale plan revisions while preserving timestamps. Failures/ambiguous identities leave existing records recoverable and unchanged.
- [x] Backup v4 retains optional repaired `templateId` and CSV reference. Strict v1–3 archives remain readable after original integrity checks. Validated restore previews include the repair and commit it atomically; repeated merge does not multiply templates. Database stays v5. No reset or owner-data clearing.
- [x] Exercise terminology and guarded breadcrumbs in standalone, plan, picker and AI contexts. Lighter day surfaces; adjacent arrows and popup Edit/Duplicate/Move/Delete; existing Move dialog, Escape/focus and dirty/unload protections.
- [x] Name-only bounded library/picker lists; single Add and bulk Add selected, filtered Select All including offscreen rows, unchecked partial state, selection reconciliation and sort-order insertion. Pending Cancel/Back inserts nothing; parent plan remains unsaved.
- [x] Shared collapsed Tags disclosure with ANY semantics, at most three horizontally scrolling rows and Clear. Set 1 spacing, full-height/stacked rest divider, A–Z existing-tag dropdown with about ten visible rows and all options retained.
- [x] Data **131/131**, build, typecheck, lint and diff checks passed. Full static **348 passed / 4 obsolete inline-Edit locator failures**; corrected popup test and final training/backup/restore rerun **64/64** resolves all four. Focused Firefox **12/12**. Earlier diagnostic runs are recorded in the verification notes.
- [x] Final handoff/README/import/backup documentation reviewed; owner assets and index hashes unchanged. Exact commands, coverage and limitations: [current verification](docs/template-ownership-verification.md).
- [ ] Owner physical-device, assistive-technology, Safari/Blob, live Support and published-version gates remain unverified; local emulation does not close them.

### Focused Create titles and library modal (2026-10-04)

- [x] Replace clickable breadcrumbs with one plain-text title path per visible screen. Keep guarded Save/Apply/Cancel/Close and unrelated routing.
- [x] Reuse shared native dialogs with body scroll lock, inert lower dialogs, Tab wrapping and focus recovery. Backdrop clicks cannot activate background controls.
- [x] Add top-right Exercise actions button and a second modal with vertical Edit/Duplicate/Archive; retain Restore for archived templates and archive confirmation. Preserve owner IDs, stale-write protection and independent snapshots.
- [x] Render saved Instructions then separated Note as plain text without empty-section filler. Embed a supported tutorial only while details are open and unobscured, using a validated ID, no autoplay and correct referrer/minimum dimensions. Dispose on close/editor/action transitions.
- [x] Focused data **133/133**, affected root/project desktop/phone static suite **188/188**, build/typecheck/lint/diff passed. Real desktop sample playback advanced with paused=false; close disposed of iframe without opening another tab.
- [x] Cross-engine **20/20** and retained-context updates **6/6** pass against this candidate. See docs/create-details-verification.md for exact commands, intermediate failures and actual-versus-simulated playback evidence.
- [ ] Physical phone/Safari playback, fullscreen/app-opening and assistive-technology checks remain manual; earlier acceptance gates and affected-browser persistence evidence remain pending.

### Deployment persistence investigation (2026-10-04; affected-browser verification pending)

- [x] Inspect stable `boros` database/schema, initialization/Guest and active selection, error handling, explicit reset operations, deployment scripts, manifest and service-worker/cache behavior. No reset-on-deploy path or application defect was found in this audit.
- [x] Test exact prior `gh-pages` artifact a87dc13 → current deployed aa9126e → two independent current-source production builds at one unchanged address, retaining the same browser context/storage across all transitions and page reopens.
- [x] Create fixtures through the old UI with distinct active owner/Guest, exercise/tag, plan/schedule, selected Train plan, saved session, committed draft, measurement, photo Blob and theme. Compare all records/IDs/photo bytes; verify permitted legacy AI-link repair separately and preserve historical snapshots.
- [x] Verify a simulated database-open failure displays an actionable error with all records intact and creates no replacement Guest; retry/reload restores the original owner.
- [x] Final update matrix **6/6**: desktop Edge root, emulated-phone Edge project subpath, desktop Firefox root. Data **131/131**; build/typecheck/lint/diff checks pass. Add read-only diagnostic script and reproducible verification record.
- [x] Read-only live audit: final `https://boros-app.com/`, valid secure context, no manifest link, no registered service worker, 19 observed screen/asset responses 200 without `Clear-Site-Data`. Current manifest/identity and hosting unchanged.
- [ ] Establish the incident's cause using before/after evidence from an actually affected browser: origin/context, loaded entry, original/Guest IDs, counts, active selection and errors/response headers. Owner reports all mobile/desktop browsers affected, ordinary reloads safe, and a blank Guest/no other profiles after deploy; this was not reproduced locally.
- [ ] Perform actual phone/Safari/update acceptance and conditional original-context ZIP recovery if records remain accessible. Do not mark loss fixed or attribute it to context isolation without evidence. See `docs/deployment-persistence-verification.md` for commands and exact manual checks.

### Train redesign and weekly progression (2026-10-04)

This owner revision supersedes older Train selection/status/timer copy below; prior
phase and hash-routing handoffs remain historical. Database stays v5; backup is v5
with strict v1–v4 reading. Implementation is complete; physical-device acceptance
is **Verification pending**, separate from automated checks.

- [x] Reuse Create PlanCard for immediate additive Add Plan; transactionally prevent duplicate additions and preserve other selections. Keep a single plan visible, show saved note/ellipsis, and remove selection without touching records/history.
- [x] Plan details: title/full note/dividers, exact Monday–Sunday labels, arrows and keyboard date picker. Independent run selector and stored-zone status; finite/revised schedules respected.
- [x] Create stable unscheduled program weeks only on activation, anchored to the profile-local Monday and saved zone. Persistent run/day/program-week identity; next active week Pending. Preserve old unassigned history without guessing dates or rewriting records.
- [x] Explicit Skip/manual Complete/correct-to-Pending markers with snapshots, IDs/revisions and marking timestamps. No fake sets, performance dates or logged workouts. Start resumes the exact occurrence. Draft conflict requires separate confirmed discard; saved sessions remain reviewable. Failed/stale writes do not report success.
- [x] Shared Train/Calendar statuses and Progress skipped/manual-completion counts; no fabricated exercise statistics. Calendar day view shows all unassigned weekly days. Excluded weeks remain distinct from rest/skips.
- [x] Preview/confirm transactional suffix movement, excluded Mondays, revised end date and safe reversal into a free week. Recheck concurrent changes and block any affected draft/session/marker; preserve prior content, identities and unrelated runs.
- [x] Remove routine autosave success chatter while retaining Saving/failure/recovery. Bold exercise names; exact seconds/minutes rest labels preserve null/zero. Save first row, Back/Clear second, safe action spacing; Back flushes before leaving and failures retain input; Clear affects only its draft's results/notes/timer.
- [x] Circular timestamp timer with Stop/Reset; browser-wide Sound Off default. Verify actual public/rest-complete.mp3; relative root/subpath asset. REST/Reset unlock; native-ended three-play sequencing, transactional cross-tab claim and cancellation guards. Expired restoration does not replay old feedback.
- [x] Extend strict backup v5 validation, counts/CSV and restore mappings for notes/runs/outcomes/gaps/moves; retain all supported old imports/integrity checks. No database store/index/schema upgrade, reset or owner-data clearing.
- [x] Data 145/145, full static 380/380 and final weekly/Calendar static 44/44; build/typecheck/lint pass. Real MP3 native playback observed, distinct from mocked sequencing tests. Final-build retained-context updates 6/6 preserve all old data plus new weekly state across another rebuild.
- [x] Document Firefox initial 36 pass/2 fixed-countdown assertion failures and corrected session recheck 10/10; static session recheck 20/20. Final type/lint/diff pass. See docs/train-weekly-verification.md for commands, diagnostic failures and exact limits.
- [ ] Physical phone audio/vibration/background behavior, software keyboard/safe areas, Safari/iOS and screen-reader/voice-control checks. Carry forward all earlier release gates and the unresolved deployment-persistence incident.

### Train refinements and closed runs (2026-10-04)

This request supersedes the earlier draft-preserving Back and selection-only
Remove from Train behavior. Earlier handoffs and verification remain historical.
Database stays v5; backup v6 reads strict v1–v5. Available automated acceptance passes; physical-device acceptance remains **Verification pending**.

- [x] Recovery cards require actual entered results/skips/notes, including zero; empty/timer-only/placeholder-only drafts have no card. Never delete during unload/background/unmount. Plan/date and smaller day only; entire card resumes its frozen identity.
- [x] Center Add Plan/empty text; responsive one/two-column plans and one/two/three-column recovery cards. Concise plan title, Week N, Incomplete/Resume/Discard Progress; equal Back to Plans/Leave Plan controls.
- [x] Confirmed occurrence Reset atomically deletes its draft, log, notes, timer and marker, with run revision/preview checks. Shared Calendar/Progress recompute; other weeks/runs/profiles and measurements stay intact.
- [x] Leave Plan confirms scope/count/future Calendar effect and records explicit closure, stops generation, removes all unfinished run drafts/timer and active selection atomically. Preserve completed history/templates/other runs; re-add after closure creates a fresh run.
- [x] Services reject stale/deleted/closed-run writes. Serialized Cancel waits behind a running autosave; failure retains input. Deliberate in-app navigation uses the same Stay/Leave confirmation. Empty Cancel deletes artifacts; Clear resets only the open draft and stays open.
- [x] Safe idempotent startup/profile-select/restore cleanup requires conclusive profile/run/template closure; old selection-only removals remain ambiguous and are not deleted automatically.
- [x] Frozen optional Instructions/Note/video information uses shared safe embeds/modals; absent sections/dividers omitted; only Close. Plan-only subtitle, date-only start, centered orange targets, unchanged full stored timestamps/zones.
- [x] Hints use earlier actual saved corresponding sets in the same run/day/occurrence, deterministic time/UUID ordering, conservative prescription matching, independent repeated/superset members, canonical unit conversion and zero/missing semantics. Placeholders never become input.
- [x] Data regressions include rollback, failed deletion, running/queued autosaves, stale services, isolation, cleanup idempotence, hints and v6/older archive compatibility. Same-context update regression includes closed and newly re-added runs across rebuilds.
- [x] Final full production static suite 408/408 at root/project × desktop/phone; Firefox affected 50/50; data 154/154; final rebuild/update 6/6; build/typecheck/lint/diff pass. Commands, failed earlier assertions and their corrections are recorded in docs/train-refinements-verification.md.
- [ ] Physical phone keyboard/background/audio/vibration, Safari photo-backed restore and screen-reader checks; live YouTube/Ko-fi and all previous release gates remain unverified.

### Create plan details and optional Instructions (2026-10-04)

Status: Complete in available local verification. This is an owner refinement,
not a new phase or a change to earlier acceptance records.

- [x] Read-only title/duration/train-rest counts, ordered days and saved prescriptions. Honest legacy `No end date`; repeated exercises, ranges, explicit zero and absent RIR retain their meaning. Varying targets show per-set details.
- [x] Reuse Train execution blocks: saved Superset-number heading, one shared bordered member box, unequal counts and member order retained; following standalone outside. Builder controls remain in place.
- [x] Nonblank Instructions/Note sections after the final day, plain text/newlines, no unnecessary final divider. Fields stay independent from exercise instructions/session notes.
- [x] Optional plan instructions in validation/manual editor/AI preview/save/duplicate and frozen revisions/outcomes/drafts/sessions; existing records and history gain no invented text or rewrite.
- [x] Shared exercise/plan hamburger/actions implementation, Close-only details footer, confirmed Archive, Restore, top-only Escape/keyboard focus/background lock, clean editor/confirmation transitions and trigger focus return.
- [x] AI v3 with strict v1/v2 compatibility; backup v7 with strict v1–v6 JSON/CSV/checksum/photo validation. Same 28 CSV tables, five new instruction columns; database `boros` v5 unchanged.
- [x] Focused data/browser checks for save/reload/edit/duplicate, failures/stale writes, profile isolation, immutable snapshots/library, all restore choices, old payloads, modal behavior, both themes and enlarged text at phone/tablet/desktop widths.
- [x] Final full production-static regression 424/424; data 159/159, Firefox affected 26/26 and retained-context updates 6/6. README, AI/backup contracts, TODO and exact verification/manual handoff updated.
- [ ] Actual phone/Safari/AT acceptance and previously pending release checks. See [exact manual steps](docs/plan-details-verification.md#exact-remaining-manual-checks).

### Calendar redesign and assignment protection (2026-10-04)

Supersedes earlier inline unscheduled/active schedule lists, repeated active assignments
for one template, and partial-log completion totals. Historical handoffs remain intact.

- [x] Reproduce the actual pointer/focus movement and prevent lost clicks without delays or global scroll suppression.
- [x] Center view/arrow/Today/Add Plan controls; retain complete-month weeks/date selection and saved timezone behavior; concise three-part occurrence cards.
- [x] Shared Calendar menu and Current/Previous run pages, unchanged address, returning date/view/scroll/focus, and relocated guarded run management.
- [x] Transactional profile/template assignment guard with retry IDs and stale-save input preservation; retain legacy/imported duplicates for explicit management.
- [x] Shared 20/8/2 progress logic, full/manual completion, explicit skips, partial exclusions, committed prescription segments, gaps, reset/leave, historical dates and unbounded/missing-date handling.
- [x] Focused data/backup/concurrency coverage and complete data suite 167/167; build/typecheck/lint/diff pass. Retained original occurrences after remaps stay in the denominator and cannot falsely complete a run.
- [x] Full static 444/444; final affected static 108/108; final Firefox 16/16 (serial clean rerun after two engine teardown errors); final same-context updates 6/6. Exact scope, commands and intermediate results are in docs/calendar-redesign-verification.md.
- [ ] Physical phone/Safari/AT/keyboard and prior release manual gates; deployment-persistence report still unresolved.

### Calendar refinements (2026-10-05)

Supersedes the preceding Add Plan form and Current Plans management actions.
Earlier verification and phase/hash-routing handoffs remain historical.

- [x] Swap Calendar in/out-of-month tokens; Day/Week use the new in-month surface. Retain Today, selection, focus and both themes.
- [x] Reuse Create Search/Sort/cards and weeks/training/rest subtitle. Stage blank, validated weekday mappings; edit/remove staging; Cancel without writes/native warning.
- [x] Exclude archived and active scheduled/unscheduled templates; commit all selections atomically with stable retry IDs, ownership/revision checks and concurrent activation protection.
- [x] Edit the existing run; previous weeks and recorded/draft/outcome references stay frozen. Move only untouched days this week and apply the new recurring mapping later, retaining old unscheduled classification.
- [x] Scoped Reset with saved-zone Monday restart, fresh revision, timer/draft/history cleanup and rollback/stale-write guards; permanent End preserving history and removing every unfinished draft.
- [x] Previous run pills/dates/rings, Search/Sort, capped scrolling, saved Hide/Unhide and confirmed scoped Delete; preserve templates/other runs/profiles/photos/statistics outside the selected operation.
- [x] Optional run fields with stable `boros` v5; backup v8 retains strict v1–v7 CRC/SHA-256/CSV/asset compatibility, 29 CSV tables and closed-run draft cleanup. No eager migration or data reset.
- [x] Data 180/180, including rollback, repeated/concurrent saves, protected reassignment, historical selection cleanup, saved-zone reset, pending corrections and strict v7/v8 backup round trips.
- [x] Final build/typecheck/lint/diff; full static 472/472, final affected static 88/88, Firefox 24/24 and rebuilt same-context updates 6/6. See [verification record](docs/calendar-refinements-verification.md) for exact scope and intermediate failures.
- [ ] Actual phone/Safari/screen-reader/audio/vibration and prior release manual gates; production deployment-loss report remains unresolved.

### Calendar and Train display refinements (2026-10-05)

The owner's latest request supersedes earlier note subtitles, context selectors,
timezone/ID annotations, extra confirmation paragraphs and Edit preview popups.
Earlier verification records remain historical.

- [x] Shared weeks / training days / rest days wording and honest unbounded durations. Two-row Train cards use committed instance values and current progression, with Upcoming/Paused/Ended boundaries.
- [x] Train details bind to the selected instance; no context selector or fallback to another. Full Monday–Sunday display retains scheduled exceptions and coincident occurrences; unscheduled day order is visual only. Rest rows add no obligations or progress counts.
- [x] Dedicated Calendar activity read model shows scheduled obligations and actual-date unscheduled full/partial/manual completions once. Pending/drafts/skips create no unscheduled events. Preserve timestamps, frozen zones and occurrence references.
- [x] Month uses complete week sections with centered row labels/dividers, adjacent dates, retained themes and seven aligned columns; horizontal row scrolling on narrow screens. Day/Week remain single periods.
- [x] Ten stable profile/plan-ID color preferences, unused-color preference and reuse beyond ten; shared blue/green/amber ring tokens. Names/day/status/counts remain accessible.
- [x] Minimal accessible action menus; exact Reset/End/Delete copy. Direct Edit Save checks an opening-time record baseline transactionally, retains failed input and accepts old mappings for repair before validating the replacement.
- [x] Data 189/189, including new completion/zone/isolation/deduplication, stale baseline/repair, progression/rest/collision, month and color tests. Database v5, AI v3 and backup v8 unchanged.
- [x] Build/typecheck/lint/diff; final affected static 120/120, Firefox 14/14 and retained-context updates 6/6. Full static initially 488/496; corrected obsolete assertions passed in the final affected suite. See [verification record](docs/calendar-train-display-verification.md) for exact stages and intermediate results.
- [ ] Physical phone/Safari/AT/keyboard, audio/vibration and live Ko-fi gates. Production deployment-loss cause remains unresolved; local tests are not a production fix.

### Calendar, Create and Progress revision (2026-10-05)

The owner's d60b4cdb request supersedes older horizontal Month rows, selected-plan
ownership, measurement date editing/selectors and Group 4 cards/counting. Earlier
phase/group and hash-routing handoffs remain historical.

- [x] One authoritative active instance per profile/template across Calendar and Train. Atomic staged Calendar activation/link, concurrent service guards, missing-link display without record replacement, stable scheduling edits and preserved legacy duplicate resolution.
- [x] Concise Calendar copy; exact No eligible plans; independent accessible stacked Month weeks, default/Today expansion and retained event colors/statuses.
- [x] Plan / Exercise / AI action order; Plans then Exercises; shared filters and responsive two-row plan scrolling.
- [x] Progress Body weight / Plans / Exercises, no main Saved sessions section and no body weight on analytics pages. Shared Previous Plans cards, rings, date ranges, filters, hidden state and guarded deletion.
- [x] Latest measurement independent of filtering; concise date/minute, automatic device-zone submission with retry-stable IDs/time, timestamp-preserving Update Weight, selected-photo lazy loading, nested modal focus, exact Delete Weight confirmation and transactional recovery.
- [x] Fixed Y axis and horizontally scrolling chronological point slots/X labels; repeated-date keyboard/touch targets, inclusive Apply/Clear/Cancel filter, initial nearest-point scroll and retained popup/parent position.
- [x] One Overall card per library identity and actual creation date; occurrence-specific plan cards; shared search/sort/ANY tags/Clear and bounded three-row grids.
- [x] Instance-scoped completed/resolved/skipped metrics, independent superset members, valid partial-set extrema, explicit skip evidence, deterministic ties, canonical-unit comparisons and paired extrema popups. Legacy unlinked history remains accessible through its plan.
- [x] Data 194/194; build/typecheck/lint; broad desktop 125/126 then obsolete editor assertion corrected and passed in affected matrix. Affected static 314/316, followed by corrected coordinate-check measurement matrix 16/16; Firefox 16/16. Exact commands/results are in [verification](docs/progress-redesign-verification.md).
- [x] Final-source retained-context two-rebuild regression 6/6 passed, 1.5m, preserving all records, active profile and photo bytes in Edge root desktop/project phone and Firefox desktop.
- [ ] Physical phone/Safari/screen reader/keyboard, actual audio/vibration and live Ko-fi acceptance. Production deployment-loss cause still needs original-context evidence, not a presumed code fix.

### Calendar, shared filters, Create and Settings refinements (2026-10-05)

The b75f7b87 request and added tab-bar gesture spacing supersede the previous
stacked Month layout, Settings return/profile-creation/timezone controls and
export acknowledgment UI. Prior checklists/handoffs remain historical.

- [x] Horizontal seven-column Monday–Sunday Month rows; independent plain collapsible headings; centered Month/Week ranges; no redundant Day heading; page-level Back retains Calendar state.
- [x] Allowlisted browser-local Day/Week/Month preference; lazy read, explicit-change writes, safe invalid/denied storage and no dataset/editor persistence.
- [x] Shared Search/Sort alignment and fixed size, Newest/Oldest labels, Tags/Clear row, unchanged ANY matching, compact selected pills with separate keyboard focus.
- [x] Shared Create/Overall library-exercise cards with actual Added dates; plan-occurrence day subtitles retained; one Create divider and existing list bounds/order.
- [x] Dropdown New profile allocates first free normalized Guest name, creates/selects atomically, handles legacy unnamed Guest and concurrent connections, guards dirty forms and repeated events, rolls back on failure. Name loads effective editable text without a false dirty state.
- [x] Remove Settings Return and timezone section; new actions resolve current device IANA zone, existing history/old preference fields remain. Initialization/selection/import no longer invent an absent profile preference. No schema change.
- [x] Data notice retained; single ID-bound Download privacy confirmation, processing/cancellation/errors and validated ZIP preserved; exact Upload sentence and divider before unchanged guarded Clear Data.
- [x] Bottom tabs: 24 px plus device safe area (16 px additional), with matching main/keyboard scroll and fixed session-action clearance.
- [x] Data 198/198, production build, explicit typecheck/lint and diff check. New allocation/rollback/default-zone/preference regressions plus strict backup/restore coverage.
- [x] Affected root/project phone/desktop matrix **320/320**; retained-context release/rebuild checks **6/6**.
- [x] Firefox affected-suite rerun **14/14** after initial 36/38 (subpixel assertion and engine cleanup issue); all tested cases now have passing evidence. See [verification record](docs/interface-refinements-verification.md).
- [ ] Physical phone gesture/keyboard/Safari/screen-reader checks, physical audio/vibration and live Ko-fi. Production persistence incident remains unresolved.

### Calendar, Support, Train amendments and active Progress plans (2026-10-05)

The 023f0206 request and the owner's missing-plan report supersede the previous
manual-rest entry and Settings-destructive-leave behavior. Earlier verification
records remain historical.

- [x] Month keeps Monday-Sunday horizontally: about two mobile cards, seven desktop columns; only today's mobile week / all desktop weeks initially expand. Explicit toggles survive updates; Today expands and reveals its day without document overflow.
- [x] Support defaults to approved `https://ko-fi.com/jhonatansaldana`, retains validated configuration and safe external-link attributes, removes coming-soon copy.
- [x] REST controls centered; visible Skip with occurrence/set-specific accessible names. Add Set precedes one divider and post-exercise/group REST; post-group REST is outside the final round.
- [x] Active-session Create/Calendar/Progress navigation uses exact Leaving day wording and Cancel/Leave. Confirmed deletion serializes against autosave, removes only the active draft/timer and preserves failed input. Unexpected unload keeps committed recovery.
- [x] Settings flushes without destructive confirmation and remembers same-profile draft identity for Train/reload. Notes, additions and timestamp timers survive; changed display units convert actual loads. Failed flush stays actionable; switching profiles cannot retarget writes.
- [x] Shared exercise picker, independent repeated additions and fresh occurrence/set IDs; single/multi-select and Cancel. Add Set copies prior targets with blank results; unequal supersets append all members to an explicit new final round. Clear keeps amended structure; Cancel discards it.
- [x] Unspecified REST counts up from persisted UTC start; positive durations count down, explicit zero stays no timed rest. Reset/Stop and single active token preserved; count-up never claims a completion alarm.
- [x] Database `boros` v5 stays unchanged. Optional session structure persists in draft/history, strict backup v9 and 30 CSV tables; original v1-v8 checksums/CSV/asset rules remain. Restore keeps IDs/rounds and frozen source provenance; no AI format change.
- [x] Progress root cause confirmed: Plans explicitly passed the previous-only filter. Progress now includes active and previous runs; active cards open analytics without historical Hide/Delete actions. Added results participate in analytics; no inflation of planned-day totals.
- [x] Data 204/204; build/typecheck/lint/diff and retained-origin/context release/rebuild checks 6/6. Includes a locked Settings-flush race regression. No owner data touched.
- [x] Final affected production root/project desktop/phone matrix **388/388**, Firefox desktop/phone-sized focused **12/12**. Extra phone Today-return visibility/page-offset checks **1/1** each in two strengthened runs. [Exact results](docs/calendar-train-session-verification.md).
- [ ] Physical phone/Safari/screen-reader/keyboard, actual device background timer/audio/vibration and live Ko-fi acceptance remain manual. Deployment-loss diagnosis remains unresolved.

## 6. Required test fixtures

Build these fixtures as the relevant phase begins, using fictional people and tiny synthetic images.

- [x] Profile A with a four-day plan, a standalone exercise, tags, one completed scheduled session, one partial session, a draft, measurements, and photos.
- [x] Profile B with different data to detect accidental cross-profile reads/deletes.
- [x] Backup of Profile A with a matching plan whose sets, notes, schedule, and session history differ; at least one unique log on each side.
- [x] Backup with a new plan, standalone exercise, and progress entry to demonstrate that nonconflicting items survive both merge priorities.
- [x] Renamed records that retain stable IDs; records with the same normalized names; ambiguous ID/name matches; zero RIR/rest; empty optional values; Unicode; commas; multiline notes; and formula-like text.
- [x] Malformed/unsupported archives and AI payloads; missing or oversized assets; invalid references and ranges.
- [x] Calendar cases around Sunday/Monday, New Year, leap days, daylight-saving transitions, and retained schedule zones after simulated device-zone changes.

### Repeating cycles of unique training weeks (2026-10-05)

This request supersedes the former single-lineup-only model. Historical phase
and hash-routing handoffs remain evidence of their original revisions.

- [x] Shared cycle resolver and ordered stable week/day/exercise/set identities; legacy repeating/unbounded records untouched; distinct actual-program-week completion keys.
- [x] Exact Duration/toggle/count/Note/week labels, independent 1-7-day editors, valid divisors, recoverable invalid-duration input, and confirmed populated reductions/Off.
- [x] Ordered details and honest count ranges; independent full-plan duplication and existing template/source ownership.
- [x] Per-definition weekday mappings in staged Add Plan and existing reassignment; one active instance; protected snapshots/drafts, stale checks and transactional saves.
- [x] Correct Train week content/rest rows, Calendar occurrence content, gap-aware progression, reset/end/re-add, stable hints and actual Progress denominators.
- [x] AI v4 strict modes/counts/notes, local IDs, editable atomic import and strict v1-v3 readers. Backup v10 definitions/set identities, 31 CSV tables and strict v1-v9 validation/promotion.
- [x] Exact custom Create Plan/Exercise Cancel/Leave dialogs, nested/AI draft protection, pristine navigation and native reload/close warnings. Train's Settings exception retained.
- [x] Build/typecheck/lint; 213/213 data tests, including new cycle/lifecycle/history/hints/AI/backup and populated v5 reopen checks.
- [x] Full production browser matrix 564/564, focused Firefox 20/20 and final same-context update/rebuild checks 6/6; final-source results recorded.
- [ ] Physical phone keyboard/gestures, Safari, assistive technology, background timers/audio/vibration and live Ko-fi; prior production data-loss cause remains unresolved.

## 7. Inputs needed later

These do not block Phase 0 unless the owner changes the scope.

| Input                         | Needed by            | Current handling                                                          |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------- |
| Ko-fi page URL                | Group 1 / Phase 11   | Supplied: https://ko-fi.com/jhonatansaldana; configured in .env.production, remote challenge may require owner confirmation |
| Hosting repository/domain     | Phase 11             | Confirmed public jsaldana92/boros and boros-app.com; owner reports HTTPS resolved (2026-10-03), no fresh independent production capture claimed |
| Visual brand preferences/logo | During UI refinement | Use a clean, accessible neutral design and text wordmark initially        |

## 8. Decision log

| Date       | Decision                                                                        | Reason                                                                  |
| ---------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 2026-10-05 | Browser-local allowlisted Calendar view; write only on deliberate change | Restore Day/Week/Month without resetting dates, recording editor contents or touching records |
| 2026-10-05 | Allocate effective normalized Guest names and select in one profiles/settings transaction | Prevent cross-tab duplicate names, orphan creation and false success; unnamed legacy Guest reserves its displayed name |
| 2026-10-05 | Device timezone for new actions; preserve old optional preference/context, including absence | Remove hidden default behavior without shifting schedules/history or changing v5/v8 contracts |
| 2026-10-05 | One shared Download modal captures the chosen profile ID | Exact privacy confirmation while preserving export snapshots/checksums and cancellation |
| 2026-10-05 | Shared 132 px Sort/44 px control height, compact inner pills and reusable library cards | Consistent browsing across tabs/pickers without changing sort/tag identity rules |
| 2026-10-05 | Add 16 px bottom-tab gesture padding on top of existing spacing and safe area | Move tab targets farther from swipe gestures; coordinate fixed actions and content clearance |

| 2026-10-04 | Calendar run views and rings derive existing v5 records; one active/future assignment per profile/template is transaction-checked, including revival/moves | Preserve historical/imported duplicates and full committed workload; never rewrite sessions or silently close runs |
| 2026-10-04 | Pointer-focused buttons do not trigger AppShell visibility scrolling; keyboard/fields keep it | Reproduced 61px movement before pointer-up lost desktop/phone clicks |
| 2026-10-02 | Local browser data; multiple profiles without passwords                         | Owner requirement                                                       |
| 2026-10-02 | Drop QR sync and provider account/API integration                               | Owner revised scope                                                     |
| 2026-10-02 | External chatbot formatting prompt + validated pasted output                    | Owner's chosen AI workflow                                              |
| 2026-10-02 | React/TypeScript/Vite/Tailwind SPA; free supporting libraries                   | Agreed project direction                                                |
| 2026-10-02 | Structured JSON plus readable CSVs/photos in ZIP                                | Preserve exact restore data while meeting readable export requirement   |
| 2026-10-02 | Completed-session snapshots and week-specific occurrences                       | Preserve history through plan edits and new weeks                       |
| 2026-10-02 | Plan-family merge priority, with explicit losing-log counts                     | Match requested merge behavior and make data loss visible               |
| 2026-10-02 | Monday weeks, persistent Guest workspace, hash routes                           | Initial implementation defaults; adjustable before affected work        |
| 2026-10-02 | Replace hash routes with single-address internal navigation in Phase 2.5        | Owner selected one address; remember the current screen per browser tab |
| 2026-10-02 | Initial hosting on free GitHub Pages; future URL-based routing remains possible | Keep navigation centralized and deployment paths configurable           |
| 2026-10-02 | MemoryRouter above workspace loading; guarded screen buttons and commit-only sessionStorage | Preserve screen during profile switches; no public route links or browser history entries |
| 2026-10-02 | Settings return target kept only in memory; legacy hashes cleaned at bootstrap with replaceState | Refresh restores screen only, with Train as return fallback; preserve deployment path |
| 2026-10-02 | Plan store v3 holds each complete plan as one nested record with revision checks | Atomic saves; additive migration preserves v1/v2 data |
| 2026-10-02 | Plan prescriptions include tag names and optional source IDs as snapshots | Source edits/archive never rewrite copies; plan-only tags do not alter library tags |
| 2026-10-02 | Derive training/rest counts from ordered days; use buttons and day selector for moves | Stable IDs and keyboard-accessible editing without drag-and-drop dependencies |
| 2026-10-02 | Separate strict public JSON v1 schema; unknown keys rejected at every object level; no imported IDs | Keep interchange independent of internal database v3 and ownership boundaries |
| 2026-10-02 | Missing optional numeric/tutorial fields use null, instructions use empty string, tags use empty array | Preserve missing versus explicit zero without coercing invalid targets |
| 2026-10-02 | Import previews reuse builders and carry one profile-bound local creation UUID across retries | Prevent duplicate imports and cross-profile retargeting without a new database schema |
| 2026-10-02 | Resolve imported plan/workout tags only in the final artifact transaction | Cancel/validation cannot create hidden tags; failed artifact writes roll back all new tags |
| 2026-10-02 | Limit pasted input to 1,000,000 characters and preserve original JSON when canceling preview | Bound synchronous parsing; clearly separate pasted input from unsaved preview edits |
| 2026-10-02 | Additive database v4: drafts, completed sessions, one owner-scoped global rest timer | Preserve all v3 stores; freeze prescriptions at start and avoid calendar associations before Phase 6 |
| 2026-10-02 | One unfinished draft per profile/plan/day; draft ID also identifies its completed log | Explicit resume and deliberate next session; idempotent completion across retries/tabs |
| 2026-10-02 | Serialize draft autosaves/actions; debounce 400 ms; compare revisions transactionally | Save includes latest input; Clear cannot be undone by queued writes; stale tabs keep input |
| 2026-10-02 | Persist raw draft input and recording units, validate completed results strictly | Recover intermediate input without fabricating missing/zero values; preserve load measurements when display units change |
| 2026-10-02 | One database-wide timer token with profile/draft ownership and UTC endAt | Start replaces the previous timer; only its owner can read/control it; elapsed time survives reload/backgrounding |
| 2026-10-02 | Database v5 adds schedules and optional unique profile/occurrence indexes on drafts/logs; no existing record rewrite | Preserve all ten v4 stores and unscheduled history; one completed log per scheduled occurrence |
| 2026-10-02 | Native all-day calendar controls; Gregorian civil-date field arithmetic plus explicit IANA Intl formatToParts for Today | No new calendar/timezone dependency needed; avoid elapsed-week arithmetic and ambiguous DST clock times |
| 2026-10-02 | Show one stored zone context at a time, with all schedules/other zones listed; default to first stored schedule zone | Today and view boundaries remain consistent after device-zone changes; overlapping schedules keep separate IDs |
| 2026-10-02 | Schedule revisions snapshot plan/day/mapping; ordinary edits require explicit future refresh; structural day edits atomically suspend future mapping | Reconstruct missed/history dates; default changes to next schedule-local Monday; never guess mappings |
| 2026-10-02 | Remap/stop previews recheck schedule/plan/draft revisions and explicitly retain affected started sessions as dated exceptions | Preserve input and snapshots, reject stale previews, and never silently delete/reassign a draft |
| 2026-10-02 | Retain database v5; extend existing measurement records with optional revision, mutation, photo and date-context metadata | No new store/index needed; preserve all existing data without a gratuitous migration |
| 2026-10-02 | Share latest-weight and Settings append logic; latest timestamp then greatest ID wins | Keep the existing deterministic index ordering and one canonical source of current weight |
| 2026-10-02 | Measurement transactions also bump the owner profile revision | Reject stale Settings saves after Progress edits, including unrelated profile edits; retain recoverable input |
| 2026-10-02 | Preserve UTC instant plus local wall time, IANA zone and offset; legacy measurements display UTC | No guessed legacy context; no accidental date shifts; typed DST gaps reject and folds choose earlier occurrence |
| 2026-10-02 | Photo removal is confirmed and staged until Save; cleanup checks all measurement/avatar references transactionally | Keep canceled edits intact and prevent orphan assets or deletion of still-referenced blobs |
| 2026-10-02 | Native SVG chart with elapsed-time spacing and complete exact-value history; load photo blobs only on demand | Cover empty/single/irregular/coincident points without a chart dependency or eager full-resolution photo reads |
| 2026-10-02 | Backup schema 1, distinct from AI interchange and database v5; data.json plus manifest/assets are authoritative | Preserve complete nested snapshots/IDs and support later new-profile, replacement and whole-plan-family restore semantics |
| 2026-10-02 | One read-only transaction captures the selected profile and all owned stores; worker packages afterward | Consistent record versions without source writes; keep hashing/compression outside IndexedDB transactions and off the UI thread |
| 2026-10-02 | Explicit saved-data acknowledgement; dirty Settings blocks export; other-tab unsaved autosaves are excluded and disclosed | Export cannot flush memory in other tabs or truthfully claim that uncommitted input was backed up |
| 2026-10-02 | Exclude browser-wide theme/selection/notice preferences, active timers and navigation; retain all persisted draft input | Avoid cross-profile selection references and transient state while keeping the complete owned dataset |
| 2026-10-02 | 21 linked UTF-8 CSV tables; string-only formula protection including leading whitespace; JSON text unchanged | Readable relationships/ranges/units without conflating zero with blanks or making CSV the restore source |
| 2026-10-02 | SHA-256 covers uncompressed payload files, excluding manifest; UUID photo paths retain original bytes/shared references | Explicit integrity coverage without self-reference, untrusted-name paths, recompression or duplicate shared assets |
| 2026-10-02 | Reopen/validate the generated ZIP before download; status says Download started; URLs revoke after 60 seconds | Detect packaging errors and avoid claiming filesystem success the app cannot observe |
| 2026-10-03 | Keep database v5 and backup schema 1; validate raw ZIP headers before JSZip and actual expanded byte streams | Reject sanitization/duplicate ambiguity and oversized input while accepting original Phase 8 exports; no dependency or schema migration |
| 2026-10-03 | Pure deterministic plan; stable ID then normalized name matching; select conflicting plan families as whole units | Both merge modes have explicit history selection, including unique losing logs; independent libraries/progress remain separate |
| 2026-10-03 | Retire the affected profile ownership ID on every committed restore/merge/clear; retain safe record IDs and remap ownership/references | Existing owner checks reject all stale/new-form writes and delayed autosaves, even when imported numeric revisions collide, without a database migration |
| 2026-10-03 | One atomic transaction rechecks all target records and photo hashes; private reviewed plan and shared commit receipt | Reject stale previews, including same-size Blob changes; rollback assets/records/selection together; repeated clicks cannot duplicate the operation |
| 2026-10-03 | Decode assets before commit; use Dexie.waitFor only for the byte-level concurrency check inside the locked transaction | Protect against changed photo bytes while preserving atomicity; 60-second timeout rolls back, and large-target CPU/latency remains unbenchmarked |
| 2026-10-03 | Clear Data retains profile name/kind and unit preferences, removes owned records/photos/timer and demographics | Return an empty usable workspace with an explicit scope and backup opportunity while preserving all other profiles |
| 2026-10-03 | Lazy-load existing screens; remember only committed screens; keep shell/error recovery available | Reduce initial code without changing memory routing, guards, schema or root/subpath hosting |
| 2026-10-03 | Focus pointer-activated buttons and keep focused fields above actual fixed controls | Fix demonstrated WebKit dialog-return and training-field visibility differences while preserving native dialogs and keyboard access |
| 2026-10-03 | Keep the Windows WebKit native Blob failure visible and Phase 10 verification pending | Independent native repro proves an engine/environment blocker; do not redesign persistence or claim Safari coverage from this run |
| 2026-10-03 | Remove only three confirmed unused direct dependencies; retain exact gh-pages 6.1.1 and deployment commands | Complete Phase 10 dependency cleanup without upgrading packages or replacing the working deployment configuration |
| 2026-10-03 | Continue Phase 11 preparation while Phase 10 stays verification pending; do not repeat unchanged Windows Blob probes | No suitable alternative WebKit/Safari environment available; retain the required acceptance gate without storage workarounds |
| 2026-10-03 | Preserve origin/gh-pages, dist, relative assets, CLI CNAME/nojekyll and concurrent favicon/images | Existing supported publication mechanism; no duplicate CNAME, routing, dependencies or DNS changes needed for preparation |
| 2026-10-03 | Fingerprint every output file and compare HTTPS bytes after owner publication | Distinguish tested working-tree artifacts from package 0.0.0, older deployment and cache; fail on mismatched assets or invalid TLS |
| 2026-10-03 | Treat observed boros-app.com certificate-name mismatch as a release blocker; leave missing Support honest | Public branch inspection does not prove custom-domain startup or candidate deployment; no invented URL or TLS bypass |
| 2026-10-03 | Centralize UUID v4 on native randomUUID/getRandomValues and classify unsupported APIs separately | Reproduce the reported startup failure without clearing records; no weak identities or checksum fallback |
| 2026-10-03 | Keep certificate repair separate from UUID compatibility | Owner confirms HTTPS warning bypass; certificate SANs do not cover boros-app.com. Validated HTTPS runtime remains inaccessible; HTTP probe is independent evidence |
| 2026-10-03 | Supply the real public Ko-fi URL through .env.production | Existing Vite mechanism embeds it in the actual production build; preserve disabled state for blank/invalid overrides and explicit protected opening |
| 2026-10-03 | Owner PNG branding, avatar-only Settings, paired units, compact filters and minute-only display | Group 1 supersedes earlier header/default UI requirements; unchanged measurements/time context and backup precision remain authoritative |
| 2026-10-03 | Record Groups 2–4 as coordinated future dependency groups | Superset occurrence identity and plan duration must reach schemas/AI/snapshots/backups before dependent Calendar/Train/Progress redesign; no partial feature implementation here |
| 2026-10-03 | Group 2 uses stable superset UUIDs and editable day-local numbers | Renumber/reorder must not reidentify results; contiguous groups share the same visible editor/training order, with independent repeated occurrences |
| 2026-10-03 | Unequal group members run only their existing sets; group rest owns round/block boundaries | No fabricated sets or hidden member rests; optional/manual and explicit zero preserve their meaning, using the existing persistent timer |
| 2026-10-03 | Require new-plan duration, preserve legacy omissions, freeze schedule boundaries | Civil weeks anchor to the selected Monday; explicit effective-date duration changes preserve past missed dates and started/completed history |
| 2026-10-03 | Retain database v5; publish AI v2 and backup v2 contracts with v1 compatibility | Nested optional fields require no index migration; legacy AI gets owner-entered duration, legacy backups retain unbounded meaning after original checksum/strict validation |
| 2026-10-03 | Record owner's HTTPS resolution separately from automated production checks | Latest owner report supersedes the prior warning; no fresh certificate/API/mixed-content capture or new-candidate deployment was performed by this task |
| 2026-10-03 | Preserve external commit 40e5c74 appearing during Group 2 work | No reset/staging/commit/push/deploy by this agent; final artifact receipt names the current HEAD plus dirty working tree |
| 2026-10-03 | Group 3 profile preferences remain optional fields in database v5 | Initialize a missing zone once in startup/selection or reviewed restore, not inside liveQuery; preserve schedule zones and historical timestamps/units |
| 2026-10-03 | Train selection is independent of scheduling and archive state | Remember archived IDs but hide them until restore; explicit selection save replaces the list, no automatic substitution; use profile revision protection |
| 2026-10-03 | Calendar defaults to a complete named month and displays saved local dates from all zones | Today follows the profile zone; each event/card evaluates lateness in its saved schedule zone and refreshes on minute/focus/visibility events |
| 2026-10-03 | Combined card status uses exact pending occurrence keys | Overdue > today > future; partial logs count, unscheduled logs do not clear occurrences; stopped/unbounded/repair/truncated-pending work cannot manufacture completion; bounded segment search avoids infinite generation |
| 2026-10-03 | Backup v3 adds profile preferences while retaining strict v1/v2 compatibility | Validate original bytes/CSV/CRC/SHA/assets before envelope conversion; remap selected plan IDs with restore families, preserve merge precedence, clear selections with plans; AI remains v2 |

| 2026-10-03 | Group 4 derives analytics from profile-owned saved actual results | No statistics store, schema bump or history rewrite; active reads fail closed after restore/Clear retires an owner |
| 2026-10-03 | Explicit library/provenance identity, never names, joins workout history | Unknown legacy links stay separate; supersets use ordered member identities including multiplicity, preserving historical compositions |
| 2026-10-03 | Actual completion chronology and deterministic ties | Starting/latest retain all matching occurrences and set pairs from the first/last session; min/max retain the earliest matching actual set and its reps/date; canonical units preserve zero |
| 2026-10-03 | Graph selection replaces the visible body history/debug list | All records remain accessible through points, keyboard/selector and Previous/Next, including exact overlaps; photo/edit/delete safeguards remain |
| 2026-10-03 | Defer the optional additional weight/reps/date graph | Complete required load/date graphs and inspectable actual reps first; next task is integrated Groups 1–4 verification and published-version smoke |
| 2026-10-03 | Create catalog is a source-aware read-only projection | Group identical full prescriptions by explicit source identity, or within one unlinked saved plan; keep every source and distinct same-name prescription. Never write templates or reinterpret history to populate the catalog |
| 2026-10-03 | Rest inputs use minute/second components; persistence remains integer seconds | Both blank stays missing, supplied zero stays zero, seconds are 0–59; preserve safe-integer totals exactly. Final group rest applies even when the group is the last block |
| 2026-10-03 | AI generation requests one fenced JSON block; parser still accepts raw JSON | Preserve strict schema/unknown-field rejection and valid Unicode text. Explain malformed smart delimiters without global replacement |
| 2026-10-04 | Standalone templates supersede plan-sourced catalog | Atomic AI plan materialization; first retained occurrence supplies missing defaults. Transactional initialization/selection and validated-restore repair preserve snapshots and Progress provenance. Optional templateId requires backup v4; database v5 and AI v2 stay unchanged |
| 2026-10-04 | Guarded breadcrumbs and filtered multi-selection | Single Add ignores checks; bulk inserts displayed order once; filters drop excluded selections and sorting retains IDs. Name-only cards, shared Tags disclosure, four-action occurrence popup and accessible scrolling dropdown reuse existing controls |
| 2026-10-04 | Test actual deployed artifacts in one retained context before changing persistence | Prior/current gh-pages files and two local rebuilds preserve all data in 6 update scenarios. Keep `boros`/schema/manifest identity unchanged; add read-only before/after diagnostics. Owner-reported loss remains unresolved, not dismissed as a context switch |
| 2026-10-04 | Plain title paths replace breadcrumb navigation; shared native modal owns focus/scroll | Keep form actions and discard guards. Only the top modal is interactive; details/actions/confirm/editor transitions retain template identity and leave snapshots untouched |
| 2026-10-04 | Explicit library-detail opening authorizes a trusted YouTube iframe | Reuse supported URL validation, discard supplied parameters, no autoplay; origin-only referrer and at least 200×200 player. Dispose while actions cover details and on close/edit; reopening starts paused. Train links and import previews remain unchanged |
| 2026-10-04 | Optional weekly fields in existing database v5 records; backup v5 supports strict v1–v4 imports | Preserve old IDs/data without an eager migration. New unscheduled run/day/program-week keys stay attached to training content; legacy histories gain no guessed week |
| 2026-10-04 | Explicit marker snapshots and excluded Mondays belong to a run | Separate marking from actual performance; counts and restore families stay consistent. Atomic suffix moves block all affected drafts/logs/markers and recheck previews |
| 2026-10-04 | Shared Create/Train plan card and immediate append-only selection action | Keep single/multiple plans visible and avoid overwriting another tab's additions. Saved optional plan notes remain plain text |
| 2026-10-04 | Timer token completion claim plus canceled media generation | Exactly one alert owner across tabs, three native-ended plays, Off vibration attempt, no expired-restoration replay or background promise. Late unlock cannot pause completion |

| 2026-10-04 | Deliberate Cancel/navigation discards even autosaved drafts; interruption retains committed input | Serialized deletion waits for writes and rejects stale edits. Timer/placeholder-only artifacts do not become recovery cards; unload/unmount never deletes |
| 2026-10-04 | Explicit `closedAt` distinguishes Leave Plan from selection removal/Stop Scheduling | Atomic closure, cutoff, draft/timer deletion and selection update. Conclusive repair only; old ambiguous drafts stay recoverable. Other runs of a shared template remain selectable |
| 2026-10-04 | Occurrence Reset uses a revision and result fingerprint transaction | Deletes exact run/day/week records/marker and invalidates stale Start/autosave. Statistics derive from remaining records; prescriptions and measurements unchanged |
| 2026-10-04 | Previous results are display-only hints from a single corresponding actual set | Earlier weeks, completed no later than session start; completion/logged/UUID descending. Same run/day/occurrence; changed prescription arrays/provenance do not match. No field stitching or historical rewriting |
| 2026-10-04 | Backup v6 stores closure; strict v1–v5 retain original integrity checks | Restore normalizes conclusively closed unfinished drafts after ownership/remapping and reports the omissions. Database `boros` v5 and installed-app identity stay unchanged |

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-04 | Create plan details share modal actions with exercise details and Train's ordered execution blocks | Saved prescriptions, repeated occurrences, unequal sets and superset boundaries remain accurate without rearranging the builder |
| 2026-10-04 | Optional plan instructions and frozen planInstructions; retain database v5 | Distinct plain-text plan/exercise/session fields; new snapshots capture text without rewriting existing history or inventing legacy values |
| 2026-10-04 | AI v3 and backup v7 freeze previous strict contracts | New optional fields require new interchange versions. Validate old bytes/CRC/SHA-256/CSV/assets before promotion, retaining AI v1/v2 and backup v1–v6 support |
| 2026-10-05 | Add Plan stages locally and commits a complete batch in one transaction | Cancel performs no write; active unscheduled/scheduled templates are excluded; retries and competing tabs cannot leave partial batches |
| 2026-10-05 | Freeze recorded occurrence references while revising untouched current/future mapping | Completed/skipped/manual/draft identity survives, including unscheduled provenance; coincident dates do not merge |
| 2026-10-05 | Reset/End/Hide/Delete are scoped to a run, independent of its reusable template | Atomic rollback, revision/fingerprint guards, explicit deletion scope, preserved other profiles/runs/assets and recoverable input |
| 2026-10-05 | Optional nested fields retain database v5; backup v8 freezes strict v1–v7 contracts | Hidden state, scheduling classification and exceptions survive restore without bypassing checksums or rewriting old records |
| 2026-10-05 | Separate Calendar activity dates from Train's weekly occurrence layout | Scheduled obligations retain their references; unscheduled saved/manual completions use actual timestamps and frozen zones, with no fabricated obligations or duplicate entries |
| 2026-10-05 | Instance-bound Train presentation and complete week rows | Current progression derives from the committed timeline; rest rows and calendar row labels never alter program identity, dates or denominators |
| 2026-10-05 | Cosmetic profile/plan-ID palette preference; no schema change | Ten muted colors stay stable through list changes; localStorage affects appearance only, leaving IndexedDB and backups intact |
| 2026-10-05 | Direct Edit Save uses an opening-time baseline | Keep transactional stale-write protection without a confirmation popup; invalid old mappings can open for repair, while submitted mappings must validate |

| 2026-10-05 | Active instances supersede Train selection metadata | Shared lifecycle + serial transactions prevent Calendar/Train duplicates; read old missing links without rewriting histories |
| 2026-10-05 | Shared measured browsing rows and Previous Plans | Create/Progress reuse filters, cards, hidden/delete semantics and responsive row bounds; Month reuses vertical Week cards |
| 2026-10-05 | Weight timestamps capture on submission and remain immutable in Update | Device context and stable retry identity preserve chronology, units, photos and failure recovery without schema changes |
| 2026-10-05 | Progress is instance-scoped; Overall uses explicit library provenance | Repeated/superset occurrences stay separate; full-set completion and explicit skip evidence replace any-set completion; ambiguous legacy history remains plan-accessible |
| 2026-10-05 | Program completion follows the shared finite resolved-workload lifecycle | Explicit complete/skip outcomes can resolve a program; elapsed dates or early End alone cannot. Paired extrema use actual sets and deterministic chronological ties |

| 2026-10-05 | Session-only optional structure records stable set UUIDs and explicit round numbers; no IndexedDB upgrade | Preserve source plans, legacy records and unequal superset order; structure-only edits remain recoverable |
| 2026-10-05 | Backup v9 freezes v1-v8 contracts; active timers/Settings return pointer remain excluded | Round/set metadata survives validated restore without weakening CRC/SHA-256 or changing AI v3 |
| 2026-10-05 | Destination-aware Train guard: Settings flush/return versus explicit destructive navigation | Avoid accidental loss during unit/settings changes while preserving requested Leave behavior and stale-write protection |
| 2026-10-05 | Progress shows active plus previous program instances | The previous-only presentation filter hid the owner's active plan despite its saved run and valid analytics |

| Date | Decision | Reason |
| ---- | -------- | ------ |
| 2026-10-05 | Ordered optional week definitions partition flattened days; shared program-week resolver | Preserve existing day/source references and frozen records; excluded gaps do not advance cycles |
| 2026-10-05 | AI v4 and backup v10; strict earlier contracts frozen; no IndexedDB migration | Add unambiguous cycles/set identities without reinterpreting old wire formats or resetting data |
| 2026-10-05 | Create registers an in-app leave guard for the whole editor | Nested and AI input survives Cancel; Train retains its separate Settings detour |

## 9. Current checkpoint

- Unique-week cycles complete in available local verification. Phase 10 remains **Verification pending**, Phase 11 **In progress**; earlier verified phases/handoffs preserved.
- Database **boros v5**, AI **v4**, backup **v10** (strict v1-v9; 31 CSV tables). No dependencies, manifest/hosting changes or user-record reset.
- Build/typecheck/lint/diff and data **213/213** pass. Full static Edge **564/564** (9.8 m), focused Firefox **20/20** (1.6 m), same-context four-stage persistence **6/6** (2.1 m), all on the final source. See [cycle verification](docs/unique-weeks-verification.md).
- Next: the recorded disposable-profile physical-phone, Safari and assistive-technology checks; carry forward background timers/audio/vibration and live Ko-fi. Local update success does not resolve the owner's production data-loss incident.

## 10. Handoff entry template

Append one concise entry after each completed implementation group. Keep the current checkpoint and overview status table updated as well.

### YYYY-MM-DD — Phase N: descriptive title

- Status: In progress / Verification pending / Complete / Blocked.
- Implemented: concrete behaviors now available.
- Files changed: paths or a concise grouped list.
- Validation: exact commands/checks and actual results.
- Browser checks: performed results; separately list anything still unverified.
- Decisions/deviations: what changed from this plan and why.
- Remaining: concrete unfinished tasks or known defects.
- Next action: one clearly scoped implementation/verification group.
- Commit/reference: if one already exists; do not fabricate or create a commit solely to fill this field.

### 2026-10-02 - Phase 0: responsive shell and navigation

- Status: Complete. Phase 0 acceptance checks passed; later phases remain untouched.
- Inspected baseline: starter React counter/demo; installed Router and Lucide; empty tests directory; no Tailwind or browser runner. Baseline build and lint passed after the build was rerun with approval for Windows subprocess access.
- Implemented: desktop sidebar and phone navigation for Train/Create/Calendar/Progress; profile/settings route; explicit unfinished-page copy; unknown-route recovery; active navigation, skip link, keyboard focus transfer, route titles, and hash routing. No fabricated profiles, sessions, or persisted data.
- Support: `.env.example` documents `VITE_KOFI_URL`; blank/invalid values show disabled Support and an explanation. Source validates HTTPS Ko-fi page URLs and uses a new tab with `noopener noreferrer`. No real destination supplied or externally tested.
- Files changed: `src/App.tsx`, `src/index.css`, `src/app/*`, `src/components/layout/*`, `vite.config.ts`, `index.html`, `public/boros.svg`, package manifests, Playwright configs, `tests/browser/shell.spec.ts`, `.env.example`, `.gitignore`, README, and this file. Removed unused starter `src/App.css`; existing unused image assets retained. Future feature folders deferred until real implementation begins.
- Configuration: Tailwind 4 official Vite plugin/import; existing React plugin retained. Relative build assets and hash routes; fixed development/preview ports. See [Tailwind Vite instructions](https://tailwindcss.com/docs/installation/using-vite).
- Final validation: `npm run build` passed (includes `tsc -b`); `npm run typecheck` passed; `npm run lint` passed; `npm ls --depth=0` passed; installation audit reported zero vulnerabilities.
- Browser checks: `npm run test:browser`: 6/6 passed in Edge against development; `npm run test:browser:preview`: 6/6 passed against the final production build. Verified all five routes, reloads, back/forward, active links, disabled Support, unknown-route recovery, keyboard skip/focus, and no browser console/runtime errors. Layout assertions covered 320, 390, 768, and 1440px with no horizontal overflow and navigation targets at least 44px. Desktop and 320px phone screenshots were visually inspected.
- Resolved verification failures: sandbox blocked Vite/Playwright subprocesses (`spawn EPERM`) and package download (`ENOTCACHED`); approved reruns succeeded. Initial browser startup found the existing dev server; confirmed it served Boros and enabled local reuse. First development/preview suites each passed 4/6 and caught missing-resource console errors; adding the Boros favicon fixed both, with final 6/6 passes. Read-only process inspection was denied; HTTP inspection established the existing server identity.
- Remaining verification: real-device/other-engine checks are outside this Edge run; live Ko-fi destination check awaits the owner's URL. No Phase 0 acceptance check remains pending.
- Optional owner spot check: open `http://127.0.0.1:5173`, use Tab/Enter through navigation and Profile & settings, refresh `/#/calendar`, and inspect at phone width. Once the real Ko-fi URL is set in `.env.local` and Vite restarted, click Support and verify the intended page opens in a new tab.
- Next action: Phase 1 only when requested; establish IndexedDB and persistent Guest/profile ownership before implementing workout features.
- Commit/reference: none; project remains untracked in the parent repository.

## UI specification — approved Boros design

Apply these rules across the application. Implement each feature’s UI during
its assigned phase; the mockup does not authorize skipping ahead or presenting
unfinished features as functional.

### Visual direction

- Boros is free. Screens should show useful controls and user data directly.
- No promotional headlines, hero sections, upselling, or motivational filler.
- The only brand tagline is: “Ask not for a lighter burden”.
- Default to dark mode. Provide Dark and Light options in Settings and remember
  the selection locally.
- Use the approved mockup for visual direction. Written requirements take
  precedence over accidental omissions or incorrect placement in the image.
- Sample names, measurements, and workouts are illustrative, not default data.

### Colors and typography

Use shared theme tokens rather than scattered hardcoded colors.

Dark theme:

- Header and main page background: #000000.
- Bottom navigation background: #282828.
- Inputs and secondary buttons: #202020.
- Borders and dividers: #3A3A3A.
- Primary text: #F1F1F1.
- Secondary text: #AAAAAA.
- Primary action: near-white background with black text.
- Destructive actions: red, accompanied by an explicit label.

Light theme:

- Header and main page background: #FFFFFF.
- Bottom navigation and secondary surfaces: #F2F2F2.
- Primary text: #111111.
- Secondary text: #606060.
- Borders and dividers: #D6D6D6.
- Primary action: near-black background with white text.

Use a clean sans-serif font resembling the reference’s Roboto styling.
Use locally bundled Roboto if available, otherwise a system sans-serif stack.

- Body and input text: approximately 16px.
- Page headings: approximately 24px, semibold.
- Section/exercise headings: approximately 18–20px, semibold.
- Secondary labels: approximately 13–14px.
- Use flat surfaces, restrained rounding, and thin borders.
- Avoid gradients, colored glows, green-tinted surfaces, and excessive shadows.
- Maintain readable contrast and visible keyboard focus in both themes.

### Shared header

- Keep a compact header at the top.
- Left: an ouroboros logo—a snake eating its own tail—beside “Boros”.
- Render the logo in a color that contrasts with the active theme.
- Place “Ask not for a lighter burden” beneath the wordmark.
- Right: circular profile avatar only, with accessible name and tooltip “Settings”.
- Use a generic avatar when no profile photo exists.
- Keep the active profile's identity in Settings, not visible text beside the header avatar.
- The avatar opens profile settings; either owner brand image returns to Train through the navigation guard.
- Do not use the previous large “Profile & settings” button.
- Handle long profile names without pushing the brand offscreen.

### Bottom navigation

- Keep these four tabs at the bottom, in this order:
  Train, Create, Calendar, Progress.
- Each tab has an icon above its label.
- Use consistent icons from the existing icon library.
- Indicate the active tab through icon treatment and text emphasis.
- Settings is accessed through the header; it is not a fifth tab.
- Support appears inside Settings only.
- Keep navigation visible while the main content scrolls.
- Respect mobile safe areas and add enough content padding to prevent overlap.
- In Settings, do not incorrectly highlight Train as the current page.

### Train screen

- Use the direct page title “Train”.
- Provide plan selection and training-day selection.
- Show the selected training-day name with an icon-only session Note action.
- Display exercises in their saved order using compact sections and set rows.

Each exercise shows:

1. Exercise name.
2. Two icon-only controls beside the name:
   - Note/document icon: opens editable exercise notes.
   - Circled “i” icon: opens exercise information.
3. A concise prescription, such as:
   “3 sets · 5–8 reps · 1–2 RIR”.
4. Set rows containing set number, weight, and actual repetitions.

Additional rules:

- Do not show muscle/tag chips in Train. Keep tags available in the creation
  and library interfaces.
- Do not show exercise instructions inline.
- The information popup contains the exercise instructions and an optional
  YouTube tutorial link.
- Do not show a kg/lb selector in Train.
- Show the selected unit as a read-only label, such as “Weight (lb)”.
- Change the weight-unit preference only through Settings.
- Preserve the meaning of existing recorded weights when units change;
  never simply relabel an unchanged number.
- If prescribed reps or RIR differ between sets, show the appropriate targets
  beside each set rather than an inaccurate shared summary.

Rest controls:

- Place a REST button between consecutive sets.
- Place the exercise-rest button after the final set and before the next
  exercise.
- Example: Set 1 → REST → Set 2 → REST → Set 3 → exercise REST.
- Do not group all rest buttons after the final set.
- Show the configured duration and remaining time while a timer runs.

Session actions:

- Place Save and Clear together immediately above the bottom navigation
  while a session is open.
- Save is the primary action; Clear is secondary.
- Clear opens a confirmation dialog.
- Ensure this action area does not cover the final exercise or focused input.

### Settings screen

Use the direct title “Settings” and clearly grouped sections:

Profile:

- Profile selection and management.
- Name, profile picture, height, weight, and age.
- Weight-unit preference: kg or lb.
- Preserve the planned relationship between profile weight and progress entries.

Appearance:

- Dark / Light segmented control.
- Dark selected on first use.
- Apply the chosen theme to every screen and popup.

Data:

- Download data.
- Upload data.
- Clear data, visually marked as destructive.
- Display this explanation:
  “Data is saved in this browser. Clearing site data removes your profiles
  and logs. Download a backup to keep a copy.”
- Preserve the required confirmations and import-resolution flows.

Support:

- “Support Boros”, with a heart icon and external-link indicator.
- Secondary label: “Ko-fi”.
- Open the configured Ko-fi page in a new tab.
- Do not add a Support tab or promotional support banner.

### Notes, information, and confirmation popups

- Use shared accessible dialog components.
- Give each icon-only trigger an accessible name and desktop tooltip.
- Notes open an editable field with clear save/cancel behavior.
- Information opens read-only exercise details and the optional tutorial link.
- Include a visible close control.
- Support keyboard focus, Escape dismissal where appropriate, and focus
  restoration to the trigger.
- Keep long popup content scrollable within the viewport.
- Do not silently discard unsaved note edits.

### Other tabs and responsive behavior

- Create: direct actions for Create Workout, Create Plan, and Import AI Output.
- Calendar: calendar controls, scheduled sessions, and Add Plan.
- Progress: measurement entry, weight history/chart, and progress photos.
- Use the same typography, controls, spacing, colors, and dialogs throughout.
- Empty states briefly explain what is missing and provide the relevant action.
- Use real interface components; do not reproduce the mockup as an image.
- Build mobile-first, with approximately 16px page padding and touch targets
  at least 44px in size.
- On wider screens, center content with sensible maximum widths.
- Preserve bottom navigation and the same interaction model across screen sizes.
- Do not reproduce the mockup’s outer phone frames or rounded screen corners.
- Support text resizing, long names, and the mobile keyboard without horizontal
  scrolling or covered controls.

### UI acceptance checklist

- [x] Dark mode is the initial default; theme selection survives reload.
- [x] Header/main background is black and bottom navigation is grey in dark mode.
- [x] Header contains the ouroboros, wordmark, exact tagline, and profile entry.
- [x] Four tabs appear at the bottom; Support appears only in Settings.
- [ ] Train contains no tag chips, inline instructions, or unit selector.
- [ ] Note and information icons open the correct accessible popups.
- [ ] Rest controls appear between the correct sets and exercises.
- [ ] Save/Clear and navigation never cover content or focused inputs.
- [x] Both themes remain readable and usable on mobile and desktop.
- [x] No promotional filler or hardcoded mockup records appear as real user data.

The unchecked Train/session UI acceptance items above belong to Phase 5.
Bottom-navigation spacing and focused Settings controls are verified in Phase 1;
the combined Save/Clear session-action requirement remains pending Phase 5.

### 2026-10-02 - Phase 1: local profiles, settings, and approved shared UI

- Status: Complete. All Phase 1 acceptance checks passed in isolated service tests and real Edge browser contexts. Physical devices and other browser engines remain explicitly unverified.
- Shared UI: black header/content, grey fixed bottom tabs, centralized Dark/Light tokens, persistent appearance, theme-aware ouroboros vector, exact tagline, circular avatar/name/Settings entry, and concise unfinished routes. Support moved exclusively into Settings with existing `VITE_KOFI_URL` validation/unavailable behavior. Backup and Clear Data controls are disabled and explicitly unavailable.
- Persistence: Dexie database `boros`, schema v1; stable UUID profile IDs, unique normalized names, compound `[profileId, id]` photo/measurement keys, settings record for remembered selection/theme/notice. Initialization is transactional and idempotent, including concurrent fresh tabs. Guest is created only if every table is empty. Missing/corrupt settings or a missing selected profile produce errors, never a replacement database.
- Profiles: named creation, edit/switch, Guest conversion preserving ID and data, optional demographics, photo preview/upload/removal, default avatar, saved selection on reload. Explicit profile IDs bind form writes; other tabs cannot retarget them. Profile switching and in-app navigation ask before discarding unsaved edits; browser unload uses the native unsaved-changes warning.
- Concurrency: optimistic profile revisions checked inside the same transaction as all profile/photo/measurement writes. Stale edits fail without overwrites or partial writes; input is kept. Reload saved profile requires confirmation. Each already-open tab retains its own active selection; the last selected profile is remembered for the next load. Appearance updates are browser-wide.
- Validation decisions: name length 1-80 for named profiles (Guest can leave it blank); display name trimmed, conflict key NFKC + collapsed whitespace + lowercase. Optional age is an integer 0-130, height >0 to 300 cm, weight >0 to 1000 kg. Invalid fields produce useful errors without saving. Bounds are input sanity limits, not health recommendations.
- Units/measurements: centimeters and kilograms are canonical; exact factors 2.54 cm/in and 0.45359237 kg/lb. Display-unit-only changes preserve canonical values and add no weight entry. Changed weights append dated UTC records; current weight derives from the latest record, not a profile copy. Blank weight keeps any prior measurement. Same-millisecond timestamps are ordered deterministically. Measurement history UI remains Phase 7.
- Photos: decoded JPEG/PNG/WebP, up to 5 MB and 4096 pixels on either side; stored as profile-owned local blobs in the profile-save transaction. Object URLs are revoked. Invalid images leave the existing photo/input intact.
- Migrations: retain v1, append numbered versions and transactional `.upgrade()` transforms, preserve stable IDs/records, and test populated previous-version upgrades before shipping a migration. No schema upgrade beyond initial v1 was necessary or claimed tested. Future profile-owned entities use the same ownership boundary. Details are in README and `src/db/database.ts`; [Dexie migration reference](<https://dexie.org/docs/Version/Version.upgrade()>).
- Files changed: `src/db/*`, `src/schemas/profile.ts`, `src/features/profiles/*`, workspace provider/context, app routes/pages, shared layout/branding/CSS, browser/data tests, Playwright worker count, package manifests, README, TODO. Existing Vite/TypeScript/Tailwind configuration and unrelated assets retained. Only `fake-indexeddb` added for isolated data tests.
- Validation: `npm run build`, `npm run typecheck`, `npm run lint`, and `npm ls --depth=0` passed. Lint has no warnings. `npm run test:data`: 9/9 passed, covering simultaneous Guest initialization, conversion, isolation, duplicate names/concurrent creates, canonical units/latest measurements, stale connection writes, input/photo validation, transaction rollback, and preservation of inconsistent existing records. Test databases are uniquely named `boros-test-*` in fake IndexedDB.
- Browser validation: `npm run test:browser`: 20/20 passed; `npm run test:browser:preview`: 20/20 passed against the final build. Includes Guest conversion, saved profile settings/photos, creation/switch/reload, default/uploaded/removed avatar, units, duplicates, rejected images/demographics, persistent theme across all routes, exact shell tokens/branding, unavailable actions, two-tab stale edits, unsaved-switch confirmation, failed-write input retention and retry, unavailable IndexedDB, hash refresh/history, keyboard focus, and route recovery. No console/runtime errors in shell navigation checks.
- Responsive checks: desktop and phone Edge projects; shell layout at 320/390/768/1440px, targets at least 44px, no horizontal overflow; 320px Settings with long names and focused Save remaining above navigation. Dark desktop/phone and light 320px screenshots visually inspected. Screenshot artifacts remain under ignored `test-results`.
- Resolved verification issues: sandbox package download (`ENOTCACHED`) and Node test worker (`spawn EPERM`) required approved reruns. First browser suite was 16/18 because its malformed PNG fixture was correctly rejected; replaced it with a generated PNG. The subsequent avatar run exposed overly strict select-label test locators; switched them to accessible combobox-role locators. Full development and production suites then passed. Initial avatar object-URL effect lint warning was fixed with a ref-managed image lifecycle.
- Remaining/manual: on a physical phone, focus Name, Age, Height, and Weight with the keyboard open; scroll to Save and the bottom tabs in portrait/landscape and confirm controls remain reachable. Safari/Firefox and screen-reader behavior are not yet tested. Real full-disk/quota exhaustion is untested; rollback and recoverable input were verified with injected failures. Once a real Ko-fi URL is configured, confirm the intended destination opens in a new tab. These limits do not represent unimplemented Phase 1 features.
- Scope boundary: no exercise library, plan builder, training sessions, calendars, AI import, progress screen, backup import/export, or Clear Data operations were added. Their checklists remain unchecked.
- Next step: Phase 2 only when requested, building profile-scoped exercise creation/library on these persistence boundaries.
- Commit/reference: none; no publish or push performed.

### 2026-10-02 - Phase 2: exercise library and Create Workout

- Status: Complete. Phase 2 acceptance passed in service tests and desktop/phone Edge browser projects. Phase 3 not started.
- Storage: additive v2 migration creates `exercises` and `tags`, each with `[profileId, id]` keys and UUIDs. Records include creation/update timestamps and optional archive timestamps; exercises include revisions. An optional active-name key enforces unique active exercise names per profile. Archived names can be reused; restore checks conflicts. Tags reuse a unique normalized name within their profile. Normalization reuses Phase 1 NFKC, collapsed whitespace, and lowercase while keeping trimmed display names.
- Create Workout: required name, set count, and positive integer reps; fixed or min/max reps per set; optional min/max RIR, rest between sets/after exercise in seconds, instructions, notes, HTTPS YouTube tutorial URL, existing tags and inline new tags. Blank RIR/rest stays unspecified; explicit 0 is preserved. Blank range maximum means a fixed target. Reversed ranges and invalid numbers produce specific linked field errors.
- Set editing: apply set 1 reps/RIR to all sets, then customize individually. Growing the count preserves existing targets; newly added sets are empty. Shrinking past populated sets and replacing customized targets require confirmation. A changed count must be applied before saving. Dialogs support keyboard focus, Escape/cancel, and return focus to the trigger.
- Library: active-profile-only reads; normalized name search; A-Z, Z-A, newest-added, oldest-added sorting; ANY-match tag filters compose with search/sort and active/archive selection. View prescription renders text and targets; View / edit preserves IDs. Duplicate opens an editable unsaved copy with a suggested unused name and receives a new ID only on save. Archive retains records; archived view supports edit/rename and restore.
- Integrity: exercise and inline-tag writes share one transaction, so failed saves create neither partial exercises nor orphan tags. Explicit profile IDs and revision comparisons protect edits/archive/restore. Stale edits and write failures keep form input and never report success. A different tab's selected profile cannot redirect an open editor's save. UI reads have loading/error/retry and empty/filter-empty states.
- Tutorial links: HTTPS only; `youtube.com`, `www.youtube.com`, `m.youtube.com`, and `youtu.be` supported. Video paths: watch with one v parameter, shorts/live/embed, or shortened video ID; IDs are 11 URL-safe characters. Credentials, alternate hosts, non-video links, and non-HTTPS URLs are rejected. Links open only by user action with `noopener noreferrer`; no automatic preview/fetch/embed. User instructions/notes remain plain text.
- Input bounds: 1-100 sets, exercise names up to 120 characters, 50 tags with names up to 80 characters, and instructions/notes up to 20,000 characters each. Numeric inputs must be safe integers; reps >0 and RIR/rest >=0. These are input/resource limits, not prescription advice.
- UI: reused approved dark/light tokens, fixed bottom navigation, current profile ownership, and existing form-state patterns. Added shared `Field` and native modal `ConfirmDialog` components. Create Plan and Import AI Output are disabled and explicitly unavailable. A general unsaved-changes prompt replaces the profile-specific wording now that exercise forms also use the shared guard.
- Files changed: `src/schemas/exercise.ts`, `src/db/database.ts`, `src/db/exercises.ts`, the initialization guard in `src/db/profiles.ts`, `src/features/create/*`, `src/components/ui/*`, app route/provider wiring, `src/index.css`, new data/browser exercise tests, existing shell assertions, README, and TODO. No dependency, lockfile, or Vite configuration changes needed.
- Final static checks: `npm run build`, `npm run typecheck`, and `npm run lint` all passed with no lint warnings. Build uses the retained `tsc -b && vite build` command.
- Final data tests: `npm run test:data` passed 19/19 (10 exercise/migration tests plus 9 existing profile tests). Covered optional/zero round trips, required/invalid/reversed targets, supported/unsafe URLs, stable-ID lifecycle and independent duplicates, exercise/tag/profile isolation, normalized active-name collisions including concurrent creates, archive restore conflicts, tag reuse, write rollback, stale connections, all sorts with combined ANY-tag/name filtering, and populated v1-to-v2 preservation.
- Final browser tests: `npm run test:browser` passed 32/32; `npm run test:browser:preview` passed 32/32 against the final build. Includes three different set prescriptions with RIR 0/missing, reload/reopen/edit, duplicate, archive/restore, search/sort/ANY-tag combinations, two-profile isolation, existing-tag selection, set growth, confirmed/canceled reduction, field errors, failed-write recovery with no orphan tags, stale-tab rejection, and another tab's profile switch during editing. Existing shell/profile/theme checks also passed. YouTube request monitoring confirmed no automatic third-party requests in the exercise lifecycle.
- Responsive/accessibility coverage: dark desktop/phone and light phone editor screenshots visually inspected; 320px no-horizontal-overflow and focused Save-above-navigation assertions passed. Native confirmation Escape and trigger-focus restoration passed. Error descriptions no longer change the input's accessible name. Physical keyboard/device and screen-reader checks remain separate below.
- Resolved verification failures: first data run was 18/19 because absent RIR was materialized as an undefined property; the form now omits it and 19/19 pass. First browser run was 28/30 because validation messages became part of input labels; shared Field now separates label and linked error description. Focused reruns passed, then expanded full development and production suites passed 32/32 each. Approved subprocess execution used for Node/Vite/Edge checks, consistent with previous phases.
- Manual checks carried forward: on a physical phone, open Create Workout, edit name/reps/RIR/instructions with the keyboard open, scroll to Save, and try a set-reduction dialog in portrait/landscape; ensure inputs/actions and bottom navigation remain reachable. In Safari/Firefox, repeat a three-set save/reload/edit/archive/restore. With a screen reader, check field names, error descriptions, dialog announcements, Escape, and focus return. Live Ko-fi destination awaits the owner's URL; then confirm Support opens that intended page. Real quota exhaustion remains untested; injected failures cover atomic rollback and retained input.
- Remaining limitations: drafts survive failed saves in memory but are not autosaved across a browser reload; native unload and in-app navigation warn about edits. Full library filtering currently works over the active profile's local records in memory; large-library performance has not been benchmarked. No tag-management/archive UI is claimed. No Phase 2 acceptance item remains pending.
- Next step: Phase 3 manual plans and editing when requested, copying exercise prescriptions into independent plan entries. No plan builder, AI import, training, calendar, progress UI, or backup workflow was added.
- Commit/reference: none; no push or deployment performed.

### 2026-10-02 - Phase 2.5: single-address navigation

- Status: Complete. All Phase 2.5 acceptance checks passed in development, production preview, and plain-static root/project hosting. Earlier handoffs above remain historical records, including their hash-routing checks.
- Implemented: MemoryRouter from the existing React Router 7.18.4 installation, reused screens/route definitions/providers, and shared guarded ScreenButton controls. Memory history stays mounted above the workspace loading boundary so selecting/creating profiles cannot reset navigation. Feature controls expose no screen URLs for modified clicks, new-tab actions, or copied links.
- Preference: `boros.navigation.screen` in sessionStorage stores only one of train/create/calendar/progress/settings, written in a post-commit effect. Missing, invalid, or inaccessible storage opens Train; write failures do not block navigation. Canceled discard confirmation writes nothing. Same-tab refresh restores the screen, not unsaved editors; independently opened tabs default to Train without a preference.
- Legacy addresses: startup recognizes the five old top-level hashes (also accepting a trailing slash), taking precedence over remembered selection. Unknown hashes select Train. One replaceState removes the hash while keeping the actual pathname/query; no added history entry, custom 404, or server rewrite.
- Preserved behavior: titles, current-screen indicators, both themes, keyboard focus/skip-to-content, profile and exercise dirty guards, native beforeunload warning, stale-write rejection, failed-save input, saved data and profile isolation. Settings has a guarded Return to previous screen action; direct entry/refresh falls back to Train. Browser Back/Forward navigates documents and can leave the app.
- Files: app navigation modules/route metadata, App/main, shared shell/placeholder controls, Settings return action, minimal button CSS, updated browser suites, navigation/hosting tests, test-only static server, static Playwright config and package script, README, TODO. No schema, service, lockfile, dependency, or Vite configuration changes.
- Static/data validation: `npm run build`, `npm run typecheck`, and `npm run lint` passed, with no lint warnings; `npm run test:data` passed 19/19, including profile/exercise isolation, revisions, canonical measurements, lifecycle, rollback, and existing populated v1-to-v2 migration preservation. Phase 2.5 introduces no new database version.
- Development/preview browser results: `npm run test:browser` 48 passed, 2 skipped; `npm run test:browser:preview` 48 passed, 2 skipped. Skips are explicitly static-host-only 404 checks, executed in the separate static suite. Desktop and emulated-phone Edge cover all five screens/reloads with unchanged URLs/history length, new tabs, each legacy hash plus unknown route, invalid/blocked sessionStorage, canceled/accepted dirty navigation, Settings return/fallback, modified/middle clicks, Space/Enter focus, skip action, external Back/Forward, and canceled native unload.
- Regression browser coverage: full existing Guest/profile/units/avatar/theme/failed-write/stale-tab suite plus three-set exercise save/reload/edit/duplicate/archive/restore, combined search/sort/ANY-tag filters, isolated profiles, retained drafts, and cross-tab selection. Browser contexts are isolated; no owner's records cleared.
- Production static hosting: `npm run test:browser:static` passed 100/100 (no skips), using the same dist build at `/` and `/project-check/` with a plain Node file server that returns 404 for all five screen paths and missing assets. Desktop and emulated-phone Edge passed the full navigation/profile/exercise suite at both mounts, including refresh and legacy cleanup retaining `/project-check/`. No SPA fallback or hosting rewrite involved.
- Responsive/visual checks: existing 320/390/768/1440px layout and >=44px target assertions passed; focused form controls remain above bottom navigation. Dark 390px shell and light 320px Settings production screenshots visually inspected. Screenshot artifacts are in ignored test-results directories.
- Resolved failures: first development run had 14 failures, 34 passes, 2 skips. It exposed the router resetting to its startup screen when workspace profile loading remounted it; moving MemoryRouter above that boundary fixed the profile regressions. Legacy test now opens a new document before each startup hash; keyboard test waits for committed focus and dismisses browser middle-click autoscroll. Full rerun passed. Sandbox Node workers initially returned spawn EPERM; approved subprocess reruns passed, as in previous phases.
- Remaining/manual checks (not passed): physical phone, portrait and landscape, open Settings demographics and Create Workout reps/RIR/instructions with keyboard visible; scroll to Save and tabs and test a reduction dialog. Safari/Firefox: switch/refresh all five screens with unchanged address, check Settings return and canceled edits, then save/reload/edit/archive/restore a three-set exercise across two profiles. Screen reader: check navigation button names/current states, skip and content focus, field/error announcements, dialog dismissal and focus return. With the owner's configured Ko-fi URL, confirm Support opens the intended page in a new tab. Real quota exhaustion and large-library performance remain untested; injected failures cover rollback and retained input.
- Limitations: copied/bookmarked URLs identify the app, not a particular screen. Screen preference is tab-local and may be unavailable; browser tab duplication can inherit sessionStorage according to browser behavior. Draft recovery across reload is not implemented. Actual GitHub Pages/custom-domain publishing is a later phase.
- Next step: Phase 3 manual plans/editing only when requested. No Phase 2.5 acceptance check remains pending in the available test environments. No Phase 3 or later features implemented.
- Commit/reference: none; no push, publish, or dependency installation.

### 2026-10-02 - Phase 3: manual plans, editing, and management

- Status: Complete. Phase 3 acceptance checks passed in isolated data tests and desktop/phone Edge development, production preview, and plain-static root/project hosting. Prior phases and their recorded verification are preserved above.
- Storage: additive Dexie v3 `plans` store, compound `[profileId, id]` key and unique active-name index. Plans contain ordered days and full exercise prescription snapshots; UUIDs identify plan/day/occurrence independently of names/positions. Reordering/moving/editing retains IDs. New copies and duplicated plan contents get fresh IDs; the new plan ID is assigned on save.
- Integrity: plan service owns profile-scoped reads/saves/archive/restore/duplicate drafts and source reads. Validation precedes one atomic plan write with the revision comparison inside the transaction. Stale writes and failures keep input and never report success. Active names reuse NFKC, collapsed whitespace, and lowercase conflict keys. Archived names may be reused, with an explicit rename-before-restore error for conflicts.
- Create Plan: plan name, 1-7 editable training days, derived rest-day count, named/numbered days, and at least one exercise per day required to save. Incomplete drafts remain editable with field/day errors. Day count increases preserve content; reduction and day/exercise removal require confirmation. Buttons reorder days/exercises; a destination selector moves occurrences between days. Focus follows moved occurrences and falls back to the editor heading when a removed trigger disappears.
- Sources/snapshots: current-profile active library exercises and occurrences in saved active plans share name/date sorting, search, and ANY tag filters. Labels identify library or plan/day/occurrence, including repeated names. Entire prescriptions (sets, reps/RIR, rest, instructions, notes, tutorial, tag names) are cloned; source IDs are optional provenance, never live bindings. Plan-only tag edits stay in snapshots, leaving library tags untouched. Date sorting uses source record creation time. This path can include future AI-created plans without implementing import now.
- Shared UI: extracted PrescriptionEditor from the working exercise editor and LibraryFilters from the existing library. Both plan and library use the same target validation, zero/missing semantics, optional fields, and set confirmations. Explicit textarea labels and error descriptions remain stable after reopening saved text. Create lists active/archived plans with edit/duplicate/archive/restore, search, and sort. Dark/light tokens, native dialogs, mobile spacing, and unchanged public address retained.
- Dirty state: parent plan owns its draft and global navigation/unload guard; nested prescription edits do not clear that guard when closed. Applying a prescription edits only the draft; Save plan persists it. Canceling a nested edit preserves the parent plan. Profile IDs bind each save; changing profile in another tab cannot retarget the editor. Drafts are not autosaved across reload.
- Limits/decisions: 120 characters for plan/day names; 1-7 days; up to 100 occurrences per day; existing prescription limits unchanged. No separate redundant training/rest-count field. New blank days are numbered but contain no fabricated prescriptions. Duplicates open as editable drafts with distinct suggested names. No new dependencies required.
- Files: `src/schemas/plan.ts`, `src/db/plans.ts`, additive database schema and initialization guard, Create plan library/editor/picker, extracted shared prescription/filter components, generic filter helper, shared textarea fields, minimal plan CSS, new plan data/browser tests, current-schema migration assertion, README, and TODO. Router/configuration and unrelated files preserved.
- Data/static validation: `npm run build`, `npm run typecheck`, and `npm run lint` passed (no lint warnings). `npm run test:data` passed 29/29: 10 new plan tests plus 19 existing checks. Includes required/day/prescription validation, unique IDs, ordering/movement, zero/undefined values, isolated reads/mutations/source choices, normalized/concurrent duplicate names, restore conflicts, independent full snapshots, duplicated IDs/names, stale connections, atomic failed create/update, combined filters, populated v2-to-v3 preservation of all six previous stores/photo bytes, existing v1-to-current upgrade, and orphaned-plan initialization protection.
- Final browser verification: `npm run test:browser` passed 58 with 2 skips; `npm run test:browser:preview` passed 58 with 2 skips; `npm run test:browser:static` passed 120/120 with no skips. The development/preview skips are static-host-only 404 checks, executed in the static suite. Desktop and emulated-phone Edge covered the full existing shell/navigation/profile/exercise suites plus plans. The same production build works at `/` and `/project-check/` without SPA rewrites. New plan coverage includes a four-day heterogeneous prescription, reopened zero/missing values/text/tutorial/tags, stable day/occurrence ordering after save/reload, movement, duplication, archive/restore/name-conflict recovery, picker search/sort/ANY tags, copying from saved plans, source edits/archive isolation, incomplete validation, confirmed/canceled removals, nested dirty navigation, canceled native reload, injected failed-save recovery, stale tabs, and profile selection isolation. All tests use isolated browser contexts.
- Resolved verification issues: first data run 28/29; the deep-equality fixture omitted an optional property that the existing exercise-to-input adapter represents as undefined. Compare the copy against its actual source snapshot; missing remains unspecified and zero remains zero. Initial focused browser run 8/10 exposed a populated-textarea label lookup issue; explicit label/control associations fixed it, and full development passed 58 with 2 static-only skips. An expanded reload probe awaited a load event despite canceling navigation; use page-initiated reload and await/dismiss the beforeunload dialog instead, preserving input (focused 2/2 pass). Overlapping runs also collided in nested artifact directories; final suites run sequentially. One subsequent development run had 57 passes, 1 failure, and 2 skips because an unexpected full document reload reset an exercise draft (trace showed Vite reconnecting and React startup in that tab). Rerunning without file edits passed 58 with 2 skips; no app change was needed for that interruption. The earlier preview probe run had 56 passes, 2 reload-probe failures, and 2 static-only skips; final results are recorded separately.
- Responsive/visual results: 320px no-overflow and focused Save-above-navigation assertions passed; dark 320px plan editor and desktop plan library screenshots visually inspected. Existing theme and shell checks also pass at 320/390/768/1440px. Physical keyboards/safe areas and assistive technology remain unverified. Artifacts are under ignored `test-results`.
- Manual checks still required (not passed): physical phone in portrait/landscape, create a four-day plan with keyboard visible, edit long names/notes and reps/RIR, use the picker/move controls/removal dialog, and reach Apply/Save and bottom tabs. Safari/Firefox: create/reload/edit/duplicate/archive/restore a plan, cancel dirty navigation/reload, and verify profile isolation. Screen reader: check plan/day/exercise names, validation errors, picker labels, day/exercise move controls, confirmation announcements/Escape/focus restoration. When the owner's Ko-fi URL is configured, verify the intended new-tab destination. Real quota exhaustion and large-library/plan performance remain untested; injected failures verify rollback and retained input.
- Remaining implementation limitations: unsaved plans/nested edits are memory-only; source choices/filtering scan the active profile's local records in memory. No drag-and-drop, tag management, AI import, training/timers, scheduling, progress, or backup workflow is claimed.
- Next action: Phase 4 external AI formatting/paste import only when requested. No Phase 3 acceptance item remains pending in the available test environments. Phase 4 and later workflows were not implemented.
- Commit/reference: none; no publication, push, or dependency installation.

### 2026-10-02 - Phase 4: external AI formatting and paste import

- Status: Complete. Phase 4 acceptance passed in isolated data tests and desktop/emulated-phone Edge development, production preview, and plain-static root/project hosting. Previous handoffs above remain historical records, including their then-current unavailable features and unverified manual checks. Phase 5 has not started.
- Public contract: strict Zod `schemaVersion: 1` discriminated plan/workout envelope, exactly one matching payload, no unknown keys at any object level. Public data contains no internal IDs, profile ownership, revisions, timestamps, or provenance. Plan/day/exercise/set validation reuses existing name, number, range, tag, and supported HTTPS YouTube rules. Day count must equal trainingDaysPerWeek. Omitted RIR/rest/tutorial become null, instructions empty string, tags empty array; explicit zero remains zero. Public notes are not accepted, but users may add them in the preview. README documents the full shape/defaults and a minimal example.
- Formatting UI: Create > Import AI Output provides separate plan/workout formatting options, JSON-only instructions and schema-validated illustrative examples. Copy uses the clipboard API; failure focuses/selects the still-visible instructions with a manual-copy message. Prompts require preservation of requested targets, no invented tutorials, and explicit missing-value defaults. There is no provider connection, external transmission, or automatic example persistence.
- Parser: accepts the whole raw JSON value or exactly one JSON fenced block; rejects prose, extra blocks, malformed JSON, unsupported versions, mismatched payloads, unknown nested fields, invalid types/ranges/day counts, and unsafe links. No fragment extraction or numeric coercion. Errors identify array-index field paths and receive focus; the pasted input remains editable. Limit: 1,000,000 characters, rejected with an error rather than truncated. Pasted code/HTML stays plain text; no tutorial fetch, preview, or embed.
- Preview: only a fully validated payload opens the shared PrescriptionEditor or PlanEditor as an explicitly unsaved import, with all fields, ordering, tags, source picker, dialogs, and validation retained. Canceling even an untouched preview requires confirmation, writes nothing, and returns to original pasted JSON. Closing the import confirms before discarding text. Preview edits are memory-only; cancel/reload does not recover them. Dirty navigation and native unload warnings preserve input when canceled. Public address stays unchanged.
- Persistence: existing exercise/plan services retain explicit owner IDs, normalized active-name conflicts, and revisions. Import sessions bind one local creation UUID and profile to a validated preview; retries after failure or uncertain success reuse that ID. Concurrent/repeated saves return the committed artifact without duplicating or overwriting it. UI submission refs close the rapid-click gap before button disabling. Final edited values are revalidated. Name conflicts require explicit rename or cancellation. Existing records are never merged or overwritten by import.
- Atomic tags/artifacts: shared tag resolution reuses NFKC/collapsed-whitespace/lowercase profile tag keys. Tags are resolved/created only during final save in the same transaction as the artifact. Failed writes roll back tags too. Imported plans store independent nested prescriptions and local day/occurrence UUIDs, with no automatic library exercises. Their tags become available for reuse; subsequent manual plan-only tag edits preserve the existing snapshot-only behavior. Saved imports use the ordinary library/plan editors and appear in the source picker.
- Scope/files: new public schema, parser/prompt/draft adapters, import UI/session service, shared tag helper, minimal service/editor submission extensions and CSS, fixtures and import tests, one updated previous unavailable-action assertion, README and TODO. Database remains schema v3 with no migration or data clearing. Existing dependencies, lockfile, Vite, router, and configuration retained. No training, timer, schedule, progress, backup, provider integration, publish, or push.
- Commands/results: `npm run build`, `npm run typecheck`, and `npm run lint` passed, with no lint warnings. `npm run test:data` passed 38/38 (9 new import tests plus 29 existing tests). `npm run test:browser -- tests/browser/imports.spec.ts` passed 10/10. Full `npm run test:browser` passed 68 with 2 skips; `npm run test:browser:preview` passed 68 with 2 skips. Skips are the two static-host-only 404 checks. `npm run test:browser:static` passed 140/140, no skips, using one build at `/` and `/project-check/` without SPA rewrites. All suites ran sequentially; no source edits during development browser verification.
- Data evidence: valid four-day/workout fixtures with heterogeneous sets, zero/missing values, Unicode, multiline malicious-looking plain text and HTTPS tutorial; prompt examples parsed against the same schema; malformed/prose/blocks/version/payload/unknown-field/type/range/day/link rejection; specific nested errors; no writes from parse/draft/discarded sessions; local IDs; normalized profile tags, isolation, explicit duplicate rename, invalid edited input, atomic rollback and retry, concurrent saves and simulated uncertain-commit retry. Existing profile/exercise/plan/migration regression tests all pass in uniquely named fake databases.
- Browser evidence: both instruction options with simulated clipboard success/denial and selected fallback text; invalid input retained with focused errors; plan/workout preview cancellation leaves all table counts unchanged; guarded navigation/native unload and unchanged address; four-day plan preview edits and saved reload; normal editor/source-picker reuse; standalone library import; duplicate-name rename; another tab selecting a profile cannot retarget a preview; injected quota failure retains edited input and rolls back tags; rapid repeated submission saves one artifact. No tutorial network requests or HTML execution observed. Contexts are isolated and never use the owner's browser data.
- Visual/responsive evidence: light 320px failed-save preview and dark desktop imported-plan library screenshots inspected. Focused Save remains above navigation, with no horizontal overflow; existing shell/theme/keyboard checks pass. Artifacts remain in ignored `test-results`. Emulation is not a physical-phone or assistive-technology pass.
- Resolved verification limitation: the first sandbox data command could not start any of its four Node test workers (`spawn EPERM`); the approved subprocess rerun passed all 38 tests. Build and browser subprocesses also used the established approved execution path. No application test failure remained.
- Remaining limitations: raw input/preview edits are not autosaved across reload; clipboard tests simulate API permission outcomes rather than claiming OS clipboard/device coverage. Real quota exhaustion and large-library/plan/import performance are untested (injected failures verify rollback/input recovery). Physical phones, Safari/Firefox, screen readers, and live Ko-fi checks remain unverified. All available Phase 4 acceptance checks passed; these carry-forward manual checks are not labeled passed.
- Next step: Phase 5 training, rest timers, persisted session drafts, and saved sessions only when requested. No later-phase implementation started. No staging, commit, dependency installation, publish, or push performed.

#### Manual checks still required (not passed)

Use a separate test browser profile for these checks; do not clear existing user data. To produce the four-day JSON fixture from the project root without writing records, run:

```powershell
node --experimental-strip-types --input-type=module -e "import {planFixture} from './tests/fixtures/interchange.ts'; console.log(JSON.stringify(planFixture(), null, 2))"
```

- Physical phone, portrait and landscape: Create > Import AI Output; copy both formatting options and paste into a text editor to confirm actual clipboard contents. Deny clipboard permission where supported and manually select/copy the instructions. Paste the four-day JSON, validate, edit a long day name and exercise reps/RIR/notes with the keyboard visible, use a move/removal dialog, and reach Apply, Save, and bottom navigation without controls being covered. Also retain the earlier Settings demographic and Create Workout keyboard checks.
- Safari and Firefox: import/save/reload/reopen that plan and the README minimal workout. Confirm zero RIR/rest versus blank optionals, same address on every screen, duplicate-name rename, cancellation without extra records, and isolation after switching between two local test profiles. Cancel dirty navigation and native reload; repeat plan/workout edit, duplicate, archive, and restore from earlier handoffs.
- Screen reader: verify Formatting instructions for, read-only instructions, AI output JSON, error paths, unsaved preview status, editor field names, move controls, source choices, and confirmation announcements. Use Tab/Enter/Space/Escape; check focus moves to validation errors/editor headings and returns to Validate or Import AI Output after cancellation. Retain earlier profile/avatar and navigation/current-state checks.
- Live Support: once the owner's real `VITE_KOFI_URL` is configured, open Settings > Support and confirm the intended Ko-fi page opens in a new tab.
- Separate stress environment: test real storage exhaustion and representative large libraries/plans/imports. Confirm failed saves keep input and produce no partial artifact/tags; record timings before claiming large-data performance. These were not simulated as successful real-device/performance checks.

### 2026-10-02 - Phase 5: training, timers, persistent drafts, and saved-session review

- Status: Complete. All Phase 5 acceptance checks passed in the available isolated service and desktop/emulated-phone Edge environments. Earlier recorded verification and handoffs are preserved. Phase 6 and later workflows remain unimplemented.
- Storage: additive Dexie v4 introduces `drafts`, `sessions`, and `restTimers`; existing profiles/settings/photos/measurements/exercises/tags/plans remain untouched. Drafts and logs have compound profile/ID keys, stable UUIDs, revisions, source plan/day references, and UTC timestamps. A unique active-source index enforces one unfinished draft per profile/plan/day. Starting again reuses that draft; only explicit Start after completion creates a new one. Finalized drafts are retained but excluded from the resume list.
- Snapshots: start copies the full ordered training day, including exercise names, per-set targets, instructions, prescription notes, tutorial URLs, tags, rest values, and source references. Drafts and completed logs render their snapshots, never the live plan. Source edits, renamed/removed days, and archiving do not retarget or rewrite them. Archived-source drafts remain in the unfinished list. No occurrence IDs, schedules, or calendar completion flags are fabricated.
- Train: active saved plan/day selectors, explicit Start/Resume and empty-state Open Create; named unfinished sessions and profile-scoped history. Compact set rows display individual reps/RIR targets, load, actual repetitions, and optional actual RIR. Session/exercise Note icons use editable dialogs; Apply starts autosave. Information icons show read-only plain-text instructions and optional validated HTTPS YouTube links. No tag chips, inline instructions, unit selector, automatic fetch, or third-party embed.
- Results/units: blanks remain missing; zero load, zero actual repetitions, and zero RIR are explicit valid values. Actual load is finite nonnegative decimal; reps/RIR are nonnegative safe integers. Drafts retain raw intermediate input with field errors so recovery does not fabricate values. Completed results reject invalid/incompatible partly entered sets unless explicitly skipped. Each load retains its entered unit; display-only conversion uses kg and six decimal places without changing stored input. Completed sets retain both canonical kg and original numeric load/unit. Settings alone changes preferred display units.
- Autosave: 400 ms debounce after result edits/applied notes, plus write latency. The UI distinguishes pending, saving, saved, and failed states. Only committed input is recoverable after reload/profile switching. Unapplied note edits stay in memory with discard/unload protection. Browser navigation with unpersisted input is guarded; confirmation cancels scheduled writes, while a transaction already in flight may finish only for its original owner/draft. Abrupt termination within the persistence window can lose edits; no stronger recovery claim is made.
- Coordination/concurrency: a dedicated controller serializes autosaves, Save, Clear, timer actions, and reload against a fixed profile/draft. It tracks edits independently of completed writes and rejects repeated action clicks while busy. Services compare draft revisions in the same transaction as writes. Stale tabs retain input and offer Retry/confirmed Reload saved draft; no implicit merge. Clear waits for earlier work, and subsequent queued autosaves cannot recreate reset values. Finalized drafts reject writes/Clear/new timers. Delayed writes cannot follow a changed active-profile selection.
- Timers: REST appears between consecutive sets and after an exercise's final set before the next exercise. Each uses the correct optional duration; missing rest offers manual seconds, explicit zero means no timed rest. One active timer exists across the database, with profile/draft ownership, a replacement token, duration, label, and UTC end timestamp. Starting a new timer replaces it; other profiles cannot read/stop/reset it. Remaining seconds derive from endAt, including reload, elapsed background time, and visibility changes; stop/reset are persisted. Clear/completion remove only that draft's timer. No background alarm/notification promised; device clock changes can affect the countdown.
- Completion: Save includes the latest current input, even before debounce. At least one valid recorded set is required. Blank/explicitly omitted sets trigger a confirmation showing omitted/recorded counts; accepting marks omissions skipped and the log visibly Partial. Incompatible partly entered sets must be corrected or explicitly skipped first. Cancel leaves input intact. Log creation, draft finalization, and owned-timer cleanup are atomic. The draft ID identifies the log, so rapid Save, uncertain retries, and competing tabs return one committed session. Success is shown only after commit. startedAt is the start time, completedAt the confirmed Save action, loggedAt the log write time, all UTC.
- Clear/review: Clear confirms that it resets only entered results, session/exercise notes, and the draft's active timer while retaining its prescription. Other drafts, completed sessions, plans, and library records remain intact; failure rolls back all changes. Train history provides read-only snapshot targets/rest/information, actual recorded units/results, skipped sets, notes, partial status, and timestamps. No completed-session edit/delete added. Returning to training days provides deliberate Start for another session.
- UI/layout: shared dark/light tokens, fields, Lucide icons, dialogs, focus restoration, navigation guards, and unchanged public address reused. Save/Clear remain together above navigation with reserved bottom space; focused final input and controls are reachable at 320px. Screenshot review prompted compact three-column mobile set fields and a smaller timer panel. Final dark 320px and light desktop screenshots were visually inspected; artifact paths are under ignored `test-results`.
- Files: new `src/schemas/session.ts`, `src/db/sessions.ts`, `src/features/train/TrainPage.tsx`, and `draft-controller.ts`; additive database/initialization changes; Train route integration and CSS; new data/browser session tests; existing current-version and former-placeholder assertions updated; README/TODO. Dependencies, lockfile, Vite/TypeScript/Playwright configuration, other screens, and unrelated work preserved.
- Static/data commands: `npm run typecheck` and `npm run lint` passed, with no lint warnings. `npm run test:data` passed 48/48: 10 session tests plus 38 previous tests. `npm run build` passed. It emits a non-blocking Vite chunk-size advisory: final JavaScript is 511.37 kB minified / 154.19 kB gzip. No threshold suppressed; code splitting and real loading/large-data measurements remain future work. `git diff --check` passed.
- Data coverage: complete source snapshots and archived-source recovery, duplicate start prevention, profile/timer ownership, blank/zero/partial validation and explicit skips, original/canonical units, stale connections, competing/idempotent completion, completed-draft protection, atomic completion failure/retry, persisted timer calculations/replacement/reset/zero/Clear, failed autosave/input retry, autosave races with Save/Clear, disposal before delayed work, already-running writes during profile switching, other-draft preservation and failed Clear rollback, populated v3-to-v4 preservation of all prior stores/photo bytes, and orphaned-session initialization protection. Existing v1/v2-to-current upgrades and all prior feature integrity tests also passed.
- Browser commands/results: final `npm run test:browser` passed 78 with 2 skips; `npm run test:browser:preview` passed 78 with 2 skips; `npm run test:browser:static` passed 160/160 with no skips. Skips are static-host-only 404 checks, executed at both static mounts. Desktop/emulated-phone Edge exercised the entire existing suite plus 10 training journeys; production uses the same build at `/` and `/project-check/` without SPA rewrites. Browser suites ran sequentially; source was not edited while development suites ran. All contexts are isolated, never the owner's browser data.
- Browser evidence: full two-exercise workout, notes/info/plain text, both prescribed rest types plus manual rest, stored timer reload/reset and simulated elapsed time, persisted draft reload/resume, zero versus blank RIR/load, latest pending results on Save, history, source edit/archive independence, cancellation of Clear and partial completion, explicit invalid-set skip, Clear followed by reload, failed autosave/retry and completion injection, native unload guarding unapplied notes, rapid repeated Save, settings-only unit conversion, two-profile/timer isolation, stale-tab recovery, competing completion, both themes, unchanged address, and final-input/action-bar mobile spacing. These do not claim real device suspension or screen-reader verification.
- Resolved verification failures: initial typecheck identified the existing ScreenButton prop as `to`, not `screen`; corrected before browser checks. First focused training run (`npm run test:browser -- tests/browser/train.spec.ts`) had 6 passes/4 failures: action bar overlapped navigation by 1.5px on both projects, and an exact label locator failed for the existing Settings weight-unit selector. Adjusted spacing and used the accessible combobox locator. Second focused run had 8 passes/2 failures from the same locator issue on Active profile; corrected it. Two subsequent full development runs passed 78/2 (the second includes final compact fields/read-only protection); production preview and static passed as above. No functional test failure remains unresolved.
- Remaining limitations/manual work: physical-phone keyboard/safe areas and real background suspension, Safari/Firefox, screen-reader/voice-control behavior, live Ko-fi, genuine quota exhaustion, and large-data/loading performance are still unverified. Timer display depends on device wall-clock time and has no alarms. Uncommitted edits/unapplied notes are not guaranteed across abrupt termination. History/source reads currently scan the active profile's records in memory. The Vite size advisory remains documented. Earlier Create/import/Settings device checks remain pending too.
- Next step: Phase 6 calendar scheduling and occurrence-linked completion only when requested. No calendar scheduling, progress screens, backup workflows, publication, push, staging, commit, or dependency installation performed.

#### Phase 5 manual checks still required (not passed)

Use a separate test browser profile without clearing existing user data. Prepare a saved plan containing one day with two exercises and at least two sets each; use 60-second between-set rest and 120-second between-exercise rest on the first exercise, and unspecified rest on the second.

- Physical phone, portrait and landscape: Train > select plan/day > Start. Enter load `0`, reps `5`, actual RIR `0`; apply session/exercise notes and wait for Draft saved locally. With the keyboard open, reach every field, Note/Information, manual rest, Save/Clear, and bottom navigation. Refresh and Resume; verify committed inputs/notes survived. Also retain prior Settings/Create/import keyboard checks.
- Real background timer: start 60-second REST, background/lock the device longer than 60 seconds, then return; it should show Rest finished rather than restart. Repeat with a mid-count reload, Reset, Stop, the 120-second exercise REST, and a manually entered duration. No alarm should be expected. Switch profiles and confirm the other profile cannot see/control the first timer; returning to its draft restores it unless a new timer replaced it.
- Safari/Firefox: save/resume a draft, switch between two test profiles, and change kg/lb only in Settings. For a `45.359237 kg` recorded load, lb display should show `100`; saving without editing load must keep its original recording-unit context in history. Cancel Clear and partial Save, then explicitly skip remaining sets and save a Partial session. Fill all sets in a deliberately started new session and review a Complete session. Confirm one log per Save and the same public address throughout.
- Source independence/recovery: while a draft exists, edit/archive its source plan in Create; resume and verify its original names/targets remain. Complete it, edit the source again, and verify read-only history remains unchanged. In two tabs, change the same draft; the stale tab must keep input with an error and require confirmed Reload before using current data. Confirmed Clear on another unfinished draft must leave existing history and other drafts untouched.
- Screen reader: verify per-exercise/set field names, read-only unit labels, target versus actual RIR, autosave/error announcements, Note/Information dialogs, skipped-set checkboxes, timer labels, partial/Clear summaries, and UTC history timestamps. Check Tab/Enter/Space/Escape and focus after dialogs/reload. Timer ticks should not announce every fraction of a second. Earlier navigation/profile/import checks remain pending.
- Once the real `VITE_KOFI_URL` is configured, verify Settings > Support opens the intended new-tab page. In a separate stress environment, test real quota exhaustion and representative large plan/session libraries; confirm failed writes keep recoverable input and no partial log/finalization, and record dataset sizes/loading/save timings before claiming performance.

### 2026-10-02 — Phase 6: recurring calendar and occurrence completion

- Status: Complete — Phase 6 acceptance passed in isolated data tests and Edge desktop/emulated-phone development, production preview, and plain-static root/project suites. Phase 7 not started.
- Inspection: read the Phase 6 attachment, root TODO/date rules/approved UI, current v4 schema and profile/plan/session services, memory navigation, configuration, and verification records. No applicable AGENTS.md found; working tree was clean at phase start. Earlier phase statuses and historical hash-routing handoffs remain unchanged.
- Implemented: Monday–Sunday week default; day/month/Today/previous/next/direct-date navigation; Add Plan with distinct weekday mapping, rest-day preview, weekly repetition and separate schedules; zone context; exact-occurrence Train entry/resume and saved-detail review; completed/partial styling; new-week independence and missed/late history; future remapping/plan refresh, structural repair, and confirmed stopping.
- Files: added `src/lib/calendar-dates.ts`, `src/schemas/schedule.ts`, `src/db/schedules.ts`, and `src/features/calendar/CalendarPage.tsx`; extended database, plan/session services and session types; connected existing app navigation/Train; added calendar styling/tests and updated README. Existing package/configuration files unchanged; no dependency installation.
- Migration: database v5 adds schedules and optional unique compound occurrence indexes on drafts/logs. The populated v4 preservation test compares all ten old stores and photo bytes. Legacy unscheduled records acquire no invented occurrence association. Initialization still refuses replacement of inconsistent/orphaned data.
- Dates: all-day Gregorian labels with calendar field arithmetic on a UTC carrier; explicit IANA Intl `formatToParts` computes local Today. No UTC truncation of instants or elapsed-millisecond week division. Browser zone is stored at creation and retained. Calendar displays one selected zone context; all schedules and their zones remain listed. No arbitrary history cutoff, only the documented four-digit date-format boundary. FullCalendar was unnecessary for these native all-day views.
- Revisions: schedule revisions store immutable prescription/mapping snapshots with effective intervals. Ordinary source edits require explicit future refresh. Plan day-ID/count changes atomically add a needs-repair segment from the next schedule-local Monday (or later start week); prior/missed dates survive. Source-plan archive does not stop existing schedules. Remap defaults to next local Monday; stop defaults there but allows Today or later. Superseded revision metadata is retained.
- Conflicts: previews recheck schedule/plan revisions plus affected draft IDs/revisions in the commit transaction. Affected unfinished drafts require explicit keep-original-dates approval; they remain visible, resumable exceptions with entered input and prescription snapshots intact. Clear affects only draft input/timer. Saved future logs survive mapping changes/stopping. Stale edits and failed writes preserve form input. New schedules reuse a creation UUID across retries.
- Data verification: `npm run test:data` passed **57/57** (9 calendar tests plus 48 prior). Includes validation/ownership, overlapping schedules, stable/range-only identities, Sunday/Monday/year/month/leap/DST boundaries, date-format limits, partial/late/unscheduled isolation, separate schedules, competing connections, idempotent starts/saves, rollback, Clear identity, stale previews, future remap, day removal/repair, stop with draft/history preservation, explicit plan refresh, and populated v4 migration. All test databases have unique test names; no owner records were cleared.
- Browser verification: `npm run test:browser` passed **86 / 2 static-only skips**; after the final extreme-date guard, the affected command `npm run test:browser -- tests/browser/calendar.spec.ts` passed **8/8**. `npm run test:browser:preview` passed **86 / 2 static-only skips** against the final build. `npm run test:browser:static` passed **176/176**, no skips, using `/` and `/project-check/` with no SPA rewrite fallback. Desktop and emulated-phone Edge contexts are isolated.
- Calendar browser journeys: four-day schedule/preview/rest days; one partial completion and saved-detail access; next-week incomplete/prior-week history; all views/Today/reload; two-profile isolation and theme; stale second-tab remapping; original future input retained after remap/stop; canceled navigation and Escape focus return; injected schedule-write failure plus successful retry; actual beforeunload cancellation; independent overlapping schedules. CDP device-zone change from New York to Tokyo retains the stored zone and verifies different Today dates at a Sunday/Monday boundary. No backup workflow was implemented for this check.
- Regression coverage: existing profile/avatar/weight/theme, exercise and plan lifecycle/isolation, AI import, training autosave/timers/notes/Clear/snapshots, stale writes, navigation guards/focus, and same-address refresh checks passed. Dark desktop and light desktop/320px calendar screenshots were inspected. No horizontal overflow; schedule actions remain reachable above fixed navigation. A narrow desktop calendar was widened during visual review to avoid split status words.
- Resolved verification failures: first focused browser run **4 passed / 2 failed** exposed preview-trigger focus loss caused by async disabled controls; explicit focus restoration fixed it and the rerun passed **6/6**. Initial lint reported two state-in-effect warnings; derived calendar selection and asynchronous entry loading removed both. An added unload test initially timed out in both projects because it awaited a reload that was deliberately canceled (**84 passed / 2 failed / 2 skips**); switching to the repository's event-based unload pattern fixed the test, and the full suite then passed **86 / 2 skips**. No outstanding failure is hidden by retries.
- Build/static checks: `npm run build`, `npm run typecheck`, `npm run lint`, and `git diff --check` passed; lint has no warnings. Vite still reports its existing >500 kB advisory: final JavaScript **531.63 kB minified / 159.80 kB gzip**. No warning threshold suppressed; no unrelated optimization.
- Remaining limitations: schedule editor input is memory-only and protected by navigation/unload warnings; refresh restores the screen, not that form or selected calendar range. Occurrences are generated for only the requested range, but profile records/revision history are read in memory; large-dataset performance is unbenchmarked. Training recovery covers committed autosaves only. No background alarm guarantee. Progress, backup import/export, and profile Clear Data remain unimplemented.
- Manual checks still unverified (carry-forward, not claimed passed):
  1. Physical phone: in portrait and landscape, Add Plan, choose four distinct weekdays and a Monday, preview/cancel/save, open a scheduled event, enter results with the keyboard visible, and reach Save/Clear and bottom navigation. Reload a saved draft, save partially, check next/prior week, and inspect month view in both themes. Also check the existing timer after real backgrounding.
  2. Safari and Firefox: repeat that schedule/start/reload/partial-save/history journey; remap a future week with a started draft, check Keep original sessions, stop future scheduling, and confirm original input and prior history survive.
  3. Screen reader/voice control: verify date/zone/weekday field names, event date/name/status, partial completion, preview/rest/conflict announcements, checkbox label, keyboard Escape, trigger focus return, and fixed-navigation reachability.
  4. When the owner supplies the live Ko-fi URL, configure it and confirm Settings → Support Boros opens that intended page in a separate tab. Unconfigured state remains tested and unavailable.
  5. Real quota exhaustion and large-data performance remain untested; use a disposable browser profile for those checks, never the owner's stored records.
- Next action: Phase 7 progress and profile measurements only when requested. No Phase 6 acceptance item remains pending; the manual/device checks above remain explicitly unverified. No publication, push, staging, or commit performed.

### 2026-10-02 — Phase 7: Progress weights, photos, and profile synchronization

- Status: Complete — Phase 7 acceptance passed in isolated data tests and Edge desktop/emulated-phone development, production preview, and plain-static root/project suites. Earlier verified phases and historical handoffs are preserved. Phase 8 has not started.
- Inspection: read the Phase 7 attachment, repository TODO/approved UI/date and measurement rules, existing v5 database, measurement/photo/profile services, Settings weight handling, navigation guards, and package/configuration/test records. No applicable AGENTS.md found. Working tree was clean at phase start. Reused installed dependencies/configuration, conversions, decoded-image validation, live queries, fields, and dialogs.
- Files: added `src/db/measurements.ts`, `src/db/photos.ts`, `src/lib/measurement-dates.ts`, Progress page/editor/photo/chart components, and focused data/browser tests. Extended measurement/photo types, shared profile-service cleanup, Settings live weight, Progress route, styles, and shell assertions. Updated README and this handoff. Database declarations, package files, and deployment configuration are unchanged.
- Implemented: dated weight entry defaulting to now, backdating, stable-ID correction, explicit measured-time correction, confirmed entry/photo deletion, recoverable failed input, optional local photos with preview/replacement/larger view, chronological history/exact details, and a responsive SVG chart. Current weight follows the latest saved measurement in Settings and Progress; empty/final-deletion states show no recorded weight.
- Storage: database remains **v5**, with no new store/index or migration. Existing measurement records gain optional revision/update/mutation/photo/date-context metadata only as written. Legacy records remain readable without rewrite: missing revision means 1, missing update time displays creation time, and missing local context displays UTC. All prior populated migration tests remain in the passing data suite. No owner data was cleared; data fixtures use unique `boros-test-*` databases and browser checks use isolated contexts.
- Weight decisions: one source of truth in the measurements table, canonical kg, unchanged 0.45359237 kg/lb factor and >0–1000 kg validation. Latest means greatest measured timestamp, then greatest ID on ties, preserving the existing IndexedDB compound-index ordering. Backdated insertion never overrides a newer weight; correction/deletion recalculates latest. Settings calls the shared append service and retains its established monotonic time of max(now, latest + 1 ms), even if the previous latest was future-dated. Blank Settings weight keeps the prior record; unit-only saves add no record. Untouched weight/photo edits preserve the exact original canonical value, avoiding display-rounding drift. Open Progress forms retain their opening display unit.
- Dates: measured UTC instant, local wall time, IANA zone, and offset are stored separately from created/updated timestamps and validated for consistency. History retains the original local context after device-zone changes. New default timestamps preserve the exact instant even in the second repeated DST hour; explicitly changed ambiguous times choose the earlier occurrence and skipped local times fail with a field error. Editing weight/photo keeps measured time unless the date/time checkbox is selected. A device-zone change while choosing a new date requires reopening, keeping input available. Native local Date and Intl reuse the existing date conventions; no timezone dependency added.
- Concurrency/recovery: measurement edits/deletes compare revisions inside the write transaction. Creation and edits reuse an entry ID and mutation UUID across retries; rapid submission cannot duplicate records/assets. Every successful measurement mutation also bumps the owner profile revision, conservatively invalidating already-open Settings forms even for backdated/photo edits. Untouched Settings weight reflects the live latest record, while explicit edits are preserved; stale saves fail rather than overwrite. Conflict recovery messages explain copying needed input and reopening. Navigation/unload confirmations and per-profile editor boundaries remain; delayed photo decoding cannot retarget another profile. Unsaved forms/photos stay memory-only, not reload-recoverable.
- Photos: decoded JPEG/PNG/WebP, max 5 MB and 4096px per side, reuse existing validation. Local blobs carry profile ownership and progress role, with explicit measurement references. Progress never silently changes the avatar. Save/delete/reference changes and unused-asset cleanup are transactional; cleanup checks both remaining measurement references and the profile avatar. Avatar replacement now uses that same reference-aware cleanup. Photo removal is confirmed but staged until Save; canceling the editor retains the saved photo. Full blobs load only in an opened editor/viewer. Object URLs revoke on preview replacement/unmount. No automatic external fetch/upload, resizing, or thumbnails.
- Chart/UI: native SVG plots every measurement by actual elapsed time, with endpoint dates, kg/lb labels, empty/single-entry handling, and normal HTML scale labels for phone/enlarged-text readability. Coincident points can overlap; chronological history retains all records and accessible exact preferred/canonical values and time details. Both themes and single-address navigation remain. Confirmed final deletion focuses Progress; confirmed photo removal focuses Save; cancellation/Escape restores the trigger. Dark phone, light desktop, and 320px/24px-root-font editor screenshots inspected. Automated overflow and Save-above-navigation assertions pass; physical keyboard/safe-area behavior remains unverified.
- Data checks: `npm run test:data` passed **66/66** (9 new measurement tests plus 57 previous). Covers out-of-order/tied times, latest correction/deletion/final empty, explicit date correction, kg/lb preservation and no synthetic unit entries, Settings synchronization/stale unrelated edits, competing connections, idempotent saves, owner isolation, shared avatar/entry assets, validation, rollback/no orphan assets, legacy metadata defaults, DST gaps/folds, and changed device zones.
- Browser checks: `npm run test:browser` passed **96 / 2 expected static-only skips**. After the final photo-removal focus adjustment, `npm run test:browser -- tests/browser/progress.spec.ts` passed **10/10**. `npm run test:browser:preview` passed **96 / 2 expected static-only skips** against the final build. `npm run test:browser:static` passed **196/196**, no skips, serving the same build at `/` and `/project-check/` without SPA rewrite fallback. Edge desktop/emulated-phone journeys cover three out-of-order weights, chart states, photos/reload/no eager blobs, kg/lb edits without drift, current-weight deletion and two-profile isolation, live Settings and stale tabs, failed-write recovery, invalid images, staged photo removal, Escape/focus, real beforeunload cancellation, rapid saves, object URL revocation, delayed decoding during profile switching, explicit date corrections, and New York-to-Tokyo retained context. Earlier profile/exercise/plan/import/training/calendar/navigation regression checks pass.
- Resolved verification findings: initial lint identified an unused shell-loop path and an unnecessary ref cleanup; both were removed. The first full development run had **95 passed / 1 failed / 2 skips**: dialog cleanup could restore focus to the disappearing final measurement's delete button. Moving successful-delete focus into the parent effect after dialog cleanup fixed the race; the full rerun passed **96 / 2 skips**. Applied and verified the same ordering for staged photo removal. No unresolved failure is hidden by retries.
- Build/static checks: `npm run build`, `npm run typecheck`, and `npm run lint` passed; lint has no warnings. Vite retains its >500 kB chunk advisory: **547.10 kB minified / 163.88 kB gzip** JavaScript. No threshold suppression or unrelated bundle optimization. `git diff --check` passed.
- Remaining limitations: history/chart read the full profile's measurement list; large-data performance is unbenchmarked. Full-resolution photos are loaded on demand with the existing size limits, without thumbnails. Unsaved Progress and schedule editors remain memory-only; training recovery still covers committed autosaves only. Physical devices, Safari/Firefox, screen readers/voice control, live Ko-fi, real storage exhaustion, background-device behavior, and large-data performance remain explicitly unverified.
- Exact manual checks still needed (use a disposable browser profile for destructive/quota checks):
  1. Physical phone, portrait and landscape, both themes: create a separate test profile, add weights dated Jan 3 (70 kg), Jan 1 (72 kg), and Jan 2 (71 kg), attach a photo, reload, and confirm chronological order/current 70 kg in Progress and Settings. Switch to lb in Settings, edit/delete the latest test entry, verify current weight falls back to Jan 2, and delete the remaining test entries to verify no recorded weight. Switch two test profiles and confirm their weights/photos stay separate.
  2. On that phone, open the keyboard, enlarge text, and reach Save and bottom tabs. Open/close the larger photo; replace/remove it, cancel the removal and editor, then confirm/save removal. Confirm the avatar is unchanged and cancellation preserves saved data. Check safe areas and camera/gallery image selection. Repeat the previous Calendar/Train journey from the Phase 6 handoff and check the rest timer after actual backgrounding.
  3. Safari and Firefox: repeat the weight/photo/reload/unit/edit/delete/profile journey; open Settings in another tab, change weight in Progress, and verify the stale Settings save retains its input and reports a conflict. Repeat prior calendar scheduling/remap/stop and training recovery checks.
  4. Screen reader/voice control: check Weight/date/zone/upload field names and errors, chart description plus every exact history value, photo/dialog labels, confirmation scope, save/conflict announcements, Escape and focus return, and keyboard access to bottom navigation.
  5. With the owner's real configured Ko-fi URL, open Settings → Support Boros and confirm the intended page opens in a separate tab. Unconfigured Support remains tested and unavailable.
  6. In a disposable browser profile only, exercise actual quota exhaustion and a large weight/photo dataset; confirm failed saves retain input and measure chart/history/photo responsiveness. No such real-quota or performance test has been claimed passed.
- Next action: Phase 8 complete-profile export only when requested. No Phase 7 acceptance item remains pending in the available test environments; manual/device/performance checks above remain unverified. No backup export/import, profile Clear Data, dependency installation, publication, push, staging, or commit performed.

### 2026-10-02 — Phase 8: complete profile ZIP export

- Status: Complete — Phase 8 acceptance passed in isolated data tests and Edge desktop/emulated-phone development, production-preview and plain-static root/project suites. Phase 9 remains unimplemented and no restore round trip is claimed. Earlier phase verification and historical handoffs are preserved.
- Inspection: read the Phase 8 attachment, root TODO/approved UI, Phase 9 relationship/precedence rules, actual v5 entities and services, training autosave boundaries, Settings, package/configuration and prior verification. No applicable AGENTS.md found; working tree was clean at phase start. Reused installed JSZip 3.10.2, Papa Parse 5.7.0, Zod, Dexie, React and Playwright; no installation or configuration replacement.
- Files: added `src/schemas/backup.ts`, read-only `src/db/backups.ts`, archive/CSV/worker/download modules and Settings control under `src/features/backups/`, `tests/fixtures/backup-profile.ts`, data/browser tests and [docs/backup-format.md](docs/backup-format.md). Updated Settings/StorageNotice wording, README and this plan. Database declarations, persistence writers, package files, navigation and other feature code remain unchanged.
- Contract: backup schema **1**, format `boros-profile-backup`, distinct from AI interchange and database version **5**. Manifest records the actual package version **0.0.0**, captured profile identity, snapshot/export timestamps, root counts, CSV row counts, complete file inventory, asset metadata and SHA-256. ZIP contains manifest.json, authoritative data.json, all 21 linked CSV tables (headers even when empty), and photos at validated UUID paths. CSVs are not the source for restoring nested records. Full field/relationship/unit/timestamp/exclusion documentation is in the contract file.
- Complete scope: one profile's fields/unit preferences; tags; active and archived exercises/plans; ordered days/occurrences/heterogeneous prescriptions; all schedule revisions/mappings/repair/stop metadata; unfinished and finalized drafts with saved raw results/applied notes; immutable full/partial sessions/results/notes; measurements and every owned photo with shared references. Stable IDs, ownership, revisions, timestamps, optional absence/nulls, zero, recording units and historical text/snapshots remain exact. Required plan-family parents/assets must resolve; optional prescription provenance does not replace frozen data when the current source changed. No infinite calendar occurrences are generated.
- Snapshot boundary: capture the profile ID before awaiting one read-only transaction over the profile and all eight owned stores. Blob values are captured there; Blob byte reads, JSON/CSV generation, hashing and ZIP compression run outside it in a worker. Concurrent multi-store edits cannot mix snapshot versions. Export never updates/deletes records, even on error. Invalid required references fail instead of silently dropping data or starting a partial download.
- Saved-data policy: explicitly require acknowledgement and tell users to save/apply notes and wait for Draft saved locally in every tab. Dirty current Settings forms block export. Another tab's memory/pending or failed autosave cannot be flushed; those changes are clearly excluded from both UI and manifest scope. Earlier committed draft state remains exportable. Browser-wide appearance/active-profile selection/storage-notice preferences, navigation/sessionStorage, active timers, interval state, unsaved forms, unapplied notes and object URLs are intentionally excluded. No credentials/environment/machine files are read.
- CSV decisions: explicit parent/context IDs and 1-based order columns, separate library IDs and exercise-occurrence IDs, numeric per-set rep/RIR bounds, rest seconds, canonical kg/cm, recording load/unit, local/UTC date context, raw draft strings and notes. Snapshot ownerKind/ownerId/scheduleRevisionId prevent ambiguous joins across plan/schedule/draft/session copies. UTF-8 BOM, CRLF and Papa Parse quoting preserve Unicode, quotes/commas/newlines. Dangerous string prefixes are apostrophe-protected even after whitespace; genuine numbers remain numbers and JSON text is unchanged. Blanks represent missing/null/empty text, distinct from numeric 0; canonical JSON resolves those distinctions.
- Assets/checksums: original image bytes are included without resizing/recompression. Shared asset IDs generate one file; other profiles never enter the snapshot. Checksums cover every uncompressed payload byte, including BOM-bearing CSVs, but exclude manifest.json to avoid self-reference. SHA-256 is integrity metadata, not authenticity. Generated ZIP is reopened and checked for inventory, CRC, hashes, counts and canonical/schema/reference equivalence before initiating download.
- UI: Settings identifies the selected profile, personal/unencrypted nature, saved-data scope and unavailable restore. Worker preparation reports actual stages and compression percentage, locks duplicate clicks, supports Cancel, and cancels on profile switch/navigation without retargeting. A failed export reports no download/source mutation. Filename uses a safe profile label and UTC timestamp. Download started explicitly says the app cannot verify filesystem success. Object URLs revoke after 60 seconds. Themes/single-address navigation remain; existing disabled Upload/Clear actions remain honest.
- Fixture: Profile A has a four-day plan, standalone and archived library exercises, tags including archived state, avatar/progress photos with shared references, three measurements, a schedule with two revisions, full and partial scheduled sessions, finalized drafts plus one saved unfinished draft, raw incomplete result strings, notes/Unicode/quotes/commas/newlines/formula-like text, explicit zeros and absent values. Current plan instructions differ from frozen session history. A second profile has separate photo/measurement/library data; a transient timer tests exclusion. All fixtures are isolated; no owner records were cleared.
- Data verification: `npm run test:data` passed **73/73** (7 backup tests + 66 existing). Tests independently reopen ZIPs, parse JSON/CSVs, compare every canonical record and image byte with source data, compute hashes with Node crypto, verify inventory/counts/joins/ranges/order/units/text/null/zero/protection and shared asset references, export both profiles and minimal Guest, inject missing-reference/blob-read/compression/hash failures, detect generated-file tampering, race a multi-store write against capture, switch selected profiles after capture, and exercise pending/failed/committed autosaves. Whole-database before/after comparisons prove export leaves source data unchanged.
- Browser verification: `npm run test:browser -- tests/browser/backups.spec.ts` passed **8/8** and `npm run test:browser` passed **104 / 2 expected static-only skips**. `npm run test:browser:preview` passed **104 / 2 expected static-only skips** against the final build. `npm run test:browser:static` passed **212/212**, no skips, at `/` and `/project-check/` without SPA rewrite fallback; this includes worker asset loading and actual ZIP downloads. Edge desktop/emulated-phone tests perform actual downloads and independently reopen their ZIP files/check hashes, compare browser records/photo bytes, export two profiles, block dirty Settings/unacknowledged scope, report missing-photo/worker failures without downloads, reject duplicate clicks, cancel delayed workers on profile switch/navigation, revoke URLs after the delay, and export only persisted results when another tab has a failed training autosave. Dark/light and 320px/enlarged-text export screenshots inspected; no overflow and download action above fixed navigation verified. Previous shell/profile/exercise/plan/import/training/calendar/Progress regression suites pass.
- Resolved findings: first data run **67 passed / 6 failed** because manifest validation reordered object keys before byte-string comparison; validate without replacing the original manifest object. Second run **72 passed / 1 failed** exposed an extra trailing row in empty CSVs; empty tables now have headers only. Final data run **73/73**. First focused browser run **0/8** failed during Node-side fixture initialization because fake IndexedDB loaded after Dexie; loading it first fixed that harness. Next run **3 passed / 5 failed** combined first-load Vite worker dependency reloads in three desktop checks and an exact Resume locator missing the scheduled-date suffix in two checks. Corrected the locator and reran on the warmed development server: **8/8**, followed by full **104 / 2 skips**. Initial unused-variable/component-export lint findings were removed, and a temporary generic-object type error was corrected. No unresolved failure is hidden by retries.
- Build/static checks: `npm run build`, `npm run typecheck`, and `npm run lint` passed; lint has no warnings. Main bundle **552.25 kB minified / 165.76 kB gzip**, separate export worker **197.72 kB**. Vite retains its >500 kB advisory; no threshold suppression or unrelated optimization. `git diff --check` passed.
- Remaining limitations: no Upload/restore/merge/replace/rename/Clear Data, no semantic round-trip verification. Worker creation requires browser worker support and hashing requires Web Crypto; failures are visible. Snapshot, uncompressed payload, ZIP and validation buffers require memory; no tested large-dataset capacity or streaming-to-disk claim. No photo resize/thumbnail creation. Physical phone/Safari/Firefox/download-manager/spreadsheet/screen-reader behavior is unverified. Real quota, background-device, large-data and live Ko-fi checks remain outstanding from prior handoffs.
- Exact manual checks still needed:
  1. In separate test profiles on a physical phone, save/apply notes and wait for Draft saved locally in all tabs. Settings → Data: verify the named scope, acknowledge saved-only data, Download data, and locate the ZIP in the actual browser/OS Downloads or Files app. Unzip it and open manifest.json/data.json, CSVs and photos. Repeat for the second profile and confirm no first-profile records/photos appear. Check portrait/landscape, enlarged text, keyboard/safe areas, Cancel and bottom navigation.
  2. Repeat the download/cancel/profile-switch journey in Safari and Firefox. Verify worker preparation, local file/save-sheet behavior, Unicode-safe filename and actual ZIP opening. Block downloads once and confirm no UI claims filesystem success. Repeat prior phase weight/photo/calendar/training persistence checks on these engines; they remain unverified here.
  3. In Excel or LibreOffice, import CSVs as UTF-8: inspect quoted commas, multiline Unicode notes, 0 versus blank cells, set order/ranges, ID joins and explicit units. Create harmless formula-like text such as ` =1+1` in a test note; confirm CSV displays inert text and data.json retains the exact original string. Spreadsheet application behavior has not been claimed passed by the parser tests.
  4. With a screen reader/voice control, check the selected profile, privacy/saved-data scope, checkbox, preparation/error/download-started announcements, Cancel/Download keyboard operation and fixed-navigation reachability. Carry forward prior modal/field/chart checks from the Phase 7 handoff.
  5. Use a disposable browser profile for real quota exhaustion and a large saved photo/history dataset. Measure export time, memory/UI responsiveness, cancellation and resulting ZIP contents; verify failure keeps records and recoverable input intact. Do not clear or stress the owner's stored records. Check existing training timer behavior after real backgrounding separately.
  6. When the owner's real Ko-fi URL is configured, Settings → Support Boros must open the intended page in another tab. Unconfigured Support remains tested and unavailable.
- Next action: Phase 9 restore and export/import/export semantic comparison only when requested. No Phase 8 acceptance item remains pending in the available test environments; the explicitly listed manual/device/performance checks remain unverified. No later-phase operation, dependency installation, publication, push, staging, or commit performed.

### 2026-10-03 — Phase 9: reviewed restore, whole-family merge and profile Clear Data

- Status: Complete — Phase 9 acceptance passed in isolated data/development/production-preview/plain-static root/project verification. Phase 10 has not started. Earlier handoffs, including hash-routing records and Phase 8's then-unverified restore boundary, remain historical and unchanged.
- Inspection: read the Phase 9 attachment, TODO/approved UI, backup-format contract, existing v5 relationships, Phase 8 ZIP validator/exporter, all owner/revision checks, draft-controller autosave queue and WorkspaceProvider. No applicable AGENTS.md found. The working tree was clean at phase start. Reused Dexie, JSZip, Papa Parse, Zod and the existing UI/navigation/test configuration; no installation, schema migration or wholesale configuration changes.
- Files: `src/db/restores.ts`; worker/ZIP reader, format/integrity helpers, pure restore planner/record validation and Settings controls under `src/features/backups/`; scoped updates to WorkspaceProvider/context, Settings/StorageNotice/ProfileEditor, nullable profile types and photo cleanup, plus theme-based table styling. Added `tests/data/restores.test.ts` and `tests/browser/restores.spec.ts`. Updated README, this plan and `docs/backup-format.md`. Existing persistence writers keep their owner checks and transaction/revision behavior.
- Validation: supported backup schema 1/database v5 only; inspect raw local/central ZIP headers before JSZip can normalize or overwrite entries. Reject unsafe paths, duplicate/NFKC/case-colliding paths, unlisted/overlapping data, directories/symlinks, encrypted/split/ZIP64/extra-field/data-descriptor archives and unsupported compression. Accept original Boros STORE/DEFLATE output. Enforce 64 MiB uploaded ZIP, 128 MiB total expanded, 4,096 entries, 32 MiB per JSON/CSV, 2 MiB manifest and 5 MiB per image. Stream actual decompressed bytes with limits, CRC and SHA-256 checks; verify inventory, schema/ownership, root and CSV counts, required references, unique indexes, decoded image types/dimensions and finalized draft/session consistency. Missing optional historical provenance remains allowed. Canonical JSON/assets create records; CSVs do not. No HTML execution, automatic third-party requests or remote service.
- Preview: source profile/export/modified timestamps/counts and validation results precede a no-write preview. Normalized names select targets; source profile IDs never select a target. Required four name-match operations plus Cancel are available, with unused-name validation for independent imports. Per-store additions/conflicts/replacements/removals/skips, explicit session/draft/schedule removal text and source labels precede confirmation. Dirty Settings input blocks restore/clear. Failed save retains the reviewed plan; stale state returns to a fresh preview requiring reconfirmation. Cancel/navigation/profile switching abandons preparation without writing.
- Merge decisions: stable ID then normalized name for plans/library exercises, scoped normalized tag resolution, explicit ID/name/multiple-candidate ambiguity. A matching plan includes its complete schedule revisions, drafts, saved sessions and notes. Device priority skips imported unique logs; imported-file priority removes local unique logs. Histories never union within a conflict. Nonconflicting families and independent libraries/tags survive. Profile source precedence includes nulls; measurements merge distinct IDs and select same-ID conflicts without date-based deduplication. Differing measurement metadata is surfaced; repeated mutation identity under distinct IDs is rejected as ambiguous. Latest weight remains derived through the existing measurement service.
- References/assets: retain safe internal IDs, remap matching roots and cross-family child collisions consistently with deterministic IDs; rebuild schedule/occurrence/active-source/session links while preserving nested day/occurrence order, frozen prescriptions, notes, timestamps, recorded units, optional values and zeros. Required winning photos only are installed; shared references remain. Different photo content/metadata sharing an ID is remapped deterministically; repeat imports add no copies. Unreferenced photos are pruned.
- Atomicity/concurrency decision: every committed operation creates a fresh local ownership ID and retires only the matched/cleared profile's old ID in the same transaction. This intentional remap prevents stale forms/new-record submissions/delayed autosaves from writing even when imported revision numbers equal their old values. All safe inner record IDs/revisions/timestamps remain. The private reviewed plan is the committed operation. Recheck complete target metadata and photo hashes under one write transaction; `Dexie.waitFor` keeps it alive only for Blob/SHA concurrency checking, with its 60-second timeout causing rollback. Parsing/decoding happens before the transaction. Successful selection and notices follow commit; duplicate calls share an in-flight operation/receipt. Other profiles/theme/notice preferences remain untouched; only the affected timer is removed, and none is restored.
- Cross-tab recovery: a retired workspace keeps its mounted old editor/input with a copy/reopen banner. Existing owner checks reject retries. Reopen uses the committed selected profile. This extends the provider without silently initializing an empty replacement database. Nullable restored demographics render blank instead of calling number formatting on null; importing nulls does not invent measurements.
- Clear Data: identifies the selected name, explains deletion of its owned records/assets/timer/demographics, and offers Download data before confirmation. Retains name/kind and weight/height preferences in an empty usable workspace under fresh ownership. Same stale-state, rollback and late-write protection as restore. Cancel keeps both records and selection. Training draft Clear remains separate.
- Fixtures/data evidence: **`npm run test:data`: 90/90 passed** (17 new restore tests, 73 existing). Representative overlapping files/local profiles include different set prescriptions, schedule mappings, saved draft notes and unique completed logs on each side; nonconflicting plans/exercises/measurements; archived library/plan/tag records; shared photos, partial sessions, historical revisions, nulls/zeros and Unicode/multiline text. Independent assertions compare each entire winning family and prove unique losing logs are skipped/removed. Tests cover rename/new-profile/replacement/both priorities/cancellation, deterministic remaps/repeat merges, source-ID isolation, name/measurement ambiguity, image bytes/shared references/pruning, latest weight, malformed/future/unsafe/duplicate/oversized/checksum/reference/CSV failures, actual expansion versus forged metadata, rollback, stale records and same-size photo edits, competing connections, delayed autosaves, duplicate commits and atomic Clear Data. Source databases are random test-specific names; no owner records were cleared.
- Round-trip evidence: export → import under a new name → export compared complete canonical records/relationships and original photo bytes. Allowed differences are new profile/ownership ID, requested name/nameKey/kind and regenerated archive metadata. All fixture assets are referenced; documented pruning of unreferenced assets is separately tested. This is an actual comparison, independent of merge-family tests.
- Browser evidence so far: final focused **`npm run test:browser -- tests/browser/restores.spec.ts`: 14/14**; full development **`npm run test:browser`: 118 passed / 2 expected static-only skips**; final production **`npm run test:browser:preview`: 118 passed / 2 expected static-only skips**. Final focused development was rerun after adding explicit mobile removal counts, CSV count checks and byte-level stale-photo protection. Edge desktop/emulated-phone tests cover every name-match choice/confirmation, new-name/rename, preview/cancel/no-write scope, repeated clicks, actual worker image decoding and rejection, invalid/future uploads, pending-worker cancel/navigation/profile switch, stale preview/reconfirmation, injected transaction failure, Clear cancellation/confirm, reload selection, nullable Settings, recovered raw draft inputs/history/schedules/photos and second-tab failed autosave input recovery. Existing profile/exercise/plan/AI-import/training/calendar/Progress/navigation/unload regressions pass. Dark/light 320px enlarged-text screenshots inspected; horizontal page overflow and action/bottom-navigation spacing checks pass. Wide count tables scroll within their container, with critical removal counts also in text.
- Build/static evidence: **`npm run build`**, **`npm run typecheck`**, **`npm run lint`** passed; no lint warnings. Main JavaScript **579.00 kB / 174.33 kB gzip**, export worker **197.72 kB**, import worker **200.83 kB**, CSS **18.97 kB / 5.04 kB gzip**. Existing Vite >500 kB advisory remains, with no suppression. Factoring shared integrity/format helpers prevents pulling the ZIP implementation into the main app. **`npm run test:browser:static`: 240/240 passed**, no skips, at `/` and `/project-check/` on a plain server without SPA rewrites, including both backup workers and every restore operation. `git diff --check` passed after removing trailing whitespace from the updated date line.
- Resolved verification findings: first complete data run **82 passed / 4 failed**, followed by a focused run exposing order-dependent fixture assumptions (active name key/source exercise), a test-created CSV directory and an expected-value snapshot alias. Corrected the fixtures and made canonical conversion copy records; subsequent data runs passed, ending at **90/90** after additional byte/asset/CSV cases. Initial focused browser **8 passed / 6 failed** used incorrect Weight/empty-history labels; next **11 passed / 3 failed** selected a hidden time-zone option and an ambiguous error locator. Corrected selectors against the actual UI; final focused **14/14**, followed by full production preview passes. No retry setting hides unresolved failures. The null-height render issue was found during source review and fixed before the verified null-field browser journey.
- Limitations carried forward: physical-phone file pickers/save sheets/keyboards/safe areas, Safari/Firefox, screen readers/voice control, real spreadsheet-app behavior, live Ko-fi, real quota exhaustion, background-device timers and realistic large-data memory/latency remain **unverified**. The parser accepts the original export ZIP subset, not arbitrary repackaged ZIPs. Limits are not capacity benchmarks; export may produce a file above this importer’s limits. Snapshots/payloads/photo bytes occupy memory; photo-hash rechecks hold the transaction until completion/timeout. No photo resizing/streaming-to-disk or offline cold-start guarantee is added.
- Exact manual checks still needed (disposable browser/test profiles only):
  1. On a physical phone, create two test profiles, export one, find its ZIP in the actual Files/Downloads app, then Settings → Backup ZIP → import under an unused name. Inspect the avatar, Progress photos/current weight, Calendar zone/history and a resumed draft after reload. Check portrait/landscape, large text, file picker, keyboard/safe areas, table scrolling, confirmation and bottom-navigation reachability.
  2. Repeat in Safari and Firefox. With overlapping named backups and one unique saved session on each side, test both merge priorities and confirm exactly which unique log is skipped/removed. Then test Replace, rename, cancel and Clear Data. Confirm the second profile remains unchanged and browser theme persists. Repeat download cancellation and blocked-download behavior from Phase 8.
  3. Keep an unsaved Settings or training editor open in a second tab. In the first tab confirm replacement/clear of that test profile. Verify old input is copyable, retries fail, and Reopen workspace loads the committed result. Confirm reload never restores an active rest timer. Do not use the owner's real records.
  4. With a screen reader and voice control, check source/target names, validation/progress/error/success announcements, preview focus, count-table headers/scrolling, confirmation checkbox, Cancel and recovery banner. Carry forward prior dialog/field/chart checks. Automated keyboard/focus assertions do not establish assistive-technology behavior.
  5. In a disposable browser profile, exercise actual quota exhaustion and a realistically large photo/history dataset. Record ZIP sizes and validation/preview/commit time/memory, cancellation and rollback/input recovery. Test prior training timers after real backgrounding separately. These capacity/device checks have not passed merely because injected failures and archive limits pass.
  6. In Excel/LibreOffice, inspect downloaded UTF-8 CSV quoting, Unicode/multiline text, zero versus blanks, relationships and inert formula-like text; compare canonical JSON. When the owner's real `VITE_KOFI_URL` is configured, click Settings → Support and verify the intended page opens separately. Neither external application nor live destination has been tested here.
- Next action: the owner can perform the exact disposable-profile manual checks above. No Phase 9 acceptance item remains pending in the available automated environments; carried-forward manual/device/capacity checks remain explicitly unverified. Phase 10 only on request. No publication, push, staging or commit performed.

### 2026-10-03 — Phase 10: integrated verification and focused usability fixes

- Status: **Verification pending**. The complete journey and critical integrity checks pass in Edge/Firefox. Windows WebKit's independently reproduced inability to persist IndexedDB Blobs blocks its photo/restore acceptance. Phase 11 remains separate; no published-origin verification or deployment was performed.
- Implemented: shared pointer-trigger focus and focused-field visibility fixes demonstrated by WebKit; lazy screen loading with accessible pending/error states and commit-only remembered-screen updates; truthful device-capacity wording. Removed only the confirmed unused @hookform/resolvers, react-hook-form and date-fns dependencies offline (four installed packages including an unused transitive dependency). Kept existing schema, services, ownership guards, memory navigation, Vite base, deployment scripts and the user's exact gh-pages 6.1.1 pin. Concurrent index.html/favicon changes remain untouched.
- Added: complete manual/AI UI journey with scheduled completion, source-edit-independent history, saved-draft export/restore/resume, progress/photo byte comparison, restored measurement correction/deletion/unit synchronization, unchanged second profile and production network audit; native IndexedDB Blob probe; failed-screen-chunk recovery check; larger-data fixture and timing report; separate production engine/capacity configs. No product features added.
- Baseline: build/typecheck/lint pass, data **90/90**, production Edge **118 passed / 2 static-only skips**. Existing suites were retained for zero/optional validation, duplicates, schedule boundaries, late/partial completion, failed/pending/simultaneous saves, stale profiles/editors/autosaves, whole-plan-family merges, cancellation, limits and transaction rollback.

Actual verification (isolated contexts/test databases; no user data cleared):

| Command / scope | Actual result |
| --- | --- |
| `npm run build`; `npm run typecheck`; `npm run lint` after final source/dependency changes | Pass; no lint warnings or bundle-size advisory |
| `npm run test:data` | **90/90** after cleanup. An earlier sandboxed invocation failed to spawn workers (`EPERM`); rerun with required subprocess permission passed |
| `npm run test:browser` | Full run: **123 passed, 1 fixture timing failure, 2 static-only skips**. Backup fixture reloaded before lazy Settings committed |
| `npm run test:browser -- tests/browser/backups.spec.ts tests/browser/navigation.spec.ts` | After fixing fixture readiness and page-initiated unload check: **26/26** |
| `npm run test:browser:preview` | Full production suite: **124 passed / 2 static-only skips** |
| `npm run test:browser:static` | Full plain-static root/project desktop/phone suite: **252/252** |
| `npm run test:browser:static -- tests/browser/navigation.spec.ts tests/browser/journey.spec.ts tests/browser/hosting.spec.ts` | Final-build follow-up after cleanup/error wording: **44/44**, including direct startup, dynamic chunks, all screens, refresh, full journeys and real static 404s |
| `node node_modules/playwright/cli.js test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone --workers=2` | **116 passed / 2 driver navigation timeouts / 2 static-only skips**; CDP-only timezone tests excluded and covered in Edge |
| Same Firefox command with `--grep 'browser Back leaves'` | Corrected page-initiated exit/cancel checks: **2/2**; input retained. No failing applicable Firefox check remains after targeted correction |
| Initial full Firefox/WebKit engine command | **185 passed / 47 failed / 4 static-only skips**. Failures separated into native Blob limitation, corrected focus/spacing defects and corrected test readiness/navigation assumptions; not labeled a full passing WebKit run |
| WebKit desktop/phone `--grep 'set growth\|complete workout\|failed autosave and completion\|plan name conflicts\|four-day schedule\|Settings returns'` | After shared focus fixes: **12/12** |
| Engine config, `tests/browser/navigation.spec.ts`, both WebKit projects | Final-build full navigation suite: **18/18**, including canceled unload and chunk failure |
| `node node_modules/playwright/cli.js test --config playwright.capacity.config.ts` | **1/1**, repeated after adding photo-read instrumentation and bounded-month assertions; final dataset metrics below |
| Engine config, `tests/browser/storage-engine.spec.ts`, both WebKit projects | **2 failures**, both native `UnknownError: Error preparing Blob/File data to be stored in object store`; deliberate unskipped reproduction, independent of Boros/Dexie |
| `git diff --check` | Pass; Git emits local LF/CRLF conversion notices, not whitespace errors |

- Performance: Windows/Edge 154.0.4258.37, Ryzen 5 3600, 16 GiB, desktop 1440×1000, one worker. Disposable profile: **100 exercises, 1 tag, 20 four-day plans, 5 schedules, 500 completed sessions + 500 finalized drafts, 730 measurements, 12 synthetic photographic-size 1280×960 JPEGs**. Each image is 866,319–867,278 bytes; exact sizes and both runs are in [docs/phase10-verification.md](docs/phase10-verification.md). Final ZIP **10,835,108 bytes**, expanded inventoried payload **15,957,150 bytes**, below import limits. Final milliseconds: Settings reload **452**, Train **923**, Create **493**, filter **82**, Progress **1281**, calendar week **991**, month **92**, export **1269**, upload validation **3024**, preview **490**, restore commit **331**. Progress read zero photo records; month at most 42 days. Synthetic oversized-file rejection and existing parser-limit tests pass without partial writes. This is not real quota testing, a statistical benchmark or unlimited-capacity support.
- Bundle: entry **274.59 kB / 88.01 kB gzip**, largest shared chunk **165.01 kB**, route chunks **11.59–43.26 kB**, export/import workers **197.72/200.83 kB**, CSS **18.97 kB**. Compare pre-change entry **579.11/174.39 kB**. Shared/route downloads are additional; the entry reduction is not the total startup-transfer reduction. No warning threshold was raised.
- Remaining blocker: complete photo/avatar/progress/restore round trips in a Blob-capable WebKit/Safari environment before marking Phase 10 complete. The Windows engine returns an explicit failed-save error and keeps input; no silent success was observed. Do not change the database format merely to bypass this native test-engine failure.
- Documented limitations: full history metadata still renders in memory; full-resolution images load on request, with no resizing/thumbnails; export/restore snapshots/payloads consume memory; an export can exceed importer limits; transaction photo hashing may hold the write lock until completion/timeout. No offline cold-start/background alarm or maximum-capacity guarantee. Native WebKit automation is not physical Safari. Live Ko-fi and published-origin behavior remain unverified.

Historical Phase 10 owner checks (superseded as the current checklist by docs/release-preparation.md; retained with this handoff):

1. **Phase 10 blocker — Blob-capable WebKit/Safari:** save an avatar and a dated progress photo, reload, then follow the manual/AI journey in docs/phase10-verification.md. Export a completed session plus an unfinished draft; import under a new name, reload, resume the draft and verify photos, prescriptions, notes, units, measurements and calendar completion. Re-export and compare; confirm another profile is unchanged. Run the native Blob/journey/restore tests in that environment where possible. Record browser/OS and results.
2. **Physical phone:** repeat in dark/light with the real keyboard open, narrow/rotated viewport and enlarged text. Reach the last input, Save/Clear and fixed navigation; check note/photo dialogs, Escape/back gestures, focus return, file selection and the actual ZIP save/share sheet. Confirm refresh recovers saved drafts but does not promise unsaved forms. Check lock/background/resume timer behavior without assuming an alarm will fire while suspended.
3. **Assistive technology:** use NVDA or VoiceOver and voice control to navigate, create/edit, announce field/save errors and completion states, open/close note/photo/confirmation dialogs and restore focus. Verify status is understandable without color. Keyboard automation alone does not establish these results.
4. **Disposable storage and backup:** test actual quota/storage denial and recovery without deleting a real workspace; ensure failed saves retain input and no success appears. Open exported CSVs in the intended spreadsheet app, checking Unicode, multiline/quoted text and formula-like strings; CSVs are not the restore source.
5. **Phase 11 owner checks, separately authorized:** supply/configure the real Ko-fi URL and verify only an explicit click opens that destination. On the published origin, verify profile/plan/session/photo persistence, export/restore and phone navigation; browser data does not migrate automatically between localhost and boros-app.com. This phase did not publish or redeploy.

- Next action: resolve the WebKit/Safari photo/restore verification blocker, record the exact result, then reassess Phase 10 completion. Do not mark Phase 11 complete from the existence of a deployment.

### 2026-10-03 — Phase 10 closeout and Phase 11 release preparation

- Status: Phase 10 **Verification pending**; Phase 11 **In progress — preparation only**. Required Blob-capable WebKit/Safari photo verification remains unavailable. No unchanged Windows Blob probes were rerun. No new application defect was found in this preparation; prior focus/visibility fixes remain covered.
- Changed in this task: `scripts/release-audit.mjs`, `docs/release-preparation.md`, README, TODO, Phase 10 verification and backup-format documentation. Added deterministic output fingerprints, read-only HTTPS resource comparison, actual deployment details, cross-origin record-transfer procedure, one current owner checklist and published-origin smoke steps. Existing application/schema/routing/dependencies/deployment scripts and unrelated favicon/logo/snake work were preserved.
- Deployment inspection: public `jsaldana92/boros`, main source branch, CLI default `origin`/`gh-pages`, `dist`, exact gh-pages 6.1.1, existing predeploy build and `--cname boros-app.com --nojekyll`. Raw public CNAME/nojekyll verified; no duplicate local CNAME required. GitHub Pages settings/enforced HTTPS could not be verified by unauthenticated API (404).
- **New release blocker:** isolated Edge returns `ERR_CERT_COMMON_NAME_INVALID`; Node returns `ERR_TLS_CERT_ALTNAME_INVALID` for `https://boros-app.com/`. Observed certificate is for `*.github.io` and not expired at inspection. No TLS bypass, DNS or settings edits. Deployment branch `01edf4154ef05ca6bc7d94361dfe155137694416` has different entry/HTML than the candidate; it cannot establish candidate acceptance. Public startup/live smoke is pending.
- Ko-fi: production configuration inspected without exposing environment values; no URL supplied. Disabled/unavailable state remains correct. Owner must supply and verify the actual destination to satisfy existing Phase 11 acceptance.

Fresh verification against the final build (isolated contexts/test databases):

| Command / check | Actual result |
| --- | --- |
| `npm run build` | Pass; no bundle-size warning; entry 274.59 kB / 88.01 kB gzip, shared 165.01 kB, five screens 11.59–43.26 kB, CSS 18.97 kB, export/import workers 197.72/200.83 kB |
| `npm run typecheck`; `npm run lint` | Pass; lint also rerun after final audit argument validation |
| `npm run test:data` | **90/90**, no skips or failures |
| `npm run test:browser:static` | **252/252**, no skips/failures, 3.3m; root/project × desktop/phone, no SPA rewrite |
| `$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/node_modules/.cache/playwright"`; `node node_modules/playwright/cli.js test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone --workers=2` | **118 passed / 2 expected static-host-only skips**, 3.6m; three CDP-only scenarios excluded by existing config and covered in Edge |
| `node scripts/release-audit.mjs` | Pass: **22 files / 2,045,178 bytes**, no bounded marker/output findings. Initial sandboxed Git subprocess failed `EPERM`; authorized read-only rerun passed |
| `node scripts/release-audit.mjs --url http://127.0.0.1:4174/` and same with `/project-check/` | **22/22 HTTP 200 + exact SHA-256 matches per mount**, including favicon/images/lazy chunks/workers |
| Audit deliberately pointed at `http://127.0.0.1:4173/not-the-release/` | Expected nonzero **exit 1**, `matchesCandidate: false`; incorrect resources are rejected even if the preview host returns fallback HTML |
| `git diff --check` | Pass; only existing LF/CRLF notices |
| Existing live HTTPS | Failed certificate hostname validation in isolated Edge and independent Node; no live candidate UI check claimed |

- Candidate inventory SHA-256: `f907033f818dbc35bb6178877601468aba34e535296e5758ba01734750c18415`. Local base HEAD `d062772de62be76c9755d5de6fa717a5401738a9` plus dirty working tree; package `0.0.0` is not a unique release identifier. Receipt is ignored `test-results/release-candidate.json`. Final app/public output remained unchanged through verification/documentation. Rebuild/retest/re-fingerprint if owner changes Support, code or assets.
- Reused evidence: prior focused WebKit 12/12 and navigation 18/18, independent native Blob failures, and final capacity 1/1 remain historical evidence for unchanged application chunks; no new full WebKit, capacity or physical-device claim. Fresh full Firefox supersedes the earlier partial run/follow-up for current applicable Firefox coverage.
- Limits retained: photo-bearing Safari round trip required; physical phone keyboards/save sheets, screen reader/voice control, real quota, spreadsheet apps, background timers and live Support unverified. No offline cold-start, unlimited-memory or oversized-export restore guarantee. Original backup schema 1/database v5 and destructive merge rules unchanged.
- Next / single current owner checklist: [docs/release-preparation.md](docs/release-preparation.md#current-owner-checklist). Resolve Safari/HTTPS/Ko-fi gates, review changes and tested fingerprint, then owner-only commit/deploy and fresh published-origin smoke. No staging, commit, source push, tag, deployment, DNS/GitHub mutation or clearing user data performed. Phase 11 cannot be complete until the intended artifact is published and required live checks pass.

### 2026-10-03 — Owner revisions Group 1: compatibility, Support and general UI

- Status: **Verification pending** for production HTTPS/live Support acceptance; implementation and available local verification are complete. Phase 10 remains **Verification pending**, Phase 11 **In progress**. Groups 2–4 are recorded above as unchecked future work; none was implemented.
- Startup: Guest initialization's direct missing `crypto.randomUUID` call was caught as a generic storage failure. New `src/lib/browser-crypto.ts` supplies native or secure getRandomValues UUID v4 for every application ID path. Existing IDs/records stay intact; initialization verifies randomness before database writes. Unsupported/throwing sources report compatibility errors, while transactions retain rollback and genuine storage errors. Workers do not generate IDs. Database v5 and backup schema 1 unchanged.
- Security: backup UI and worker hashing require real Web Crypto SHA-256; missing APIs fail explicitly without skipped checksums or false success. Manual clipboard selection still works when clipboard APIs fail. UUID compatibility does not repair TLS or establish a trusted connection.
- UI/configuration: `.env.production` supplies the owner's real Ko-fi URL. Protected Support opening stays inside Settings and requires a click. Header uses the original snake.png/logo.png, proportionally in both themes, exact text tagline and guarded Train navigation; Settings is avatar-only with name/tooltip. Height/weight units are paired with their inputs, Age remains separate at 320px, filters are compact with 44px controls. Ordinary dates display minutes without truncating stored precision, unchanged measurement edits or backup data. Favicon, dependency pins, deployment scripts, single-address navigation and unrelated pre-existing work were preserved.
- Files: crypto/date helpers and their data tests; existing database ID call sites; WorkspaceProvider/AppShell; profile/Create/calendar/Train/Progress presentation and CSS; backup compatibility guards; affected browser fixtures plus new Group 1 tests and native/fallback journeys; public production environment configuration and documentation. No new dependency or schema migration.

| Command/check | Actual result |
| --- | --- |
| `npm run build`; `npm run typecheck`; `npm run lint` | Passed; lint rerun after the final test-only correction; no large-chunk warning |
| `npm run test:data` | **97/97**, no skips/failures; seven new secure-randomness, rollback, identity/isolation, strict checksum and precision tests |
| `npm run test:browser:static` | Initially **268 passed / 12 failed**, no skips; obsolete Calendar ISO text and visible Guest-header expectations, plus brand assertion without scrolling back to the header |
| `npm run test:browser:static -- --last-failed` | **12/12 passed** after fixture corrections; same production artifact |
| `$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/node_modules/.cache/playwright"`; `node node_modules/playwright/cli.js test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone --workers=2` | Initially **130 passed / 2 failed / 2 expected static-only skips**; Firefox serialized a 44px target as 43.999996px |
| Same Firefox command with `--last-failed` | **2/2 passed** after rounding only the touch-target assertion to hundredths of a pixel; 44px requirement unchanged |
| `npm run test:browser -- tests/browser/group1.spec.ts tests/browser/profiles.spec.ts tests/browser/progress.spec.ts tests/browser/shell.spec.ts tests/browser/journey.spec.ts` | **44 passed / 2 expected production-Support skips**; development unconfigured Support state passes |
| `node scripts/release-audit.mjs`; `node scripts/release-audit.mjs --url http://127.0.0.1:4174/` and same with `/project-check/` | **23/23 resources per static mount**, exact HTTP byte/hash matches and zero findings; no SPA rewrite |
| `git diff --check` | Passed |

- Browser evidence combines the initial full runs and their targeted passing reruns, not a newly claimed full 280/280 or 132/132 run. Native and unavailable-randomUUID UI journeys cover manual/AI creation, profiles/IDs/reload/isolation, scheduling, timers, drafts, photos and byte-preserving backup/restore. Focused checks cover unavailable secure randomness/no writes, unavailable hashing/no success, manual clipboard fallback, both guarded brand images, avatar names, both themes, paired units and precise measurement timestamps through edits. Dark/light 320px and light 1440px screenshots were inspected. All tests use isolated contexts/test databases; owner records were not cleared.
- Current candidate inventory: **23 files / 2,047,113 bytes**, SHA-256 `33a2a1cc3b7ba3090f829c52bc0e1788f93bbb4c7e19951285a8ee33cfa73e68`. Entry **274.37 kB / 87.99 kB gzip**, shared **166.06 kB**, workers **198.09/201.20 kB**, CSS **19.44 kB**. Base HEAD `d062772de62be76c9755d5de6fa717a5401738a9` plus preserved dirty working tree. Ignored receipts are `test-results/release-candidate.json`, `group1-root-resources.json` and `group1-project-resources.json`. No application/configuration/asset change after this tested build; later changes require a new build and affected verification.
- Live diagnosis: owner Chrome displays struck-through HTTPS and loads only after the owner bypasses its certificate warning. Independent default-validation Edge fails with `ERR_CERT_COMMON_NAME_INVALID`, Node with `ERR_TLS_CERT_ALTNAME_INVALID`; certificate is valid August 2–October 31, 2026 but SANs cover GitHub domains, not boros-app.com. The HTTPS document never loads here, so final successful redirects, secure-context APIs and mixed content are unverified. No warning was bypassed here. A separate deliberate HTTP probe stays HTTP, returns 200, lacks randomUUID/subtle, has getRandomValues and reproduces startup failure; it is not evidence that the owner used HTTP.
- Hosting evidence: observed four apex A records match GitHub Pages, with no AAAA/CAA answer; authenticated Pages provisioning/settings remain unknown. Owner must verify the exact custom domain, DNS check and certificate issuance, then enforce HTTPS and check normal validated loading/redirects. No blind DNS replacement or hosting edit was performed. Public HTML at task start matched the then-local pre-edit build, superseding the earlier older-artifact observation; the new Group 1 candidate is not published. Exact evidence/API capture and owner actions: [docs/group1-verification.md](docs/group1-verification.md).
- Live Support: local production test verifies the supplied account URL, explicit-only new tab, `noopener noreferrer` and null opener. Independent live request gets certificate-valid Ko-fi HTTP 403/Cloudflare “Just a moment…”; account content remains unverified. Owner should confirm the intended page in an ordinary browser. No challenge bypass.
- Remaining manual/environment checks: photo-bearing Safari/WebKit round trip, physical phone keyboards/safe areas/download sheets, screen reader/voice control, real quota, spreadsheet applications and suspended-device timers. Known Windows WebKit Blob limitation was not repeatedly reprobed; earlier capacity results remain historical. Current exact owner checklist: [docs/release-preparation.md](docs/release-preparation.md#current-owner-checklist).
- Next: resolve owner HTTPS/Support checks. The next implementation dependency group, only on request, is Group 2's superset occurrence identity and duration coordinated across schemas, snapshots/history, AI and backups. No staging, commit, push, publication, dependency installation, DNS/GitHub mutation or owner-data deletion was performed.

### 2026-10-03 — Owner revisions Group 2: supersets, repeated occurrences and finite duration

- Status: **Complete in available local acceptance checks**. Groups 3–4 unstarted. Earlier Safari/physical-device/live Support and full release acceptance remain pending; no earlier phase is newly marked complete.
- Implemented: day-scoped stable group UUIDs with editable positive numbers, independent repeated exercise occurrences, immediate grouped editor order, member/block movement, duplication and dissolution. Train/history render unequal rounds without invented sets, with member notes/info/results and optional/manual/zero group rest on the existing persistent timer. Autosave/Clear/partial/full/idempotent Save, frozen snapshots, stale-write protection, profile isolation and single-address guards remain intact.
- Duration: new plans require explicit positive weeks. Existing absent duration remains unbounded. New schedules freeze inclusive end dates from their selected Monday; plan edits do not silently alter them. **Review plan duration** explicitly previews and applies the current plan duration from a selected future Monday, preserving earlier missed dates and all started/completed exceptions.
- Compatibility: database stays **v5**, no migration/default rewrite; populated store/photo reopen verified. AI contract **v2**, with strict v1 support and required owner duration entry in legacy plan preview. Backup contract **v2**, with linked superset/duration CSVs and strict v1 support. Original archive CRC/SHA-256/structure/assets pass before an in-memory v1 envelope conversion; no source ZIP mutation, invented duration or checksum bypass. Whole-plan-family winners keep group/occurrence identity, repeated results and schedule history through root remapping.
- Changed areas: plan/session/schedule schemas and services; PlanEditor/PlanLibrary, Train/controller and Calendar duration preview; AI contract/instructions/conversion; backup schema/CSV/archive/read/restore provenance; group styling; focused fixtures/data/browser tests and existing creation fixtures; TODO/README/backup and release documentation. Group 1, installed dependencies/pins, hosting config, favicon/PNG assets and unrelated work were preserved.

| Command / check | Actual result |
| --- | --- |
| `npm run build`; `npm run typecheck`; `npm run lint` | Passed; final lint clean; no large-chunk warning |
| `npm run test:data` | Final **108/108**, no failures/skips; 11 new Group 2 tests |
| `npm run test:browser:static -- tests/browser/group2.spec.ts --workers=2` | Initial **8 passed / 8 failed** from new test theme selectors; corrected selectors, then **16/16 passed** |
| `npm run test:browser:static` | Final candidate **296/296**, no failures/skips, 4.4m; root/project subpaths and Edge desktop/phone |
| `$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/node_modules/.cache/playwright"`; `node node_modules/playwright/cli.js test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone --workers=2` | **138 passed / 2 failed / 2 expected static-only skips**, 5.3m; two ENOENT trace cleanup failures caused by a concurrent runner cleaning the parent output directory |
| Same Firefox command with `--last-failed`, other suites stopped | **2/2 passed**, 9.4s, no source/test change required; combined evidence rather than a fresh complete-suite pass |
| `npm run test:browser -- tests/browser/group2.spec.ts` | **8/8**, no skips/failures, 27.3s |
| `node scripts/release-audit.mjs`; `node scripts/release-audit.mjs --url http://127.0.0.1:4174/` and same with `/project-check/` | **23/23 resources per mount**, exact HTTP 200 byte/hash matches, zero findings, no SPA rewrites |
| `git diff --check` | Passed; LF/CRLF notices only |

- Test history: sandboxed Node workers initially failed EPERM; authorized data execution first passed 95/97 because two old creation fixtures lacked newly required duration. Updated fixtures plus new Group 2 tests passed 108/108. Extending a root-remap fixture exposed its stale derived activeSourceKey (107/108); correcting the fixture produced final 108/108. Full details and exact Firefox command: [docs/group2-verification.md](docs/group2-verification.md). Do not overlap default `test-results` cleanup with nested engine/static runs in future.
- Browser/data evidence includes same-library standalone/group copies, multiple groups/three members, different reps/RIR and unequal sets, zero/unspecified rest, stable renumber/reorder/dissolve/duplicate, timer and note reload, partial/full saves, snapshot immutability, atomic failures, profile/concurrency guards, DST/New Year/first-last civil weeks, legacy unbounded preservation, both AI versions, original v1 backup validation and v2 round trips including duration changes and both merge priorities. Existing navigation/profiles/library/measurements/photo/backup regressions pass. Dark/light 320px editor/training screenshots were visually inspected and overflow checks passed. All data/browser contexts are isolated.
- Final candidate: **23 files / 2,099,946 bytes**, SHA-256 `dd8b25b6231d48ff56c387b7fd5b2bdfde68a151c9c7c0bc84ca711c7bf4bd95`. Entry **274.38 kB / 88.04 kB gzip**, shared **166.07 kB**, workers **201.36/204.68 kB**, Create **50.52 kB**, Train **21.23 kB**, CSS **19.82 kB**. Receipt in ignored `test-results/release-candidate.json`; per-mount receipts `group2-root-resources.json` and `group2-project-resources.json`. Rebuild/retest after source/configuration/asset changes.
- Owner/repository evidence: latest owner statement says HTTPS is solved and the site fully works. This supersedes the historical hostname-blocker status, but no fresh independent certificate/API/mixed-content or changed-candidate production check is claimed. An external commit `40e5c74d3e94dcdbadf6b82e955aceb5a0ae2eae` appeared during work and was preserved; the receipt identifies it plus the dirty working tree. This agent did not stage, commit, push, deploy, install dependencies, modify hosting or clear owner data.
- Short owner test: in a disposable profile, make a two-week plan with Squat standalone plus Squat/Row/Press in one three-member group; use 3/2/1 member sets and distinct reps/RIR. Save/reopen, enter different weights/notes for the repeated Squat, start rest and reload/resume, save/review. Schedule from a Monday and confirm the second-Sunday boundary/no week-3 occurrence; change plan duration and verify the schedule changes only after its separate preview. Export/restore under a new name and compare. Exact steps and remaining checks: [docs/group2-verification.md](docs/group2-verification.md#owner-check-and-remaining-boundaries).
- Remaining: physical phones/keyboards/download sheets/safe areas, screen reader/voice control, live Ko-fi account content, Blob-capable Safari photo/restore, real quota, spreadsheet applications and suspended timers remain unverified. Existing Windows WebKit Blob limitation was not reprobed; prior capacity measurements were not repeated or generalized to supersets. Full release acceptance remains separate.
- Next: **Group 3**, only when requested—Calendar month/default/time-zone preference and active-plan Train flow. Do not begin Group 4 analytics or publication from this handoff.

### 2026-10-03 — Owner revisions Group 3: profile zones, Calendar month and Train plans

- Status: **Complete in available local verification environments**, including fresh Edge/static and Firefox suites. Group 4 is not started. Earlier phase/Group 1–2 handoffs remain historical; physical Safari/device release gates stay unverified.
- Implemented: per-profile validated IANA time zone in Settings; one-time browser-zone initialization for legacy profiles, preserving saved schedule/session/measurement dates; full named month with Monday–Sunday weeks, dim actionable adjacent dates, retained Day/Week navigation, all schedule zones visible and no Calendar Create Plan/zone editor. Existing mapping/duration/stop previews are reused.
- Train: persistent guarded zero/one/multiple-plan selection independent of scheduling/archive; archived IDs hidden but remembered for restore; cards and Back to plans, local per-plan day selection, exact Calendar occurrence entry, saved draft recovery and compact saved-session review. Existing superset execution, notes, timers, partial/full Save, failed-input guards and frozen history remain intact.
- Status: overdue > today > future > fully completed finite workload, based on distinct occurrence keys and each schedule's zone. Last uses actual saved completion time; Next includes overdue pending dates. Unscheduled logs never complete scheduled work. Stopped/truncated unfinished work, legacy unbounded schedules and mapping repair cannot manufacture completion. Segment searches avoid infinite generation; minute/focus/visibility events refresh the display.
- Data/contracts: database **v5**, optional profile `timeZone`/`selectedPlanIds`, no store/index migration. Backup **v3**, strict **v1/v2** compatibility after original CRC/SHA-256/field/reference/CSV/photo validation. Merge precedence includes profile preferences and selected IDs remap with plan roots; Clear Data clears selections and retains zone/units. AI remains **v2** with v1 support. Existing timestamp precision, canonical measurements and atomic restore boundaries are preserved.
- Changed areas: profile schema/service/editor; Calendar; Train selection/editor integration; schedule/session library services; new bounded status and current-time helpers; backup schema/CSV/read/restore and Clear preview text; focused data/browser tests and affected earlier fixtures; TODO/README/backup/release documentation. Dependencies/configuration/hosting and unrelated source were preserved.

| Check | Actual result |
| --- | --- |
| `npm run build`, `npm run typecheck`, `npm run lint`, `git diff --check` | Passed on final source; no large-chunk warning |
| `npm run test:data` | **116/116 passed**, no skips/failures; 8 new Group 3 tests |
| `npm run test:browser -- tests/browser/group3.spec.ts --workers=2` | **8/8 passed**, 34.7s; desktop/emulated phone |
| `npm run test:browser:static` | Final **312/312 passed**, no skips/failures, 4.8m; root/project static mounts × desktop/phone |
| Firefox desktop/phone production suite | **148 passed / 2 expected static-host-only skips / 0 failures**, 4.9m; exact command in docs/group3-verification.md |
| `node scripts/release-audit.mjs` | Passed, zero findings; 23 files / 2,108,868 bytes |
| Same audit with `--url http://127.0.0.1:4174/` and `/project-check/` | **23/23 HTTP 200 and exact resource byte/hash matches at each mount** |

- Candidate inventory SHA-256: `383e9335b63ad9c6621f3b1db92c18a113a7c6e861f7890da51a7d9cb8044dea`. Starting/current HEAD `a4b0e204c72790e21370e417d03f60bfc05cda69`, initially clean, plus this task's uncommitted changes. No dependency installation, staging, commit, push, deployment, hosting mutation or owner-data clearing.
- Verification history: initial data **105/108** exposed obsolete version assertions/legacy fixture fields; fixed contracts plus new coverage pass **116/116**. Initial new browser **0/8** found a prohibited read/write liveQuery; default initialization now runs outside snapshot queries. A **4/8** rerun exposed the test's profile-label locator; accessible combobox selection passed **8/8**. Initial full static **307 passed / 5 failed** exposed canceled-navigation and dialog-close fixture assumptions; corrected full run **312/312**. A final status guard for mixed stopped/completed schedules received a data regression and a fresh build/full static **312/312**. Full details: [docs/group3-verification.md](docs/group3-verification.md).
- Reviewed screenshots: month Calendar and plan cards in both themes, desktop/phone; automated checks cover 320px overflow/fixed-navigation clearance, keyboard focus, exact unselected occurrence/draft reload/partial save, profile switching/isolation, timezone changes, failed preference/autosave writes and simulated midnight/background resume. Simulation is not physical-device evidence.
- Owner checks: on the test build, save/reload a Settings zone and compare old/new schedule zones; inspect full month/adjacent dates and event controls on a physical phone in both themes; select two plans and use Back, start an occurrence, wait for **Draft saved locally**, reload/Resume/save and confirm card/Calendar status; switch profiles and back. On Blob-capable Safari/iOS, repeat photo-backed export/restore under a new name while preserving originals.
- Carry-forward limitations: physical keyboard/safe areas/download sheets, screen readers/voice control, native Safari photo/restore, live Ko-fi account content, actual quota, spreadsheet apps and suspended-device timers remain unverified. No new Windows WebKit Blob probe, capacity benchmark or production smoke is claimed. HTTPS remains owner-confirmed resolved.
- Next: **Group 4 Progress redesign**, only when requested. No analytics work or publication was started.

### 2026-10-03 — Owner revisions Group 4: Progress redesign

- Status: **Complete in available local verification environments**. Phase 10 remains **Verification pending**, Phase 11 **In progress**. Earlier phase and Group 1–3 handoffs, including their then-current limits, remain historical and unchanged. This is not overall release acceptance.
- Views: Body weight, Plans and Workouts sections; graph-first measurements with numeric unit ticks, angled date ticks and colored points; labeled selector/arrow/Home/End/Previous/Next access to every overlap; existing guarded edits/deletes/photos; horizontal touch/keyboard plan carousel; three-column workout grid (two below 341px); plan/all-plan statistics, separate superset members and shared saved-session review with Back controls. No URL/history changes.
- Identity: saved library IDs or explicit plan-copy library provenance; otherwise explicit source plan/day/occurrence or own snapshot tuple. Names do not join exercises. Current library names preserve linked renamed/archived history; unknown legacy links remain separate. Supersets use ordered member identity arrays including multiplicity. Historical A+B never adopts a later A+C composition; individual members filter by composition and position.
- Counts: distinct scheduled completed occurrences plus unscheduled session IDs; partial sessions count and stay marked. Each exercise occurrence with at least one actual set counts once, including repeated/superset members. Groups add no extra completion. Drafts and wholly skipped work are excluded.
- Statistics: actual completion instant then stable session ID, occurrence order and set index. Starting/latest show every matching occurrence/set pair from the first/last qualifying session. Min/max use every actual canonical set; ties retain the earliest matching set's reps/date. Valid zero remains zero; missing/skipped stays absent. kg/lb displays convert without rewriting history. Scheduled actual dates use their stored zone; unscheduled dates use the profile zone because no historical zone field exists. Measurements retain measuredAt and their existing date context/latest-ID tie rule.
- Architecture: reusable profile-scoped read service and pure selectors; derived data only; reactive updates and ID-resolved selection; old readers fail closed after restore/Clear retires the owner. Failed-input, revision/owner checks, photo ownership and URL cleanup remain. No chart-time photo loads. Database **v5**, backup **v3** with strict v1/v2 imports, and AI **v2** are unchanged. No dependencies or migration.
- Optional graph incorporating weight, reps and date is **deferred**. Required load/date graphs expose actual reps, date and session/occurrence/set context through accessible selection; no volume substitution.
- Verification: `npm run build`, `npm run typecheck`, `npm run lint`, `git diff --check` passed. `npm run test:data`: **122/122** (six new focused tests). `npm run test:browser -- tests/browser/group4.spec.ts --workers=2`: **8/8**, 26.8s. `npm run test:browser:static`: final **328/328**, 5.5m, root/project-subpath × Edge desktop/phone, including added single/equal-point axis assertions. Firefox production command in the verification doc: **156 passed / 2 expected static-host-only skips / 0 failures**, 6.0m. Existing CDP-only cases remain covered by Edge. No physical-device or actual AT claim.
- Earlier attempts: initial focused measurement/Group 4 run **14 passed / 2 failed** from a new exact-label Import choice selector; corrected role selector passed. Live-archive coverage initially needed its Archive button scoped to the confirmation dialog. Initial static **320 passed / 4 failed** from old restore-photo tests expecting the removed full list; select the measurement first, then final full suite passed. Added canonical backup comparison initially treated absent versus undefined as different; canonical comparison passes. No failed run is labeled passed.
- Larger-data check: `node node_modules/playwright/cli.js test --config playwright.capacity.config.ts`: **1/1**, 18.1s. Existing 100-library/20-plan/5-schedule/500-session+draft/1,500-set/730-measurement/12-photo fixture. Observed ms: Progress **1079**, measurement selection **246**, 75-set graph **151**, set selection **71**, Back **213**. All 730 body points and selected 75 sets retained; **zero photo records read** for charts. ZIP **10,835,707 bytes**, expanded **15,960,728**; export/restore passed. One desktop observation, not a quota/device/capacity guarantee.
- Artifact: **25 files / 2,124,374 bytes**, inventory SHA-256 `6fa948c549f0162b9cb75c010e612d4ef0413cc53947ee60433af03e844d7a12`. Root and project static audit each returned **25/25 HTTP 200 + exact bytes/hashes**, zero findings. Progress chunk **24.23 kB / 8.02 gzip**. Candidate remains unpublished.
- Files: new `src/db/progress.ts` and `src/lib/progress-analytics.ts`; Progress chart/statistics components and theme CSS; shared `SessionReview` extracted from Train; focused fixtures/data/browser tests and adapted measurement/restore/capacity checks; README/backup compatibility notes/[docs/group4-verification.md](docs/group4-verification.md). Starting/current HEAD `c0411389b355abcc192dbf77c794f9f96cb9e662`, initially clean, plus this task's uncommitted changes. No staging, commit, push, deploy, hosting changes, installation or owner-data clearing.
- Owner check: select/edit/delete graph measurements and confirm Settings's latest weight, including an optional photo; record one shared exercise with different results in two plans and compare each plan with the all-plan view; inspect separate superset member graphs and saved notes; use Back, switch profiles and reload in both themes. On the real phone/AT setup verify labels, selection, keyboard/safe-area access and downloads. Exact steps and remaining limits are in the verification doc.
- Remaining unverified: physical phones/keyboards/download sheets/safe areas; actual screen reader/voice control; Blob-capable Safari/iOS photos/restores; live Ko-fi account content; real quota; spreadsheet applications; suspended timers. Windows WebKit's established Blob limitation was not reprobed. Owner-confirmed HTTPS resolution remains accepted; no fresh published-version check was performed.
- Next: **integrated verification of Groups 1–4 and the final published-version smoke test**. Publication and overall release acceptance remain separate owner actions.

### 2026-10-03 — Owner refinements: Create catalog, editors and AI formatting

- Status: **Complete in available local verification environments**. Phase 10 remains **Verification pending**, Phase 11 **In progress**. This handoff supersedes the current-work checkpoint, not earlier historical results.
- Implemented: compact Workout/Plan/AI cards and section dividers; short Search/Sort labels and ANY-match pressed tag pills; bounded name-only exercise catalog; source/details/action dialogs; plan cards with training/rest-day/duration summaries and Edit/Duplicate/Archive/Restore dialogs. Existing AI/manual plan exercises appear immediately without reimport or template writes.
- Catalog rules: owner-scoped read transaction; separate archive state; full prescription plus known library/provenance identity, or unlinked owning-plan identity, forms a presentation bucket. Repeated identical unlinked occurrences within a plan share a card; distinct same-name prescriptions and independent library IDs remain separate. Every source remains listed. Plan-sourced edits target the exact plan/day/occurrence with the frozen original revision; independent copies/history are not retargeted or rewritten. Adding through the existing picker still creates a new occurrence ID.
- Editors: superset controls immediately follow members; “Superset name” keeps positive numeric semantics; red Delete confirms grouping-only removal. Day arrows stay together, occurrence arrows have accessible names/tooltips, and Move opens an accessible destination dialog with limits, Cancel/Escape and focus recovery. Short labels, Set 1 Apply to All, profile-bound unsaved Draft previews, accurate save/failure states and clipboard fallback remain.
- Rest and AI: shared Minutes/Seconds inputs everywhere rest is entered, with blank/zero/one-component semantics and exact canonical integer seconds. Both prompts request one complete fenced `json` object with ASCII delimiters; parser still accepts raw/one-fence input, rejects unknown/malformed payloads, and preserves Unicode text. Plan-only instructions explain A20 → B8 → inter-round rest, then A20 → B8 → post-group rest; shorter members stop at their prescribed set counts. Train now exposes the post-group boundary even when it is the final session block, with exactly one rest per round and no timed member breaks.
- Boundaries: database **v5**, backup **v3** with strict v1/v2 support, AI **v2** with v1 support unchanged. No schema migration, dependency installation, configuration/hosting edit, owner-data clearing, commit, push or deployment. Initial clean HEAD `e65acd536e25718713b835bd3b401a060573db29` (`group 4 updated`); all current changes are uncommitted.
- Verification: build/typecheck/lint/diff checks passed. Data **126/126** (four new focused tests). Focused Edge development **8/8**, 16.5s. Complete production static root/project × desktop/phone **344/344**, 6.1m. Strengthened keyboard-focused static rerun **16/16**, 26.6s. Firefox affected run **88 passed / 2 failed**, 5.2m; failures were test setup using programmatic focus instead of Tab. Real Shift+Tab/Tab → Enter → Escape checks assert visible focus before/after; focused Firefox **8/8**, 23.7s, resolves both without an application change. Initial data/browser attempts and exact commands are recorded in [docs/create-refinements-verification.md](docs/create-refinements-verification.md).
- Capacity **1/1**, 17.0s: 100 templates, 20 plans, 5 schedules, 500 drafts, 500 sessions, 730 measurements, 12 photos; Create load **403 ms**, search **38 ms**. Export/restore passed; charts retained all fixture points/selected sets and read zero photos. One desktop observation, not a device/quota guarantee.
- Artifact: **26 files / 2,132,551 bytes**; inventory SHA-256 `0c8533415eb47c2051a498e38d768ed8cd0487e5493903dfa8085c2d67de98ad`. Root/project static audits each returned **26/26 exact resource bytes/hashes**, no findings. Both-theme phone/desktop screenshots inspected for cards/scrolling, dialogs, group footers, arrows and focus. No fresh published-site or HTTPS check is claimed.
- Files: Create components/filters/prompts/parser; shared RestInput/ActionDialog; catalog read service and plan-library reader; rest conversion helper and Train/session boundary; theme CSS; focused and adapted regression tests; README, this TODO, [AI formatting notes](docs/ai-formatting.md) and the verification record. Groups 1–4, record schemas and routing/configuration are preserved.
- Owner check: on the local candidate, open an already-saved AI-plan exercise, choose its exact source, edit/save/reload and compare other occurrences; combine search/sort/two tags. On a physical phone in both themes, use catalog scrolling, card dialogs, arrows, Move/Cancel/Escape and rest inputs with the software keyboard. Copy both AI prompts to the chosen chatbot and verify a complete fenced result and reviewed targets; check the two-round A20/B8 rest sequence.
- Remaining unverified: physical phones/keyboards/safe areas/download sheets; screen reader/voice control; Blob-capable Safari/iOS photos and restore; live Ko-fi content; real quota; spreadsheet applications; suspended-device timers. Windows WebKit's known Blob limitation was not reprobed. Owner-confirmed HTTPS resolution remains accepted. External chatbot output compliance remains an owner check, not guaranteed by prompt text.
- Next: owner device/AT acceptance and a separately authorized publication/final published-version smoke test. The published site has not changed.

### 2026-10-04 - Owner revision: standalone exercise ownership and Create/editor refinements

- Status: Complete in available local checks. This explicitly supersedes the previous plan-sourced catalog projection; earlier phase/group and hash-routing handoffs remain historical. Phase 10 remains Verification pending; Phase 11 remains In progress.
- Ownership/import: main library and picker read standalone profile-owned templates. Library Edit opens the exercise editor and saves directly. Plans retain stable occurrence IDs and independent prescriptions. AI plan import saves templates/tags/linked snapshots atomically, reuses valid identities and active normalized names without overwriting defaults, and selects the first new repeated occurrence as the proposed default. Group membership/rest stay plan-local. Canceled previews and failed saves create no partial records.
- Repair: profile initialization/selection and validated restore perform an idempotent transactional backfill, never render-time writes. Valid references win; active/oldest retained snapshots supply missing defaults, with archived-only templates staying archived. Ambiguous dangling identities raise visible errors. Plan timestamps/prescriptions/IDs/groups and historical schedules/drafts/sessions are preserved; changed links increment plan revision for stale-edit protection. Original AI defaults cannot be recovered when prior edits were not retained.
- Compatibility: database v5 unchanged; backup v4 adds optional templateId and its CSV column. Strict v1/v2/v3 archives pass original integrity/asset checks before reviewed atomic restore repair. Repeated merges do not multiply templates. The defaults reference remains separate from source provenance; Progress histories are never merged by name. AI v2/legacy v1 and the public workout discriminator are unchanged.
- UI: Exercise terminology; guarded contextual breadcrumbs; lighter day surfaces in both themes; adjacent arrows and Edit/Duplicate/Move/Delete popup with Escape/focus recovery. Name-only bounded lists; single Add versus filtered multi-selection and displayed-order bulk addition with fresh occurrence IDs/double-click protection. Select All includes offscreen results, partial is unchecked, filters drop excluded IDs, sorting retains selection, and Back/Cancel inserts nothing. Shared collapsed Tags/ANY disclosure, three horizontal rows, Clear, Set 1 spacing, responsive rest divider and scrolling A-Z tag dropdown retain validation and plain-text behavior.
- Verification: build/typecheck/lint/diff passed; final data 131/131 (4.04s). Initial focused Create runs were 13 pass/6 fail/3 interrupted, then 21 pass/1 obsolete empty-state assertion; all diagnostic issues corrected. Full plain-static root/project x desktop/phone: 348 passed/4 failures (7.4m), solely one stale inline-Edit test at each mount/size. Updated to popup and final training/backup/restore rerun passed 64/64 (1.4m), resolving all four. Focused installed Firefox desktop/phone passed 12/12 (56.2s). No single clean final 352-test run is claimed. Details: [verification record](docs/template-ownership-verification.md).
- Screenshots/guards: inspected dark/light phone/desktop editor spacing, rest separators, breadcrumbs, day/card hierarchy, menus and lists. Automated checks cover profile isolation, reload persistence, failed/stale saves, dirty navigation, unload, selection state/order, scrolling/keyboard focus and immutable history. Only isolated databases/browser contexts were used.
- Preserved: prior uncommitted Create work except the explicitly superseded projection. All six owner favicon/manifest asset hashes plus index.html match pre-task values. HEAD remains e65acd536e25718713b835bd3b401a060573db29. Package/Vite/hosting configuration untouched. No dependency installation, staging, commit, push, deploy or owner-data clearing.
- Remaining limits: physical phones/keyboards/safe areas/download sheets; screen reader/voice control; Blob-capable Safari/iOS photo/restore; live Ko-fi content; real quota; spreadsheets; actual suspended-device timers remain unverified. Windows WebKit's prior Blob blocker, old capacity results and external-chatbot compliance were not rechecked. Owner-confirmed HTTPS resolution remains accepted; the published site has not been updated.
- Owner test:
  1. Import a plan and open one of its exercises from the library.
  2. Edit and save a library note directly.
  3. Change that exercise's sets/reps inside one plan.
  4. Confirm the library and another plan remain unchanged.
  5. Add several exercises using checkboxes and Select All.
  6. Reload and confirm saved data and relationships.
- Next: perform that workflow and pending owner device/AT checks; publication and published-version smoke require separate authorization.

### 2026-10-04 - Deployment persistence investigation and update regression

- Status: local investigation/testing complete; **affected-browser verification pending**, incident not resolved. Owner reports https://boros-app.com/, blank Guest with no other profiles after deploy across mobile/desktop, and normal reloads retaining data. Do not substitute an assumed Home Screen explanation for that report.
- Audit: stable database `boros`/Dexie v5, additive upgrades, persisted active ID, Guest only when every store is empty, explicit startup errors with no reset fallback. Whole-profile deletion requires reviewed Clear/restore confirmation. Deployment replaces static Git checkout files only; no service worker, versioned database key or cache-triggered reset exists. Manifest start_url/scope are `./`, display is `browser`, id absent; current source/live HTML do not link it. Identity and hosting left unchanged.
- New regression: exact published a87dc13014fe54dad0b407572f7fdc1afe4dd132 and aa9126efd67244ddb9c7c8818896a32822a56b64, plus two independent local builds from source b672c6d1329e3e9abafa1dcbca926158623ffa4f, served successively at one fixed origin per case. Same browser context retained across all builds/reloads/page reopens. Old UI creates profiles, library exercise/tag, plan/schedule, selected plan, saved session, committed draft, weight and PNG photo. Native reads compare every store/ID and Blob byte; a separate legacy AI fixture permits only additive template/link repair. Simulated failed opening preserves all records and reports an error; recovery restores the same owner.
- Verification: **6/6** update cases on desktop Edge root, emulated-phone Edge project subpath and desktop Firefox root; **131/131** data tests; build/typecheck/lint/diff pass. Initial harness locator/channel/tag-fixture failures and sandbox EPERM rerun are recorded in [the investigation record](docs/deployment-persistence-verification.md). No full 352-case suite rerun claimed for tooling/documentation-only changes.
- Live read-only audit: all five screens at final HTTPS address, secure context true, randomUUID/subtle available, zero registered service workers, no manifest link, 19 observed 200 document/asset responses without Clear-Site-Data. This does not reproduce a live update or establish what happened in an affected owner browser.
- Changed: dedicated release preparation/test/config and npm test alias, scripts/storage-diagnostics.js (read-only, identifiers/counts/context only), TODO/README and verification record. No application/schema/manifest/assets/Vite/deploy-script/lockfile changes; owner records untouched. Started clean at b672c6d; no commit, push, deployment, hosting edits or dependency installation.
- Next: back up each accessible original profile; collect diagnostic JSON/OS/browser/launch context before and after an ordinary reload and the next separately authorized deployment, keeping the same tab/profile/app. If another original context retains records, export there and import under a new name in the intended destination, preserving checksum validation. Exact steps are in the record. Physical phone/Safari, screen-reader, live Ko-fi and earlier acceptance gates remain unverified; earlier phase/group handoffs remain historical.

### 2026-10-04 - Focused Create titles, exercise details and tutorial player

- Status: **Complete in available local verification environments**; physical-device and accessibility acceptance remain pending. Phase 10 remains Verification pending; Phase 11 remains In progress. Earlier handoffs retain their historical results.
- Implemented: one plain-text Create/editor title path, guarded existing Save/Apply/Cancel actions, modal details with locked background and scrolling content, and a separate vertical Exercise actions popup. Top-only interaction, Escape order, keyboard containment and trigger-focus recovery are covered. Instructions and Note are separate conditional plain-text sections with a divider.
- Tutorial: validated supported YouTube IDs produce a fixed HTTPS iframe URL with controls, fullscreen/inline support, no autoplay and strict-origin-when-cross-origin referrer policy. Player dimensions are at least 200 by 200. Only opened details load it; Close/Edit dispose it. Opening the actions popup also disposes it; returning remounts it paused, without preserving playback position. Invalid URLs never become embeds. Train's external tutorial action is unchanged.
- Ownership: existing profile/template/revision-bound edit, duplicate, archive and restore services reused. Template IDs and independent plan/session snapshots are preserved. Database/schema, memory routing, manifest, assets, Vite, lockfile and hosting configuration were not changed. Existing persistence-investigation files and owner AppShell edits were preserved.
- Verification: build/typecheck/lint/diff checks passed; data **133/133**, affected production static root/project-subpath x Edge desktop/phone **188/188**, focused Firefox desktop/phone **20/20**, same-context old-deployment-to-two-new-build update regression **6/6**. No full-suite or physical-phone pass is claimed. Exact commands, diagnostic failures and limits: [verification record](docs/create-details-verification.md).
- Actual playback: separate disposable local Edge check at 13:03 EDT returned HTTP 200 and advanced the real sample video's time after a Play click (`currentTime: 0.366922`, `paused: false`, `readyState: 4`). Close removed the iframe without opening another tab. Automated regression iframe fixtures are explicitly simulated, not counted as real playback.
- Remaining: actual iPhone/Safari and Android scrolling, inline/fullscreen/audio/rotation; keyboard and screen-reader traversal through the real cross-origin player and stacked dialogs; earlier Safari photo/restore, live Ko-fi and release gates. The owner's deployment data-loss report is still unresolved; passing local update tests does not establish its cause or constitute a persistence fix.
- Next: follow the verification record's exact phone/playback/accessibility checks and continue collecting affected-browser persistence evidence. No dependency installation, commit, push, deploy, hosting change or owner-data clearing was performed.

### 2026-10-04 - Train redesign and persistent weekly progression

- Status: **Complete in available local verification environments**; physical phone/audio/vibration/Safari/AT acceptance remains **Verification pending**. Phase 10 stays Verification pending and Phase 11 In progress. Earlier phase/group, hash-routing and persistence handoffs are historical and preserved.
- Implemented: shared Create/Train cards with immediate additive Add Plan, optional saved note, persistent selection and remove-only action. Full plan note, exact week labels/arrows/date picker, independent run selector and vertical status cards. Scheduled due states use saved zones; newly activated unscheduled programs have persistent Monday-anchored run/day/program-week identities and finite durations. Existing unassigned history is not dated retroactively.
- Outcomes: explicit Skip/manual Complete/correct-to-Pending snapshots with stable identities and revisions; retry/stale-write checks and separate confirmed draft discard. Actual session Save still needs results and completed history remains immutable. Train/Calendar/Progress agree; manual completion adds a day without fake exercise statistics. Calendar day view shows all unassigned days for its containing week.
- Movement: preview/confirmation, civil-week suffix shift, excluded gaps, revised ends, safe reversal and atomic collision/concurrency checks. Any affected draft, saved session or marker blocks movement; earlier snapshots/timestamps and independent runs stay intact. Pending correction markers retain audit history and also block movement.
- Session/timer: routine autosave chatter removed; Saving/failure/recovery kept. Bold exercise names, seconds/minutes rest labels, circular timestamp timer with Stop/Reset, browser-wide Sound Off default, actual rest-complete.mp3 with native-ended three-play sequencing. Transactional completion claim and cancellation guards avoid duplicate/stale feedback. Fixed delayed-unlock race. Save first row, Back/Clear second; Back confirms/flushes and failures preserve input; Clear confirms draft-only scope.
- Compatibility: database **boros v5** unchanged, optional fields in existing records with no eager migration/reset. Backup **v5** preserves notes/runs/outcomes/gaps/moves; strict v1–4 ZIP/CSV/checksum verification remains. Restore remaps references and respects existing whole-plan-family priorities. AI v2, standalone defaults, independent plan/session snapshots, memory navigation, owner AppShell, manifest/assets and configuration are preserved.
- Verification: build/typecheck/lint/diff pass; final data **145/145**, 4.369s. Complete plain-static root/project × desktop/phone suite **380/380**, 5.8m. Final Calendar correction rerun **44/44**, 1.3m, and session-test correction rerun **20/20**, 39.3s. Firefox affected run **36 passed / 2 failed**, 2.4m; both failures expected 2:00 after a reload that correctly consumed a second. Timestamp/identity continuity replaced that brittle assertion; final Firefox sessions **10/10**, 47.9s. No single clean final 38-test Firefox run claimed. Initial failures and exact commands: [verification record](docs/train-weekly-verification.md).
- Real media: actual 25,913-byte MP3 returned successfully at root/project mounts and produced exactly three native completion events/unmuted play calls in Edge and Firefox checks. Mocks independently exercise cancellation/claim/error/late-unlock cases. This is desktop-engine evidence, not physical audible/vibration/background acceptance. Inspected weekly dark phone/light desktop screenshots and the phone timer circle/actions.
- Update persistence: final **6/6**, 1.5m. Same retained context/storage across exact prior/published releases a87dc13/aa9126e and two independent final local builds; compare profile IDs, records, active selection and photo bytes. Also add a weekly program/marker/gap/Sound setting after build 1 and preserve them through build 2. Includes Edge desktop root, Edge phone subpath, Firefox root and the legacy AI repair fixture. The owner's live loss remains unresolved; no root cause or persistence fix is claimed.
- Files: weekly/schedule/session/profile/progress services and schemas; Train/Calendar/Progress/Settings UI; shared plan cards/note editor; timer feedback; backup version/validation/CSV/remapping; focused and adapted data/browser/update tests; README, backup format, this TODO and the verification record. Started clean at **5ebd5e7a8108d262e4ba5e7d9a162c15e8a92379**; current work remains uncommitted.
- Next manual checks: on disposable phone profiles in both themes, add/reload two plans, compare Skip/manual Complete and Pending correction across screens, postpone/reverse untouched week 2 and verify occupied-week rejection. With normal media volume hear three plays for Sound On, test Stop/Reset/leave/profile cancellation, and supported Off vibration; record background/expired-restore behavior. Cancel/confirm Back and Clear, reach last set/actions with keyboard open, and traverse date picker/dialogs/status with a real screen reader. Exact steps and carried-forward Safari photo/restore/YouTube, live Ko-fi, quota, spreadsheets and persistence evidence checks are in the record. No commit, push, deploy, hosting change, dependency install or owner-data clearing occurred.

### 2026-10-04 — Train refinements: recovery, Cancel, Reset and permanent Leave Plan

- Status: **Complete in available local verification**. Physical-device acceptance remains **Verification pending**. This request supersedes Back-preserves-draft and Remove-from-Train-only-deselects behavior; previous handoffs remain historical.
- Implemented: actual-input-only recovery cards (zero/notes count; timers/placeholders do not), responsive centered main layout, concise Week N/day/session labels, retained week/run on return, exact confirmed Cancel/Clear, and one guarded in-app departure flow. Interruption/unmount never deletes committed recovery data; failed saves/deletes keep input.
- Destructive scope: Reset atomically removes only the selected occurrence's draft/log/marker/timer and shared statistics recompute. Leave atomically records closure, stops future Calendar generation, deletes every unfinished run draft/timer and updates selection. Completed results/outcomes, measurements, templates and independent runs/profiles remain. New activation after closure uses a fresh run identity. Revision/fingerprint checks and serialized draft commands prevent stale/late writes; two-tab browser regressions confirm no resurrection.
- Repair limitation: earlier selection-only removal left no definitive closure record. New startup/profile-select/restore cleanup requires an exact owned run/template with a valid explicit `closedAt`, and never removes completed history. Deselection/archive/name/Stop Scheduling alone are insufficient; ambiguous old drafts are retained, with exact intentional discard guidance in the record.
- Information/hints: optional frozen Instructions/Note/trusted embedded video with correct dividers, plain empty message, only Close and restored focus. Centered orange targets; date-only session start and plan-only subtitle, with original timestamp/zone retained. Read-only muted previous-set placeholders match exact run/day/occurrence/set, exclude skipped/draft/deleted/manual results, preserve missing/zero and convert only display units. Deterministic completion/logged/UUID ordering and conservative prescription/provenance matching are documented; repeated/superset members remain independent.
- Compatibility: stable `boros` database **v5** and AI **v2** unchanged; backup **v6** adds run closure, reads strict v1–v5, verifies original CRC/SHA-256/CSV/assets before promotion, and reports conclusive closed-draft omissions during reviewed restore. Final preview counts distinguish skipped imports from removed local remnants. No record rewrite solely for hints or migration/reset.
- Verification: final build/typecheck/lint/diff pass; data **154/154**, 4.490s; complete production static root/project × desktop/phone **408/408**, 6.9m. Focused browser **11/11**, 21.9s; Firefox Train/weekly/navigation **50/50**, 3.3m. First broad static run **392 passed / 16 failed**, 8.6m: four obsolete assertions repeated across mounts/viewports, all resolved by the clean full rerun. Final rebuilt retained-context update suite **6/6**, 1.7m, preserves original profiles/all linked records/photo bytes/active selection and new closed/fresh run state across actual prior/published artifacts and two rebuilds. The owner's live deployment loss remains unresolved.
- Files: Train UI/controller, Calendar entry, shared navigation guard/dialog/Field/CSS, scoped session/run/cleanup services, closure/backup types and restore/CSV handling; focused/adapted data/browser/update tests; README, backup-format, this TODO and [verification record](docs/train-refinements-verification.md). Initial clean HEAD **07e5ba787fa0c1cef319e8fcbed9292bb9d8afcb**; all work remains uncommitted. Configuration, dependencies, manifest/assets, owner AppShell and hosting preserved.
- Next/manual: disposable-profile phone checks for interruption versus Cancel, scoped Reset/Leave/re-add, placeholders, keyboard/safe areas, large text, sound/vibration/backgrounding and modal/screen-reader focus in both themes. Live YouTube, Safari photo-backed restore, live Ko-fi, quota, spreadsheets and read-only deployment-incident evidence remain pending. Exact steps and diagnostic failures are in the verification record. No commit, push, deployment, hosting change or owner-data access occurred.

### 2026-10-04 — Create plan details and complete optional Instructions lifecycle

- Status: **Complete in available local verification**; actual phone/Safari/AT acceptance remains pending. Phase 10 remains Verification pending and Phase 11 In progress. Previous Train, phase/group and hash-routing handoffs remain historical.
- Implemented: read-only title, honest duration, train/rest counts, saved day/exercise order and exact fixed/range/zero/variable rep/RIR summaries. Supersets use Train's execution blocks with one shared bordered member box, existing saved Superset numbers, repeated occurrences and unequal sets intact. Nonblank plain-text Instructions/Note follow the final day with preserved newlines and conditional dividers.
- Actions: shared exercise/plan hamburger and vertical menu; details footer only Close. Native modal stack retains scroll/background/focus blocking, top-first Escape and focus return. Edit/duplicate/archive/restore stay profile/ID/revision bound; duplicate names require rename. Archive keeps confirmation and history/runs, returns to details on cancellation and retains an actionable failed confirmation.
- Lifecycle: optional `instructions` (max 20,000 plain-text characters) is validated, manually editable, imported through editable AI previews, saved and duplicated. New schedule revisions, outcomes, drafts and completed sessions freeze `planInstructions`. Changes leave library defaults and existing history untouched. No note copying, fabricated legacy text, changed Train subtitle or eager database migration.
- Compatibility: stable database `boros` **v5**. AI **v3** retains strict v1/v2 payloads; backup **v7** retains strict v1–v6 JSON/CSV/CRC/SHA-256/assets validation. Five existing CSV tables add instruction columns, retaining 28 tables. New/replace/both-merge choices preserve the winning plan family's frozen text. Old records without instructions remain valid and absent.
- Verification: build/typecheck/lint/diff pass; final data **159/159**, 8.325s; final complete static root/project × desktop/phone **424/424**, 7.1m; focused static **16/16**, 25.3s; Firefox plan/shared-exercise/import **26/26**, 1.6m; same-context updates **6/6**, 1.7m. Initial data fixture used a prohibited past refresh date (158 pass/1 fail); corrected to next local Monday. Initial broad run was 419 pass/5 locator failures: four old single-Close assumptions and one label matching a read-only region during asynchronous duplication. Corrected selectors passed the full clean rerun; application code was unchanged. Details: [verification record](docs/plan-details-verification.md).
- Persistence evidence: same origin/context/storage across actual prior/published artifacts and two independently rebuilt candidates; all IDs, records, active selection and photo bytes survive. New AI v3 instructions/frozen weekly marker/run text added after build 1 survive build 2, alongside closed/fresh runs and Sound preference. The owner's live deployment-loss report remains unresolved; no root cause or persistence fix is claimed.
- Preservation: began with existing uncommitted Train work at HEAD `07e5ba787fa0c1cef319e8fcbed9292bb9d8afcb`; kept it and the owner AppShell/configuration/manifest/assets. Changed Create detail/editor/shared actions, plan/AI/backup contracts and snapshot propagation, focused/adapted tests, README, AI/backup docs and this handoff. No dependencies installed, commit, push, deploy, hosting edit or owner-data clearing.
- Next/manual: use a disposable profile on actual iPhone/Safari and Android; verify both themes, long text, grouped details, keyboard/safe-area reachability, Edit/save/reload/Duplicate and Archive cancel/restore. With a screen reader/hardware keyboard verify modal headings, top-only interaction and focus return. In Blob-capable Safari export/restore under a new name and compare Instructions/Note/history/photos; check multiline CSVs in the intended spreadsheet app. Carry forward live YouTube/Ko-fi, real quota/downloads, suspended-device timers/audio/vibration and deployment-incident diagnostics. Exact steps are in the verification record; publication requires separate authorization.

### 2026-10-04 — Leave Plan confirmation copy

- [x] Removed the paragraph beginning "Future Calendar occurrences" and ending "other runs will stay" from the Leaving this plan? popup, as requested. Confirmation actions and persistence behavior are unchanged.
- Verification: typecheck, lint and diff checks passed. Browser/build suites were not rerun for this text-only deletion; earlier results remain historical.
- Next/manual: open Train > a plan > Leave Plan to review the shortened popup; choose Cancel to keep the run.

### 2026-10-04 — Train plan subtitle

- [x] Replaced the technical weekly-program/time-zone/run subtitle below the plan title with "# weeks · # Train & # Rest days", adding "· ✓ Calendar" only for the selected calendar-scheduled context. Counts come from the plan; legacy missing duration reads "No end date". The program-context selector and scheduling/persistence behavior are preserved.
- Verification: production build (including TypeScript), lint and diff checks passed. Existing affected browser checks passed 12/12 (29.3s): `npm run test:browser:static -- tests/browser/group3.spec.ts tests/browser/weekly.spec.ts --grep 'immediate multi-plan|weekly markers'`. Covered scheduled/unscheduled context switching, singular/plural weeks, both themes and root/project-subpath desktop/phone viewports using disposable contexts. Full/data/Firefox suites were not rerun for this display-only change; earlier results stay historical.
- Next/manual: open a plan from Train on a physical phone and confirm the compact subtitle and conditional Calendar mark. Earlier Safari/AT and deployment-persistence checks remain pending. No commit, push or deployment performed.

### 2026-10-04 — Calendar redesign, interaction repair and assignment guard

- Status: Complete in available local verification; physical-device/AT acceptance remains pending. See [verification record](docs/calendar-redesign-verification.md) for reproduction, decisions, commands, diagnostic failures and exact manual checks.
- Reused installed setup, shared PlanCard/dialogs and profile-scoped services; added Calendar ScheduleEditor/PlanRuns, pure run-progress and a transactional assignment guard. AppShell's pointer-focus change fixes the reproduced missed click. Progress uses the same fully-completed-day helper while preserving all actual results and session markers.
- Final data 167/167 (5.405s), build/typecheck/lint/diff pass. Full static 444/444 (7.5m), then final affected static 108/108 (2.8m) after the retained-prescription calculation; final Firefox 16/16 (1.2m), retained-context updates 6/6 (2.0m). Initial affected browser 84/104, narrow 14/15 and broad 436/440 failures exposed/fixed focus/layout and obsolete/racy test selectors. Final parallel Firefox had two engine context-close protocol errors; the clean serial rerun passed.
- No database/backup schema change, deployment, commit/push, hosting modification, dependency installation or owner-data clearing. Earlier phases and persistence incident remain as recorded.

### 2026-10-05 — Calendar staging, scheduling revisions and run lifecycle

- Status: **Complete in available local verification**. Physical-device/Safari/AT acceptance remains pending; Phase 10 stays Verification pending and Phase 11 In progress. Earlier Calendar, Train, Create and hash-routing handoffs remain historical.
- Add Plan now reuses Search/Sort/cards, excludes archived/active scheduled and unscheduled templates, captures the selected start Monday/zone, stages blank validated mappings, and commits every pending selection atomically. Edit/Leave/Cancel operate only on staging; page Cancel writes nothing and releases its own dirty guard without disabling other navigation/unload protection. Shared subtitles show weeks/training/rest. Token colors and viewport-bounded lists retain reachable controls in both themes.
- Current Plans gains Scheduled/Non-Scheduled pills and Edit/Reset/red End. Edit changes the existing run, preserving previous weeks and frozen completed/skipped/manual/draft references; untouched days move this week and future recurring mapping changes. Old unscheduled snapshots remain unscheduled. Reset atomically erases only this run's progress/drafts/timers/gaps, retains its prescription/duration/mapping, and restarts at saved-zone Monday with a fresh revision. End preserves completed history, removes all unfinished sessions, records closure and blocks stale resurrection.
- Previous Plans retains rings and authoritative dates, adds Search/Sort (added-date sorts use run creation time), capped scrolling and persistent Hide/Unhide. Hiding keeps statistics/backups; confirmed Delete removes only the selected historical run's owned results/notes/outcomes/drafts/timer. Successful actions focus the page heading when the original card may disappear. Templates, other runs/profiles and unrelated photos/measurements stay intact.
- Compatibility: **boros v5** and AI **v3** unchanged. Backup **v8** adds optional hidden state, frozen exception refs and revision-level unscheduled classification, plus a 29th CSV table. Strict v1–v7 bytes/CRC/SHA-256/CSV/assets are validated before promotion; restore remaps exception keys and keeps closed-run drafts non-resumable. No eager migration or empty-database fallback.
- Verification: final build/typecheck/lint/diff pass; data **180/180**, 9.539s; full static **472/472**, 7.7m; final affected static **88/88**, 2.0m after lifecycle/sort/focus refinements; Firefox **24/24**, 1.7m; freshly rebuilt retained-context updates **6/6**, 1.8m. These preserve the exact origin/context, old records/IDs/active profile/photo bytes, and new hidden history/assignment exceptions across prior/published artifacts and two candidate rebuilds. Initial obsolete assertions, native-IDB fixture refresh and asynchronous selector failures are recorded in [verification details](docs/calendar-refinements-verification.md).
- Preservation: retained the existing dirty working tree and pointer/persistence fixes; no dependency/configuration/manifest/hosting change, commit, push, deploy or owner-data access. Normal database name/version remain stable. The production deployment-loss report is still unresolved; these local passes establish no production root cause or fix.
- Next/manual: exact disposable-profile phone keyboard/safe-area/both-theme, staging/cancel/batch, protected current-week edit, scoped Reset/End, Hide/Delete/statistics and photo-backed restore checks are in the verification record. Screen-reader/hardware-keyboard, actual Safari/phone Firefox, background audio/vibration, quota/download/spreadsheet and live YouTube/Ko-fi gates remain open. Investigate the production incident only with read-only before/after evidence at a separately authorized deployment.

### 2026-10-05 — Calendar/Train actual activity and weekly presentation

- Status: **Complete in available local verification**. Physical-device/Safari/AT acceptance remains pending; earlier phase and hash-routing records stay historical. No production persistence cause or fix is claimed.
- Implemented: shared plan summaries; two-row Train cards using current committed progression and boundary labels; explicit instance binding without a context selector or silent fallback; full weeks with noninteractive Rest rows and retained collision exceptions. Unscheduled weekday placement remains presentation-only.
- Calendar now separates scheduled obligations from actual-date unscheduled saved/manual activity, preserving partials, timestamp/zone context and unique references. Month has complete labeled week sections with horizontal row scrolling on narrow screens. Ten profile/plan-ID color preferences and shared blue/green/amber rings retain names/status/accessibility.
- Menus show only their actions and dismissal. Reset/End/Delete use the exact shortened copy, including Train End. Direct Edit Save checks an opening-time record baseline transactionally and keeps failed input; invalid existing mappings can open for repair. Action scopes, history, profile isolation, navigation, focus and unload guards remain.
- Files: Calendar/Train/shared plan/dialog components and theme styles; new calendar-activity service and program-display/calendar-colors helpers; calendar-runs baseline read; focused data/browser tests and affected existing assertions; README/TODO and [verification record](docs/calendar-train-display-verification.md). Existing unrelated dirty work is preserved.
- Verification: build/typecheck/lint/diff pass; data **189/189** (7.820s); final affected static **120/120** (2.5m), root/project desktop/phone; final Firefox **14/14** (2.0m), including mapping repair. Both themes and 800px tablet layouts are covered. Same-context update checks **6/6** (1.8m) preserve original records/photos/selection across release fixtures and two fresh builds; these preceded only the final cosmetic palette allocation narrowing.
- Intermediate failures: initial data **187/188** (new fixture reused a unique key); initial affected static **96/112** (removed note subtitle); broader static **488/496** (old Create wording and removed Edit confirmation). Corrected fixtures/assertions passed their final reruns. Full 496-case suite was not repeated after the focused corrections. Exact commands/stages are documented.
- Compatibility: database **boros v5**, AI **v3**, backup **v8** unchanged. Cosmetic localStorage color preferences are separate from backups/user records and tolerate unavailable storage. No dependency/manifest/hosting change, commit, push, deployment or owner-data clearing.
- Next/manual: use a disposable profile on an actual phone/Safari to check week-row swiping, keyboard-safe controls, one-tap actions, actual-date full/partial/manual completions and retained dates after direct Edit. Check VoiceOver/TalkBack focus, action names and non-color cues. Exact steps and previous audio/vibration/Ko-fi/production-persistence gates remain in the verification record.

### 2026-10-05 - Calendar/Create/Progress shared instances, browsing and analytics

- Implemented: authoritative active instances and atomic Calendar/Train linking; independently collapsible vertical Month weeks; reordered Create and bounded shared lists; redesigned weight logging/filter/chart/details/update/delete; shared Previous Plans actions and per-instance/Overall analytics with selectable paired extrema.
- Preservation: started clean at ea2c68d; retained installed configuration, stable database v5, backup v8/older readers, photos, snapshots, profile ownership, stale-save protection and single-address navigation. No dependency installation, commit, push, deployment, hosting or owner-data clearing.
- Definitions: whole-program completion follows the shared resolved workload; full exercise occurrences count once; valid partial sets contribute extrema; manual completion creates no exercise results; explicit day/exercise skips deduplicate. Old blank/skip ambiguity is handled conservatively using retained finalized input where available. No name-based identity guessing.
- Files: shared active-plan helper and activation services; Calendar/Create/Train integrations; Progress components and analytics/date/scale helpers; shared bounded grid/cards/filter styling; focused/adapted tests; README and this TODO. Full details: [verification record](docs/progress-redesign-verification.md).
- Verification: build/typecheck/lint pass, data 194/194; initial focused root 4/4 + 6/6; broad root 125/126 with corrected obsolete editor assertion; affected root/project desktop/phone 314/316 with corrected coordinate assertions and final weight suite 16/16. Firefox 16/16. Final retained-context rebuild regression 6/6 passed (1.5m). No remaining known application failures in performed checks.
- Remaining: physical phones/Safari/screen readers/software keyboards, audio/vibration, live Ko-fi and separately authorized production persistence capture. Earlier handoffs and their unverified gates remain historical, without new completion claims.
- Next: carry out the exact disposable-profile manual checklist and the separately authorized production evidence capture. Do not publish without separate authorization.

### Handoff ? Calendar, shared filters, Create, Settings and gesture spacing (2026-10-05)

- Status: implemented and locally verified. Phase 10 remains Verification pending and Phase 11 In progress because physical release gates are still open. No unrelated work was overwritten.
- Calendar: seven horizontal cells per collapsible Month week, plain keyboard-accessible headings, centered ranges, concise Day view, Back on run pages and a validated local view preference. Expanded narrow rows scroll horizontally without document overflow; records and existing pointer/focus behavior stay intact.
- Browsing: shared fixed-size Search/Sort, Newest/Oldest labels, Tags/Clear alignment, compact selected pills, shared Added-date library cards and exactly one Create divider. Existing identity, ANY-match, sorting and bounded-list behavior preserved.
- Settings: transactional first-free Guest allocation plus selection, dirty-confirmation before creation, repeated-event locking, rollback errors and effective editable Name. New actions use current device zones; saved zones/history and optional legacy fields, including absence, survive. Startup/selection/restore no longer introduce an unused preference.
- Data: one captured-ID Download privacy confirmation; validated complete ZIP, cancellation and truthful errors stay. Exact Upload sentence and a divider before the unchanged Clear Data workflow. No new schema or backup version.
- Navigation padding: 24 px plus the device safe area, 16 px more than before; main-content, scroll clearance and fixed session actions adjusted together.
- Validation: build/typecheck/lint/diff pass; data **198/198** (5.45 s); final affected static matrix **320/320** (5.3 m) at root/project paths and desktop/touch-phone sizes; Firefox first **36/38**, then affected-suite **14/14** (53.4 s) after test-coordinate tolerance and serial browser cleanup. Earlier broad desktop **123/131** had eight superseded expectations, all covered by the passing final affected matrix. Failures and exact commands are recorded, not hidden.
- Persistence: final-source same-origin/context four-stage regression **6/6** (2.1 m), including two rebuilds, both normal and legacy-AI fixtures, active selection, stable IDs, records and photo bytes. Historical release setup stays untouched; only current Back/Guest UI assertions changed. Local success does not establish the production loss incident's cause.
- Files/checks/manual steps: [interface verification](docs/interface-refinements-verification.md), updated README. Physical phones/gestures/software keyboards, Safari, screen readers, physical audio/vibration and live Ko-fi remain unverified. Next: the exact disposable-profile manual checks; no commit, push, deployment, hosting or owner-data clearing performed.

### Handoff - Calendar, Support, Train amendments and active Progress plans (2026-10-05)

- Status: complete in available local verification; physical release acceptance remains pending. Phase 10/11 statuses and earlier historical handoffs are unchanged.
- Inspection: read attachment, TODO, navigation/workspace guards, draft/controller/timers, Calendar/Progress, strict backup/restore/CSV, configuration and existing tests. No applicable AGENTS.md found. Started clean at `6179937de8523885d9d8ba6c15d300a397044b36`.
- Changes: responsive Month defaults/Today scroll; approved Support fallback; centered rests/Skip labels; Settings-specific nondestructive return; exact destructive leave; independent session exercise/set additions, persisted explicit superset rounds, stable set IDs, recoverable structure-only drafts, immutable history/analytics; count-up timers and backup v9.
- Missing-plan cause: Progress passed `previous` to shared PlanRuns, excluding active schedules. It now includes both active and previous instances; Calendar's separate lists retain their existing filters and mutation guards.
- Preservation: database name/stores/indexes v5 and AI v3 unchanged; versioned backup v9 accepts strict original v1-v8 archives. No source plan/library mutation, destructive migration, checksum/security bypass, dependency installation, manifest/hosting edit, commit, push, deploy or owner-data access.
- Evidence: data **204/204**, production build/typecheck/lint/diff, Edge **388/388** root/project desktop/phone, Firefox **12/12**, and **6/6** same-origin retained-context upgrade/rebuild checks. A narrow Settings typing-during-flush race was prevented by locking the editor through its queued write, with a regression. Exact commands and intermediate fixture corrections are recorded in [verification](docs/calendar-train-session-verification.md).
- Remaining/manual: disposable-profile real phone keyboard and gesture reachability; Safari and assistive technology; actual background/locked-device count-up/countdown, audio and vibration; open live Ko-fi. Production data-loss remains unresolved without same-context before/after evidence. See the verification record for exact steps.


### Handoff - Repeating cycles of unique training weeks (2026-10-05)

- Status: complete in available local verification; physical release acceptance remains pending. Prior phase statuses and historical handoffs remain as recorded.
- Implemented: exact Create duration/toggle/count/Note/week controls, independent weekly editors, divisor validation and recoverable destructive-change confirmations; ordered previews and count ranges; shared actual-program-week resolution throughout Calendar, Train and Progress; per-week mappings, protected reassignment, gap-aware progression, correct 14-day alternating-cycle totals, independent completion identities and stable previous-result hints.
- Preservation: optional ordered week definitions partition existing flattened day snapshots; legacy repeating/unbounded plans and old session identities are unchanged. New cycle sets carry stable UUIDs. Duplication remaps the complete structure; reset/end/re-add, session-only additions, ownership, stale-write checks and transaction boundaries remain intact. Database **boros v5** needs no store/index migration or record reset.
- Contracts: AI **v4** explicitly distinguishes repeating and unique plans with strict original v1-v3 readers. Backup **v10** preserves week definitions, mappings, revisions, snapshots, gaps and set identities in JSON and **31** linked CSV tables. Original v1-v9 validation and CRC/SHA-256 checks precede promotion; whole-family restore and reference repair remain profile-scoped.
- Navigation: exact custom Create Plan/Exercise Cancel/Leave dialogs protect parent/nested/AI input. Initial defaults, generated empty sections and reverted-empty fields do not trigger false warnings. Native real unload protection and the separate Train Settings detour remain.
- Files: plan/schedule/session/AI/backup schemas and services; Create, Calendar, Train, shared detail/mapping/guard components and styles; analytics/hint helpers; focused and adapted data/browser/update tests; README, AI/backup docs, TODO and [verification record](docs/unique-weeks-verification.md).
- Final verification: build/typecheck/lint/diff pass; data **213/213** (11.85 s); complete static Edge root/project-subpath desktop/phone **564/564** (9.8 m); focused Firefox desktop/phone **20/20** (1.6 m); final-source retained-context updates **6/6** (2.1 m). Four-stage updates retain the same context/origin through two historical release archives and two current builds, preserving original IDs, records, selection and photo bytes plus a new cycle/outcome/postponement between rebuilds. Desktop and phone screenshots were inspected. Intermediate failures and corrections are documented, not counted as passes.
- Scope: retained the preceding uncommitted Calendar/Support/Train/Progress work at HEAD `6179937de8523885d9d8ba6c15d300a397044b36`. No dependencies installed, commit, push, deploy, manifest/hosting edit or owner-data access. The production disappearance report remains unresolved; these local upgrades do not establish a production cause or fix.
- Next/manual: on a disposable profile on a physical phone, build a four-week/two-definition plan with four/three training days, assign weekdays independently, verify weeks 3/4 repeat 1/2 and Progress totals 14, then test a single completion and a postponed week. Check keyboard/gesture reachability and Cancel/Leave from a nested editor. Repeat focus/announcement checks with Safari and assistive technology. Carry forward locked-device timers/audio/vibration and live Ko-fi checks; exact steps are in the verification record.

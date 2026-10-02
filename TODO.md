# Boros — shared implementation plan

Updated: 2026-10-02  
Status: Phase 4 complete; external AI formatting and paste import verified.
Current phase: Phase 4 complete; Phase 5 has not started.

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

Navigation consists of Train, Create, Calendar, and Progress in fixed bottom tabs. The avatar/name entry opens Settings; Support appears only inside Settings and opens the owner's configured Ko-fi page in a new tab.

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

- A plan contains 1–7 ordered training days. Rest days equal `7 - trainingDaysPerWeek`; the builder displays both counts.
- An exercise requires a name and at least one prescribed set. Set count and repetition targets are the only mandatory numeric inputs.
- Each prescribed set has positive integer `reps.min` and `reps.max`; equal values mean a fixed target. Reject reversed ranges.
- Each set may have an RIR range with nonnegative integer bounds. RIR 0 is valid. Missing RIR is unknown, not 0.
- Rest between sets and rest after an exercise are optional nonnegative integer seconds. Missing rest is unspecified; 0 explicitly means no timed rest.
- Instructions, notes, YouTube URL, and tags are optional. Support choosing existing tags and creating new ones.
- Store per-set targets, not a single string that must be reparsed during training. The form can apply a target to all sets and then override individual sets.
- Copy an exercise prescription into a plan entry when adding it. Keep an optional source exercise ID, but editing the library exercise must not silently change existing plans.
- Store a complete prescription snapshot in a started session and its completed log. Later plan edits or archiving must not rewrite historical exercise names, targets, tags, units, or instructions.
- Autosave training drafts locally. `Save` explicitly creates a completed session; `Clear` confirms before deleting only that draft's entered results/notes and resetting it to its prescription.
- Plan/library removal should archive records needed by history or schedules. Explicit profile clearing and confirmed import replacement have separate deletion semantics.

### Calendar and dates

- Weeks run Monday–Sunday. Compute date keys using calendar-aware operations, not elapsed milliseconds divided by seven days.
- A schedule records the browser's IANA time zone when created, its start-week date, and its training-day-to-weekday mapping. Show the time zone and retain it across device imports.
- A plan repeats weekly from its selected start week until the user stops/removes its future schedule. A duration mentioned in a plan name is not automatically interpreted as a schedule length.
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
| 5     | Training, rest timers, draft recovery, saved sessions             | 3                 | Not started |
| 6     | Calendar scheduling and weekly completion                         | 5                 | Not started |
| 7     | Progress weights/photos and profile synchronization               | 1, 5              | Not started |
| 8     | Complete ZIP/CSV/JSON export                                      | 1–7               | Not started |
| 9     | Backup restore, overwrite, merge, rename, and clear data          | 8                 | Not started |
| 10    | Integrated verification and usability polish                      | 0–9               | Not started |
| 11    | Static deployment and release smoke test                          | 10                | Not started |

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
- [x] Validate tutorial links as supported HTTPS YouTube URLs; do not execute imported HTML or fetch tutorial content automatically.
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

- [ ] Allow selecting a plan and training day; add scheduled-day entry points when Phase 6 is implemented.
- [ ] Render exercises in their planned order, with set rows from first to last and a concise prescription summary.
- [ ] Add session-level and exercise-level Note buttons with editable text.
- [ ] Show each set's weight, kg/lb unit, actual repetitions, target repetitions, and target RIR. Actual RIR may remain optional.
- [ ] Allow zero load for bodyweight/unloaded work and distinguish blank results from recorded zero. Prevent invalid negative values and incompatible partially entered sets.
- [ ] Add REST controls between sets and between exercises, using their respective durations. Unspecified rest can be entered manually; do not invent a prescribed duration.
- [ ] Use a single active rest timer with a stored end timestamp, visible remaining time, and stop/reset controls. Recalculate after tab backgrounding instead of relying on interval ticks alone.
- [ ] Persist drafts as users enter results/notes; show save failures and resume the correct draft after reload/profile switching.
- [ ] On Save, validate entries, explain incomplete sets, and let users explicitly save a partial session with omitted sets recorded as skipped. Require at least one recorded set; do not fabricate results.
- [ ] Snapshot prescriptions and write session completion plus draft finalization in one transaction. Repeated clicks/retries must not duplicate a session.
- [ ] Treat an explicitly saved partial session as completed for its selected occurrence, with a visible partial marker.
- [ ] Add Clear with a confirmation that describes its draft-only scope. Cancel preserves all input; confirm clears entered results/notes and any active timer.
- [ ] Provide a way to review saved session details, including actual results, notes, and timestamps.

Acceptance: complete an exercise, use both timer types, reload mid-session, and recover inputs. Save twice rapidly and get one log. Edit the source plan and confirm the log remains unchanged. Canceling Clear preserves the draft. A storage failure retains recoverable input and does not mark completion.

## Phase 6 — Calendar and weekly completion

Goal: a recurring weekly plan connects to the correct completed training sessions.

- [ ] Add week view by default, day/month views, Today, and previous/next navigation without an arbitrary history window.
- [ ] Add Plan flow: select plan, choose starting week, assign each training day to a distinct weekday, and preview the schedule.
- [ ] Calculate occurrences only for the displayed/relevant date range; do not pre-create infinite future database rows.
- [ ] Show scheduled training days and their completed/incomplete state in Calendar and Train.
- [ ] Connect a started session to its stable occurrence identity. Retrying/reopening that occurrence must not accidentally create duplicate completion records.
- [ ] Grey out and strike through completed training days for the relevant week while keeping their saved details readable.
- [ ] Leave other training days active. The next week's occurrences start incomplete automatically without deleting or modifying previous logs.
- [ ] Leave missed prior occurrences visible as missed/incomplete history; do not silently move them into a different week.
- [ ] Define schedule edits with effective dates/revisions so changing a future mapping does not rewrite historical occurrences.
- [ ] Handle plan-day removal/count changes with an explicit remapping flow; preserve completed sessions and their prior schedule context.
- [ ] Stop/remove future scheduling without deleting historical sessions. Support separate schedules without confusing their occurrence IDs.
- [ ] Test Sunday/Monday, year boundaries, daylight-saving changes, and importing a schedule into a browser in another time zone.

Acceptance: schedule four days, save one, and see only that occurrence crossed out. Visit the next week and see fresh incomplete days; revisit the prior week and see its completion/history. A future mapping edit changes future occurrences while prior session dates stay intact.

## Phase 7 — Progress and profile measurements

Goal: users can track body weight/photos and see a consistent current weight.

- [ ] Add dated weight entries with optional progress photos, stored locally and scoped to the active profile.
- [ ] Show chronological history and a simple weight-over-time chart with explicit units.
- [ ] Support reviewing, correcting, and deleting a progress entry/photo with appropriate confirmation for deletion.
- [ ] Derive current profile weight from the latest measurement timestamp, not insertion/import order. Use a deterministic tie-breaker when timestamps match.
- [ ] A weight change in settings creates/updates a dated measurement through the same service; progress and profile must not disagree.
- [ ] Backdated/imported earlier measurements must not replace a more recent weight. Correcting/deleting the latest entry recalculates current weight from the remaining records.
- [ ] Keep the permanent profile photo separate from progress photos unless the user explicitly chooses a photo as the profile photo.
- [ ] Validate image size/type, manage previews, and remove unused photo blobs without deleting shared references.

Acceptance: add several out-of-order measurements and see the latest measured weight in the profile. Switch units, edit/delete the latest entry, and confirm the correct remaining value. Progress photos never silently replace the profile photo, and other profiles remain isolated.

## Phase 8 — Download complete profile data

Goal: one ZIP is both human-readable and sufficient for a complete restore.

- [ ] Implement Download Data for the active profile and clearly identify that scope.
- [ ] Define a versioned backup contract with a manifest, complete `data.json`, linked CSV tables, and photo files.
- [ ] Include profile/settings, tags, exercise templates, plans, training days, prescriptions, schedules/mapping history, drafts, completed sessions/actual sets, notes, progress entries, photos, archive states, and timestamps.
- [ ] Flatten readable CSVs for profiles, exercises, tags/relationships, plans, days, plan exercises/sets, schedules, sessions/session exercises/session sets, and progress as needed. Include IDs, foreign keys, order, explicit units, and date/time meanings.
- [ ] Make `data.json` plus the manifest/assets authoritative for restore. CSV is the readable export, not a lossy source for reconstructing nested relationships.
- [ ] Escape commas, quotes, and multiline notes correctly; protect spreadsheet-facing string cells from formula execution without altering the canonical JSON values.
- [ ] Record schema/app version, export time, profile name/ID, record counts, and an asset inventory/checksums in the manifest.
- [ ] Read a consistent snapshot and generate the archive before reporting success. Export failure must not modify the source data.
- [ ] Do not export secrets or machine-specific local URLs. Explicitly exclude transient timer ticks/UI state; preserve relevant training draft results.
- [ ] Use a recognizable filename containing the profile name and export timestamp; warn that the downloaded ZIP contains personal data/photos and is not password-protected.
- [ ] Validate a representative archive independently against the backup schema before marking export complete.

Acceptance: export a profile containing all feature types and open its CSV/JSON/photo files. Confirm IDs, order, ranges, units, notes, timestamps, and image references are preserved. Export another profile and confirm no cross-profile records appear. Full round-trip verification completes in Phase 9.

## Phase 9 — Upload, replace, merge, rename, and clear

Goal: imports are reviewable and atomic, with exactly the promised conflict behavior.

### Validation and preview

- [ ] Accept the supported ZIP format, validate manifest/version/structure/assets/references, and reject unsupported future versions with an actionable message.
- [ ] Define and enforce archive limits for compressed size, expanded size, entry count, and individual images. Reject unsafe paths and duplicate/ambiguous entries.
- [ ] Use canonical JSON for restore; never execute imported HTML/scripts or treat CSV formulas as program instructions.
- [ ] Parse into temporary memory/staging and show profile name, counts, conflicts, replacements, and errors before writing live data.
- [ ] Match profile names using the same normalized key as profile creation. A new name imports as a separate profile with an independent profile ID.
- [ ] If an imported ID conflicts with another local identity, resolve it within the selected profile or remap references safely; never overwrite an unrelated profile because IDs happen to match.

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

- [ ] Match plans/library exercises by stable ID first and normalized name second. If ID and name resolve to different candidates, report an ambiguity; do not guess.
- [ ] For a conflicting plan, treat its days, exercise prescriptions, schedules, drafts, completed sessions, and associated notes as one plan family.
- [ ] Prefer this device: keep the entire local plan family and skip the matching imported family, including its unique session logs. This is the owner's requested whole-plan priority rule, not a union of session histories.
- [ ] Prefer imported file: remove the matching local plan family and restore the entire imported family, including its history. Preview how many local logs/drafts/schedules will be removed.
- [ ] For identical records, deduplicate by stable identity. Reimporting the same backup must not keep creating duplicate records.
- [ ] Keep reusable library exercises/tags independent of a plan family's ownership. Removing a losing plan family must not delete a library item, photo, or record still required by another retained record.
- [ ] Plan prescriptions and session snapshots remain self-contained when their original library exercise differs or is archived. Maintain/remap references consistently.
- [ ] For profile fields, the selected precedence source wins conflicting values, including explicit nulls. For progress and independent records, merge distinct IDs and apply precedence to same-ID conflicts; recalculate current weight afterward.
- [ ] If divergent progress records refer to the same logical measurement, surface a conflict where identifiable; do not erase legitimate distinct measurements merely because their dates match.
- [ ] Import assets required by winning records, preserve assets still in use, and remove only genuinely unreferenced assets.
- [ ] Apply the complete chosen operation in one IndexedDB transaction after validation. A failure or cancellation must leave the live profile unchanged.
- [ ] Handle stale concurrent changes between preview and commit by rebuilding/reconfirming the affected preview rather than applying an outdated destructive plan.

### Clear Data

- [ ] Provide Clear Data in profile settings with an explicit summary of what will be deleted and an opportunity to download a backup.
- [ ] Require confirmation and clear only the selected profile's records/assets. Return to an empty usable workspace while preserving other profiles.
- [ ] Cancel leaves data and selection unchanged. Never label clearing a workout draft as clearing profile data.

Acceptance: verify new-name import, each precedence mode, full replacement, rename, and cancellation using two profiles with overlapping plan names and different logs. Test repeated imports, malformed ZIPs, missing photos, interrupted/failed writes, and deletion counts. Complete an export → import → export semantic comparison, allowing only intentional identity remapping and export metadata differences. Other profiles must remain byte/semantically unchanged as appropriate.

## Phase 10 — Integrated verification and usability

Goal: the complete workflow is usable and the data rules hold across features.

- [ ] Run the repository's production build, type checks, lint, and relevant automated tests; resolve regressions introduced by this work.
- [ ] Cover meaningful domain cases: validation, per-set ranges, unit conversion, immutable history, duplicate-save prevention, weekly boundaries, parser failures, backup precedence, and transaction rollback.
- [ ] Run a browser journey: Guest → named profile → create exercise → create four-day plan → schedule → record sets/timers/notes → save → view completion/history → add progress → export → restore under a new name.
- [ ] Confirm AI imports and manual plans use the same editor, training UI, and persistence path.
- [ ] Check phone and desktop layouts, keyboard navigation, form labels, focus management, confirmation dialogs, readable errors, and color-independent completion indicators.
- [ ] Verify recovery after refresh, profile switching, background tabs, and storage failure. Apply and check the selected concurrent-tab policy.
- [ ] Check user text, filenames, links, and pasted content remain inert. Confirm no profile data/photos are sent to a provider, analytics service, or application backend.
- [ ] Open YouTube/Ko-fi only by user action; avoid automatic third-party embeds that contradict local-data expectations.
- [ ] Verify images are reasonably bounded/compressed as implemented, object URLs are released, and archive creation/import reports progress for larger datasets.
- [ ] Exercise a realistic larger dataset without loading every photo or every possible calendar occurrence at once. Record the dataset and observed result rather than promising an untested capacity.
- [ ] Confirm the storage notice, backup instructions, and destructive operation wording match actual behavior.
- [ ] Remove production demo records, fake success messages, unused dependencies, and unfinished actions masquerading as working buttons.

Acceptance: the full journey passes, critical data-integrity tests pass, and remaining limitations are recorded explicitly. No known defect remains that can silently corrupt/erase data or misreport a successful save/restore.

## Phase 11 — Static release

Goal: publish the tested SPA at a stable address when the owner authorizes deployment.

- [ ] Obtain the real Ko-fi URL and configure/test the Support link.
- [ ] Prepare the initial release for free GitHub Pages hosting from a public repository. Confirm the repository and optional custom domain before deployment.
- [ ] Document local setup, actual scripts, supported backup versions, storage scope, single-address navigation, and release steps in the project README.
- [ ] Produce the release build and verify unchanged-address navigation, remembered-screen refresh, asset paths, and startup at the configured root or project subpath. No screen-specific server routes are required.
- [ ] Explain that development and production origins have separate data. Use export/import to move records; changing domain/port/protocol does not carry IndexedDB records automatically.
- [ ] Deploy only when instructed, then run the short release smoke test on the published origin.
- [ ] Create a profile, save/reopen a plan/session, reload, export a backup, and confirm persistence from the published site. Check a phone-sized viewport and the Support link.
- [ ] Record the release URL/version, verification date, and known limitations.

Acceptance: the published app passes the release smoke test, data survives reload at its stable address, and backups work. Offline cold start remains outside the release promise unless separately implemented and verified.

## 6. Required test fixtures

Build these fixtures as the relevant phase begins, using fictional people and tiny synthetic images.

- [ ] Profile A with a four-day plan, a standalone exercise, tags, one completed scheduled session, one partial session, a draft, measurements, and photos.
- [ ] Profile B with different data to detect accidental cross-profile reads/deletes.
- [ ] Backup of Profile A with a matching plan whose sets, notes, schedule, and session history differ; at least one unique log on each side.
- [ ] Backup with a new plan, standalone exercise, and progress entry to demonstrate that nonconflicting items survive both merge priorities.
- [ ] Renamed records that retain stable IDs; records with the same normalized names; ambiguous ID/name matches; zero RIR/rest; empty optional values; Unicode; commas; multiline notes; and formula-like text.
- [ ] Malformed/unsupported archives and AI payloads; missing or oversized assets; invalid references and ranges.
- [ ] Calendar cases around Sunday/Monday, New Year, daylight-saving transitions, and different importing-device time zones.

## 7. Inputs needed later

These do not block Phase 0 unless the owner changes the scope.

| Input                         | Needed by            | Current handling                                                          |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------- |
| Ko-fi page URL                | Phase 11             | Configurable unavailable state; never invent a live URL                   |
| Hosting repository/domain     | Phase 11             | Free GitHub Pages selected; repository and optional custom domain pending |
| Visual brand preferences/logo | During UI refinement | Use a clean, accessible neutral design and text wordmark initially        |

## 8. Decision log

| Date       | Decision                                                                        | Reason                                                                  |
| ---------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
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

## 9. Current checkpoint

- Read the attached Phase 4 request, root TODO, approved UI specification, and prior handoffs; inspected the actual builders, validation, services, navigation, configuration, package scripts, and verification records. No applicable AGENTS.md found. Working tree was clean at the start of this phase.
- Phase 4 is complete; acceptance passed in data tests and desktop/emulated-phone Edge development, preview, and static root/project hosting. Earlier phases retain their recorded status and unchanged historical handoffs. Phase 5 has not started.
- Create now offers separate plan/workout formatting instructions, selectable clipboard fallback, strict raw/fenced JSON validation with field paths, and editable unsaved previews using the manual builders. Imported artifacts reopen in the same editors/source picker.
- Database stays at schema v3; no records or stores are migrated or cleared. Profile-bound creation IDs make retries idempotent. Artifact and resolved/created profile tags commit atomically; plans do not create library exercises. Existing revision/name checks and dirty/unload guards remain intact.
- Reused dependencies, configuration, themes, dialogs, editors, validation, and services. No provider connection, automatic tutorial fetch/embed, or later-phase implementation.
- Final verification: build, typecheck, lint passed; data 38/38; focused import browser tests 10/10; full development Edge 68 passed / 2 static-only skips; production preview 68 passed / 2 static-only skips; plain-static root/project hosting 140/140 with no skips. Dark desktop and light 320px screenshots inspected; no overflow and focused Save above navigation verified.
- Tests use uniquely named fake databases and isolated browser contexts, never the owner's records. No dependency install, publication, push, staging, or commit.
- Carry-forward limitations: physical-phone keyboard/safe areas, Safari/Firefox, screen readers, live Ko-fi, actual quota exhaustion, and large-data performance remain unverified. Pasted input and previews are memory-only; confirmed preview cancellation preserves original JSON but discards preview edits.
- Next step: Phase 5 training/timers/drafts only when requested. The manual/device/performance checks below remain explicitly unverified.

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
- Right: circular profile photo, with the username beside it and “Settings”
  directly beneath the username.
- Use a generic avatar when no profile photo exists.
- Show the actual active profile name, or Guest.
- The avatar/name/Settings area opens profile settings.
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

# Reusable Workouts and standalone sessions - 2026-10-06

Status: complete in available local verification environments. Physical release
gates remain open. No publishing, commits, dependency installs or owner-data access.
Existing uncommitted terminology/Create refinements were retained. No AGENTS.md
was found in the project or ancestors during inspection.

## Implementation

- `workouts` is a profile-owned template collection in additive `boros` database v6.
  Existing stores and records are not rewritten or extracted into workouts. Shared
  prescription validation, normalized active names, optimistic revisions and transactions
  protect saves, edits, duplicates and archive/restore. Errors remain visible with input.
- Create has Plan / Workout / Exercise, a full-width Imported button, and Plans /
  Workouts / Exercises libraries. The workout builder reuses PlanEditor in standalone
  mode, without duration/week fields or the embedded workout border. The picker copies
  independent workout, exercise, group and available set IDs into only the selected
  plan week; source workout and explicit exercise references remain available.
- Train removes Saved sessions and adds Existing Workout / Custom Workout. Source
  metadata is explicit; neither requires a plan or schedule. Existing autosave,
  additions, timers, Settings detours, profile guards, clear/discard and recovery apply.
  Custom Save defaults to No; Yes uses a supplied unique name or atomically allocates
  the next `Custom Workout (n)`. Private results/notes do not become prescriptions.
- Explicit Save, including partial historical logs, completes the workout in shared
  Train/Calendar/Progress derivation. Actual sets and exercise completion/skip rules
  are unchanged. Canceled and failed saves do not mark completion.
- Calendar lists standalone/custom performances separately on the completion date in
  captured time context, with no pending obligations. Completed review is a shared
  modal, retaining Calendar state/scroll. Notes open read-only nested dialogs with
  restored focus; the redundant weekly completion metadata row is removed.
- AI v5 separates Plan, Workout and Exercise. V1-v4 workout still means one exercise.
  Strict version/kind validation rejects hybrids. Workout imports atomically link
  exercise defaults by explicit ownership/normalized names without overwriting them.
- Backup v11 has 32 CSV tables, complete templates/snapshots/sources/time context,
  inventory/counts and unchanged checksum/photo verification. Strict v1-v10 bytes and
  headers validate before compatibility promotion. Workout merge is independent of
  plan families; standalone pairs match only session IDs and honor merge precedence.
  Reviewed replace/new-name/clear use the new store in the existing atomic operation.

## Verification record

- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings after cleanup.
- `npm run build`: passed (688 ms final production build).
- `npm run test:data`: **222/222 passed** (10.702 s). Includes migration preservation,
  normalization/isolation/stale edits, independent copies, repeated standalone saves,
  custom Yes/No/generated names, failed-write rollback, idempotency, lifecycle scope,
  AI version dispatch, ZIP/merge/reimport and committed restore/clear.
- Initial browser updates: root desktop **136 passed / 11 failed**; failures were old
  completion/review/layout assertions and test locators. Corrected affected retry:
  **34 passed / 1 failed**, the remaining old filter-row count corrected from two to
  three. New unique-week test requires dialog-scoped filters because hidden library
  inputs remain mounted; selector corrected. These intermediate failures are not counted as passes.
- Full production Edge matrix: `npm run test:browser:static`: **588 passed / 4 failed**
  (9.4 m). All four failures were the new unique-week test selecting both the mounted
  library and picker Search controls; scoping to the picker corrected the ambiguity.
- Final production rebuild and affected matrix:
  `npm run test:browser:static -- workout-library.spec.ts backups.spec.ts restores.spec.ts plans.spec.ts imports.spec.ts`:
  **96/96 passed** (1.9 m), root and project-subpath static servers without rewrite
  fallback, each at desktop and touch-phone sizes. This includes all four previously
  failing cases and the final editor guard, reference validation and restore-count changes.
  The complete 592-case matrix was not rerun after those final changes.
- `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright npx playwright test --config playwright.engines.config.ts workout-library.spec.ts imports.spec.ts profiles.spec.ts session-amendments.spec.ts --project=firefox-desktop --project=firefox-phone`:
  **42/42 passed** (2.0 m). `PLAYWRIGHT_BROWSERS_PATH` was assigned as a PowerShell
  environment variable before running the command.
- Desktop/phone light Create screenshots inspected: three aligned actions, matching
  Imported width, bounded three-column workout collection and no horizontal overflow.
  Full-page screenshots capture the fixed tab bar at its viewport position; content
  beneath that position remains reachable by scrolling. Automated checks cover dark
  editing, modal focus/background blocking, nested note focus restoration, retained
  Calendar month/date/expanded-week/scroll state and sticky-session reachability.
- Logs: `workout-data.log`, `workout-build-final.log`, `workout-browser-final.log`,
  `workout-focused-final.log`, `workout-firefox.log`, `workout-updates.log` (local ignored
  artifacts). Browser artifacts are under `test-results/static` and `test-results/engines`.
- `git diff --check`: passed.
- Update preparation uses cached gh-pages commits
  `a87dc13014fe54dad0b407572f7fdc1afe4dd132` and
  `aa9126efd67244ddb9c7c8818896a32822a56b64`, then two new isolated production builds.
  `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright npm run test:browser:updates`:
  **6/6 passed** (2.1 m), Edge root desktop/project phone and Firefox desktop, linked
  and legacy fixtures. Same origin AND browser context across each switch; profiles,
  selection, all old records and Blob bytes checked. New workout, standalone session
  and custom draft created between builds and retained through the second update.
  Simulated database-open failure remains an actionable error without resetting data.
  This update matrix preceded the final editor guard, backup-reference and restore-count
  changes; database initialization/migration and session persistence were unchanged
  afterward. Final data and affected browser checks cover those last changes.

## Owner check (disposable profile)

1. Create two exercises, then Create > Workout. Add one exercise twice, give them
   unequal sets and a superset, save and reopen. Edit, duplicate, archive and restore.
2. Copy it into two plans and two unique-week sections. Edit one copy; confirm the
   library and other copies retain their targets. Switch profiles and back.
3. Train > Existing Workout: enter one set and confirm partial Save. Confirm Completed
   in Calendar, open the review and its note, then Close without losing date/view.
4. Train > Custom Workout: add exercises/sets, enter results, reload and resume. Test
   save-dialog Cancel, then No; repeat with Yes and a name, then Yes with a blank name.
   Verify one saved session per Save and only Yes adds a library template.
5. Export the disposable profile and restore under a new name; compare workouts,
   history, recoverable drafts and photos before touching any original profile.

Still unverified: physical phone keyboard/gesture/safe-area ergonomics, Safari/iOS
Blob-backed restore, real screen-reader behavior, physical timer/audio/vibration and
background suspension, real storage quota/eviction, OS save sheets/spreadsheet apps,
and live Ko-fi. Firefox automation is recorded separately from physical browser checks.
The owner's previous production data-disappearance report has no confirmed root cause;
local retained-context tests are not proof about their original browser storage.

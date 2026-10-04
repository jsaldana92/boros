# Standalone templates and Create/editor verification

2026-10-04. Starting/current HEAD `e65acd536e25718713b835bd3b401a060573db29`
(`group 4 updated`). This task began with the preceding Create refinements
uncommitted. Those changes were preserved except where the owner explicitly
superseded the plan-sourced catalog. No applicable AGENTS.md was found. No
dependency installation, staging, commit, push, deployment or hosting change.

## Implemented behavior and compatibility

- Library cards read independent templates. Edit/Save exercise changes defaults
  directly. Plans, drafts and completed sessions retain independent snapshots.
- AI plan imports atomically materialize templates/tags and source-linked plan
  occurrences. Existing identities win; active normalized names reuse defaults;
  the first occurrence of a new repeated name supplies its default. Plan variations,
  repeated occurrence IDs, supersets and notes stay independent. AI v2 and v1
  parsing remain strict; the public `workout` discriminator is unchanged.
- Transactional profile initialization/selection repair is idempotent across
  reloads/concurrent connections. It adds missing templates/links, preserves valid
  references and raises ambiguous identity conflicts. It never runs from render.
  Current plan timestamps/prescriptions/groups/IDs and historical records stay exact;
  changed plan links increment revision to invalidate stale editors.
- Optional `templateId` separates repaired defaults from historical provenance.
  Progress still uses its original identity rules. Unknown old movements do not
  acquire shared history through a name match. A repaired library default can
  therefore appear separately from the older unlinked history, intentionally.
- Database remains v5. Backup v4 retains `templateId` in JSON/CSV; strict schemas
  1–3 retain frozen fields/headers and pass original CRC/SHA-256/asset validation
  before compatibility repair. Restore preview includes repair counts/warnings;
  atomic commit saves the reviewed result. Repeated old-backup merges remain safe.
  New template/tag timestamps use the repair instant; original AI defaults may
  be unrecoverable after edits. Active/oldest retained plan snapshots supply them.
- Guarded contextual breadcrumbs, lighter day surfaces, occurrence Up/Down plus
  Edit/Duplicate/Move/Delete popup, and name-only bounded lists replace prior UI.
  Single Add ignores other checks. Bulk Add selected uses displayed sort order,
  allocates independent IDs, closes once and leaves the parent draft unsaved.
  Filtered Select All includes offscreen records; partial state is unchecked;
  filtering drops excluded IDs, sorting retains them and Cancel/Back inserts none.
- Shared collapsed Tags disclosure retains ANY-match selection when collapsed;
  Clear resets only associated filters. Expanded pills use three horizontally
  scrolling rows. Rest inputs preserve exact seconds and missing/zero semantics,
  with a vertical divider on desktop and horizontal separator when stacked.
  Existing-tag dropdown sorts A–Z, shows about ten rows and retains all options.

## Checks and exact results

All databases/browser contexts were disposable test-owned data. Existing owner
records were never cleared. Tests use the real native IndexedDB in browsers and
isolated fake-indexeddb databases for services.

- `npm run test:data`: **131/131 passed**, final run 4.04s. Six focused ownership
  tests cover atomic import/reuse/varied prescriptions, late-failure rollback,
  independent library/plan/history changes, repair concurrency/profile isolation,
  failure/conflict/archive handling, and schema 1–4/repeated restore compatibility.
  Existing grouped training, measurement, schedule, Progress and backup integrity
  tests also pass. The obsolete projected-catalog test was replaced, not retained
  as authority for the new behavior.
- `npm run build`, `npm run typecheck`, `npm run lint`: passed, no lint findings.
  `git -c core.safecrlf=false diff --check`: passed.
- Initial desktop production Create run: **13 passed / 6 failed / 3 interrupted**.
  Failures were obsolete navigation/text/disclosure locators, an escaped breadcrumb
  expectation, and scrolling fixtures that no longer overflowed after deduplication.
  Fixtures now contain enough records to prove scrolling; assertions still require
  keyboard reachability and visible focus. Second run: **21 passed / 1 failed**,
  solely the old picker empty-state text; updated before the full static run.
- `npm run test:browser:static -- --max-failures=10`: **348 passed / 4 failed**, 7.4m,
  at `/` and `/project-check/`, desktop and emulated phone, plain server without
  SPA rewrites. All four failures were one training test still clicking the removed
  inline Edit button. Updated it to open the occurrence popup. No application
  behavior was changed for this locator correction.
- `npm run test:browser:static -- tests/browser/train.spec.ts tests/browser/backups.spec.ts tests/browser/restores.spec.ts`:
  **64/64 passed**, 1.4m on the final production build. This includes all four
  previously failing cases, now using the popup. Combined with the full run, every
  one of the 352 static scenarios has passed; a single clean final 352-test run is
  not claimed or needed for the locator-only correction and scoped warning change.
- With `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright`, ran
  `npx playwright test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone tests/browser/create-refinements.spec.ts`:
  **12/12 passed**, 56.2s. Used already-installed browsers; no dependencies installed.

The final source change after the full static run only makes restore preview's
compatibility warning also appear when missing templates are materialized behind
already-recorded source IDs (no plan-link rewrite needed). Data tests were rerun;
the final production build and backup/restore rerun cover that adjustment.

Inspected both-theme desktop/phone screenshots for breadcrumbs, rest separators,
Set 1 spacing, day/card hierarchy, popup focus, and bounded lists. The browser
tests assert selection state/order/IDs, double-click protection, dirty guards,
reload persistence, direct library notes, and two-profile isolation. Native browser
unload, navigation, stale-edit and restore protections also run in the regression
suite. Emulated viewports are not physical-device acceptance.

## Preserved owner files and remaining gates

SHA-256 checks match the pre-task values for `index.html`, `public/site.webmanifest`,
both Android Chrome icons, Apple touch icon and both favicon PNGs. Package files,
Vite configuration, Git HEAD and hosting settings were not changed.

Still pending: physical phones/software keyboards/safe areas/download sheets,
actual screen reader/voice control, Blob-capable Safari/iOS photo and restore,
live Ko-fi content, real quota exhaustion, spreadsheet applications and timers
after actual device suspension. Windows WebKit's prior Blob limitation was not
retested. Capacity and external-chatbot compliance were not reverified this task.
The owner's HTTPS resolution remains accepted; no fresh live-production check
or publication is claimed. Earlier phase/group/capacity records remain historical.

Owner test on this local candidate:

1. Import a plan and open one of its exercises from the library.
2. Edit and save a library note directly.
3. Change that exercise's sets/reps inside one plan.
4. Confirm the library and another plan remain unchanged.
5. Add several exercises using checkboxes and Select All.
6. Reload and confirm saved data and relationships.

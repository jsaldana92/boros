# Calendar redesign verification — 2026-10-04

Implementation and available local verification are complete; physical-device and
assistive-technology acceptance remains pending. Earlier phase results remain
historical. No commit, push, deployment, hosting change,
dependency installation, migration, reset, or owner-data clearing was performed.
The working tree already contained the preceding Train/Create changes; those remain.

## Interaction cause and fix

Reproduced against the pre-change production build using disposable Edge contexts
at 1280×800 and 390×844. Positioned Add Plan near the fixed navigation, then recorded
pointer-down, animation frames, pointer-up. On desktop its top moved from 685.3125
to 624.3125; scrollY changed 365 → 426. On phone width its top moved 729.125 →
668.125; scrollY changed 3282 → 3343. Neither click opened the editor.

The AppShell focus handler scheduled `scrollIntoView` on pointer focus, moving the
button 61 pixels before release. Inspection found stable component definitions/date
keys, prevented form submissions, and no route-change focus effect for Calendar's
local state. Shared dialogs intentionally lock and restore scroll.

The fix distinguishes pointer-focused buttons from keyboard-focused controls.
Field/keyboard clearance remains active; pointer buttons stay under the pointer
through release. There are no arbitrary delays, global scroll disabling, or retry
click handlers. The regression holds down a real pointer on a date occurrence near
the navigation boundary, checks unchanged scroll/position across frames, then
releases once and verifies the session opens. Phone projects also exercise tap.

Preview cancellation explicitly restores the submit control after modal cleanup:
the async preview temporarily disables the form, which can blur the button before
the dialog captures its trigger. Ordinary date/view changes never refocus a heading.
Current/Previous pages restore Calendar's view/date/scroll and recreated menu focus.

## Data and UI decisions

- Three centered control rows: Day/Week/Month; arrows/Today; Add Plan. Date input
  remains available. Month grids retain complete weeks and dim adjacent dates.
- Date cards contain name, smaller day, and Pending/Due Today/Past Due/Incomplete/
  Completed/Skipped. Zones and IDs remain in data and run details. Unassigned work
  remains in Train and the run pages; it is absent from the main date grid.
- Current/Previous cards represent individual scheduled and unscheduled runs,
  using shared Create PlanCard presentation. Their actions manage runs, not templates.
- Assignment uniqueness is profile + template ID, checked in an IndexedDB read/write
  transaction, serialized across connections. Save IDs make retries idempotent.
  Editing/duration changes/week moves cannot revive a conflicting assignment.
  Historical runs remain legal. Renames cannot evade the check; a distinct template
  can coexist. Add Plan disables assigned choices and preserves stale/failed input.
- Imported/pre-existing active duplicates remain untouched and reviewable. A notice
  links to Current Plans; guarded Stop Scheduling or Leave resolves extras. No
  import rejection, unique index over history, automatic merge or automatic closure.
- The existing Add Plan behavior creates an independent Calendar run. It does not
  reattribute results from an unscheduled Train run to new weekday occurrences.
- Lifecycle uses explicit closure, effective stopped boundary, committed duration
  segments and resolved finite prescriptions, never the currently displayed week.
  A future shortening takes effect at its saved boundary, not immediately. Date
  labels use saved civil start/end or closure converted in the saved run zone;
  missing dates show Date unavailable.
- Counts deduplicate occurrence keys and are owner/run scoped. Full logs and manual
  completion contribute C; explicit skips contribute S; partial logs retain their
  actual results but do not contribute C. Progress uses the same completion helper.
  Session statuses elsewhere are preserved; nothing rewrites historical sessions.
- T is derived arithmetically over committed duration/revision segments. Template
  edits/repair flags and early departure do not erase the original prescription;
  explicit revisions apply their new prescription from their effective boundary.
  Gaps add no workload. Recorded original occurrences kept outside a remap/shortened
  boundary also remain in T once, preventing inflated percentages or false completion.
  This uses at most one day/week per saved key, never full/infinite occurrence
  expansion or photo reads.
  Legacy unbounded runs show counts and No fixed total.
- Database remains `boros` v5; backup format remains v7, with existing supported
  older imports/checksums intact. Tests validate duplicate-run backup preservation.

## Verification record

- Pre-change pointer reproduction: failed once at both recorded viewports, as above.
- `npm run typecheck`, `npm run lint`: pass.
- `npm run build`: pass (TypeScript + Vite production build).
- `git diff --check`: pass with repository line-ending settings; no file/config
  normalization was performed. Existing Windows LF/CRLF advisories remain.
- `npm run test:data`: **167/167**, 5.405s (final run). Disposable named databases only.
  Covers concurrency/retry/rename/isolation, ended/left/future-stop eligibility,
  legacy duplicate restore, 20/8/2, full/partial/manual/draft/reset counts, gaps and
  reversal, committed duration/remap/template repair, unbounded/missing dates,
  timezone/year boundaries, transactional rejection of conflicting revival, and
  retained original prescriptions after remapping.
- Initial data run: 152/159; seven previous expectations depended on allowing
  duplicate active assignments or counting partial logs as full days. Updated
  fixtures use distinct templates or explicitly seeded legacy records. Intermediate
  fixture failures (missing duration/import and inconsistent historical start/end)
  were corrected before the clean 166-test pass.
- Initial affected static run: 84/104 passed, 20 failed in 4.4m. Failures exposed
  preview focus restoration plus obsolete status/management selectors and tests
  clicking Cancel before an async nested confirmation appeared. Visual inspection
  also found a shared span style overriding the ring layout; corrected specificity
  and added ring alignment/centering assertions.
- Narrow recheck: 14/15 passed, 1.6m; remaining helper raced Calendar's lazy load.
  The helper now waits for the page heading before choosing its management path.
- First full static run: **436/440**, 7.3m. All four failures were the same restored
  schedule assertion at each mount/viewport, still looking for the removed inline
  Schedule article. Updated to open Current Plans and the saved run details.
- Firefox affected suite: **30/30**, 2.2m, Calendar/Group 3/Group 4 on desktop and
  phone-width contexts. Same-context update suite: **6/6**, 1.6m.
- Clean full static: **444/444**, 7.5m. This preceded the final retained-prescription
  calculation; the final rebuilt app then passed the affected static suite
  **108/108**, 2.8m (Calendar redesign/Calendar/Groups 2–3/weekly/Train refinements,
  all four root/project × desktop/phone projects).
- Final rebuilt retained-context update suite: **6/6**, 2.0m.
- Final focused Firefox: initial **14/16**, 1.6m. The two failures were Firefox
  `Browser.removeBrowserContext` teardown protocol errors (`_maybeDontRestoreTabs`),
  not failed app assertions. Clean serial rerun: **16/16**, 1.2m, on the final build.
- Initial sandbox attempts could not spawn Node/browser processes and Vite's native
  config dependencies. Reviewed execution runs above succeeded; no dependencies or
  repository permissions/configuration were changed to work around them.

Final commands (PowerShell, project root):

```powershell
npm run build
npm run typecheck
npm run lint
npm run test:data
npm run test:browser:static
npm run test:browser:static -- tests/browser/calendar-redesign.spec.ts tests/browser/calendar.spec.ts tests/browser/group2.spec.ts tests/browser/group3.spec.ts tests/browser/weekly.spec.ts tests/browser/train-refinements.spec.ts
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
node node_modules/@playwright/test/cli.js test --config playwright.engines.config.ts tests/browser/calendar-redesign.spec.ts tests/browser/calendar.spec.ts --project=firefox-desktop --project=firefox-phone --workers=1
node tests/updates/prepare.mjs test-results/persistence-deployed a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
npm run test:browser:updates
git diff --check
```

Commands and intermediate output are in ignored `test-results/calendar-*.log`.
Static tests use the plain server at `/` and `/project-check/` with no SPA fallback,
isolated browser contexts, desktop and emulated phone projects. New layout checks
also exercise tablet, 320px width, enlarged text, both themes, long names and missing
legacy dates. Screenshots and traces live under `test-results/static`.

The retained-context update harness uses the existing read-only isolated release
checkout: `a87dc13014fe54dad0b407572f7fdc1afe4dd132` →
`aa9126efd67244ddb9c7c8818896a32822a56b64` → two independently rebuilt candidate
directories. Each case keeps exactly the same browser context and origin while
checking IDs, active profile, exercises/plans, sessions/drafts, measurements/photos,
and newer run/instruction state. It does not touch the owner's browser or deploy.

## Manual checks still required

1. On a physical phone, use a disposable profile. Open Calendar, scroll near the
   bottom navigation, tap a date card once, and confirm it opens without a jump or
   second tap. Exercise Day/Week/Month, arrows, Today and the date picker.
2. Open Calendar menu → Current Plans/Previous Plans → Cancel. Confirm prior
   date/view/scroll and unchanged address. Test Escape and keyboard focus on desktop,
   then VoiceOver/TalkBack labels, counts and blocked background interaction.
3. In both themes and enlarged text, inspect all three rings on a narrow phone,
   tablet and desktop. Check a 20-day run with eight completed and two skipped days
   shows 50% / 40% / 10%; partial/draft/missed days add nothing to completion.
4. Repeat Add Plan in two tabs for the same disposable template. Only one assignment
   should save; the other preserves input and explains Already in Calendar. Leave
   that run through confirmation, then re-add and verify separate retained history.
5. Safari/iOS, physical software keyboard/safe areas, real screen-reader/voice-control
   testing, photo-backed Safari restores, live Ko-fi, quota/storage pressure and
   background audio/vibration remain unverified from prior handoffs.

The owner's reported post-deployment blank workspace remains unresolved. Local
retained-context checks are evidence of preservation under those tested conditions,
not a confirmed production root cause or fix. Obtain the previously documented
read-only before/after evidence at a separately authorized deployment.

# Calendar, Create and Progress revision — 2026-10-05

Scope: owner's `d60b4cdb` attachment. Started from clean HEAD `ea2c68d` after
reading the root TODO, current services, UI, backup contracts and test setup.
No applicable AGENTS.md was found. No dependencies, commits, push, deploy,
hosting, manifest or installed-app identity changes. All test data belongs to
disposable databases or isolated browser contexts.

## Implementation

- Active instances, determined by the shared run lifecycle, are authoritative
  for Train and Calendar. `selectedPlanIds` is retained as compatibility metadata.
  Calendar's final batch save writes its instances and that metadata in one
  transaction. Train reads existing active instances even when the selection is
  missing; reading does not rewrite records. Train Add and direct schedule writes
  serialize on the same stores. Legacy duplicate active runs remain separate and
  require explicit resolution through Current Plans. Archived templates do not
  hide an existing active instance. Historical runs permit a new independent run.
- Month weeks reuse the vertical Week cards, independently collapse, default to
  today's grid week (otherwise the first), retain expansion across event updates,
  and expand on Today. Add Plan retains staged/final-Save behavior and separates
  `No eligible plans` from an unmatched search.
- Create uses Plan / Exercise / AI, followed by Plans / Exercises. `BoundedGrid`
  measures actual responsive rows for the two-row plan list and three-row exercise
  lists. Shared tags have smaller pills inside full touch targets.
- Progress has Body weight / Plans / Exercises. Previous Plans reuses Calendar's
  eligibility, cards, colors, date ranges, sorting, hidden state, five-card scrolling
  and guarded actions. Its primary card opens instance analytics; the separate
  action button opens Hide/Unhide/Delete. Hiding never removes statistics.
  Deleting removes only that instance's persisted results through the existing
  service. Active runs remain in Train/Calendar Current Plans.
- Historical sessions lacking an available instance remain under **Legacy plan
  history**, grouped by source plan ID. These read-only views do not fabricate
  instances or introduce another hidden/deletion system.

## Weight behavior

- Current weight uses the shared latest-measurement query, including its existing
  greatest-ID tie rule. Filters affect only the chart. Display is saved local date
  and minute (`date · HH:mm`), with UTC date/minute as the legacy fallback. No
  timezone annotations or internal identifiers are shown.
- Log Weight captures the actual UTC instant and device IANA context at the first
  valid submission. The form retains that instant, record ID and mutation ID on
  failure/retry. Profile schedule timezone is not substituted. No date input remains.
- Update Weight freezes the original measurement ID, profile, revision, timestamp,
  timezone and opening display unit. An untouched converted weight retains its
  exact canonical value. A replacement photo and measurement commit atomically;
  cancellation or failure leaves the original photo. Delete uses the existing
  shared-reference cleanup. No database migration was needed.
- Inclusive date filters use the same displayed measurement dates. Start/end may
  be one-sided; reversed dates fail; Cancel retains and Clear removes the filter.
- The fixed numeric Y axis and scrolling plot share `chartScale`. Equally spaced
  chronological **record slots**, with a date label for every record, preserve
  repeated dates without aggregation; they do not encode elapsed time. About ten
  slots fit on wider screens; narrow screens retain 44px point targets and scroll.
  Plot and date labels move together. The first unfiltered entry scrolls near the
  actual point closest to now. Opening/closing details never resets scroll/filter.
- Only the selected details component reads its photo. Charts and exercise analytics
  do not query photo blobs. Blob previews revoke object URLs on replacement/unmount.
  The shared dialog stack handles focus, inert lower dialogs, Escape and scroll lock.

## Analytics definitions

All results are profile scoped. A plan page is scoped by **instance ID**, and its
exercise cards by **training-day ID + occurrence ID**. Repeated occurrences and
superset members stay separate; a superset group never adds an exercise count.
Historical prescriptions/names come from frozen run/session/outcome snapshots.

- **Times Completed (plan):** 0 or 1. The existing authoritative lifecycle completes
  a finite positive workload when all prescribed days are resolved through saved
  full sessions or explicit completed/skipped outcomes. Thus a fully resolved run
  may include explicit skips, matching Calendar's Plan ring. Elapsed dates or early
  End alone are not completion. Unbounded/unknown legacy totals do not imply it.
- **Training Days Completed/Skipped:** the shared `runProgress`/`resolvedDays`
  rules deduplicate occurrence keys. Manual completion counts a day without
  inventing exercise performance. A partial session alone is not a completed day.
- **Exercises Completed / exercise Times Completed:** each occurrence counts once
  only when every prescribed set has a valid recorded result. A fully recorded
  exercise in a partial training-day session can count; a partly recorded exercise
  cannot. Missing, skipped or invalid sets never stand in for actual results.
- **Times Skipped:** a whole explicitly skipped exercise counts once. Saved
  day-level skips contribute the exercises in their saved prescription, except
  exercises with actual partial/full performance. Day/exercise skips deduplicate
  by instance/occurrence/exercise identity. Missed dates do not imply skips.
  Older session serialization used `{skipped:true}` for both blank and explicitly
  skipped inputs. Retained **finalized** draft input can establish explicit skips;
  without that evidence the exercise skip remains unknown and is not counted.
  Unfinished drafts never contribute performance or outcomes. This conservative
  limitation preserves the existing database and supported backup formats.
- **Overall:** exactly one card per persisted standalone library exercise ID,
  using its actual creation date (UTC date). Explicit frozen library source IDs
  and explicit plan-copy `libraryId` join its history across runs/plans. Mutable
  names, current plan contents and ambiguous legacy references never create links.
  Archived library records retain their identity/history. Unlinked history stays
  accessible through its plan, not as misleading duplicate Overall cards.
- **Weight/Reps Max/Min:** valid actual saved sets, including partial performances.
  Zero is a real value. Canonical kilograms determine load extrema; current units
  affect display only. The popup retains weight and reps from the **same set**,
  actual `completedAt` date, and historical plan/day names in Overall. No drafts,
  blank/skipped sets, deleted records or manual-without-results enter extrema.
- **Ties:** earliest actual completion instant, then lexicographic session ID,
  frozen exercise order, then set order. Reps use the same deterministic rule.
  Performance dates use the saved occurrence timezone when present, otherwise
  the profile timezone for legacy logs that lack historical zone context.

Database stays `boros` v5, AI v3 and backup v8 with strict older readers. No records
are rewritten for display or analytics. Existing photo checksum validation,
profile/stale-write protections and deployment-persistence safeguards remain.

## Verification record

Implementation is complete in available local checks. Physical acceptance is
still pending. No remaining application failure was found in the performed checks.

- `npm run build`, `npm run typecheck`, `npm run lint`, `git diff --check`: passed; lint clean.
- `npm run test:data`: **194/194 passed**, 5.329s. Includes cross-connection activation,
  rollback of profile links, missing-link reuse, occurrence counts, explicit skips,
  manual completions, mixed units/zero, paired extrema, date filtering, instance
  deletion and supported backup restoration. Existing measurement photo-sharing,
  concurrent revisions, idempotency and transaction-failure tests also pass.
- Initial production measurement suite: **4/4 root desktop passed**.
- New analytics/shared integration suite: **6/6 root desktop passed**.
- Broad root desktop suite: **125/126 passed**. The one obsolete Group 1 test
  expected the removed date editor; updated to assert automatic submission and
  timestamp-preserving editing and passed in the affected matrix.
- Intermediate failures: corrected fixture revision/name-index setup and raw test
  seed indexes; fixed the real clipped Previous Plans list exposed by pointer
  checks. Windows sandbox blocked Node worker spawning (`EPERM`); the approved
  local-process reruns succeeded. No owner data was involved.
- Affected static matrix: **314/316 passed**, 6.0m, on the final production build.
  Both failures were the same test comparing viewport Y coordinates before and
  after the phone necessarily scrolled vertically to reach a point. Corrected it
  to compare document coordinates; final **16/16 measurement checks passed**, 22.2s,
  across root/project × desktop/phone. No application change was needed for these
  assertions. The complete matrix was not repeated after this test-only correction.
- Firefox: **16/16 passed**, 1.6m, desktop and phone viewports. Device-timezone/CDP
  scenarios are covered by Edge, not falsely labeled Firefox checks. Visually
  inspected dark desktop chart, dark phone analytics, large-text phone log form;
  both-theme/tablet/phone screenshots and no-overflow checks are automated.
- Retained-context update suite (historical release → deployed release → fresh
  build → second rebuild): final source **6/6 passed**, 1.5m, Edge root desktop/project phone and
  Firefox desktop. Uses the exact same origin and browser context, compares all
  stable IDs, active selection, drafts, sessions, measurements and photo bytes.
  Both the earlier source run (6/6, 1.7m) and final UI-adjusted source run passed.

Commands and artifacts (all generated files are ignored under `test-results`):

```powershell
npm run build
npm run typecheck
npm run lint
npm run test:data
npx playwright test --config playwright.static.config.ts --project=root-desktop --workers=4 --max-failures=10
npx playwright test --config playwright.static.config.ts tests/browser/progress.spec.ts tests/browser/progress-redesign.spec.ts tests/browser/group4.spec.ts tests/browser/group1.spec.ts tests/browser/group3.spec.ts tests/browser/calendar.spec.ts tests/browser/calendar-redesign.spec.ts tests/browser/calendar-refinements.spec.ts tests/browser/calendar-train-display.spec.ts tests/browser/weekly.spec.ts tests/browser/train-refinements.spec.ts tests/browser/journey.spec.ts tests/browser/restores.spec.ts tests/browser/create-refinements.spec.ts tests/browser/exercises.spec.ts tests/browser/plans.spec.ts --workers=4
npx playwright test --config playwright.static.config.ts tests/browser/progress.spec.ts --output=test-results/progress-final-weights --workers=4
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
npx playwright test --config playwright.engines.config.ts tests/browser/progress.spec.ts tests/browser/group4.spec.ts tests/browser/progress-redesign.spec.ts --project=firefox-desktop --project=firefox-phone --workers=1 --grep-invert 'automatic device dates|submission time survives'
node tests/updates/prepare.mjs test-results/persistence-deployed a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
npm run test:browser:updates
git diff --check
```

Logs: `progress-redesign-{build,data,broad,final-static,final-weights,firefox,updates-final}.log`.
Screenshots/traces: `static`, `progress-final-weights`, `engines`, `update-runs`.
The static server has no SPA rewrite fallback; root and `/project-check/` use
the same build. Update input metadata is in `update-builds/builds.json`:
historical release `a87dc130`, deployed reference `aa9126ef`, then two independent
builds of the dirty working tree based on `ea2c68d`. The final two entry assets are
`index-B4dcX4KV.js`, SHA-256
`c9e1188c7472857e924a9332a43b3977553499bab086cdf7ce1cbd974cca7613`.

## Remaining physical checks

Use a disposable profile; retain real records and download a backup first.

1. On a physical phone (normal browser and the intended Home Screen context), open
   Calendar, expand/collapse several weeks, use Today, and tap an occurrence. Check
   portrait/landscape scrolling, keyboard focus and stable taps.
2. Log Weight with a photo. With the software keyboard open, reach Log Weight and
   Cancel above navigation. Scroll a long graph, tap two same-date points, apply
   a one-sided filter, cancel a replacement photo, then update an older entry and
   confirm current weight remains the newest. Cancel Delete before testing deletion
   only on a disposable record.
3. Open Previous Plans in Calendar and Progress. Hide/unhide a test run, check its
   rings, separate repeated exercises, paired extrema and single Back behavior.
   Use large text and VoiceOver/TalkBack or a desktop screen reader to check graph
   point names, modal focus/Escape and background blocking.
4. Safari/real iOS and physical Android behavior remain unverified. Prior actual
   audio/vibration and live Ko-fi checks remain unverified. Local cross-build tests
   do not establish the production deployment-loss incident's cause: follow
   `deployment-persistence-verification.md` for read-only before/after evidence
   at a separately authorized deployment, keeping the original browser context.

No publication is authorized by this verification work.

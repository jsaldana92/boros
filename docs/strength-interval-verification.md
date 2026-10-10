# Strength and Interval verification - 2026-10-07

Implementation and available local verification are complete; physical-device
acceptance and the earlier release gates remain pending.

Local implementation based on source HEAD `b94cfa8`. No applicable AGENTS.md was
found. No commit, push, deployment, dependency installation, manifest identity,
hosting, service-worker or navigation changes. Existing local audio assets are
served below Vite's relative base. All test records are disposable; no owner
browser database was opened or cleared.

## Implementation and decisions

- Structured, validated `strength|interval` ownership on plans, workouts and
  exercise prescriptions; immutable core filters coexist with disambiguated
  ordinary tags. Pickers, persistence, imports, merge and restores enforce type.
- Shared type chooser/icons and top-level previews. The Add Workout picker retains
  search/sort/scroll/Cancel with increased spacing and no empty-workout action.
  Normal builder sections remain. Progress has no new type controls or metrics.
- Typed manual and AI builders share circuit structure, copied independent
  occurrences, repeating/unique weeks, zero-aware durations and editable errors.
- Plan publication is transactional and revision guarded. Unchanged library
  sources reuse IDs; authored/initially changed copies publish independent
  templates with normalized-name `(n)` suffixes. Publication markers prevent
  duplicate variants on ordinary later saves. Active legacy plans reconcile once;
  archived sources stay archived; known deletions cannot be resurrected. A missing
  historical source without a tombstone is ambiguous and is deliberately left
  unpublished instead of guessed. Editing that existing copy remains possible.
- Exact active/recovery/round/set/circuit sequence; no extra round pause, no
  trailing set/circuit rest, final recovery retained. Timestamp-authoritative live
  advancement, immediate zero phases, pause/resume, committed checkpoints and
  explicitly paused reload. Closed-screen time is not counted. Live foreground
  recovery can reconcile elapsed time; historical sound cues are not replayed.
- Explicit Save only; partial confirmation, idempotent completed writes and atomic
  optional custom library creation. Calendar reviews actual timed results and
  has a separate type pill. Generic plan completion includes Interval, while
  Strength performance analytics exclude its durations/empty compatibility sets.
- Session additions/replacements keep completed phase snapshots and template
  ownership. Additions in a started circuit begin in pending rounds, never past
  ones; a fully consumed circuit is not rerun. Settings pauses/preserves the draft;
  unapplied pending edits require confirmation. Recorded partial phase time must
  be explicitly skipped before changing pending targets. Errors retain input,
  stop automatic checkpoints and offer reload. Stale tabs cannot overwrite.
- Sound uses only `localService` voices and the shared preference. Custom movement
  text is never sent to a remote voice. `active-warning.mp3` plays once on crossing
  five seconds for an active phase longer than five seconds, never for rest,
  short phases, hidden screens or a delayed backlog. Unsupported speech/media
  cannot break the timer. Existing Strength three-play rest cue remains unchanged.
- Stable `boros` v8 migration; backup v14, 38 CSV tables; AI v6 with strict earlier
  contracts. Checksums and original legacy schema/CSV validation precede promotion.
  Migration errors roll back and never replace the database with Guest.

## Automated verification

Final build, TypeScript, lint and diff checks pass. `npm run test:data` passes
**260/260** (including 17 focused Interval cases), with no skipped tests. Browser
results below distinguish full attempts from the corrected affected reruns:

- The initial data runs exposed old fixtures that were relabeled as older schemas
  without stripping new fields, plus a real plan-revision comparison affected by
  publication-only metadata. Fixtures now represent their original contracts and
  content comparison excludes identity/publication metadata. Subsequent expanded
  data runs passed; the final 260/260 includes deletion of a last circuit without
  leaving its now-trailing extra rest.
- Browser updates account for the deliberate Strength chooser in existing
  Strength suites through `tests/browser/strength-test.ts`. The new Interval suite
  uses unmodified Playwright fixtures and explicitly checks chooser/Cancel/type.
- Earlier new-flow attempts caught ambiguous Cancel/return selectors. These were
  scoped to their dialogs/current navigation controls. Four development Interval
  flows passed, including unique-week publication, actual custom completion,
  pause/reload, Calendar, denied media, keyboard focus and stale-tab recovery.
- Initial full Edge static matrix: **632 passed / 32 failed (664 attempted)**.
  Failures covered changed publication revision/type expectations, Calendar's
  added pill, new filter controls, restore normalization of published Workouts,
  removed empty-workout actions and the ordinary Strength tag label in Progress.
  The latter was restored in the app; other assertions now reflect the new contract.
- Broad corrected Edge follow-up: **253 passed / 7 failed (260 attempted)**.
  Remaining test issues were an absent exercise-region wrapper, pointer navigation
  blocked by the native modal, and reloading before async Save completed. Tests
  now select the visible tag row, invoke the leave guard deliberately while the
  modal blocks background pointer input, and wait for the saved card before reload.
- Next affected Edge follow-up: **122 passed / 2 failed (124 attempted)**. Both
  failures came from the newly added note-then-Save assertion reproducing a real
  blur/save race. Button actions now checkpoint the note themselves; background
  blur autosave cannot consume the first Save click. Final Interval rerun:
  **20/20 passed** across root/project subpath and desktop/390px phone viewports.
  This also verifies stopped controls after a quota failure, retained notes,
  recovery without error-resolution wall time, native unload cancellation,
  paused reload, Settings detour, Calendar actuals and stale tabs.
- Firefox broad follow-up: **70 passed / 2 failed (72 attempted)**; those two were
  the modal-background pointer test issue above. Corrected Create/Interval/lifecycle
  follow-up: **34/34 passed**. Interval suite after the note-save correction:
  **10/10 passed** on Firefox desktop/phone viewports. After the final audio-only
  guard, Edge again passed **20/20**; Firefox passed **9 cases** and hit one
  browser teardown protocol error (`Browser.removeBrowserContext`,
  `_maybeDontRestoreTabs`) after the typed-creation app assertions completed.
  The unchanged single-case rerun passed **1/1** (7.9 seconds); no application or
  test changes were needed to resolve that teardown failure.
- The affected regressions all have passing corrected coverage. These are separate
  runs, not a claim that a single final full matrix passed. Edge static hosting is
  file-only, with no SPA rewrite, at `/` and `/project-check/`. Screenshots of dark/
  light previews and desktop/phone timer layout were visually inspected.
- Real device audio was not heard by automation. The on-disk warning is a nonempty
  MPEG asset; local URL retrieval passed at both mounts. Simulated denied media
  and unavailable/remote-only voice paths remain nonfatal. Existing Strength
  three-play feedback tests passed in the data and browser lifecycle suites.

Commands (all run from the repository root; logs/artifacts are local ignored files):

```powershell
npm run build
npm run typecheck
npm run lint
npm run test:data
git diff --check
npx playwright test -c playwright.static.config.ts
npx playwright test -c playwright.static.config.ts tests/browser/interval.spec.ts tests/browser/calendar-redesign.spec.ts tests/browser/create-refinements.spec.ts tests/browser/journey.spec.ts tests/browser/plans.spec.ts tests/browser/progress-redesign.spec.ts tests/browser/backups.spec.ts tests/browser/restores.spec.ts tests/browser/imports.spec.ts tests/browser/workout-library.spec.ts tests/browser/lifecycle-refinements.spec.ts tests/browser/plan-content.spec.ts tests/browser/train.spec.ts tests/browser/profiles.spec.ts --output=test-results/interval-final
npx playwright test -c playwright.static.config.ts tests/browser/interval.spec.ts tests/browser/create-refinements.spec.ts tests/browser/lifecycle-refinements.spec.ts tests/browser/backups.spec.ts tests/browser/restores.spec.ts tests/browser/workout-library.spec.ts --output=test-results/interval-verified
npx playwright test -c playwright.static.config.ts tests/browser/interval.spec.ts --output=test-results/interval-closed
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
npx playwright test -c playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone tests/browser/interval.spec.ts tests/browser/workout-library.spec.ts tests/browser/backups.spec.ts tests/browser/restores.spec.ts tests/browser/imports.spec.ts tests/browser/profiles.spec.ts tests/browser/lifecycle-refinements.spec.ts --output=test-results/interval-firefox
npx playwright test -c playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone tests/browser/interval.spec.ts tests/browser/create-refinements.spec.ts tests/browser/lifecycle-refinements.spec.ts --output=test-results/interval-verified-firefox
npx playwright test -c playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone tests/browser/interval.spec.ts --output=test-results/interval-closed-firefox
npx playwright test -c playwright.engines.config.ts --project=firefox-phone tests/browser/interval.spec.ts -g 'typed creation' --workers=1 --output=test-results/interval-firefox-teardown-rerun
```

The standalone note-save reproduction first failed, then passed after the UI fix;
its final production coverage is in the 20/20 and 10/10 Interval runs. No failed
app acceptance is being relabeled as a manual-only limitation.

## Retained-context upgrade protocol

`tests/updates/prepare.mjs` reads cached published commits
`a87dc13014fe54dad0b407572f7fdc1afe4dd132` and
`aa9126efd67244ddb9c7c8818896a32822a56b64`, builds an isolated archive of pre-change
HEAD `b94cfa8`, then builds the candidate twice. It does not checkout/reset the
working tree or invoke deploy. Each test uses one fixed origin and the SAME
browser context across all five stages, page reloads and page close/reopen.

The old UI creates Guest plus a named active profile, photo, dated measurement,
exercise, manual/legacy AI plan, assigned schedule, saved session and committed
unfinished draft. Native IndexedDB reads compare actual photo bytes and all
records. Only explicitly asserted migration additions, publication/link changes
and a one-time plan revision are allowed. The first new build also creates typed
Interval actuals and newer Strength/cycle/custom/deletion records; the second
build must preserve the entire snapshot exactly. An injected database-open error
must display an actionable error while all records and selection stay intact.
Profile switching must retain the same owned records and leave Guest empty.

Six cases passed in Edge desktop root, Edge phone viewport project subpath and
Firefox desktop (manual and legacy AI variants each). The closing run passed **6/6** (2.1 minutes), with no skipped cases. Source/artifact
receipts are in `test-results/update-builds/builds.json` and the update-run JSON
attachments. Both deterministic candidate rebuilds used entry `index-JzAvMh46.js`,
SHA-256 `4c2a495c9c7a866ac641f15e5902605c7e822e2d3e4279ae35de2e9a2f619255`.
A subsequent audio-only guard also suppresses warning replay after a short hidden
crossing; its pure regression and the final production Interval suites were rerun.
No database, migration, checkpoint or backup code changed after the 6/6 run.

```powershell
node tests/updates/prepare.mjs 'node_modules/.cache/gh-pages/https!github.com!jsaldana92!boros.git' a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
npm run test:browser:updates
```

This evidence does **not** resolve the owner's
earlier unexplained production disappearance report; affected-device before/after
storage evidence remains required.

Final production entry: `./assets/index-CRCa-Lyk.js`; SHA-256
`ffd485f5ff3d21b068f5366e787209f67e7edd558be7d8b1bf9e953d1e1aad77`.
Final audio-guard browser outputs: `test-results/interval-final-audio` and
`test-results/interval-final-audio-firefox` (same commands as the closing Interval
suites above, with those output directories). Build/typecheck/lint/data logs are
`.interval-build-verified.log`, `.interval-types-verified.log`,
`.interval-lint-verified.log`, and `.interval-data-final.log`.

## Exact owner checks still required

Use a disposable named profile. Keep a backup of real records first; do not clear
site data or bypass security warnings.

1. Open an existing Strength plan: confirm its sets/reps/RIR, optional zero rests
   and supersets are unchanged. An old ordinary Interval tag must not convert it.
2. Create Interval exercises Jumping Jacks, Push-ups and Sprint, each 10 seconds
   active / 5 recovery. Confirm blank/negative/noninteger durations reject while
   recovery 0 is accepted. Try the same movement twice to confirm separate rows.
3. Build a circuit with those three movements, one round and one set, plus 30
   seconds after it and a second circuit. First round must finish at 45 seconds;
   the next circuit starts at 75, with final recovery plus extra rest preserved.
   Separately verify Sprint 20/10, five rounds, three sets: 15 active intervals.
4. Save a Workout and a four-week/two-unique-week Plan. Confirm eligible typed
   pickers, publication in the Workout library, independent edits, archive and
   scoped deletion; an ordinary plan save must not add more library copies.
5. On a physical phone, test Sound Off/On, locally available speech, five-second
   warning, pause/resume, screen lock/background/return and denied media. Confirm
   no warning during rest/short phases and no accumulated cue replay. Listen to
   the supplied MP3 and verify the existing Strength triple rest cue too.
6. During a session enter a note, visit Settings, return, then reload. Confirm
   explicit Resume from the saved paused checkpoint, no closed-time activity,
   cancellation of pending-edit/leave warnings and explicit partial/full Save.
   Check software-keyboard clearance, bottom navigation and 200% text in both themes.
7. Open the saved Calendar item: confirm type pill, circuit/set/round, prescribed
   seconds versus actual seconds, partial/skipped state and notes. Progress should
   count completed workouts without lifting statistics for Interval or type pills.
8. Export and restore into a separate disposable profile. Compare circuits,
   repeated occurrences, actual results, notes, photos and paused drafts. Repeat
   on Safari/iOS and the normal browser/Home Screen contexts used by the owner.

Physical phone/lock-screen audio and vibration, Safari/iOS native Blob handling,
real screen-reader operation, quota/native download sheets and live Ko-fi remain
unverified. Desktop automation is not evidence that those physical checks passed.
The previous Windows WebKit Blob limitation and unresolved production persistence
investigation remain open. Phase 10/11 release gates are unchanged. Additional untracked circuit audio files
appeared during the work and were left untouched; this implementation uses only
the requested active warning asset and existing local speech/chime behavior.

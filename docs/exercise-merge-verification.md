# Exercise merge and editor/input fixes - 2026-10-06

Status: complete in available local verification environments. Physical keyboard/
viewport verification and earlier device/release gates remain pending.

## Inspection and preservation

Read the attached request, root TODO and affected persistence, UI, analytics, backup
and restore code. No applicable AGENTS.md found in the repository or ancestors.
Started clean at `59a9aeec88c83e65d1da3ca9f38c1849c625eceb`. Database is still **boros
v6**, AI still **v5**, export now **backup v12**. No package/configuration/manifest/
deployment changes, installs, commit, push, deploy or access to owner browser data.

## Findings and implementation

- Session input keys/controller remain stable. The concrete layout defect was the
  autosave paragraph being inserted above all fields while pending/saving, then
  removed on each successful debounce. Field-error text also expanded result rows
  during partial entry. The status and numeric error slots now retain their geometry;
  validation and explicit zero/blank semantics remain. Browser tests retain the exact
  input DOM node, focus, caret and text through separate autosaves, measure field/page
  position and instrument scrollIntoView/scrollBy/scrollTo during typing.
- Shared focus clearance previously centered obscured controls. It now moves only the
  obscured distance on focus or viewport resize, coalesced in one animation frame.
  It never runs on an input change or autosave render and does not listen to normal
  scroll events. The existing actions/navigation and bottom clearance stay reachable.
  These are verified application causes/fixes; a real mobile keyboard is not available
  here, so this is not a claim to have reproduced every physical keyboard behavior.
- Skip's full-width flex label made blank row space clickable. Only its inline label
  and checkbox now toggle it, with a >=44px target and unchanged per-exercise/set
  accessible names. Surrounding space and keyboard single-toggle tests cover it.
- Hiding the parent builder previously unmounted its autofocus title; return remounted
  it and focused the top. The title now stays mounted, while a shared per-builder
  return hook captures the keyed occurrence, nearby workout, focus target and nested
  scroll positions. One frame after closing any child confirmation restores the
  occurrence-relative location and preventScroll focus. Form state stays mounted;
  cleanup prevents restoration into another builder/profile. No long timer is used.

## Merge contract

Only a persisted active library exercise editor offers Save exercise / Merge / Cancel.
The single-select modal reuses picker search/sort/tags/cards and excludes the edited,
archived and retired records. Other pickers remain multi-select. The edited exercise
is the default destination; Switch reverses direction without writing. Cancel retains
form input and selection; exact confirmation wording and nested modal focus apply.

Final confirmation revalidates the form and both captured IDs/revisions/profile in one
transaction. Unsaved edits belong to the edited record even if it becomes the source.
The destination keeps its ID/name/default prescription; tag IDs are unioned. Existing
50-tag validation remains (an excessive combined set is rejected before commit).

Source fields, prescription, notes, instructions, tutorial, tags and creation timestamp
remain in the exercise row, with `mergedIntoId`, `mergedAt`, `mergeOperationId` and a
new revision. No recorded occurrence/result is rewritten. Explicit redirects resolve
chains into one Overall identity while each repeated occurrence/result retains its
own key. Plan statistics/completion, immutable Calendar reviews and conservative
same-plan/occurrence/set previous-result hints retain their existing scope. Existing
sessions/timers/autosaves are not reset. Stale writes/archive restore cannot revive a
retired identity; matching operation retries are idempotent; failures roll back tags,
source retirement and destination together.

Backups retain all source rows and redirects in the existing exercise collection/CSV.
V1-v11 original bytes, versioned allowed fields, checksums, inventories and assets are
validated before promotion. New-name/replace/both merge priorities/profile clear cover
the redirects; plan-family replacement cannot delete them. Exercise restore now matches
IDs only. Conflicting active names on unrelated IDs require name resolution or a new
profile. A pre-merge backup cannot reactivate an already-retired device identity even
with imported metadata precedence. Invalid final cycles or missing/foreign destinations
are rejected rather than repaired speculatively. See [backup contract](backup-format.md).

## Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed after removing a test-file BOM introduced by PowerShell.
- `npm run build`: passed (651 ms final Vite production build).
- `git diff --check`: passed.
- `npm run test:data`: **230/230 passed** (18.596 s). Covers snapshots/independent
  repeated supersets, both directions/unsaved fields, tags, names, atomic injected
  second-write failure, retry/concurrency, cross-profile/self/chained merges, stale
  editors/archive restore, active controller/timer preservation, strict v11 ZIP
  promotion, cycle/missing/foreign rejection, all restore choices/export round trips,
  profile clear, retained-context database reopen, Overall and plan-scoped results.
- Initial data: 207 passed/21 failed (version expectations, revised identity matching,
  new fixture assertions); then 228/228 and 229/229. Adding the final plan fixture
  temporarily moved fake-indexeddb initialization after a DB import: 222 passed/8
  fixture failures. Restoring setup order gave the final 230/230 above. An initial
  sandboxed Node invocation could not spawn workers; approved local execution was used.
- Initial root-phone browser: 2 passed/3 failed. Two revealed that the status-row edit
  had not applied (corrected); one used an invalid AI fixture. The next run passed five
  cases, but its parent-editor test waited on an incorrect note label; stopped after
  the other checks passed. Corrected parent scenario passed 1/1 on development desktop
  (7.1 s). Final production matrix and Firefox results are recorded below.
- `npm run test:browser:static -- exercise-merge.spec.ts workout-library.spec.ts session-amendments.spec.ts train.spec.ts exercises.spec.ts plans.spec.ts imports.spec.ts backups.spec.ts restores.spec.ts navigation.spec.ts create-terminology.spec.ts`:
  **240/240 passed** (4.6 m), Edge root/project-subpath and desktop/touch-phone.
- `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright npx playwright test --config playwright.engines.config.ts exercise-merge.spec.ts workout-library.spec.ts plans.spec.ts imports.spec.ts --project=firefox-desktop --project=firefox-phone`:
  **38/38 passed** (3.0 m). The environment variable was assigned with PowerShell.
- Additional single-selection/search/sort/tag/archived-exclusion/Cancel case:
  `npm run test:browser:static -- exercise-merge.spec.ts --grep 'merge picker selects' --output=test-results/merge-picker`: **4/4 passed** (5.5 s).
  Equivalent Firefox command with `--output=test-results/merge-picker-firefox`:
  **2/2 passed** (7.9 s).
- Screenshot review identified an existing standalone Progress source label rendering
  an absent plan name as `undefined`. The final display-only fix joins actual available
  names; tests assert chart/source details omit that segment. The first closeout was
  stopped with 19 Edge passes/2 failures and 3 Firefox passes because the new detail
  test used `20 kg` instead of its accessible name `Weight Max: 20 kg`; selector fixed.
  This was not a product failure.
- Final corrected production closeout:
  `npm run test:browser:static -- exercise-merge.spec.ts progress-redesign.spec.ts --output=test-results/merge-verified`:
  **40/40 passed** (1.2 m), all four root/project desktop/phone combinations.
- Final corrected Firefox closeout:
  `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright npx playwright test --config playwright.engines.config.ts exercise-merge.spec.ts progress-redesign.spec.ts --project=firefox-desktop --project=firefox-phone --output=test-results/merge-verified-firefox`:
  **20/20 passed** (1.4 m). No application changes after these final checks.
- Update preparation:
  `node tests/updates/prepare.mjs 'node_modules/.cache/gh-pages/https!github.com!jsaldana92!boros.git' a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64`,
  then `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright npm run test:browser:updates`:
  **6/6 passed** (2.2 m). Cached releases and two local builds retain the same origin
  and browser context, profiles/active selection/records/IDs/photos, recovery, and
  new workout/session records. An open failure remains an error without reset. This
  preceded only the final Progress display correction; persistence was unchanged.
- Local ignored logs: `merge-data-first.log`, `merge-data-second.log`,
  `merge-data-third.log`, `merge-data-final.log`, `merge-data-final2.log`,
  `merge-browser-first.log`, `merge-browser-second.log`, `merge-parent.log`,
  `merge-browser-matrix.log`, `merge-firefox.log`, `merge-picker-final.log`,
  `merge-picker-firefox.log`, `merge-update-builds.log`, `merge-updates.log`,
  `merge-build-final.log`, `merge-browser-final.log`, `merge-firefox-final.log`.
  Final closeout uses `merge-browser-verified.log`, `merge-firefox-verified.log`.
  Desktop/phone dark/light screenshots inspected, including nested confirmation,
  compact Skip/results and combined Progress; fixed navigation in full-page captures
  appears at its viewport position. Automated checks verify final-field/Add reachability.
  The full unrelated browser suite was not rerun.

## Exact owner checks (disposable profile)

1. On a physical phone, start a workout containing repeated exercises and a superset.
   With the software keyboard open, enter/edit weight, reps and RIR, pause between
   digits for autosave, try blank and 0, then switch fields near the bottom. Verify
   no bouncing, lost focus/caret or keyboard dismissal; reach final inputs and
   Save/Cancel/Clear. Tap blank Skip-row space (nothing happens), then the label or
   checkbox (one toggle). Repeat with portrait/landscape and both themes.
2. In Create, edit an exercise in Workout 4, Apply and confirm return near that
   occurrence. Repeat Cancel, a unique-week section, library Workout and AI preview.
   Confirm the parent's unsaved notes remain and another newly opened plan starts
   without inheriting the position. Repeat with the phone keyboard visible.
3. Create two disposable exercises with different defaults/tags and record results
   for each, including both in one workout. Edit one, change its instructions, open
   Merge, select the other and verify the default Into direction. Try Switch and
   Cancel; confirm no data changed and input remains. Confirm a merge, then verify
   only its destination is selectable, defaults/tags are correct, Calendar retains
   both historical results/notes, and Overall Progress combines results once while
   plan views remain separate. Export and restore under a new name to inspect the
   retained merge before using this operation on any important profile.

Still unverified: real iOS/Android keyboard and visual-viewport interactions, Safari/
iOS IndexedDB Blob restore, real screen readers, physical timer audio/vibration and
background suspension, quota/eviction and native file/save-sheet behavior, spreadsheet
apps and live Ko-fi. Emulated touch viewports and Firefox automation do not close
those gates. The earlier production data-disappearance report remains unresolved;
local retained-storage tests do not establish a production cause or fix.

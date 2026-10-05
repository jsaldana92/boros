# Calendar, filters, Create and Settings refinements — 2026-10-05

Owner request: attachment `b75f7b87`, plus extra bottom-tab gesture spacing.
Started from clean `b7ad78d37bce7c7339e2fcb3f4b968ac6d088a17`. No applicable
AGENTS.md was found in the repository or ancestor directories. Earlier handoffs
remain historical; this revision supersedes their stacked Month weeks, Settings
return/name-creation/timezone controls and export acknowledgment checkbox.

## Implementation and decisions

- Calendar keeps independent collapsible complete Monday–Sunday weeks and the
  existing day-cell/event styling, now in seven horizontal columns. Narrow
  screens can scroll an expanded row without overflowing the document. Headings
  have no normal fill/border; keyboard focus and expanded state remain. Month and
  Week range headings are centered; Day omits the duplicate heading. Only the
  page-level Current/Previous Plans Cancel controls become Back. Existing focus,
  scroll, staged writes, colors, occurrence identity and expansion behavior stay.
- `boros.calendar-view` is a browser-wide localStorage interface preference,
  independent of profile records and single-address sessionStorage navigation.
  It accepts only day/week/month, defaults safely to Month, and writes only on
  explicit selection. Denied storage is nonfatal; the current module retains an
  in-memory selection. It does not restore an old displayed date or editor.
- Shared `SearchSort` backs plan controls and `LibraryFilters`, including existing
  pickers and Progress. Search expands left; Sort stays right at 132 px × 44 px,
  with matching input height. Newest/Oldest change labels only. Tags/Clear share a
  row; ANY matching and Clear semantics stay. The old outer selected-tag border,
  shadow and font-weight are removed from compact filter buttons; selection uses
  the inner pill. Touch targets remain at least 44 px and focus is independent.
- `LibraryExerciseCard` supplies Create and Overall Progress name/Added date from
  the actual standalone record. Occurrence cards keep their day subtitle. Plans
  remain above Exercises, scrolling bounds stay, and only the action-row divider
  remains above Plans.
- Settings removes Return, the separate creation form and Time zone. New profile
  is a dropdown action, never a persisted ID. `createNextGuest` allocates the first
  free effective normalized Guest name in the same serialized IndexedDB
  transaction that creates/selects it. NFKC, whitespace and case rules include
  an older unnamed Guest. Profiles start independently with kg/cm defaults and
  no copied owned records. UI locking handles repeated pending events; the leave
  guard runs before any creation. Errors roll back both profile and selection.
- Name contains effective editable text at initialization without becoming dirty.
  Rename keeps ownership IDs and uses the existing stale revision check. Saving
  other fields on an unchanged Guest does not unnecessarily convert its kind.
- New Calendar assignments capture the current device IANA timezone on entry;
  new Train activations resolve it inside the activation action. Measurements
  already capture device time at submission. Existing schedules/occurrences and
  measurements are never re-zoned. Optional old profile zones remain compatible
  with backup readers and legacy history fallback, but do not choose new-action
  defaults. Startup/selection and restore no longer invent a missing preference.
  This also preserves absence exactly through export/import/export.
- Data retains its specified browser-storage notice and actionable status/errors.
  Download opens one shared modal with the exact privacy warning and Cancel /
  I understand (Download). Its captured stable profile ID binds the export;
  switching/leaving cancels preparation. Dirty forms still block export, duplicate
  submission is locked, and worker cancellation, snapshot validation, checksum
  verification and truthful download feedback stay intact. No second checkbox.
  Upload has the exact requested sentence; a divider separates Clear Data, whose
  existing wording, scope and confirmation remain.
- Bottom-tab padding is **24 px plus `safe-area-inset-bottom`**, increased from
  8 px (16 px extra). Main-content/keyboard scroll clearance and fixed session
  actions account for the extra height. Navigation controls and their targets
  are unchanged.

Database `boros` v5, AI v3, backup v8 and supported older readers remain. No
dependency, schema, manifest, hosting, commit, push or deployment change. Tests
use disposable fake-indexeddb databases and isolated browser contexts, never the
owner's records. The production deployment-loss investigation remains unresolved.

## Verification

- Production build passed; explicit typecheck and lint passed. Diff check passed
  after removing trailing whitespace from adapted test statements.
- Data suite: **198/198**, 5.4457 s. New cases cover cross-connection normalized
  Guest allocation, absent legacy Guest names, independent records, transaction
  rollback, device defaults versus frozen runs, and invalid/denied preferences.
  Existing strict backup/checksum, restore/clear, history and isolation checks pass.
- Affected production static matrix: **320/320**, 5.3 m, Edge root/project paths
  and desktop/touch-phone contexts. Covers all changed screens, profile isolation,
  view persistence, old schedule context, filters/sorting, shared cards, Upload/
  Clear Data, ZIP contents/checksums and guards. Visually inspected dark phone
  Month and 320 px enlarged Settings; automated tablet/light captures also pass.
- Final-source same-context update regression: **6/6**, 2.1 m, Edge root desktop,
  project phone and Firefox desktop. The only test adaptations are the current
  Back label and effective Guest Name value; full data comparisons remain.
- Firefox: **36/38** on the first run, 2.0 m. One exact Tags/Clear coordinate
  equality needed subpixel tolerance; the other failed during Firefox's context
  cleanup (`_maybeDontRestoreTabs`), after the export checks. The complete affected
  backup/shared-browsing suites then passed **14/14**, 53.4 s, with subpixel
  tolerance and one worker. All 38 tested cases now have passing evidence; the
  full 38-case matrix was not repeated after those test-only changes.

Intermediate results are retained, not labeled acceptance passes:

- The first sandboxed data run could not spawn Node workers (`EPERM`). Approved
  local-process reruns used test databases. The next run passed 194/198: two old
  boundary fixtures depended on a hidden profile timezone, one new test used
  `assets` instead of snapshot `photos`, and restore invented an absent timezone.
  Fixtures were made explicit and restore corrected; the final 198/198 passed.
- First focused desktop run: 12 passed, 6 failed, 1 interrupted by fail-fast.
  The exact-label selector exposed the dropdown label including option text;
  an explicit Active profile accessible name fixed it. Keyboard-focus testing
  now enters keyboard modality before asserting focus-visible styling.
- Broad desktop: **123/131**, 2.8 m. Eight failures were superseded expectations:
  Back label, Month preference restoration, Added card subtitle, four old timezone
  form-save assertions, and a test creating competing CDP timezone sessions.
  These were corrected without weakening data/status expectations.
- Initial cross-build run: **0/6** because its current-build Calendar return step
  still asked for Cancel. Updated to Back and the effective Guest value; all record,
  ID, active-profile and photo-byte comparisons remain unchanged.

Commands (generated output stays under ignored `test-results`):

```powershell
npm run build
npm run typecheck
npm run lint
npm run test:data
npx playwright test --config playwright.static.config.ts --project=root-desktop --workers=4 --max-failures=12
npx playwright test --config playwright.static.config.ts tests/browser/interface-refinements.spec.ts tests/browser/profiles.spec.ts tests/browser/backups.spec.ts tests/browser/restores.spec.ts tests/browser/calendar.spec.ts tests/browser/calendar-redesign.spec.ts tests/browser/calendar-refinements.spec.ts tests/browser/calendar-train-display.spec.ts tests/browser/create-refinements.spec.ts tests/browser/progress-redesign.spec.ts tests/browser/group3.spec.ts tests/browser/weekly.spec.ts tests/browser/exercises.spec.ts tests/browser/group4.spec.ts tests/browser/navigation.spec.ts --workers=4 --max-failures=8
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
npx playwright test --config playwright.engines.config.ts tests/browser/interface-refinements.spec.ts tests/browser/profiles.spec.ts tests/browser/backups.spec.ts tests/browser/progress-redesign.spec.ts --project=firefox-desktop --project=firefox-phone --workers=2
node tests/updates/prepare.mjs test-results/persistence-deployed a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
npm run test:browser:updates
npx playwright test --config playwright.engines.config.ts tests/browser/backups.spec.ts tests/browser/progress-redesign.spec.ts --project=firefox-desktop --project=firefox-phone --workers=1 --output=test-results/interface-firefox-rerun
git diff --check
```

Logs: `interface-{build,data,desktop,static,firefox,firefox-rerun,updates-final,diff}.log`.
Screenshots/traces: `static`, `engines`, `interface-firefox-rerun`, `update-runs`.
The static server serves existing files at `/` and `/project-check/`, without an
SPA fallback. Edge phone/desktop contexts also exercise tablet and 320 px enlarged
text layouts, both themes, keyboard focus and document-overflow assertions.

Cross-build inputs: read-only historical release `a87dc130`, deployed reference
`aa9126ef`, then two independent builds of this working tree. Each test keeps its
exact origin and browser context through every reload and page close/reopen;
it compares stable IDs, active selection, profiles, exercise/plan/session/draft/
measurement records and actual photo bytes. Also covers historical AI template
repair, existing failure/retry guards and the second rebuild's weekly history.
Release fingerprints are in `test-results/update-builds/builds.json`. Both new
builds have entry `index-DajSuBc5.js`, SHA-256
`c33f7df403abafd2a677352a89fc68d40c0d3913ee768dabca4e5487b9ae22a5`.
The existing source tree and production build stayed unchanged through the final
static, Firefox and update checks; subsequent adjustments were test expectations
and documentation only.

## Exact remaining manual checks

Use a disposable profile in the intended phone browser/Home Screen context.

1. Swipe up from the phone's bottom edge repeatedly. Confirm the extra gap helps
   avoid tab activation, all four tabs remain reachable, and Train's fixed session
   actions remain above navigation in portrait/landscape and with the keyboard open.
2. Expand several Month weeks, horizontally pan their Monday–Sunday cells, tap an
   event once, and return with Back from Current/Previous Plans. Select Day or Week,
   switch tabs, reload and reopen; confirm the view persists while the date starts
   at Today after reopening. Check enlarged text and device Safari.
3. In Settings, type an unsaved name, choose New profile and cancel the discard
   prompt: no profile should appear. Accept on a second attempt; verify the next
   Guest name, blank independent data and editable Name. Switch back to the original
   disposable profile and confirm its records remain.
4. Open Download, verify the exact profile name, cancel, then confirm a test export
   and inspect the ZIP in the actual phone Downloads/Files app. Use VoiceOver,
   TalkBack or a desktop screen reader to verify modal naming, focus containment,
   Escape/back behavior and focus return, plus compact selected-tag announcements.

Physical phones/OS gesture behavior, software keyboards, Safari, assistive-tech
acceptance, physical audio/vibration and live Ko-fi remain unverified. Browser
viewport tests do not establish those passes. Local cross-build checks do not
prove the production deployment-loss cause; retain original-context evidence and
follow the existing investigation at a separately authorized deployment.

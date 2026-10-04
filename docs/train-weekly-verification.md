# Train weekly progression verification — 2026-10-04

Implemented locally; physical-device audio/vibration and accessibility acceptance
remain pending. No commit, push, deployment, hosting change, dependency install,
or access to the owner's browser records occurred. Initial working tree was clean
at `5ebd5e7a8108d262e4ba5e7d9a162c15e8a92379`. Read the request, root TODO,
persistence investigation, database/services, UI, configuration and prior checks;
no applicable AGENTS.md was present. Historical handoffs remain historical.

## Behavior and data decisions

- Add Plan reuses Create's PlanCard and appends immediately in a transaction.
  Duplicate additions cannot create duplicate runs/selections. A single selected
  plan stays a card; its saved optional note has an ellipsis. Removing selection
  preserves the plan, runs and history. Plan note editing remains plain text.
- Selecting a plan shows its full note, Monday–Sunday range, keyboard-operable
  date picker and vertical day cards. Existing independent schedules are selectable
  contexts with stored zone/run IDs. The live query is keyed to the displayed run
  and week so stale query results cannot appear beneath another week.
- First activation without a schedule creates a stable unscheduled run from the
  profile-local Monday, saved zone and plan duration/snapshots. Its identity is
  run/day/program-week, independent of displayed calendar position. Existing
  date-based scheduled keys remain unchanged. Old unscheduled sessions/drafts
  retain their unassigned historical context; no week is guessed or reset.
- Explicit skipped/manual-completion markers live on the owning schedule with
  stable IDs, occurrence refs, snapshots, revisions and audit timestamps. These
  are not exercise-performance timestamps. Correction to Pending retains a marker
  revision; no exercise result, zero or completed session is fabricated. Actual
  Save still requires at least one valid recorded set. A draft must be explicitly
  discarded, with its own confirmation/revision check, before marking its day.
  Saved sessions remain reviewable and cannot be overwritten by a marker.
- Calendar and Train share event/status derivation; scheduled due states use the
  saved zone. Unscheduled items remain weekly, even in Calendar's day view, and
  never imply assigned weekdays. Progress counts explicit skipped and manually
  completed days separately; manual markers contribute no exercise statistics.
- Moving a selected week shifts its untouched suffix and effective revisions by
  civil calendar weeks, creates/reuses an excluded Monday, recomputes finite ends,
  and records a move audit. Preview and commit check revision/fingerprint and all
  same-run drafts, sessions and markers in the affected suffix transactionally.
  Any occupied suffix is blocked, including corrected Pending markers. Earlier
  records and independent runs remain intact. Gaps are not skipped days.
- The database remains **boros / schema 5**: optional fields in existing stores
  need no index/store upgrade or rewrite of old records. New backup **v5** retains
  runs, gaps, moves and markers in strict JSON plus CSV projections. Strict v1–v4
  imports retain original integrity checks before promotion. Restore remaps run
  references and uses the existing whole-plan-family conflict policy. Browser-wide
  Sound and active timers are excluded from profile ZIPs. See
  [backup format](backup-format.md).
- Session autosave continues without routine success chatter. Saving, failure,
  conflict and recovery controls stay visible. Back confirms entered results/notes,
  flushes pending writes and leaves only after success; errors preserve input.
  Clear confirms draft-only results/notes/timer scope. Save occupies the first
  fixed action row; Back/Clear share the second. Exercise names are bold and rest
  labels preserve missing/zero values while formatting longer durations in minutes.

## Timer implementation and evidence

Circular progress derives from the stored end timestamp. REST/Reset creates a new
token and attempts media unlock within the user gesture. Sound defaults Off in the
existing browser settings record; Off attempts one 100 ms vibration. On plays
`public/rest-complete.mp3` exactly three times, advancing on native `ended` events.
The verified file is **25,913 bytes**, with measured media duration **0.809781 s**.
It resolves relative to Vite's base at root and project subpaths.

An IndexedDB transaction claims each completion token once across tabs. Generation
guards stop pending claims/repetitions on Stop, Reset, replacement, leaving the
session, changing profile or changing Sound. Restored expired timers show completion
without replay. A discovered late-unlock promise race could pause completion; the
completion sequence now invalidates it and explicitly restarts playback. Focused
tests reproduce the delayed promise and guard against its return.

Mocked tests verify sequencing/cancellation/error cases. Separate Edge browser tests
play the actual MP3, observe three native `ended` events and three unmuted playback
calls, and check the HTTP asset at both hosting mounts. This is desktop-engine media
evidence, including emulated phone viewports, **not** a physical audio/vibration
pass or a listening-quality test. Native media diagnostics are stored with browser
test artifacts (Playwright replaces its output directory on later runs). Both
Firefox desktop/phone media checks also passed. API behavior follows [play() promise handling](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)
and [ended events](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/ended_event).
Visible completion remains if playback/vibration is unavailable. There is no
background, lock-screen or iPhone-vibration guarantee.

## Verification commands and results

Only uniquely named test databases and disposable browser contexts were used.
For update tests, each test retains the **same** context/storage across old releases
and both new builds, including reloads and page reopens; storage is never reset
between builds.

| Check | Actual result |
| --- | --- |
| `npm run build` | Passed; production bundle built after final Calendar correction |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed without warnings after removing unused test imports |
| `npm run test:data` | **145/145**, 4.369 s; final code |
| `npm run test:browser:static -- --max-failures=6` | **380/380**, 5.8 min; plain static `/` and `/project-check/`, Edge desktop/phone, no SPA fallback; precedes the final day-view-only correction |
| Final static weekly/Calendar/Group 3 checks | **44/44**, 1.3 min; after final Calendar correction |
| Final static session checks | **20/20**, 39.3 s; after timestamp-test correction |
| Firefox affected desktop/phone checks | **36 passed / 2 failed**, 2.4 min; both fixed-countdown test failures resolved by final session rerun **10/10**, 47.9 s. No single clean 38-test run claimed |
| Same-context updates | First run **6/6**, 1.6 min; final builds **6/6**, 1.5 min, including Edge root/phone subpath and Firefox root |
| `git diff --check` | Passed |

Focused suites cover append/duplicate/isolation, scheduled and unscheduled states,
marker versus session counts, retry/stale tabs/rollback, saved-draft conflicts,
forward/reverse/gap/end/year/DST behavior, retained snapshots, all restore priorities,
timer token claiming and media sequencing, failed Back flush, Clear cancellation,
keyboard dialogs and both themes. Existing full suites cover navigation/unload,
profile/exercise/plan isolation, photos, imports, historical schedules and restore.

Commands for the final focused suites:

```powershell
npm run test:browser:static -- tests/browser/weekly.spec.ts tests/browser/calendar.spec.ts tests/browser/group3.spec.ts
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
npx playwright test tests/browser/weekly.spec.ts tests/browser/train.spec.ts tests/browser/calendar.spec.ts tests/browser/group2.spec.ts tests/browser/group3.spec.ts --config=playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone
npx playwright test tests/browser/train.spec.ts --config=playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone
npm run test:browser:static -- tests/browser/train.spec.ts
node tests/updates/prepare.mjs test-results/persistence-deployed a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
npm run test:browser:updates
```

Update inputs use the already-isolated historical checkout and exact previous /
published release revisions. The old UI creates profiles, exercise/tag, plan/run,
saved session, committed draft, measurement and PNG photo. Native reads compare all
stores, IDs, active selection and Blob bytes after each update. A separate legacy
AI fixture allows only documented additive template repair. After build 1, the
test also creates a new weekly program, marker, gap and Sound On; build 2 must retain
those too. Simulated database-open failure remains an actionable error and recovery
returns the original records. Passing this test does **not** identify the cause of
the owner's reported live deployment loss; that incident remains unresolved.

### Diagnostic failures retained honestly

Sandboxed subprocesses initially failed with EPERM; approved isolated test reruns
succeeded. Early data suites caught obsolete backup-v4 counts/fixture checks,
one undefined optional-property comparison, and a legacy-v4 error expectation.
All were corrected before the 145-test pass. Early browser runs caught obsolete
selection/status/success-text locators, asynchronous timer-popup closing, superset
set-order assumptions in the persisted-draft helper, and a Stop transition race in
the test. The helper now waits for actual owned draft values in IndexedDB.

The first complete static attempt ended **172 passed / 8 failed / 3 interrupted /
197 not run**. Failures were old backup count/version expectations, seed timers
covering fields in peer tabs, and an audio assertion counting `play` events while
the unlock element was already playing. Tests now compare three actual unmuted
playback calls and three native completions, and the implementation restarts from
zero. The subsequent full 380-test run passed. The initial Firefox command treated
file arguments as project names; corrected CLI ordering started the real suite.
Raw logs are ignored artifacts under `test-results/train-*`; historical failures
are not counted as passes.

Firefox's two remaining session assertions expected a full `2:00` after a reload
that actually consumed a second; the correct app display was `1:59`. The test now
compares the persisted timer token/end timestamp before and after reload and checks
displayed remaining time against that timestamp within one second. Final Firefox
10/10 and static 20/20 session reruns resolve both failures without a code change.
Visually inspected weekly dark phone/light desktop cards, dividers, note, pills
and date control; inspected the phone timer circle/actions. Automated theme/layout
checks cover both themes at all four static mount/size combinations. Emulation
does not establish physical keyboard or screen-reader behavior.

## Exact remaining owner checks

Use a disposable profile on the candidate build; do not clear the original site.

1. On a physical phone in both themes, add two plans from Train. Confirm immediate
   append, note truncation/full note, remove-only selection, reload and profile
   isolation. In plan details, use arrows and date picker; check assigned weekdays
   only on scheduled runs and choose each independent run explicitly.
2. Skip one untouched day, manually complete another, reload and compare Calendar
   and Progress. Correct a marker to Pending. Start a draft, enter results, then
   verify marking requires explicit draft resolution and saved sessions still open
   for review. No fabricated exercise statistics should appear.
3. On an untouched week 2, preview/confirm Move Training to Next Week, inspect the
   excluded gap and extended end, then reverse from its new week. A move across a
   draft, marker or saved session must fail without changing any records.
4. With device media volume audible, turn Sound On, tap REST and let it finish:
   listen for **three** consecutive plays. Test Stop, Reset, leaving the session
   and switching profiles during playback. With Sound Off, check one short
   vibration only if supported. Repeat with a locked/backgrounded device and an
   expired restored timer, recording OS/browser behavior; no old sound should
   replay solely on restoration. iPhone vibration may be unavailable.
5. Enter results/notes; cancel Back and Clear and confirm input remains. Confirm
   Back, reopen the saved draft, then confirm Clear and verify other history stays.
   With the software keyboard open, reach the last set and both action rows above
   bottom navigation in portrait/landscape. Use a real screen reader/voice control
   for the week picker, stacked dialogs, timer completion and status pills.

Carry forward Safari/iOS Blob-backed photo/restore, real download sheets, live
Ko-fi content, quota, spreadsheet and suspended-device checks. Windows WebKit's
known prior Blob limitation was not re-probed. The real YouTube player acceptance
from the previous handoff is still pending on phones. Continue the separate
[deployment-persistence evidence collection](deployment-persistence-verification.md)
in an affected owner context before/after the next separately authorized release.

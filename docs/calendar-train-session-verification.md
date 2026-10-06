# Calendar, Support and Train session verification - 2026-10-05

Scope: attachment 023f0206 plus the owner's active plan missing from Progress.
Started clean at `6179937de8523885d9d8ba6c15d300a397044b36`; no applicable AGENTS.md.
No installation, commit, push, deployment, hosting/manifest edit or owner-data access.

## Implemented behavior and boundaries

- Month defaults to today's week on mobile (<640px), or all weeks on desktop.
  A mobile month without today starts collapsed. Per-month/layout explicit toggles
  survive ordinary renders/data refresh. Rows stay Monday-Sunday, about two mobile
  cards visible inside their scroller. Today preserves other toggles and reveals
  the correct day. Existing view preference, colors, date rules and navigation stay.
- Support defaults to the approved `https://ko-fi.com/jhonatansaldana` in actual
  app configuration. HTTPS/host validation still applies to VITE_KOFI_URL overrides;
  an invalid override gives an unavailable state. The rendered href, new-tab target
  and noopener/noreferrer are tested; the live external destination is not opened.
- REST and Add controls center; Skip's visible text is short while accessible
  names identify occurrence and set. Ordinary/superset post-rest follows Add Set
  and one divider; between-round rests remain separate.
- Settings locks the editor synchronously while flushing pending draft state. Failure stays in Train and keeps
  input. A validated sessionStorage pointer contains only profile/draft UUIDs,
  separate from the allowlisted screen preference; same-tab Settings reload can
  return to the same owned draft. Unavailable sessionStorage retains in-memory
  return until reload; committed drafts remain recoverable from Train. Profile
  changes never retarget another owner's controller or timer.
- Active session navigation to Create/Calendar/Progress asks `Leaving {day}` with
  exact approved body and Cancel/Leave. Leave serializes behind running autosave,
  deletes only that draft and its timer transactionally, and cancels local feedback.
  Failure stays with input. Stale saves require an existing record/revision, so
  cannot resurrect deletion. Unmount/reload does not delete committed recovery.
- Add Exercise reuses Create's picker/filter behavior in a blocking modal; repeated
  selections copy independent occurrences and source references. Add Set copies
  previous prescribed reps/RIR with empty actual values. Supersets append one set
  per member to a new final round (A3/B2/C1 becomes A4/B3/C2, with A4/B3/C2 together).
- Optional session `structure` owns stable UUIDs/rounds and an amendment flag.
  New drafts allocate set IDs; legacy drafts get metadata only on amendment.
  Failed writes keep pending structure/input; Clear retains structure; Cancel
  removes it with the draft. Saved history/Progress includes added work without
  increasing scheduled-day totals. Original plans and library records stay intact.
- Unspecified REST persists count-up startedAt; positive durations retain countdown
  endAt; zero is no timed rest. Stop/Reset count-up never claims completion/alarm.
  Old timers without mode remain countdowns. Additions do not change active timers.
- Database `boros` v5/indexes and AI v3 unchanged. Backup v9 adds strict optional
  session structure and `csv/session_structure.csv` (30 tables); strict v1-v8
  original ZIP/CRC/SHA-256/CSV/photo validation precedes envelope promotion.
  Restore preserves internal identities and round membership in the new profile
  scope. Active timers/navigation pointers stay excluded per existing contract.
- Confirmed missing-plan root cause: WorkoutProgress passed `previous` to the
  shared PlanRuns list. Progress now includes current plus previous runs; current
  cards can open analytics but do not expose historical Hide/Delete actions.
  Calendar's Current/Previous lists and mutation validation remain unchanged.

## Verification

- Production build, explicit typecheck, lint and diff checks passed.
- Full isolated fake-IndexedDB data suite: **204/204**, including the Settings flush lock regression.
- Production Edge root/project, desktop/emulated-phone affected matrix: **388/388** (6.6 minutes), 97 tests in each of four projects, on the final build.
- Installed Firefox desktop/phone-sized focused suite: **12/12** on the final build (58.6 seconds). Additional Edge-phone Today cross-month visibility / zero page-horizontal-offset followups: **1/1** each in two strengthened runs.
- Retained-context updates: **6/6** (Edge root desktop, Edge project phone and
  Firefox desktop, ordinary and legacy-AI fixtures). Each test keeps the SAME
  browser context/origin as the static files switch between cached published
  revisions `a87dc13014fe54dad0b407572f7fdc1afe4dd132`,
  `aa9126efd67244ddb9c7c8818896a32822a56b64` and two independently built current
  candidates. IDs, profiles/active selection, exercises/plans, saved sessions,
  committed drafts, measurements and original photo bytes survive reload/reopen.
  A forced DB loading failure remains an error, not a replacement workspace.
  These cached releases are identifiable prior artifacts, not a claim about
  today's live deployment or the cause of the owner's separate data-loss report.
- Both current update builds: HTML SHA-256
  `f3f6680e42f71ca2e2a524b61e26263ff8eaa2996aaac34311c9b6c4a3aa25db`;
  entry `index-B9pzTg4H.js`, SHA-256
  `070e4e64354ce77a612799d8e48b9652163ec31a0ab30b60770830f9784631e5`.
  Base commit identifies the starting checkout; current changes are uncommitted.

Intermediate results are retained honestly: first data run 197/198 required an
old-wire fixture to omit new structure; expanded suite 200/202 had two new test
setup mistakes (existing load precision and service method name); the new v8
fixture initially expected v7's 28 CSV tables instead of v8's 29. The later 203/203 run passed those assertions; final **204/204** also covers
the synchronous Settings flush lock. First focused browser run 4/10 used a label selector
including option text and expected automatic return after an intervening profile
switch; corrected to accessible combobox selection and explicit draft recovery.
The first wider root matrix was 143/146: desktop Week 4 was already expanded and
the test closed it, and two old tests requested removed manual rest inputs.
Expectations now follow the requested behavior while retaining ID/record checks.
The first expanded matrix was **386/388**: a new completed-history assertion
treated a partial session as fully completed. Corrected to the established zero
completed / four planned days. After the Settings flush lock and test corrections,
the final complete matrix passed **388/388**. Firefox focused **12/12** and update
**6/6** checks were repeated successfully on the final candidate. The added Today
followups explicitly wait for horizontal visibility after switching months and
assert `scrollX === 0`, avoiding reliance on transient full-page screenshots.

Sandboxed test/build process launches failed with EPERM; the same installed local
commands ran with process access. No dependencies were installed or security
validation disabled. Logs/traces/screenshots live under ignored test output paths.

```powershell
npm run build
npm run typecheck
npm run lint
npm run test:data
npm run test:browser:static -- session-amendments.spec.ts train.spec.ts train-refinements.spec.ts group2.spec.ts group3.spec.ts group4.spec.ts progress-redesign.spec.ts progress.spec.ts calendar.spec.ts calendar-refinements.spec.ts calendar-redesign.spec.ts calendar-train-display.spec.ts interface-refinements.spec.ts weekly.spec.ts shell.spec.ts profiles.spec.ts backups.spec.ts restores.spec.ts navigation.spec.ts
node tests/updates/prepare.mjs test-results/persistence-deployed a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
npm run test:browser:updates
npx playwright test --config playwright.engines.config.ts session-amendments.spec.ts --project=firefox-desktop --project=firefox-phone --workers=2 --output=test-results/session-firefox-final
npx playwright test --config playwright.preview.config.ts session-amendments.spec.ts --grep "month defaults" --project=phone --output=test-results/today-viewport
git diff --check
```

## Exact remaining manual checks

Use a disposable profile; do not clear original browser data.

1. On an actual phone in both themes, open Calendar Month: only today's week
   initially opens. Swipe its row to Sunday, collapse/reopen weeks, choose another
   month and Today. Confirm today's card is revealed, controls remain reachable
   with larger text, and bottom-edge system swipes do not trigger tabs.
2. In a training day with unequal supersets, enter results/notes, Add Set to a solo
   exercise and a superset, and Add Exercise twice. Check the new grouped sets all
   appear in one final round. Open the software keyboard and reach the last field,
   Add controls and Save above fixed navigation.
3. Start an unspecified rest, wait, visit Settings, change kg/lb and Save profile,
   reload Settings then return Train. Verify same session, converted loads, notes,
   added structure and increasing elapsed time. Reset to zero and Stop; neither
   should sound/vibrate. Repeat a countdown while backgrounding/locking the phone
   in Sound On and Off. Foreground timer math and automated MP3 tests do not prove
   audible playback, physical vibration or reliable background delivery.
4. Select Create/Calendar/Progress during the session: Cancel preserves it; Leave
   removes only that unfinished draft. Start another draft, add a set without
   results, reload and resume; Clear keeps that set. Save some results and verify
   frozen history and active-plan analytics; use a downloaded v9 backup to restore
   a disposable copy and inspect added exercises/rounds in the real save-picker flow.
5. Repeat relevant flows in physical Safari and with a screen reader: named Skip
   controls, week toggles, picker/leave/timer focus trapping and focus restoration,
   error announcements, active tabs and no unexpected address changes.
6. Settings Support should open the owner's live Ko-fi page in a new tab. Only
   rendered configuration/href/security attributes were checked locally.

The production disappearance incident, physical save sheets/quota behavior,
Safari/assistive technology and prior release gates stay unverified. Current local
results do not mark Phase 10 complete or authorize publication.

# Calendar refinements verification — 2026-10-05

Scope: the owner's attached Calendar refinements, following the 2026-10-04
redesign. Earlier handoffs and release gates remain historical. No commit, push,
deployment, hosting/dependency/manifest change, or owner-browser data access.
The existing dirty working tree was preserved. No applicable AGENTS.md was found.

## Implemented behavior and decisions

- Month cells swap the existing surface/main-background tokens. Day/Week use the
  in-month surface. Today, selected-date, focus and status indicators are separate.
- Create/Add Plan share Search/Sort controls and the weeks / training / rest
  subtitle. Add Plan excludes archived templates and any active run, including
  unscheduled runs. Legacy unbounded durations remain explicit.
- The starting Monday and profile zone are captured when Add Plan opens from the
  selected Calendar date. Browsing and midnight do not silently change them.
  New popup mappings are blank; every training day needs a distinct weekday.
- Popup Save stages only. Scheduled pills are qualified by the page-level Save
  explanation. Edit keeps the old staging on Cancel; Leave removes staging only.
  Page Cancel performs no write and releases that form's dirty guard without a
  native warning. Other navigation and browser-unload protection remain intact.
- Batch Save validates all inputs and rechecks template revisions, ownership,
  archive state, active scheduled/unscheduled runs, and mappings inside one shared
  transaction. Stable IDs support exact retries; partially committed batches are
  not accepted. A failed second insert rolls back the first and retains the form.
- Current Plans uses Edit / Reset / red End. Editing assigns the existing run,
  retaining its ID/start/progression/prescription/duration/zone. Old unscheduled
  revisions retain their classification; original results never become scheduled
  completions. Template edits alone do not change the committed prescription.
- Reassignment preserves previous weeks. Recorded results, explicit nonpending
  outcomes, and active drafts retain frozen occurrence references. This includes
  already recorded future work. Untouched current days move; following weeks use
  the new mapping. Exceptions suppress the corresponding generated day in its
  week, so a completed Monday and a newly assigned pending Monday can coexist.
  A corrected pending marker follows the new mapping. Past Due is never a skip.
- Preview fingerprints include run/session/draft records. Commit checks them and
  the effective week again. A stale save keeps input and requires renewed review.
- Reset retains the selected run ID but creates a fresh prescription revision,
  erases only its results/notes/drafts/outcomes/timer/gaps/movement history, and
  restarts Week 1 on the current Monday in its saved zone. Its committed duration,
  mapping and scheduled/unscheduled status stay intact. Midnight/week changes
  invalidate an old Reset preview. Missing drafts and revision checks block stale
  autosaves/reopens; failures roll back the entire transaction.
- End reuses permanent Leave: completed history stays, every unfinished run draft
  is removed, timers stop, actual closure is recorded, and stale tabs cannot resume
  it. Historical runs do not reserve a new active assignment.
- Previous Plans includes scheduled/unscheduled resolved/ended runs, authoritative
  dates, rings, and persistent Hide/Unhide. Final full-completion dates come from
  actual saved completion/marker timestamps; unknown dates are not replaced with
  today. Hidden runs still contribute to statistics and backups. Delete confirms
  the run name/date range and removes only its owned run/history/drafts/timer.
  Templates, other runs/profiles and measurement/avatar assets are preserved.
- Lists scroll internally. Height reserves room for actions and fixed navigation;
  at most five historical cards precede scrolling. Mobile Add Plan uses paired
  Search/Sort controls; shorter viewports or large text show fewer cards. Mapping
  rows become stacked label/select pairs on narrow phones. Shared modal stack,
  pointer focus repair, return scroll and single-address navigation are retained.

## Persistence and compatibility

Database remains **boros / Dexie v5**, with no store/index/name change or eager
record migration. Optional additions: run `hiddenAt`, run `occurrenceExceptions`,
and revision `unscheduled`. Backups write **v8**, with 29 linked CSV tables; v1–v7
strict contracts and original ZIP/CRC/SHA-256/CSV/photo validation remain supported.
Exception IDs/keys follow restore remapping. Hidden/closed history and current
classification round-trip. Closed-run cleanup still excludes resumable unfinished
drafts from restore. AI remains v3. See [backup format](backup-format.md).

Main files: CalendarPage, AddPlans, ScheduleEditor, PlanRuns, WeekdayFields and
viewport helper; shared PlanCard/PlanBrowseControls; calendar-runs, schedules,
weekly and run-actions services; schedule/backup schemas, backup CSV/read/remap,
run-progress and theme CSS; focused and adapted tests, README and TODO.

## Verification record

Complete in available local verification. Physical-device/assistive-technology
acceptance remains pending; no earlier phase or release gate is newly completed.

- Final build/typecheck/lint and diff check passed. No dependency changes.
- Final data suite: **180/180**, 9.539s. Includes the strict-v7 ZIP fixture and
  the final reset-uniqueness and historical-selection regression cases.
- Initial approved data run: **157/167**; ten assertions still expected the old
  current backup envelope (v7). Updated current-envelope expectations to v8 while
  retaining strict older-wire fixtures; final compatibility tests pass.
- New Calendar browser cases: initial **20/24**, 37.3s. Four copies of one test
  expected menu focus instead of return to its Add Plan trigger; corrected.
- Affected Calendar/group/journey/restore suite: **120/124**, 4.8m. Four obsolete
  Close selectors needed the requested Cancel label; corrected.
- First complete static suite: **464/472**, 7.8m. Four copies of an old subtitle
  order and four new native-IDB fixture reads without reload; corrected.
- Follow-up Calendar/shared Create static suite: **52/52**, 1.0m. Included root
  and `/project-check/`, desktop/phone, both themes, staged/batch failure paths,
  existing-run edit, reset/end/hide/delete, Previous sorting/scrolling/focus and
  protected reassignment. Screenshot review additionally tightened mobile density.
- Initial extended update suite: **3/6**, 1.7m. Three executions clicked Cancel
  before asynchronous Edit finished, seeing two buttons. Added an explicit
  Current Plans/dialog-closed wait. No persistence mismatch was reported.
- Complete static suite: **472/472**, 7.7m, at root/project paths and desktop/phone
  viewports. After final lifecycle guards, date sorting and successful-action focus
  handling, the affected Calendar/Train/zone suite passed **88/88**, 2.0m.
- Final freshly rebuilt same-context update suite: **6/6**, 1.8m. Both previous
  artifacts and two independent candidate builds were served at the identical
  origin per case; retained hidden/exception metadata and all old records matched.
- Final Firefox Calendar suite: **24/24**, 1.7m, serial desktop/phone-width run.
  Physical Safari and actual phone browsers remain manual.

The first sandboxed data run failed to launch workers (`spawn EPERM`); reruns used
approved process execution and isolated databases. No test accesses owner data.

Reproduction commands:

```powershell
npm run build
npm run typecheck
npm run lint
npm run test:data
npm run test:browser:static
npm run test:browser:static -- tests/browser/calendar-refinements.spec.ts tests/browser/calendar-redesign.spec.ts tests/browser/train-refinements.spec.ts tests/browser/group3.spec.ts
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
node node_modules/@playwright/test/cli.js test --config playwright.engines.config.ts tests/browser/calendar-refinements.spec.ts tests/browser/calendar-redesign.spec.ts --project=firefox-desktop --project=firefox-phone --workers=1
node tests/updates/prepare.mjs test-results/persistence-deployed a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
npm run test:browser:updates
git diff --check
```

The update harness uses the existing isolated release checkout, actual previous
and published artifacts, and two freshly built candidates. Each case retains the
**same origin, browser context and storage** through reload/reopen/update/rebuild.
It compares IDs, active selection, all records and original photo bytes. After
build 1, new hidden history and recorded unscheduled exceptions gain Calendar
assignments and must survive build 2, alongside prior closed/fresh runs/gaps/text.
This local regression does not establish a production deletion cause or fix.

## Exact manual checks still required

Use a disposable profile on actual iPhone/Safari and Android, without changing
the original owner context. Keep a downloaded backup of any records you value.

1. In both themes, inspect Month's inside/outside colors, Today/selection/focus,
   then Day/Week. Scroll a long Add Plan list; open the keyboard and verify that
   weekday inputs and Cancel/Save remain reachable above navigation/safe areas.
2. Stage two plans, edit and cancel one mapping, remove/reselect it, then page
   Cancel. Confirm no runs were added and no browser warning appears. Repeat
   with page Save and refresh; verify both runs appear exactly once.
3. Complete Monday's first day, skip/mark another, and leave a third draft with
   input. Edit weekdays: recorded days stay where they were; untouched days move;
   next week uses the new mapping. Assign an unscheduled run and verify old
   unscheduled results still have their original classification.
4. On a disposable run, cancel then confirm Reset. Check Week 1/current saved-zone
   Monday, empty rings, cleared drafts/timer and preserved template/other run.
   End another run with saved history and an unfinished session; confirm the
   history remains and the unfinished input/timer cannot resume after refresh.
5. Previous Plans: search/sort, Hide, refresh, Show hidden plans, Unhide. Confirm
   Progress statistics stay unchanged. Cancel Delete, then delete a disposable
   historical run; check only that run's results/statistics disappear.
6. Export a profile with hidden history, assigned formerly unscheduled results,
   and photos. In a Blob-capable Safari context import under a new name. Compare
   run dates/classification/exceptions/history and original images. A closed run
   must have no resumable draft. Check CSVs in the intended spreadsheet app.
7. With VoiceOver/TalkBack and a hardware keyboard, verify popup heading/field
   announcements, Tab trapping, Escape/top-popup dismissal, focus return, red
   destructive actions and large text. Physical background audio/vibration/timer,
   real quota/download behavior, live YouTube and Ko-fi remain unverified.

Safari/physical-phone/assistive-technology gates are not passed by desktop
emulation. No live smoke or deployment was performed. The owner's deployment-loss
incident remains unresolved; use the read-only evidence checklist in
[deployment persistence verification](deployment-persistence-verification.md)
at a separately authorized deployment. Do not clear site data or bypass browser
security/checksum checks to investigate it.

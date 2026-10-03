# Group 3 — profile time zones, Calendar month and Train selection

Date: 2026-10-03. Complete in the available local verification environments.
Starting HEAD: `a4b0e204c72790e21370e417d03f60bfc05cda69` (`group 2 updated`),
with a clean working tree. No dependency install, commit, push, deployment,
hosting change or owner-data clearing. Group 4 is not started. Earlier Group 1–2
handoffs remain historical, and HTTPS remains owner-confirmed resolved.

## Behavior and persistence decisions

- Optional profile time zone defaults once from the browser during creation,
  startup or selection of a legacy profile. Only that profile's revision/update
  metadata changes. Settings edits retain stale-write/unsaved-input guards and
  never rewrite schedule zones, occurrences, session timestamps or measurements.
  New schedules use the profile preference frozen when Add Plan opens.
- Calendar initially shows the named current month, complete Monday–Sunday weeks
  and dim adjacent dates with usable events. Previous/Next uses calendar months;
  Day/Week controls retain their day/week steps. Today uses the profile zone.
  All schedules appear at their saved civil dates, labeled with their zones;
  each event's lateness uses its own zone. Only the visible range is generated.
  Desktop has seven columns; narrow layouts retain chronological readable cards.
  Calendar has Add Plan only, reusing mapping/duration/revision/stop previews.
- Train selections are profile-scoped interface preferences. None shows the
  requested compact empty state plus Select Plans; one opens its day interface;
  multiple show plan cards and Back to plans. No draft is created by rendering.
  Per-plan day selection survives card switching while that screen is mounted.
  Reload preserves selected plans and saved drafts, not unsaved editor contents.
- Selection does not schedule, archive, stop or erase records. Archived IDs are
  remembered but hidden until restore. Missing IDs are ignored in the usable
  list without substitution. Explicit Save selection replaces the list with the
  currently checked active plans. Profile revision checks reject concurrent
  Settings or selection saves. Failed saves keep checkbox input.
- Unfinished sessions remain reachable for archived/unselected plans. Calendar
  entry retains its exact schedule/day/date/draft identity and never changes
  selections. Saved-session review is a compact secondary action when records
  exist. Existing autosave, failed-input/Back/navigation/unload guards, partial
  completion, supersets, timers and frozen history remain in use.
- Cards combine current schedules by distinct occurrence keys. A schedule with
  a future stop remains current until its local cutoff; effective stopped schedules
  leave pending-card computation but remain in Calendar/history. Their unfinished
  original workload still prevents a combined COMPLETED claim. Precedence:
  overdue > due today > future pending > fully completed finite workload.
  Partial saved sessions complete only their exact occurrence; unscheduled logs
  affect Last workout but never scheduled completion. Last workout is the latest
  actual completedAt, displayed in the profile zone; Next is the earliest pending
  civil date and its saved zone (stable key breaks same-date ties).
- Ended missed work remains PAST DUE. Unbounded, mapping-repair, stopped-only and
  unscheduled workloads cannot manufacture COMPLETED. Shortening checks for
  removed pending work before claiming completion; retained unfinished drafts
  still count. Status visits effective segments and at most saved completions,
  not every elapsed date. Minute boundaries and focus/visibility events refresh
  time-sensitive displays without reload, using each schedule's zone.
- IndexedDB stays **v5**: no store/index changes or destructive migrations.
  AI stays **v2** with v1 support. Backup **v3** adds strict profile preferences,
  timeZone in profiles.csv and train_selections.csv; strict **v1/v2** bytes, CSVs,
  CRC, SHA-256 and assets are verified before an in-memory v3 envelope is made.
  Only restore preview defaults a missing legacy profile zone. Whole-profile
  merge priority chooses preferences, imported plan IDs remap with plan families,
  and Clear Data clears selection while keeping time zone and unit preferences.

## Verification

All data tests use uniquely named fake IndexedDB databases; browsers use isolated
contexts. No existing user records were cleared. Test output is ignored under
`node_modules/.tmp/group3-*.log` and `test-results`.

| Check | Actual result |
| --- | --- |
| Build / typecheck / lint / git diff --check | Passed on final source; no large-chunk warning |
| `npm run test:data` | **116/116 passed**, including 8 new Group 3 tests |
| `npm run test:browser -- tests/browser/group3.spec.ts --workers=2` | **8/8 passed**, 34.7s; Edge desktop/emulated phone |
| npm run test:browser:static | Final **312/312 passed**, no skips/failures, 4.8m; plain static root/project mount × Edge desktop/phone |
| Firefox command below | **148 passed / 2 expected static-host-only skips / 0 failures**, 4.9m; production desktop/emulated phone |

Initial data run: 105/108; two obsolete v2 export assertions and a v1 fixture
containing the newly initialized preference were corrected to their proper
version contracts. Initial Group 3 browser run: 0/8, finding the prohibited
read/write transaction inside Dexie liveQuery. Initialization was moved to
startup/selection/restore, leaving snapshots read-only. Next run: 4/8 because
the new test's exact label locator could not resolve the nested profile select;
using its accessible combobox name produced the 8/8 pass above. No runtime error
was waived or assertion weakened to accept failed saves.

First full static run: **307 passed / 5 failed**, 7.4m. Four failures came from an
old test trying to click Week after deliberately canceling navigation; one acted
on the day selector before the async selection dialog closed. Corrected waits and
event-value capture produced **312/312** (4.8m). Review then added a mixed stopped/
completed-schedule guard and data regression; a fresh build and **312/312** (4.8m)
verified that final source. Browser suites run sequentially to avoid the previous
Group 2 trace-output cleanup collision.

Final artifact: **23 files / 2,108,868 bytes**, inventory SHA-256
`383e9335b63ad9c6621f3b1db92c18a113a7c6e861f7890da51a7d9cb8044dea`.
`node scripts/release-audit.mjs` passed with zero findings. The same command with
`--url http://127.0.0.1:4174/` and `/project-check/`, through the existing no-rewrite
static server, returned **23/23 HTTP 200 and exact byte/hash matches at each mount**.
Receipts: ignored `test-results/release-candidate.json` and
`test-results/group3-{root,project}-resources.json`. Entry 275.03 kB / 88.14 kB gzip,
Train 25.98 kB / 8.13 kB gzip; no dependency or configuration change.

Fresh full Firefox command (cached installed browsers, no dependency install):

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/node_modules/.cache/playwright"
node node_modules/playwright/cli.js test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone --workers=2
```

The two skips are the plain-static-host test at the preview origin. Three existing
CDP-only tests per engine viewport are excluded by the established engine config;
the full Edge suite covers them. These are not failed Firefox tests or claimed
physical-device checks. Calendar/card screenshots were visually reviewed in both
themes on desktop/phone, including explicit red overdue text and readable events.

## Remaining owner checks

1. In Settings choose your IANA zone, save and reload. Confirm a new schedule uses
   it and an existing schedule retains its original zone/dates.
2. On a physical phone, inspect month/year navigation, adjacent dates and event
   labels in both themes; focus the lowest inputs with the real keyboard open.
3. Select two plans, open each and use Back to plans. Schedule a finite plan;
   verify overdue/due dates against its shown zone. Open an occurrence, record a
   set, wait for **Draft saved locally**, reload, Resume and confirm exact data.
4. Switch profiles and back; verify isolation. Try backup/photo restore on a
   Blob-capable Safari/iOS device using disposable profiles, preserving originals.

These are not claimed passed: physical phone keyboard/safe areas/download sheets,
screen reader/voice control, Blob-capable Safari photo/restore, actual storage quota,
spreadsheet applications, suspended-device timers and live Ko-fi account content.
Unchanged Windows WebKit Blob probes and capacity benchmarks were not rerun.
No new-candidate production smoke/deployment occurred. Next: **Group 4 Progress
redesign**, only on request; no analytics implementation is included here.

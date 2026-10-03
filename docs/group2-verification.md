# Group 2 — supersets, repeated occurrences and finite duration

Date: 2026-10-03. Implementation and available local acceptance checks complete.
Groups 3–4 were not started. Physical Safari/device checks and release acceptance
remain separate. No dependency installation, staging, commit, push, deployment,
hosting mutation or owner-data clearing was performed by this task.

## Behavior and compatibility decisions

- Repeated library exercises retain separate occurrence UUIDs, prescriptions,
  notes and results. Optional source-library identity is retained, including
  `libraryId` on new plan-copy provenance when known. Historical unknown identity
  is not guessed by name.
- Each day optionally stores groups `{ id, number, restBetweenRoundsSeconds?,
  restAfterGroupSeconds? }`; occurrences reference `groupId`. The ID is stable,
  while the positive display number is unique only within that day. Groups need
  at least two contiguous members at save. Incomplete editor groups are allowed
  temporarily and produce specific validation errors.
- Joining collects members at the group's first displayed position immediately.
  Inner movement reorders members; crossing a group's outer boundary moves the
  entire block. A cross-day move becomes standalone. Renaming a group preserves
  its ID. Dissolution/member removal preserves remaining prescriptions; a lone
  member must be joined or dissolved before save. Plan duplication creates new
  day/group/occurrence IDs and retains copied prescriptions/provenance.
- Train uses the editor's block/member order. Rounds run to the largest member
  set count, with shorter members absent from later rounds. Targets and actual
  notes/results remain keyed to individual occurrences. Group rest replaces
  member rest during execution: unspecified permits manual seconds, zero is
  explicit no timed rest, positive values use the single persistent timer.
  After-group rest appears only when another block follows. Original standalone
  rest prescriptions remain saved and return when the group is dissolved.
- Existing autosave/Clear/partial and full Save/idempotency/revision checks remain.
  Draft and completed-session day snapshots include groups, order, prescriptions
  and rests. Later source edits do not mutate them. Read-only history shows rounds;
  no analytics or Group 3 plan-card selection was introduced.
- New plans require positive whole duration in weeks, with no invented default.
  A legacy plan with absent duration remains unbounded when edited without an
  explicit duration. Duplicating one creates a new plan and requires duration.
- New schedules freeze duration and inclusive end date, calculated using civil
  dates from the selected Monday. Two weeks from 2024-12-30 ends 2025-01-12.
  Prescription refresh/plan edits do not change that boundary. **Review plan
  duration** offers a separate preview/confirmation, anchored to the original
  start week and effective from a chosen future Monday. Ordered duration changes
  preserve earlier missed dates. Started/completed exceptions remain visible
  even beyond a new boundary; an end date never completes missed workouts.
- IndexedDB remains **v5**: optional nested data requires no new index or migration.
  Populated-store reopen tests preserve original records and photo bytes. No
  upgrade defaults, replacement database or destructive recovery were introduced.
- AI output is **v2**, with strict nested superset/duration validation and local IDs.
  **v1 remains supported**; its plan preview requires the owner to enter duration.
  Single-workout v1/v2 input remains supported. Missing values stay distinct from
  zero. Preview cancellation, atomic import/tag rollback and owner/retry protection
  use the existing services.
- New backups are **v2/database v5**. Canonical JSON, linked group and duration CSVs,
  snapshots, strict validation and whole-family restore all carry the new data.
  Original v1 exports use their frozen strict field/CSV contract. ZIP CRC/limits,
  SHA-256 inventory and original assets are verified before a validated v1 payload
  receives an in-memory v2 envelope. Absent duration/groups stay absent; source ZIP
  bytes are unchanged. Both whole-family merge priorities and root ID remapping
  preserve groups/results together. See [backup-format.md](backup-format.md).

## Actual verification

All tests use generated test database names or fresh browser contexts. Existing
owner records were not cleared. Windows WebKit's previously established native
Blob limitation was not reprobed without an environment change.

| Command/check | Result |
| --- | --- |
| `npm run build` | Passed; no large-chunk warning |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, including after final fixture edits |
| `npm run test:data` | Final **108/108**, no skips/failures; 11 new Group 2 tests |
| `npm run test:browser:static -- tests/browser/group2.spec.ts --workers=2` | Initial **8 passed / 8 failed** due to new tests treating existing theme buttons as a select; corrected theme/restore selectors, then **16/16 passed** |
| `npm run test:browser:static` | Final production bundle: **296/296**, no skips/failures, 4.4m; root/project subpath × Edge desktop/emulated phone |
| Firefox command below | **138 passed / 2 failed / 2 expected static-host-only skips**, 5.3m; two trace cleanup ENOENT errors caused by concurrent development-run output cleanup |
| Same Firefox command with `--last-failed`, with other suites stopped | **2/2 passed**, 9.4s; no source/test change needed. Combined evidence, not a newly claimed full 140/140 run |
| `npm run test:browser -- tests/browser/group2.spec.ts` | **8/8**, no skips/failures, 27.3s |
| `node scripts/release-audit.mjs` | Passed; 23 files, zero findings |
| `node scripts/release-audit.mjs --url http://127.0.0.1:4174/` and same with `/project-check/` | **23/23 HTTP 200 + exact byte/hash matches at each mount**, using the existing plain static server without rewrites |
| `git diff --check` | Passed; LF/CRLF notices only |

Firefox command (PowerShell, existing cached installation):

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/node_modules/.cache/playwright"
node node_modules/playwright/cli.js test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone --workers=2
```

Do not run a default-output development suite concurrently with nested static/
engine output directories: Playwright cleans `test-results` at startup. Use
separate non-overlapping output directories or run sequentially. CDP-only cases
remain excluded by the existing Firefox configuration and are covered in Edge.

Earlier data runs are not hidden: the first sandboxed invocation could not spawn
Node workers (`EPERM`); the authorized rerun had **95 passed / 2 failures** because
older creation fixtures omitted newly required duration. Updating those fixtures
and adding Group 2 coverage yielded **108/108**. Extending the remap fixture later
produced **107 passed / 1 failure**: the fixture changed sourcePlanId but forgot the
derived activeSourceKey. Correcting that fixture yielded the final **108/108**.

Coverage includes repeated standalone/group copies; two independent groups and
three-member rounds; differing reps/RIR and unequal counts; zero/missing rest;
group renumber/move/dissolve/duplicate; input retention; reload/timers/notes;
partial/full/idempotent Save and Clear; frozen history; stale writes/rollback/
profile isolation; first/last weeks, Sunday/Monday, New Year and both DST changes;
legacy unbounded records and AI; populated v5 reopen; v1 archive integrity before
conversion; v2 export/restore with duration history; both family merge priorities
and name-match root remapping. Existing full navigation/profile/exercise/backup/
restore regressions pass. Dark/light 320px group-editor and training screenshots
were visually inspected; overflow checks passed. This does not verify physical
keyboards, assistive technology or real device suspension.

## Candidate and repository state

Final artifact: **23 files / 2,099,946 bytes**; inventory SHA-256:

`dd8b25b6231d48ff56c387b7fd5b2bdfde68a151c9c7c0bc84ca711c7bf4bd95`

Entry `index-D8_G7pG4.js`: **274.38 kB / 88.04 kB gzip**; shared calendar module
**166.07 kB / 49.00 kB gzip**; export/import workers **201.36/204.68 kB**;
Create **50.52 kB**, Train **21.23 kB**, Calendar **16.43 kB**, CSS **19.82 kB**.
Receipts: ignored `test-results/release-candidate.json`,
`group2-root-resources.json`, `group2-project-resources.json`.

The repository was dirty at entry. An external commit appeared during work:
`40e5c74d3e94dcdbadf6b82e955aceb5a0ae2eae` (“https fixed, first full deployement”).
It was preserved. The candidate identifies that HEAD **plus the working tree**;
this agent did not create the commit or publish any artifact. Dependency pins,
Vite base, CNAME/deploy mechanism, favicon, PNGs, UUID compatibility, Support and
single-address navigation were preserved. `npm ls --depth=0` succeeded with the
installed setup; no install/upgrade was performed.

## Owner check and remaining boundaries

Use a disposable profile on a trusted local build or a separately authorized
deployment; do not clear existing data.

1. Create Squat, Row and Press. Create a plan with **Duration (weeks) = 2** and one
   day containing Squat twice, then Row and Press. Leave the first Squat standalone;
   enable Superset 1 on the second Squat, Row and Press. Give those members 3, 2 and
   1 sets with different reps/RIR, group rest 30 seconds, then save/reopen.
2. Train it. Enter different weights for the two Squat occurrences and a note on
   only the grouped one. Check that rounds contain 3, 2, then 1 member. Start REST,
   reload/resume, then save partial or complete results and review the group.
3. Add the plan to Calendar on a Monday; confirm the preview ends on the second
   Sunday. Check no ordinary occurrence appears in week 3. Change the plan to one
   week: the saved schedule must keep its original end until **Review plan duration**
   is previewed and confirmed. Started sessions and earlier missed dates must remain.
4. Export an original ZIP, import under a new profile name, reload and compare the
   repeated occurrences, groups, session notes/results and schedule boundary.

Owner reports **HTTPS resolved and the site fully working on 2026-10-03**. This
supersedes the old blocker claim, but supplies no new independent certificate/SAN/
secure-context/mixed-content capture or verification of this changed candidate.
No warning bypass or hosting change occurred here. Live Ko-fi account content,
photo-backed Safari/WebKit round trip, physical phones/keyboards/download sheets,
screen readers/voice control, real quota, spreadsheets and suspended timers remain
unverified as listed in the [owner checklist](release-preparation.md#current-owner-checklist).
Prior capacity observations were not rerun or generalized to the new group UI.

Next implementation group: **Group 3**, only when requested—Calendar month view,
profile time-zone preference and active-plan Train flow. Group 4 analytics remains
later work. Phase 10 and full release acceptance are not marked complete.

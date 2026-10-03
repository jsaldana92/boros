# Group 4 — Progress redesign

2026-10-03. Group 4 is complete in the available local verification environments. This does not declare the overall release complete. Starting HEAD:
`c0411389b355abcc192dbf77c794f9f96cb9e662` (`group 3 updated`), initially clean.
No dependencies, hosting configuration, canonical schemas, or existing records
were changed. No commit, push, publication, or owner-data clearing was performed.

## Views and controls

Progress has Body weight, Plans and Workouts sections. Body weight uses a graph,
selected-entry details and existing guarded add/edit/delete/photo flows instead
of a visible history/debug list. All measurements remain stored and selectable.
Numeric weight ticks use the profile unit; date ticks are angled. Points retain
their actual coordinates, including exact overlaps. Click a point, focus the
graph and use arrows/Home/End, choose its labeled selector option, or use
Previous/Next point. The selector numbers distinguish otherwise identical entries.
Every point is retained; none are jittered, averaged, sampled or replaced.

Plan cards scroll horizontally, with touch, Tab/Enter and Previous/Next controls.
Archived plans with sessions and historical-only plan snapshots remain available.
Plan drill-downs show counts, current/historical exercises and supersets, and saved
session review. The alphabetical Workouts grid has three columns, reducing to two
below 341px. Long names wrap. Separate superset member sections have their own
statistics, chart and selected-session review, including original results/notes.
Visible Back actions remain within Progress and never change the address.
Train retains its existing saved-session entry point and shares the review UI.

Charts use the existing SVG/browser tools, with theme-specific colors. Exercise
identities sorted by stable key choose a consistent five-color cycle across plan
and all-plan views. Labels/sections/point selectors always identify the data;
color is supplementary and can repeat in larger catalogs. No third-party chart
dependency, request, or automatic photo loading was added. Photos load only for
an opened viewer/editor, with existing ownership checks and object-URL cleanup.
The optional additional weight/reps/date graph is **deferred**; required load/date
graphs expose reps and performance context through point selection.

## Identity and analytics definitions

- The reader takes an explicit profile ID, reads that owner's plans, library and
  completed sessions in one read-only transaction, and verifies the owner exists.
  Pure reusable selectors defensively filter ownership too. No drafts enter the
  analytics. Statistics are derived, never saved or exported as duplicate values.
- A library source ID, or a plan-copy source's explicit library ID, identifies a
  shared exercise. Without that, an explicit source plan/day/occurrence tuple is
  used; otherwise the snapshot's own plan/day/occurrence tuple is used. Names
  never identify or join exercises. Current library names label known identities,
  so renaming/archiving cannot detach history. Unlinked same-name occurrences
  remain separate choices labeled by plan/day/exercise position.
- We do not chase today's mutable plan to infer absent legacy library provenance.
  That could attach a historical snapshot to a newly edited source. Explicit
  plan-copy tuples can share with their unlinked originating occurrence, but
  unknown library links remain unknown. Historical records are never rewritten.
- A superset key is the ordered array of member exercise identities, preserving
  multiplicity. Local group UUID/number and names do not define a cross-plan
  identity. Identical reliable compositions can aggregate; A+B, B+A, A+A and A+C
  stay distinct. Each member's graph filters by this composition AND position,
  preventing repeated members from being counted twice in either member panel.
  Historical membership comes only from the saved session snapshot.
- Training days completed = distinct scheduled occurrence keys plus distinct
  unscheduled session IDs. Saved partial sessions count; their marker remains
  available in lists, statistics, graph selections and session review. Exercise
  completions = performed session exercise occurrences with at least one actual
  recorded set. Superset members count individually, never again as a group.
  Wholly skipped occurrences and drafts contribute no performed work.
- Chronology uses actual `completedAt`, then lexicographic session ID for equal
  instants. Occurrences retain snapshot order and sets retain recorded index.
  Starting/latest show ALL recorded sets of ALL matching occurrences in the
  first/last qualifying session. Equal-time sessions remain separate, inspectable
  sessions with deterministic first/last selection. Scheduled dates, targets and
  logging/import timestamps are never substituted for actual completion.
- Min/max compare canonical `weightKg` for every actual set. Equal extrema choose
  the first chronological match, then occurrence order, then set order; reps/date
  come from that exact set. Zero load/reps remain legitimate values; skipped or
  absent results do not become zero. Every set contributes once per exercise
  view. Superset members can additionally be inspected through their own panels,
  without adding group totals to exercise counts.
- kg/lb displays convert canonical values using the existing conversion helper;
  unit changes never rewrite historical entered loads/units or canonical values.
  Scheduled sessions display actual completion in their stored schedule zone.
  Unscheduled sessions have no saved zone field: display uses the current profile
  zone (UTC fallback), without claiming that it was the original recording zone.
  Body chronology remains `measuredAt`, preserving the existing tied-ID latest
  measurement rule and saved measurement date context/explicit legacy UTC.
- Dexie subscriptions recompute on owned source changes. Selection uses IDs
  resolved against current query results. Missing selections are invalidated;
  profile switching remounts the workspace, and restore/Clear ownership retirement
  makes old readers fail closed. Existing editors keep failed input, but their
  existing owner/revision checks prevent writing to a replacement or other profile.

## Compatibility

Database **v5**, backups **v3** (strict v1/v2 imports retained), AI **v2** remain
unchanged. No new stores, persisted analytics or migration. Existing ZIP CRC,
SHA-256 and asset validation remain mandatory. Historical Group 1–3 and Phase
handoffs remain unchanged. The owner-reported HTTPS resolution is not reopened
or represented as a new published-version check.

## Verification

Tests use only unique fake databases or disposable browser contexts.

| Command/check | Actual result |
| --- | --- |
| `npm run build` | Passed; Vite 8.3.2 / TypeScript checks; no large-chunk warning |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero findings |
| `npm run test:data` | **122/122**, no skips/failures; six new analytics/restore tests |
| `npm run test:browser -- tests/browser/group4.spec.ts --workers=2` | **8/8**, 26.8s; new empty/single/equal-axis assertions subsequently included in the full static run |
| `npm run test:browser:static` | Final **328/328**, no skips/failures, 5.5m; root/project-subpath × Edge desktop/emulated phone |
| Firefox production suite below | **156 passed / 2 expected static-host-only skips / 0 failures**, 6.0m; desktop and emulated phone |
| Capacity command below | **1/1**, 18.1s |
| `node scripts/release-audit.mjs --url http://127.0.0.1:4174/` and same with `/project-check/` | **25/25 HTTP 200 and exact byte/hash matches at each mount**, zero audit findings, existing plain static server without rewrites |
| `git diff --check` | Passed; LF/CRLF notices only |

Firefox command uses the existing cached installation, with no install:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/node_modules/.cache/playwright"
node node_modules/playwright/cli.js test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone --workers=2
```

Static and engine outputs are separate directories; no default-output suite
was started while either was running. Existing engine configuration excludes
three CDP-specific cases per viewport, which the Edge static suite covers.

Candidate: **25 files / 2,124,374 bytes**, inventory SHA-256
`6fa948c549f0162b9cb75c010e612d4ef0413cc53947ee60433af03e844d7a12`.
Entry chunk **275.10 kB / 88.19 kB gzip**; Progress **24.23 / 8.02**;
shared session review **3.58 / 1.41**. Ignored receipts:
`test-results/group4-root-resources.json`, `test-results/group4-project-resources.json`.
Screenshots under `test-results/static/group4-*` cover body light, member dark,
and 320px enlarged-text layouts. Phone body/member screenshots were also visually
reviewed. Required styles use theme tokens; keyboard graph/selector access, card
navigation, Back focus, dialogs and fixed-nav clearance have automated checks.

The initial full static run passed **320/324**: four restore-photo checks still
expected a photo action from the removed full measurement list. They now select
the dated entry before opening its photo. Initial new browser fixtures also
needed the existing Import choice select addressed by role and the Archive
confirmation scoped to its dialog. Focused reruns passed. The first added
backup-comparison test compared an omitted JSON property with an in-memory
`undefined` property; canonical field comparison fixes that test expectation.
These failed attempts are retained here rather than represented as passing runs.

### Representative larger profile

`node node_modules/playwright/cli.js test --config playwright.capacity.config.ts`:
**1/1 passed**, 18.1 seconds overall (15.2-second test). Existing dataset reused:
100 library exercises; 20 four-day plans; 5 schedules; 500 completed sessions and
500 finalized drafts; **1,500 actual sets**; 730 measurements; 12 synthetic
1280×960 JPEG photos. There are 180 selectable exercise identities (100 library
plus 80 independent plan occurrences); one performed identity spans 25 sessions
and **75 sets**, all plotted/selectable. All 730 body points/options were checked.
Charts read **zero photo records**. No records or extrema were sampled away.

Single observed Windows run: Edge 154.0.4258.53, Ryzen 5 3600, 16 GiB RAM.

| Operation | Observed milliseconds |
| --- | ---: |
| Settings reload | 438 |
| Train / 500 saved sessions | 1036 |
| Create / 100 exercises + 20 plans | 491 |
| Exercise filter | 111 |
| Progress / 730 measurements | 1079 |
| Select a measurement | 246 |
| Open 75-set workout statistics/graph | 151 |
| Select a recorded set | 71 |
| Back to 180 workout choices | 213 |
| Calendar week / month | 598 / 61 |
| Export | 1126 |
| Validate upload / preview / commit restore | 2774 / 470 / 209 |

Photos are 866,319–867,278 bytes each, unchanged from the representative generator.
ZIP **10,835,707 bytes**, expanded inventory **15,960,728 bytes**. The round trip
and oversized-file rejection passed. This is one observation, not a statistical
benchmark, quota test, phone measurement or unlimited-capacity guarantee. No
performance optimization or new dependency was justified by this run.

## Remaining owner checks and next step

Physical phones/keyboards/safe areas/download sheets; actual screen reader/voice
control; Blob-capable Safari/iOS photo and restore; live Ko-fi account content;
real quota exhaustion; spreadsheet applications; and suspended timers remain
unverified. The established Windows WebKit native IndexedDB Blob limitation was
not rerun without an environment change. Automated phone views do not establish
physical-device or assistive-technology acceptance.

Owner check:

1. In Progress, add two weights, select each by graph/selector, edit the latest,
   and confirm Settings follows it. Cancel and then confirm deletion; verify the
   remaining weight and an optional photo. Overlapping entries remain selectable.
2. Record different sets for one library exercise in two plans. Compare its
   per-plan statistics with Workouts' across-all-plans statistics, including all
   starting/latest set pairs and the selected set's session notes.
3. Open a superset and inspect each member's separate results and graph. Use Back,
   switch profiles, and reload; the address stays unchanged and histories stay
   separate. Repeat in both themes on the actual phone and with a screen reader.

Next: integrated verification of Groups 1–4 and the final published-version smoke
test. Publication remains a separate owner action.

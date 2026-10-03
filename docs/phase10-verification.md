# Phase 10 verification record

Date: 2026-10-03. Status: **Verification pending**. The original sections record
local Phase 10 production verification. The closeout below adds Phase 11 preparation
evidence; neither establishes acceptance of the newly published boros-app.com app.

## Scope and isolation

The pre-change baseline passed build, typecheck, lint, 90 data tests and production
Edge desktop/phone: 118 passed, two static-host-only skips. Existing suites already
cover validation, zero/optional values, duplicate names, stale writes, failed and
pending autosaves, simultaneous saves, weekly/DST boundaries, partial/late sessions,
whole-family merge precedence, cancellation, restored ownership and rollback.
Phase 10 adds a cross-feature UI journey, a native engine storage probe, chunk-load
failure recovery, and a measured larger-profile experiment rather than duplicating
those service tests.

Every browser test uses a fresh Playwright context. Node fixtures use random
`boros-test-*` databases and delete only those fixtures. No existing user database
was cleared. No deployment, staging, commit, push or dependency upgrade was run.
The user's package.json/package-lock.json changes, exact gh-pages 6.1.1 pin,
predeploy/deploy commands, CNAME handling and relative Vite base are preserved.

## Integrated journey

`tests/browser/journey.spec.ts` creates a named workspace from Guest (same ID),
a second independent profile, a heterogeneous three-set library exercise and a
manual four-day plan. It schedules, records lb loads including zero, RIR, rests and
plain-text notes, saves a late completion, checks the subsequent week, edits the
library and plan, and imports/edits/schedules/trains an AI plan through the same UI.
It adds a JPEG measurement and exports a still-unfinished scheduled training draft.
After a new-name restore and reload, canonical exported data is compared in full
(only owner ID and requested profile name/nameKey normalized), as are image bytes.
It resumes the unfinished `12.` input, checks the saved note/photo, and corrects,
changes units and deletes the restored measurement while checking Settings/Progress.
The untouched neighbour's canonical backup stays identical.

Production requests are recorded throughout. The only external request is the
explicit tutorial click, intercepted locally by the test. No records or images go
to an application backend, analytics or AI provider. This verifies opening behavior,
not a live YouTube destination. Blank Support remains disabled; no Ko-fi URL was
invented. Live Ko-fi remains an owner check.

## Focus and loading changes

- WebKit pointer-clicked buttons did not become the active element, so dialog
  cleanup returned focus to the previous input. The shared shell now focuses the
  invoking button before its action, preserving keyboard and dialog behavior.
- WebKit could position a focused training field beneath fixed actions despite
  CSS scroll margins. The shell checks focused controls against the actual action
  bar/navigation and visible viewport, scrolling an obscured control into view.
- Screens load on demand with a visible loading state and a recoverable error
  boundary. Only a screen that commits successfully updates the remembered screen.
  Shell navigation remains usable after a chunk failure. No URL or DB schema change.
- The entry chunk decreased from 579.11 kB / 174.39 kB gzip to 274.60 kB /
  88.01 kB gzip (final cleanup: 274.59 kB). Shared/route chunks are additional downloads: the entry size is not
  the total startup transfer. Largest shared chunk is 165.01 kB; route chunks range
  from 11.59–43.26 kB. Workers remain 197.72 and 200.83 kB. Vite's >500 kB warning
  is resolved without raising its threshold.
- Test corrections wait for an opened screen before browser Back/reload and
  explicitly scroll an already-focused Save button after resizing the viewport.
  Cross-engine cold-start assertions allow ten seconds. Storage fixture errors now
  include the failing request's error instead of rejecting with a null transaction error.
  Fixtures wait for Settings to open before reloading. The browser-exit check uses
  page-initiated navigation: Firefox's driver-level goto can remain pending after
  an unload cancellation, consuming the test timeout despite preserving input.
- Removed unused @hookform/resolvers, react-hook-form and date-fns offline, including
  their unused @standard-schema/utils transitive dependency. No versions were upgraded.
  The concurrently added index.html/favicon edits were observed and left intact.

## Larger profile observations

Command: `node node_modules/playwright/cli.js test --config playwright.capacity.config.ts`.
Environment: Windows, Edge 154.0.4258.37, AMD Ryzen 5 3600 (6 cores), 16 GiB RAM,
1440×1000 viewport, one worker, localhost production preview; no CPU/network throttle.
These are single-run wall-clock UI observations including Playwright waiting, not
statistical benchmarks or a supported maximum.

Counts: one disposable source profile, 100 exercises, one tag, 20 four-day plans,
five recurring schedules, 500 finalized drafts and corresponding sessions, 730
measurements, 12 separate 1280×960 JPEG assets. The images are deterministic textured
synthetic images at photographic dimensions/byte sizes, not photos of real people.
JPEG bytes: 866662, 866739, 867067, 867116, 867278, 866319, 866399, 867148,
866465, 867072, 867240, 866526. ZIP: **10,835,125 bytes**; inventoried expanded
payload: **15,957,150 bytes** (manifest additionally occupies space).

| Observed action | Initial measured milliseconds |
| --- | ---: |
| Settings reload | 439 |
| Train with 500 sessions | 925 |
| Create with 100 exercises / 20 plans | 513 |
| Filter exercises | 103 |
| Progress with 730 measurements | 1391 |
| Calendar week | 895 |
| Calendar month switch | 69 |
| Export through download event/read | 1386 |
| Upload validation | 3023 |
| New-name restore preview | 650 |
| Restore commit through success notice | 219 |

The final follow-up passed **1/1**, with zero photo-record reads while opening
Progress, a rendered month bounded to 42 days, and a >64 MiB file rejected before
reading or changing selection. Its ZIP was **10,835,108 bytes**, with identical image
sizes and expanded payload. Follow-up milliseconds, in the table's order:
**452, 923, 493, 82, 1281, 991, 92, 1269, 3024, 490, 331**. Small ZIP-size variation
reflects fresh random record IDs/export metadata. Archive structural/expanded/photo limits and rollback are
also covered by data tests. The file-size UI check uses a synthetic oversized File;
it is not real quota exhaustion. The complete profile is retained in memory for
export/restore. History rendering is still proportional to the history size; no
pagination, photo compression, disk streaming or unlimited-capacity claim is added.
An export can exceed importer limits; that pre-existing limitation remains explicit.

## Cross-engine blocker

Firefox 155 and Windows WebKit 26.6 were installed only as Playwright engine binaries
under ignored `node_modules/.cache/playwright`. Edge supplies the Chromium engine.
WebKit automation here is **not** Safari on a physical iPhone or macOS.

Windows WebKit rejects even a direct native IndexedDB Blob put, independently of
React, Dexie or Boros: `UnknownError: Error preparing Blob/File data to be stored in
object store`. Native text and Uint8Array puts succeed. The minimal reproducible
test is `tests/browser/storage-engine.spec.ts`; it deliberately remains a failure
on that engine rather than silently skipping photos. Photo profile/measurement
saves and photo-bearing restores therefore cannot pass there. The UI retains input
and reports the failure; it does not report a committed save. No schema/storage
workaround was introduced for this test-engine limitation.

The initial broad cross-engine run had 185 passes, four static-only skips and 47
failures. These included native Blob failures, the focus defects above and test
timing/scroll assumptions. After the focus changes, the focused WebKit exercise,
calendar, Settings return, plan conflict, training spacing and failure/retry checks
passed **12/12** across desktop/phone viewports. Final-build WebKit navigation also
passed **18/18**; the independent native Blob probe failed **2/2**, as documented.
Final applicable suite totals are
recorded in the current TODO.md handoff. Three tests that use Chromium's CDP timezone
override remain in Edge coverage and are excluded from the other-engine configuration.

To reproduce other-engine checks in PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/node_modules/.cache/playwright"
node node_modules/playwright/cli.js install firefox webkit
npm run build
node node_modules/playwright/cli.js test --config playwright.engines.config.ts --workers=2
```

The full command currently includes the known Windows WebKit Blob failures. A
passing subset must not be described as a passing full WebKit suite. Complete the
photo/restore journey in a Blob-capable WebKit/Safari environment before closing
Phase 10. Do not repeat the unchanged failing Windows probes expecting a different
result. The single current owner checklist is in
[release-preparation.md](release-preparation.md#current-owner-checklist); the earlier
TODO.md checklists are retained as historical handoff records.

## Release-preparation closeout — 2026-10-03

No application/storage/routing/dependency changes were needed in this preparation.
The earlier focus/visibility bugs have implemented fixes and regression evidence;
the native Windows IndexedDB Blob failure remains an environment blocker. No
Blob-capable WebKit/Safari environment was available (WSL not installed, Docker
absent, no physical macOS/iOS or remote provider), so those known failing probes
were not rerun or skipped to claim a pass. Phase 10 stays **Verification pending**.

The build includes concurrent owner favicon/logo/snake work, preserved untouched.
Its inventory fingerprint and exact output sizes are in release-preparation.md;
all application chunk filenames remain the same as the prior final build. Existing
focused WebKit and larger-data results above are reused on that basis, not described
as fresh executions. New local audit/HTTPS comparison tooling and documentation do
not change the application bundle, database v5 or backup schema 1.

Fresh checks: `npm run build`, `npm run typecheck`, `npm run lint` passed;
`npm run test:data` **90/90**; `npm run test:browser:static` **252/252 in 3.3m**.
No static suite skips or failures. This full final-build run supersedes reliance
on an earlier build for current root/project functional verification. All 22 output
resources, lazy chunks and workers returned 200 and matched SHA-256 under both
mounts using `node scripts/release-audit.mjs --url http://127.0.0.1:4174/` and the
same command with `/project-check/`. A deliberate wrong preview path correctly
returned failed comparison/exit 1. The local audit's initial sandboxed invocation
could not spawn read-only Git (`EPERM`); the authorized subprocess rerun passed.

The full final-build Firefox desktop/phone command passed **118 tests / 2 expected
static-host-only skips in 3.6m**, with no failures. Command (using the existing cached
binaries): `$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/node_modules/.cache/playwright"`,
then `node node_modules/playwright/cli.js test --config playwright.engines.config.ts
--project=firefox-desktop --project=firefox-phone --workers=2`. This supersedes the
earlier partial Firefox run/targeted correction for current coverage. Its three
CDP-only timezone scenarios remain excluded by the existing engine configuration
and covered in Edge; static-host tests skip on preview. Physical phone keyboards,
save/share sheets, actual AT, quota exhaustion, spreadsheet applications and
background-device behavior remain unverified. No owner's data was cleared.

Public-origin readiness is separate: isolated Edge and Node rejected the custom
domain's certificate hostname. The public deployment branch has CNAME/nojekyll but
a different entry artifact. No live candidate startup/round-trip was therefore
claimed. Missing Ko-fi configuration retains unavailable Support. Details and
owner-only release/smoke instructions: [release-preparation.md](release-preparation.md).

## Subsequent owner revisions — Group 1

The preparation totals above are historical. Group 1 changes application ID
generation, compatibility errors, Support configuration, header/layout and display
dates, so its new artifact has separate verification in
[group1-verification.md](group1-verification.md) and the latest TODO handoff.
The older asset fingerprint and full-browser results alone cannot verify that
changed artifact. Phase 10 still awaits photo-backed restore in Blob-capable
WebKit/Safari; unchanged Windows native Blob probes were not rerun. The owner now
confirms the production page is HTTPS loaded through a certificate warning bypass,
consistent with the independently observed hostname mismatch, not a claim that
the owner was simply visiting HTTP. No warning was bypassed in our checks.

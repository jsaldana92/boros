# Analysis CSV, notes, instructions and retained timing — 2026-10-10

Implemented locally; automated results below are distinct from pending owner/device
acceptance. No commit, push, deployment, dependency, hosting, manifest or service
worker change. Tests use disposable fake IndexedDB databases or isolated Playwright
contexts; no owner records were accessed or cleared. Earlier verification records
and unresolved production-persistence investigation remain historical evidence.

## Changes and contracts

- Settings separates Data CSV, Profile Backup ZIP, Restore Profile from Backup,
  and existing Clear Data, with requested copy, dividers and distinct accessible
  Download names. ZIP checksums, photo validation, restore choices, atomicity,
  stale-write checks and Clear Data confirmations remain in place.
- Flat CSV contains one row per Strength set or Interval exercise execution,
  original prescribed order, historical text, independent effective notes, canonical
  weight conversion, explicit outcome/unknown/zero distinctions and UTC time basis.
  Snapshot is read-only, profile-scoped and excludes photo blobs. Formula protection,
  escaping, confirmation/cancel, empty history and recoverable failures are covered.
- Independent copied notes and explicit-clear provenance initialize new sessions
  from compatible saved branch history. Shared current instructions resolve by
  stable canonical source identity; started and historical snapshots stay frozen.
  Nested instruction edits direct users to the base library editor. AI v8 remains
  strict, with explicit instruction conflict review and visible first-copy defaults.
- Stop resets only the Interval cursor. Separate attempt/phase records retain
  actual active/recovery time through restarts, checkpoints, reload and finalization.
  Pause/rest/Warm Up/closed-app time is excluded. Clear/cancel can discard unsaved
  activity; retained activity participates in recovery and discard protection.
- Stable `boros` database **v13** has no store/index/record rewrite. Backup **v19**
  includes provenance, plan-note snapshots and timing ledger in authoritative JSON,
  plus additions to existing 40 CSV tables. Frozen v18 and older validators check
  original contracts/checksums before promotion. AI stays **v8**.

Detailed contracts: [analysis-csv.md](analysis-csv.md),
[backup-format.md](backup-format.md), [ai-formatting.md](ai-formatting.md).

## Performed checks

| Command/check | Actual result |
| --- | --- |
| `npm run build` | Passed; TypeScript and Vite production output. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run test:data` | **321/321 passed**, no skipped/canceled tests. |
| `npm run test:browser:static -- analysis.spec.ts backups.spec.ts restores.spec.ts imports.spec.ts` | **80/80 passed** in Edge at `/` and `/project-check/`, desktop and phone widths. |
| `npm run test:browser:static -- train-runtime.spec.ts interval-repeat.spec.ts workout-actions-rest.spec.ts plans.spec.ts workout-library.spec.ts plan-content.spec.ts --project=root-desktop --project=project-phone` | **72/76 passed** initially; four old checks needed the newly required retained-activity restart confirmation. |
| `npm run test:browser:static -- interval-repeat.spec.ts workout-actions-rest.spec.ts --project=root-desktop --project=project-phone` | **26/26 passed**, including all four corrected checks. No application changes were needed after the 80-check run. |
| `git diff --check` | Passed. |

Fourteen focused data tests cover copied defaults/branches/clears, full ordered
Strength signatures and missing-versus-zero RIR, Interval signatures, source/profile
isolation, canceled drafts, immutable shared-instruction history, deleted-source
fallback, added/swapped exercise defaults, attempt timing, pause/Stop/restart/reload,
stale retry and finalization idempotence, CSV phase order, skips/manual outcomes,
historical text and unit conversion, independently parsed CSV, AI atomic conflicts,
original-v18 ZIP promotion and v12-to-v13 preservation across every store/photo bytes.
The existing data suite additionally exercises merges, deletion, restore, publication,
calendar, measurement, profile and timer ownership behavior.

New browser checks independently parse four-set CSV downloads, inspect ZIP JSON,
reject CSV restore, assert section order/exact copy/dividers/accessible names, exercise
light-theme mobile spacing, retain a stopped fractional Interval through reload and
save four separate execution rows, edit an Interval exercise note, verify empty/cancel/
worker-error/profile-switch behavior, and resolve AI instruction conflicts before
any writes. Existing backup/restore checks cover photos, conflicts, native browser
storage, other profiles/tabs, cancellation, rollback and Clear Data safeguards.

The Settings phone-width light screenshot was visually inspected. Captures are in
`test-results/analysis-closeout/` (ignored generated artifacts). Static hosting has no
SPA rewrite fallback. This does not prove native phone download/share sheets.

Intermediate runs are not hidden: the first data passes exposed expected-version,
fixture and nested-transaction regressions; these were fixed without weakening old
backup contracts. Data reached 317, then 319 passing; the final extra phase-order test
initially addressed the untouched circuit after timer reordering, was corrected to
its stable exercise identity, and the full 321 passed. Browser runs were 67/76, then
76/80: fixes waited for committed navigation/start before reload/clock advancement,
updated restore fixture version expectations and used the correct labeled select
role. The unchanged final application passed all 80. Raw local logs:
`.analysis-data-final.log`, `.analysis-browser-final.log`,
`.analysis-browser-regression.log`, `.analysis-browser-timer-final.log`. The broader
regression follow-up now explicitly cancels a restart and verifies unchanged retained
activity before confirming another attempt. It also confirms restart when switching
themes after performed activity. All 156 distinct checks from the affected browser
suites are covered by passing results; 26 were rerun, not additional distinct checks.

## Still unverified / exact owner checks

Use a disposable profile, keep the real profile intact, and retain a ZIP backup.

1. Create an exercise with a default note, add matching copies to two workouts in
   one plan, and also add it twice to a standalone workout. Save distinct notes in
   the repeated standalone entries. Reopen each branch: matching plan branches may
   carry across workouts, standalone entries retain their own notes. Change one
   rep/RIR target and confirm it does not inherit the incompatible plan note. Clear
   a note, save, and verify it stays empty on the next performance.
2. Start a session, then edit the source exercise/workout instructions in Create.
   Confirm the current preview and next new session show the update while the
   started session and saved history retain their original instructions.
3. Start an Interval with repeats. After Warm Up, stop partway through an exercise,
   reload, restart and pause/resume. Save the partial session. Download Data and
   check separate execution rows, fractional active/own recovery time, known zeros
   for unstarted executions and no added paused/rest time.
4. In Settings, use Data → Download and Profile Backup → Download. Confirm CSV and
   ZIP respectively reach your device's downloads. Restore only the ZIP into a
   disposable new profile and check notes, saved activity and photos.
5. Open the CSV in your actual Excel/Numbers/LibreOffice workflow. Check UTF-8 text,
   commas/quotes/multiline notes in single cells, decimal units, separate sets and
   repeats, `None`/`NA`/zero/`Skipped`, and formula-like notes rendered as text.

Physical phone/Home Screen/lock-screen/music/Bluetooth and native file-sheet tests,
Safari, real screen readers, spreadsheet application import and live Ko-fi are not
claimed passed. No new Firefox verification was performed for this change; earlier
Firefox results remain specific to their recorded revision. Prior destructive
Stop/Reset activity and missing old note/instruction provenance cannot be recovered
or invented. Legacy unknown timing stays `None`, not zero. Timer time is recorded
timer activity, not proof of physical movement. The production data-loss report is
not declared fixed by isolated upgrade or browser tests.

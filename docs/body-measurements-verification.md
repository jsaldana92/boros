# Body measurements, dates, exports and exercise controls

Implemented locally on 2026-10-13. Available automated checks pass; physical-device
acceptance remains pending. This record supersedes current measurement behavior
in older handoffs without changing their historical verification claims. Phase 10
remains Verification pending and Phase 11 In progress. The separate reported
production persistence incident remains unconfirmed, not fixed by this update.

## Behavior and compatibility

- Progress renders Body weight, Body fat, then the existing sections. Both reuse
  the existing fixed-axis/scrollable chart, independent date filters, keyboard
  points, current value/date and photo viewer. Missing metrics create no point.
- Log Measurements and Update Measurements share one native modal. Weight and
  body fat are optional individually; one must remain. Decimal fat must be >0 and
  <100. No auto-estimate, backfill or Settings body-fat field. Unchanged displayed
  weight retains full canonical precision. Initial focus is the dialog heading.
- The entry is one stable profile-owned record with optional kg/fat, one shared
  date/photo and existing revisions, idempotent retry and transactional cleanup.
  Metric-specific Delete retains the other metric and photo. Only deleting the
  last metric removes the record; photos survive any remaining reference.
- Latest weight/fat are calculated independently by measured instant, then
  greatest ID. Settings weight-only saves use the existing service and timestamp
  convention; unit-only changes never rewrite measurements. Stale writes fail
  visibly with recoverable input. No failure creates an empty database.
- Date defaults to device-local today. Today uses the first valid save attempt's
  device instant (`device_clock`); another selected date uses local noon
  (`date_only_noon`). These are automatic clock values, not exact user-entered
  times. Retries retain the instant. `loggedAt` and `updatedAt` stay separate.
  Date edits retain time/milliseconds and stored zone, including when the device
  zone differs. DST folds prefer the saved offset, otherwise the earlier instant;
  skipped times/dates reject with a date error rather than silently shifting.
  Context-free legacy entries retain UTC; date edits mark `legacy_preserved_time`.
- Database **15 → 16**, stable name `boros`, no store/index/record rewrites in v16.
  Existing IDs, weight precision, dates, photos, selection and records survive.
  ZIP **21 → 22**, AI stays **10**, same **40 CSV tables**. Current strict JSON and
  progress CSV preserve optional metrics and time source. Original v1–21 records,
  CSVs and checksums validate against frozen contracts before promotion.
- New/replace restore keeps shared entries intact. V22 merge picks whole entries
  by stable ID; an absent metric in the winning entry is an intentional clear.
  A pre-v22 winning weight entry cannot express a body-fat clear: a same-ID merge
  retains device fat and warns that it takes the selected entry's date/photo.
  Other IDs survive merge. Explicit Replace retains its reviewed semantics.
- Analysis CSV adds one `record_type=measurement` row per historical entry,
  including measurement-only profiles. Separate numeric body-weight/fat columns
  use `None` when missing; exercise fields use `NA`. Selected date is dd/mm/yyyy;
  time stays HH:mm:ss with exact UTC/time-source metadata. Exercise-result rows,
  Strength sides, Interval timing, escaping and formula protection are retained.
- Exercise editor/action button contents are centered through scoped selectors;
  order, placement, sizing and focus behavior remain unchanged. The existing
  Strength model already supplies independent Left/Right fields per logical set
  in plans, standalone/custom workouts, supersets and add/replace paths. Reused
  that implementation, with new entry-path coverage; no second result model or
  blanket historical conversion was added. Interval and unsided rows are unchanged.

## Files changed for this update

- Model/services: `src/schemas/profile.ts`, new frozen `measurement-v15.ts`,
  `src/db/database.ts`, `src/db/measurements.ts`, `src/lib/measurement-dates.ts`,
  and optional-weight handling in `ProfileEditor.tsx`.
- Progress: `MeasurementEditor.tsx`, `ProgressPage.tsx`, `WeightChart.tsx`.
  Scoped alignment: `DetailsActions.tsx`, `PlanEditor.tsx`, `src/index.css`.
- Export/restore: `src/db/analysis.ts`, `features/backups/{analysis,archive,csv,
  read-backup,restore-plan}.ts`, `DownloadAnalysis.tsx`, `schemas/backup.ts`, new
  frozen `backup-v21.ts` and prior contracts' frozen measurement imports.
- Tests: new `tests/data/body-measurements.test.ts` and
  `tests/browser/body-measurements.spec.ts`; L/R entry-path regression; affected
  Progress/group1/journey labels, analysis empty copy, current-version assertions
  and legacy fixture field projection. README, TODO and CSV/backup docs updated.

Pre-existing strict-hint/L/R changes remain in the working tree, including their
earlier verification record. The owner's unrelated `index.html` edit is preserved.
No dependencies, navigation, manifest, deployment or hosting changes; no commit,
push, deploy, or owner-storage access/clearing.

## Actual verification

Commands use existing installed tooling. Node subprocesses/Edge required the
workspace's sandbox escalation; an initial spawn EPERM was environmental.
Data tests use disposable `boros-test-*` databases. Playwright uses isolated
contexts at a plain static server, no SPA rewrite, `/` and `/project-check/`,
desktop 1440×1000 and emulated phone 390×844. These are Edge checks, not Safari or
a physical phone.

| Command | Actual result |
| --- | --- |
| `npm run build` | Pass (TypeScript + Vite production build). |
| `npm run typecheck` | Pass. |
| `npm run lint` | Pass, no warnings. |
| `npm run test:data` | **362/362 pass**, 0 skipped. |
| `git diff --check` | Pass; Windows LF/CRLF advisories only. |
| `npm run test:browser:static -- tests/browser/body-measurements.spec.ts tests/browser/progress.spec.ts tests/browser/lr-distinction.spec.ts tests/browser/analysis.spec.ts --workers=2` | **64/68 pass** initially; four copies of the new custom L/R test used a nonexistent `Add (1)` selector. Corrected to the actual picker/add/replace flow; all four pass in the next run. |
| `npm run test:browser:static -- tests/browser/body-measurements.spec.ts --workers=2` | **24/24 pass** after correction and adding full measurement ZIP restore coverage. |
| `npm run test:browser:static -- tests/browser/profiles.spec.ts tests/browser/group1.spec.ts tests/browser/journey.spec.ts tests/browser/restores.spec.ts tests/browser/progress.spec.ts --grep 'Guest conversion\|paired units\|existing native\|complete manual\|submission time\|new profile and rename' --workers=2` | **28/28 pass**: original profile/units/UUID fallback, both full manual/AI journeys, DST retry/unload and photo-backed restore checks at all four mounts/viewports. |

Together these runs cover **96 distinct passing browser checks**, including all
four corrected failures (repeat runs are not counted twice). Historical full
browser suites were not all rerun. Harmless NO_COLOR/FORCE_COLOR warnings appeared.

Initial data runs exposed outdated current-version assertions and old-backup
fixtures inadvertently carrying new `timeSource` data. Corrected fixture projection
and assertions without weakening old schema validation. A new legacy ZIP fixture
also included implicit directory entries; disabled their creation to match the
real ZIP inventory contract. Final data run passes. Initial lint warnings were
unused destructured test ownership fields; corrected before final lint.

Focused coverage includes optional/combined metrics, decimal/empty/zero rejection,
date edits, independent latest/ties, zones/DST gaps/folds/skipped dates, old-v15
all-store migration preservation, canonical kg/lb precision, shared photo reference
cleanup, stale and injected failing transactions, profile isolation, CSV historical
row counts/time/formula escaping and v22 semantic ZIP round trips. Original v21
weight-only ZIP reading and both current/legacy merge clear rules are exercised.

Browser checks exercise both themes, non-input initial focus, shared edits from
both graphs, cancellations, exact deletion dialogs, Settings synchronization,
separate filters/scroll, fixed axes, keyboard point/focus return, two-tab conflicts,
injected quota failure retaining photo/input, retry/double-save, unload warnings,
320px enlarged text, CSV downloads and ZIP restore/photo decode in a new profile.
The new custom L/R test checks the unchanged Edit/Duplicate/Move/Delete menu order,
centered labels, add/replace paths, independent zero/positive values, reload and
stable typing focus. Existing L/R checks cover standalone/superset/save, hints as
side-specific placeholders, unsided behavior, Progress and exports. Data coverage
adds planned/custom/append/replace save/recovery without multiplying set IDs.

Visually inspected phone Dark dialog, phone Light graphs and desktop Dark graphs;
screenshots also captured for the opposite theme/mount combinations. Emulation
does not verify a real software keyboard, pinch zoom or native file sheet.

## Owner check (use a disposable profile)

1. Progress → **Log Measurements**: save weight **70** and body fat **24.5**, with
   a photo. Confirm separate weight/fat points and no keyboard opening on launch.
2. Log **71** weight only, then **23.5** body fat only. Each graph gains only its
   own point and independently updates its current value.
3. Log **69 / 25** with Date **2025-01-01**. Confirm that selected day in both
   point popups; a newer current value must remain current.
4. Edit the combined entry from each graph. Change its date; both points move.
   Add/remove a metric, replace/remove the photo, then test Cancel with unsaved
   changes. Neither unchanged weight precision nor original time should drift.
5. Delete weight from a combined point: body fat/date/photo must remain and
   Settings must show the next latest weight. Delete the remaining fat only
   after checking **Delete Body Fat?**; that final entry should disappear.
6. Settings → Data → Download. Open in your spreadsheet and inspect
   `record_type`, numeric `body_fat_percentage`, `measurement_date` (dd/mm/yyyy),
   body weight/unit versus exercise `weight`, and `None`/`NA` cells.
7. Download Profile Backup, then Restore Profile from Backup → **Import under a
   new name**. Verify both graphs, selected dates, shared photo and reload;
   switch back to confirm the original disposable profile is unchanged.
8. Open an exercise's edit/actions popup. Labels/icon contents should be centered;
   button order, position, focus outline and hit areas should be unchanged.
9. Train a two-set Strength exercise with L/R enabled. Enter different Left/Right
   values (include blank and explicit zero), wait for saving, reload, then Save.
   Confirm both sides in review/Progress/CSV. Repeat with a superset and an
   added/replaced exercise; check phone typing and reachable sticky actions.

Remaining unverified: physical iOS/Android keyboard, zoom, safe areas and Home
Screen lifecycle; Safari/Firefox for this update; real screen reader/voice control;
real storage exhaustion (only injected failures tested); native downloads/photo
sheets and spreadsheet applications; live Ko-fi and prior media/background gates.
No new production update/persistence or device-level acceptance is claimed.

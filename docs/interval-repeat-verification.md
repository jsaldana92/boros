# Interval repeat replacement and Create/Train refinements - 2026-10-08

Historical verification record. The later [workout actions/rest update](workout-actions-rest-verification.md)
supersedes silent ordinary-rest speech, the generic final Rest label, shared
sticky/block denominators and Interval pending-exercise editing. Its current
contracts are DB11/backup17; this record's checks are retained as historical evidence.

Implementation and automated verification are complete; physical-device
acceptance remains separate. This deliberately replaces the previous editable
Interval sets/rounds contract and Stop-retains-progress behavior. Historical
Strength/Interval and timer handoffs remain unchanged. Strength's sets, supersets
and normal timer behavior are preserved.

No applicable AGENTS.md was found. Existing uncommitted work was preserved. No
commit, push, deploy, dependency install, hosting/manifest/routing change, owner
database access or owner data clearing occurred. All tests used disposable data.

## Implemented behavior

- Centered Plan Type / Workout Type / Exercise Type headings; choices unchanged.
  Shared trailing 18px type icons, including Plan cards. Mobile workout names
  clamp to two lines with complete accessible names and dates inside the existing
  grid/padding/card geometry; desktop uses five compact columns at 900px.
- Archive keeps colored text with the shared neutral border and keyboard focus.
  The picker return hook captures the actual Add control plus stable occurrence,
  circuit/day fallback and nested scroll positions. One layout frame restores its
  relative position/focus after additions or cancellation, without resetting forms.
- Train plan rows use an 8px gap; Add Plan has a separate 24px top margin. The
  Strength and Interval footer now share one component: full-width Save, then
  Cancel/Clear. Initial Interval Start is centered/wide with a desktop cap;
  sticky/modal controls retain their existing sizes and layout.
- New Interval circuits have `repeat` 0-10 (additional executions, default 0).
  Every execution runs all active/recovery targets then its circuit rest. Zero
  rests are skipped; adjacent positive rests stay distinct. Continuous finishes
  all repetitions before the next circuit and runs workout rest once. Circuit-only
  excludes workout rest. New executions have one silent five-second Warm Up.
- One compiled list drives phase IDs, actuals, totals, Current/Next, ring blocks,
  denominator, rendered repeated exercises and cues. Ring/denominator reset for
  each repetition; rest/preparation have their own blocks. The active border does
  not change row height. Main/sticky/modal share the same timer.
- Per-tick `busy` updates caused the button flicker. Checkpoints now run in a
  background queue without toggling controls; user actions serialize behind them
  and read the latest committed revision. Stale writes remain rejected. A
  mutation observer verifies unchanged button identity, enabled state and focus
  through ticks and automatic boundaries.
- Stop clears only its execution scope's timer results and ownership, cancels
  feedback and returns it to ready. Other circuit results, notes, structural edits
  and history survive. Natural completion retains results for explicit Save.
  Empty/preparation/reset sessions leave without a warning or unfinished stub;
  notes, edits, other results and errors remain guarded. Navigation waits for a
  pending checkpoint and recalculates meaningful input to protect a just-crossed
  preparation boundary. Failed reset writes preserve stored state and input.
- Distinct repetition phase IDs prevent cue deduplication by exercise alone.
  Local start/warning/end MP3s fire per eligible activity; only workout-rest
  completion uses the existing triple completion routine. Preparation/ordinary
  rests/Stop are silent. Sound Off, visibility gaps, optional local speech,
  ownership, pause/recovery, Settings detours and denied media remain protected.

## Exact fixture

Workout **Sprint Madness**, post-workout rest **60 seconds**:

| Circuit | Exercise targets (active / recovery seconds) | Circuit rest | Repeat |
| --- | --- | --- | --- |
| Starting slow | Push-up 20/10; Sprint 20/10; Pull-up 10/20 | 30 | 1 |
| Sprint madness | High knees 50/10; Backwards jog 50/10; Full sprint 20/10 | 30 | 0 |

The compiled duration is `5 + (90 + 30) * 2 + 150 + 30 + 60 = 485` seconds
(08:05). Excluding preparation: 480. Circuit-only: 245 and 185. Omitting Circuit
2 rest and workout rest gives 390 before preparation; circuit rest alone gives
420; adding workout rest gives 480. Full sprint's 10-second recovery is retained.
Denominators: 01:30, 02:30, 00:30 circuit rest, 01:00 workout rest, 00:05 Warm Up.
Final Circuit 1 rest points to High knees. Workout rest points to Workout
Complete!; circuit-only ends with Circuit Complete!, without saving automatically.

## Migration and contracts

- Stable `boros` database **v10**, AI **v8**, backup **v16**, **40 CSV tables**.
  V10 upgrades only editable Workout/Plan templates in the upgrade transaction.
  Profile IDs/selection, photos/measurements and unrelated records are preserved.
  Schedule revisions/outcomes, started/finalized drafts and sessions are not
  rewritten. New copies/starts from old schedule prescriptions convert explicitly;
  existing draft recovery retains the exact original checkpoint and phase IDs.
- Lossless conversion uses the stored old contract, not faulty timer behavior.
  Zero-rest repeated activity chunks contain at most eleven executions. Positive
  old between-set/final rests belong only to the last execution of their section.
  Three sets of five rounds with positive between-set/final rests become six
  sections: repeat 3/rest 0, repeat 0/old set rest, repeated for each old set with
  the last section using old final rest. Total activities and rest positions match.
  The 100 by 100 case retains all 10,000 activities; nothing is clamped/truncated.
- Additional sections are named `Original (1)`, `(2)`, etc. First IDs stay;
  additional circuit/occurrence UUIDs use deterministic, collision-checked
  mappings. Source links and prescriptions are copied intact. Conversion is
  idempotent. Invalid/missing references or identity collisions abort with an
  actionable error, retaining the original database rather than replacing it.
- Internal schemas retain strict legacy circuits/phase identities for snapshots.
  Already-started legacy drafts keep old timing through a compatibility compiler;
  a pending edit can append a current repeat circuit without dropping old phases.
  Retired legacy counts are not exposed as new editable controls. Historical
  review retains original Set/Round indexes rather than reinterpreting actuals.
- AI v8 defaults omitted repeat to 0 and rejects retired Interval fields or
  contradictory mixed models. Original v6/v7 and older Strength readers remain
  strict before conversion. Fenced JSON, plain text and field errors remain.
- Original backup JSON, manifests, CSVs, photo bytes and SHA-256 validate before
  promotion. V16 adds circuit `repeat` and phase `repetition` columns; legacy
  columns remain for historical rows. Imported editable templates convert;
  started/history snapshots do not. Imported live ownership/anchors are removed
  and unfinished timers restore paused. New restore/export preserves timing,
  source links, actuals and references. Existing profile isolation/merge rules stay.
- No known valid-contract conversion case is unresolved in the tested corpus.
  Invalid legacy records are deliberately preserved with an error. Conversion can
  produce more sections than a new manual/AI workout would normally create.

## Actual verification

Commands were run in PowerShell using installed tools, with no downloads.

| Command | Actual result |
| --- | --- |
| `npm run build` | Pass; production build and TypeScript compilation |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no warnings in final run |
| `git diff --check` | Pass; Git emits only the existing prepare.mjs LF/CRLF notice |
| `npm run test:data` | **285/285 pass** |
| `npm run test:browser:static -- interval-repeat.spec.ts interval.spec.ts interval-timer.spec.ts create-refinements.spec.ts workout-library.spec.ts backups.spec.ts restores.spec.ts plans.spec.ts train.spec.ts navigation.spec.ts hosting.spec.ts --output=test-results/repeat-matrix-final` | **211/212 pass**, one assertion timeout; see unchanged rerun below |
| `npm run test:browser:static -- backups.spec.ts --grep 'another tab with a failed' --output=test-results/repeat-backup-rerun` | **4/4 pass** unchanged, including the failed project-desktop case |
| `npm run test:browser:static -- interval-layout.spec.ts --output=test-results/repeat-layout` | **4/4 pass**: exact footer geometry, trailing icons and separate Train gaps |
| `$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'; npx playwright test -c playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone interval-repeat.spec.ts interval.spec.ts interval-timer.spec.ts workout-library.spec.ts backups.spec.ts restores.spec.ts --output=test-results/repeat-firefox` | **54/54 pass** |
| `node tests/updates/prepare-repeat.mjs` | Preserved pre-edit v9 production build plus two new local builds prepared |
| `$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'; npx playwright test -c playwright.updates.config.ts interval-repeat.spec.ts --output=test-results/repeat-updates-final` | **3/3 pass**, same context/origin throughout migration, reload/reopen and second build |
| `$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'; npx playwright test -c playwright.updates.config.ts persistence.spec.ts --output=test-results/repeat-older-updates` | **6/6 pass**, existing linked/legacy-AI published-release fixtures through both final local builds |

The static matrix uses Edge desktop and 390px phone emulation at `/` and
`/project-check/` on a file-only server with no rewrite fallback. Layout checks
also cover 320px light mode, both themes, focus/keyboard access and safe spacing.
Firefox runs use desktop and phone-sized viewports. Screenshots were visually
inspected for the phone timer and focused Archive modal. Geometry/containment,
footer equality and focus assertions are automated, not inferred from screenshots.

The broad run's one timeout was the pre-existing two-tab backup test waiting for
an absent explanatory string (`toHaveCount(0)` returned no result within five
seconds). No failed download/data assertion was observed; the test passed
unchanged in all four static projects on rerun. This is recorded as a timeout and
rerun, not an uninterrupted 212/212 pass.

Earlier attempts exposed and corrected chooser title alignment. Test fixtures
also needed current schema numbers, original snapshot structure IDs, JSON
undefined-field normalization, chooser names, explicit preparation waits,
library choices for AI previews and actual Cancel/Back labels. The first full
data attempt was 223/273 with obsolete expectations; the next was 278/281, then
281/281. Final added coverage reached 285/285 after fixing a fixture-only variable
rename during lint cleanup and adding explicit v10 rollback coverage. Initial new browser attempts were 4/20, 4/10 and
6/10 while fixtures were corrected. An older broad attempt was interrupted after
discovering its Strength chooser helper still matched only Training type. No
test was skipped or assertion removed to mask an application failure. Initial
upgrade fixture attempts failed before the update at old UI/payload steps;
corrected and final three-project same-context runs both passed.

Upgrade evidence is under `test-results/repeat-update-builds/builds.json` and
`test-results/repeat-updates-final`. The pre-edit v9 build entry was
`index-CgKIHYzw.js`, SHA-256
`cbaeab7aec501c1f456644511259d2a66f11b03f76b9c32657fdfd0ff0ad80a2`.
Both independently built new entries are `index-DvsrmyP6.js`, SHA-256
`b0cba064ed62ef50b5b261bb6ca1db8320e6f2827b0f38adc1415ac720dd0e5c`.
Identical deterministic build outputs are expected. The old v9 fixture contains
two profiles, active selection, photo bytes, a measurement, linked exercise/plan/
workout, active schedule, saved history and a committed paused legacy draft.
Only templates change as specified; all other table records compare exactly.
Reopening uses a new page in the SAME browser context, never a fresh context
between builds. Earlier published-release artifacts are reused without fetching;
their receipt's two current build entries point at these final local builds.

## Remaining manual checks / short owner test

Use a disposable profile on a physical phone. Keep a backup of valuable data.

1. Add one/multiple exercises deep inside a Workout or repeating/unique Plan,
   then cancel a picker. Confirm position, expanded sections and parent input stay.
2. Inspect a long workout name at phone width: two lines, complete date inside
   the unchanged card. Check the more compact desktop grid and keyboard focus.
3. Build Sprint Madness exactly from the table above, using Repeat circuit 1/0.
4. Start Continuous. Confirm one Warm Up, both Starting slow executions and both
   30-second circuit rests, with a 01:30 denominator resetting on the repeat.
5. Confirm Circuit 2's three activities, final 10-second recovery, 30-second
   circuit rest and separate 60-second workout rest. Final Next is Workout
   Complete!; circuit-only never runs workout rest. Total is 08:05 including prep.
6. Run active time, press Stop, then leave with no other input. Expect no warning
   or unfinished-session card. Check main/sticky/modal controls remain stable.
7. Repeat with a Session Note: Stop keeps it and leaving asks for confirmation.
8. Let a timer finish naturally. Results remain available; Save is still explicit.
   Check local cues once per repeated activity, no Stop cue, Sound Off, pause/
   resume, Settings return and phone foreground/background/lock-screen behavior.
9. Reopen or restore a legacy Interval workout. Confirm its full old timing/rest
   positions remain, including any additional named sections; old saved history
   and a previously started checkpoint must remain intact.

Unverified: physical-phone keyboard/gesture/lock-screen/audio behavior, Safari/
WebKit with functioning IndexedDB Blob support, real screen-reader acceptance,
native file dialogs and live Ko-fi. Prior release gates remain open. These
isolated upgrade results do not establish the cause of the owner's earlier
production data-disappearance report or claim that issue is fixed.

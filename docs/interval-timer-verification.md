# Interval timer execution update - 2026-10-07

Historical verification record. The later [workout actions/rest update](workout-actions-rest-verification.md)
supersedes silent ordinary-rest speech, the generic final Rest label, shared
sticky/block denominators and Interval pending-exercise editing. Its current
contracts are DB11/backup17; this record's checks are retained as historical evidence.

Implementation finished; automated verification and physical-device acceptance
are recorded separately below. Earlier phase
acceptance records remain historical. No applicable AGENTS.md was found. The
existing uncommitted Strength/Interval implementation and owner assets were
preserved. No commit, push, deploy, dependency install, manifest/routing/hosting
change or owner database access/clearing occurred.

## Implementation

- Default individual circuit mode; multi-circuit checkbox is opt-in and persists
  with the draft. Continuous and circuit-only starts have distinct validated
  phase lists. Mode switching and pending structural edits require stopping.
- Exactly one five-second silent preparation per explicit new execution. Every
  recovery is additive; positive final circuit rest is retained in either mode.
  Only continuous execution adds the optional separate post-workout rest.
- Workout A is 255 seconds including preparation (250 without); its two separate
  circuit executions are 95 and 105 seconds. Core denominators are 60 and 100
  seconds. Preparation/post-circuit/post-workout blocks use 5/30/60 respectively.
- Timestamp boundaries drive timing. Phase numerators count down; circuit ring
  progress spans active/recovery/between-set phases. Main/sticky/modal share one
  calculation/state, with clockwise progress, normalized unbounded minutes,
  accessible icon actions and no timer remount on modal/scroll changes.
- Pause retains ownership; Start resumes without preparation/cues. Stop records
  honest partial time, cancels feedback and releases ownership without Save or
  Cancel. Restart confirmation clears only its selected scope. Results use one
  prescribed phase identity, avoiding duplicate performance counts.
- The coordinator uses a shared IndexedDB read/write transaction across drafts
  and restTimers, retaining the existing stores. Running/paused Interval ownership
  and active/paused Strength timers exclude another start across profiles/tabs.
  Revisions and a live tab token reject stale callbacks; explicit recovery pauses
  the stored checkpoint and revokes the old tab. Imported draft ownership is inert.
- Rest/count-up timers now also prepare, pause/resume and reserve that slot. Their
  existing UI and triple completion cue remain, with the exercise/group label
  visible during preparation. Preparation/countdown derive from one boundary.
- Saved active results, notes, profile scope, partial confirmations, frozen
  sources and Calendar review remain separate from automatic timer completion.
  Preparation-only drafts remain visible for recovery. Closed-app time is excluded.

## Schemas and compatibility

Stable database `boros` is v9: optional fields/versioned execution state, no record
rewrite or store/index replacement. Post-workout rest belongs to the workout/day,
not a circuit or final exercise. Editors, plan/library copies, duplication,
publication identity comparison, custom save and snapshots retain it.

AI v7 adds optional postWorkoutRestSeconds to Interval workouts, including plan
weeks; strict original v6 is frozen separately. Backup v15/database v9 has 40 CSV
tables, including linked execution phase/cue tables. Original v14 schema/CSV
contracts/checksums are validated before promotion. Legacy phase/result snapshots
and completion meaning stay intact. Exported committed checkpoints restore paused
without browser objects or live ownership. Photo bytes and the existing
whole-family merge/replace/deletion protections are preserved.

A historical missing workout library source with neither record nor tombstone
remains ambiguous and is not recreated. The earlier production data-loss report
is not diagnosed or fixed by these local tests.

## Audio evidence

Files inspected locally: circuit-start.mp3 (36,576 bytes),
circuit-5s-warning.mp3 (38,688), circuit-end.mp3 (40,752),
rest-complete.mp3 (25,913). All have MPEG/ID3 signatures. The existing .mp3 end
asset is used; no substitute was downloaded/generated. An isolated Edge page
loaded metadata for all four files successfully: each circuit clip is 2.024375
seconds, rest-complete is 0.809781 seconds. This proves local decoding, not
physical audibility. active-warning.mp3 remains
untouched and is no longer referenced by Interval playback.

One committed generation/phase event ledger prevents duplicated start/warning/end
cues across presentations and resumed drafts. A bounded end-then-start queue handles
zero rest; a queued start remains valid while its phase is current and foreground
updates are fresh, including after the two-second end clip. Stale/gapped/hidden
events are consumed without replay. Sound Off cancels
current/queued feedback immediately. Preparation and Interval rest boundaries have
no speech/cues. Fresh active starts retain exercise-name speech after the file
cue when a local voice is available; warning/end/start cues cancel stale speech.
Remote voices are never used. Only positive post-workout rest invokes the existing triple-play
completion routine once. The explicit start gesture unlocks muted, zero-volume
media; unavailable audio never changes timer state.

Audio event behavior is tested with controlled media ports and denied browser
playback; asset retrieval is tested under root/project paths. Physical playback,
voice availability, vibration and locked-screen reliability were not verified.
No remote speech is used by the updated Interval sequence.

## Verification results

- `npm run build`, `npm run typecheck`, `npm run lint`, `git diff --check`: pass.
- `npm run test:data`: **273/273**, no skipped tests (including 14 focused timer
  cases). Covers the exact sequence, boundaries, scope/ownership, audio ledger,
  local voice restriction, v8/v9 records and photo bytes, original v14 archives.
- Affected production Edge matrix: **192/192** at `/` and `/project-check/`,
  desktop/phone viewports, both themes, static hosting with no rewrite fallback.
- Affected Firefox matrix: **60/60**, desktop/phone viewports.
- Final audio-adjusted Edge timer rerun: **32/32**, both hosting mounts and
  viewport sizes; final Firefox timer rerun: **16/16**.
- Retained-context upgrades before the final audio-only refinement: **6/6**.
  Final-source retained-context rerun: **6/6** (2.8 minutes).
- Visually inspected dark post-workout modal, desktop light preparation and
  320px light active-name screenshots. Automated geometry checks found no page
  horizontal overflow. Physical device evidence remains separate.

Commands run from the repository root:

```powershell
npm run build
npm run typecheck
npm run lint
git diff --check
npm run test:data
npm run test:browser:static -- tests/browser/interval-timer.spec.ts tests/browser/interval.spec.ts tests/browser/session-amendments.spec.ts tests/browser/lifecycle-refinements.spec.ts tests/browser/train.spec.ts tests/browser/group2.spec.ts tests/browser/backups.spec.ts tests/browser/restores.spec.ts tests/browser/imports.spec.ts tests/browser/workout-library.spec.ts --output=test-results/timer-final
node tests/updates/prepare.mjs 'node_modules/.cache/gh-pages/https!github.com!jsaldana92!boros.git' a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
npx playwright test -c playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone tests/browser/interval-timer.spec.ts tests/browser/interval.spec.ts tests/browser/train.spec.ts tests/browser/lifecycle-refinements.spec.ts tests/browser/backups.spec.ts tests/browser/restores.spec.ts --output=test-results/timer-firefox
npm run test:browser:static -- tests/browser/interval-timer.spec.ts tests/browser/interval.spec.ts --output=test-results/timer-complete
npx playwright test -c playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone tests/browser/interval-timer.spec.ts tests/browser/interval.spec.ts --output=test-results/timer-firefox-complete
npm run test:browser:updates
```

Intermediate findings: outdated implicit-timer-replacement and pre-preparation
assertions were updated to the requested contract. The first expanded browser run
passed 58/80, exposing an async checkbox visual revert, hidden Strength timer
label, preparation-only recovery visibility and test synchronization/locator
issues. Focused follow-ups passed 4/12 then 8/12; the remaining recovery assertion
read the display before Pause committed and now waits for Paused. Data tests also
found a zero-recovery amendment cursor and a one-millisecond rest-boundary mismatch;
both were fixed. A new compatibility fixture initially imported Dexie before
fake-indexeddb; its initialization order was corrected. A broad attempt passed 187/192: four
restore fixtures still reset the manifest to v14, and one stale-tab test opened
another tab before Pause committed. Correcting the fixtures/synchronization
produced the 192/192 result. Decoding the actual two-second audio clips exposed
an overly short queue cutoff; the final focused data/browser runs cover retaining
a still-current start cue and local speech after playback.

Upgrade preparation used read-only cached published commits
`a87dc13014fe54dad0b407572f7fdc1afe4dd132` and
`aa9126efd67244ddb9c7c8818896a32822a56b64`, an isolated archive of pre-Interval
`b94cfa8cc03ec427fa6617b196b982f27871fa50`, then two independent current builds.
Each test keeps one fixed origin and the SAME browser context/storage through all
five versions and a reopened page. Disposable manual/legacy-AI fixtures preserve
IDs, exercise/plan/schedule/history/draft/measurement records, photo bytes, active
selection and profile isolation. New Interval records/checkpoints created in the
first current build survive the second. Injected open errors remain actionable,
never silent Guest resets. Tests cover Edge root desktop/project phone and Firefox
desktop. No real browser data is accessed. The build preparation emitted Vite's
external-outDir warning as a PowerShell NativeCommandError (host reported exit 1);
all five directories and the completed receipt were produced and used by the tests.
It did not delete or empty an external checkout.

Receipts: `test-results/update-builds/builds.json` and
`test-results/update-runs/results.json`; final HTML SHA-256
`35cc1cca5e945cfe76d5db268caf5baff8ea52bb2257a5a0a3ae52df091a6220`,
entry `index-CgKIHYzw.js`, SHA-256
`cbaeab7aec501c1f456644511259d2a66f11b03f76b9c32657fdfd0ff0ad80a2`.
The two current builds match. Local logs are `.timer-data-final.log`,
`.timer-build-complete.log`, `.timer-browser-final.log`, `.timer-firefox.log`,
`.timer-browser-complete.log`, `.timer-firefox-complete.log` and
`.timer-updates-complete.log`. These generated files remain uncommitted.

## Exact owner check: Workout A

Use a disposable profile, keeping a backup of actual data. Circuit 1 is Jumping
Jacks 20 active/10 recovery, Push-ups 20/10, 30 seconds post-circuit rest. Circuit 2
is Sprint 20/20 and Squats 40/20, zero post-circuit rest. Both have one round and one
set. Set Post-workout rest to 1 minute.

1. Check Continuous workout and Start: see exactly one silent 00:05 / 00:05 preparation.
2. Circuit 1 shows 00:20 / 01:00 and 00:10 / 01:00; its final rest shows
   00:30 / 00:30. Circuit 2 shows 00:20 / 01:40, 00:20 / 01:40,
   00:40 / 01:40 and 00:20 / 01:40. Post-Workout Rest is 01:00 / 01:00
   with Congratulations! The full execution is 4:15, including preparation.
3. Scroll past the main timer; pause through the sticky icon, open the modal,
   resume with Start and Close. Check frozen/resumed time, the same ring, focus,
   narrow-phone long names and that Close changes only the modal.
4. Confirm conflicting timer starts and the mode checkbox are disabled while
   running or paused. Stop releases the slot without saving/canceling the workout.
5. With Sound On, listen for active start, eligible five-second warning and
   natural active end. Recovery/set/circuit rests stay silent. Sound Off cancels
   everything. Test pause/resume, denied media and background/lock-screen return.
6. Positive post-workout rest completion plays one normal three-clip sequence.
   Zero post-workout rest produces no such completion cue.
7. Uncheck continuous mode. Start Circuit 1: 1:35 including preparation/rest;
   Circuit 2 separately: 1:45. Neither runs post-workout rest or starts another
   circuit. Cancel Restart timer? and verify progress is retained.
8. Pause, reload and explicitly recover: position/results/mode remain, preparation
   does not repeat and old cues do not replay. Repeat while paused in preparation.
9. Save explicitly; review full/partial actuals in Calendar. Export and restore to
   a disposable profile; compare workout rest, circuits, actuals, notes and photos.

Physical phone keyboard/safe-area behavior, Safari/iOS, real screen readers,
locked-screen audio/vibration, native download sheets and live Ko-fi remain open.
Earlier Phase 10/11 release gates and production persistence investigation remain
open. Desktop automation is not physical-device evidence.

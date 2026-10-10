# Train runtime, history and ownership — 2026-10-09

Implementation and applicable automated verification are complete.
Physical-device acceptance and previous release gates remain open. This record
supersedes earlier Train route-discard and preparation-period instructions. Older
handoffs remain historical. No commit, push, deploy, dependency, manifest, origin,
hosting or routing configuration changes were made. No owner storage was opened.
Tests use disposable databases and isolated loopback browser contexts.

## Changes

- One persistent workspace-wide `activeWorkouts` pointer owns a stable profile
  and draft. Start/resume and ownership acquisition share an IndexedDB transaction,
  including Calendar, planned, library and custom entry points. Profile switching
  retains ownership and hides the owning profile's records in the other profile.
  Return to workout selects the owner. Legacy unfinished drafts remain stored.
- A document-level runtime owns Strength/Interval controllers, checkpoint queues,
  feedback, sound preference and wake lock above routes. Tab navigation flushes
  committed input without canceling the workout. Returning restores its editor,
  notes, results, timer and scroll. Popup closure is presentation only. Unapplied
  notes, explicit Cancel/Clear and other editors retain their safeguards.
- Save releases ownership only after the completed record commits. Cancel and
  legitimate plan/profile removal release it with their transaction. Clear and
  timer Stop/Reset retain workout ownership. Late writes cannot recreate deleted
  drafts. Failed saves retain input and lock. An editor whose draft/profile was
  removed in another tab remains visible with an error; it cannot write into the
  replacement. Successful Save/Cancel dismisses the editor without racing a stale
  live query back into it. Legacy Resume claims ownership before displaying its
  editor, even if the user has not changed a field. Read-query failures retain the
  editor and expose Retry rather than unmounting it or creating a new workspace.
- Strength countdown and count-up rests start immediately, without preparation or
  an early chime. Reset remains in the open popup and fills the same full row as
  Close. Interval had no Reset button; its existing scoped restart remains intact.
- New circuit/continuous Interval executions have one ten-second Warm Up. Pause,
  popup and route changes do not add preparation. Rest-only execution starts
  immediately. Repeats, final circuit rests and post-workout rest remain separate;
  displayed scope totals exclude preparation. Old five-second checkpoints remain
  valid until the user starts a new execution.
- Strength hints use canonical identity (including merges), stable repeated-entry
  IDs and per-set rep/RIR prescription. Planned hints stay in the current run;
  compatible other workouts in that run may supply them. Standalone uses the
  latest two saved exercise occurrences, then selects compatible values. Actual
  completion timestamps and stable tie-breakers order candidates. Partial saved
  results count; skipped/unsaved/manual-without-actuals do not. Zeros and missing
  values differ. Canonical weight conversion changes units correctly.
- Placeholders never become input, satisfy validation or enter saved results.
  Instructions history renders recorded sets in their original order, actual RIR
  ordinals and current units. Planned history shows the latest plan performance
  on mismatch, or two overall if no plan history exists; standalone shows two.
  Existing video/note content is retained; empty sections stay hidden.
- New standalone snapshots retain their workout definition's occurrence IDs.
  Earlier snapshots with freshly generated occurrence IDs remain unchanged.
  Ambiguous old sibling matches are conservatively omitted from hints, never
  guessed using names or array positions; canonical history remains reviewable.

## Audio investigation: separate cases

1. **Foreground dispatch:** prior feedback relied on per-page media objects and
   UI effects. The shared runtime now resumes one AudioContext synchronously on a
   training/Sound-On gesture, caches decoded local assets, cancels stale sources
   and catches playback rejection. HTML audio remains an unsupported-Web-Audio
   fallback. A regression identified a concrete Interval delay: committed cues
   waited for another polling tick and could become stale. Delivery now occurs
   immediately on commit. Sound Off cancels files, speech and queued cues; On
   never replays consumed cues. Completion still uses exactly three plays.
2. **Popup and Boros tabs:** baseline popup Close alone did not dispose its parent
   feedback; no owner-device popup-only root cause was established. Baseline
   route unmount did cancel feedback/dispose controllers and Interval checkpoint
   polling. Those lifetimes are now independent of the page. Automated tests
   close popups, visit all four other screens and return to the same record and
   clock, with one cue sequence and no duplicate draft. Popup reopening and Reset
   remount races found during verification were fixed. A deterministic regression
   exposed a reentrant checkpoint during foreground note-save notification; the
   controller now reserves that queue before a background poll can enter.
3. **Locked/background:** timestamps remain authoritative. Hidden, delayed or
   restored cues are consumed silently rather than replayed. A feature-detected
   screen wake lock is requested only while this document owns a visible running
   timer. Pause/finish/hide releases it; visible/resume requests it again. Denial
   is harmless and is not retried every tick. No physical lock-screen run was
   performed. Suspended JavaScript/audio cannot be made reliable by this change.
4. **External music:** baseline code requested no explicit audio-session category.
   Where available, short cues/speech now request `transient` with reference-counted
   cleanup restoring the previous category after completion/cancel/error. No
   exclusive playback/recording category, microphone, silent loop or media-session
   trick is used. Actual Spotify/Apple Music ducking or resumption was not tested
   and cannot be controlled directly by Boros.

The W3C Audio Session draft describes `transient` for short mixable alerts and
distinguishes it from exclusive categories; actual policy remains browser/OS
dependent. [Audio Session specification](https://www.w3.org/TR/audio-session/).
Gesture activation and rejected playback remain relevant even with Web Audio.
[Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/).
Wake locks are visible-document requests that the platform may release, not
background execution or prevention of deliberate locking.
[MDN Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).

## Data compatibility

Database **boros v12** adds only `activeWorkouts`; existing records/IDs/Blob bytes
remain intact. Initialization/restore keeps valid local ownership, otherwise
adopts a deterministic recoverable draft without deleting other legacy drafts.
An old Strength rest checkpoint also makes its otherwise blank draft recoverable.

Exports are **backup18/database12**, with **AI8** and **40 CSV tables** unchanged.
The workout pointer is not exported. Frozen v17 validators reject new ten-second
states mislabeled as v17. Original checksums, photos, references and schema checks
run before promotion. Restore strips foreign timer ownership/anchors, recovers
paused and reconciles local workout ownership. Import does not start media.
See [backup format](backup-format.md). The production persistence incident remains
unresolved by this isolated work; no real owner data was used to infer its cause.

## Verification ledger

Build, typecheck, lint and `git diff --check` pass. The final production entry is
`dist/assets/index-h5eN31JY.js`; source/config baseline was captured before editing
at ignored `test-results/train-runtime-baseline-v11`. Other dirty/untracked work
was retained. Restricted Windows subprocess checks required approved local test
execution; no dependency installation or publication was performed.

| Check | Actual result | Log / artifacts |
| --- | --- | --- |
| `npm run build`, `npm run typecheck`, `npm run lint` | Pass | `.train-runtime-build-final.log`, `.train-runtime-type-final.log`, `.train-runtime-lint-final.log` |
| `npm run test:data` | **307/307 passed** | `.train-runtime-data-final.log` |
| `node --experimental-strip-types --test tests/data/train-runtime.test.ts` | **13/13 passed** | `.train-runtime-data-focused-final.log` |
| Edge broad affected static suite (13 files below) | **264/264 passed** | `.train-runtime-edge-final.log`, `test-results/train-runtime-edge-final` |
| Edge runtime/menu/Interval timer/Train closeout | **108/108 passed** | `.train-runtime-edge-closeout.log`, `test-results/train-runtime-edge-closeout` |
| Additional legacy-resume/reload/backup Edge matrix | **116/124 passed**; eight outdated timer assertions corrected and covered by the 24/24 rerun below | `.train-runtime-resume-final.log`, `test-results/train-runtime-resume-final` |
| Final runtime/menu Firefox desktop + phone | **40/40 passed** | `.train-runtime-firefox-resume.log`, `test-results/train-runtime-firefox-resume` |
| Final Edge timer/native/rejected-audio matrix | **24/24 passed**, including all eight prior timer failures | `.train-runtime-timers-final.log`, `test-results/train-runtime-timers-final` |
| Final Firefox native/rejected-audio matrix | **6/6 passed** | `.train-runtime-firefox-audio.log`, `test-results/train-runtime-firefox-audio` |

The broad Edge command was:

```powershell
npm run test:browser:static -- tests/browser/train-runtime.spec.ts tests/browser/train.spec.ts tests/browser/session-amendments.spec.ts tests/browser/interval.spec.ts tests/browser/interval-timer.spec.ts tests/browser/workout-library.spec.ts tests/browser/group2.spec.ts tests/browser/journey.spec.ts tests/browser/restores.spec.ts tests/browser/train-refinements.spec.ts tests/browser/workout-actions-rest.spec.ts tests/browser/interval-repeat.spec.ts tests/browser/interval-layout.spec.ts --output=test-results/train-runtime-edge-final
```

The subsequent 108-check command used `train-runtime.spec.ts`,
`workout-actions-rest.spec.ts`, `interval-timer.spec.ts` and `train.spec.ts` with
`--output=test-results/train-runtime-edge-closeout`. The final additive-resume
checks include the final Resume behavior. The last two commands cover the final
audio-source error cleanup on `index-h5eN31JY.js`; broader matrices preceded that
small cleanup and the final focused additions:

```powershell
npm run test:browser:static -- tests/browser/train-runtime.spec.ts tests/browser/group3.spec.ts tests/browser/weekly.spec.ts tests/browser/lifecycle-refinements.spec.ts tests/browser/backups.spec.ts tests/browser/journey.spec.ts --output=test-results/train-runtime-resume-final
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
npx playwright test --config playwright.engines.config.ts tests/browser/train-runtime.spec.ts tests/browser/workout-actions-rest.spec.ts --project=firefox-desktop --project=firefox-phone --output=test-results/train-runtime-firefox-resume
npm run test:browser:static -- tests/browser/train-runtime.spec.ts tests/browser/lifecycle-refinements.spec.ts tests/browser/weekly.spec.ts --grep 'timer unlock|draft resolution|native HTML audio|rejected Web Audio|native Web Audio' --output=test-results/train-runtime-timers-final
npx playwright test --config playwright.engines.config.ts tests/browser/train-runtime.spec.ts --grep 'rejected Web Audio|native Web Audio' --project=firefox-desktop --project=firefox-phone --output=test-results/train-runtime-firefox-audio
```

Static Edge projects serve `/` and `/project-check/` without SPA rewrites, at
1440px desktop and 390px phone, including 320px checks and both themes. Inspected
Strength dark-phone and Interval light-desktop screenshots; tests check dialog
widths, focused controls, containment and sticky access. Firefox uses the installed
Playwright engine, desktop/touch viewport projects and Vite preview. These are
isolated contexts, never the owner's local workspace.

New data coverage includes competing DB connections, start/resume boundaries,
failed Save/queued cancellation, plan removal, immediate rests, ten-second and
legacy preparations, canonical hints/history, optional zeros/units, cue
cancellation/rejection, optional audio-session focus, wake-lock races/denial,
original v17 archive checksums and a real schema-v11 fixture upgrade with exact
record/Blob comparison. It does not claim a same-context previous-release browser
update run; older such runs remain in their historical records.

New browser coverage includes all four Strength/Interval planned/standalone
cases, all Boros screens, stable URLs/IDs, reload, failed ownership reads without
reset, legacy Resume, other profiles/tabs, popup control geometry, hints excluded
from saved data, native Web Audio decoding/three actual source starts, canceled
sound queues and simulated visibility/wake-lock transitions. Older native HTML
media instrumentation now explicitly selects that fallback; it checks real MP3
ended events separately from the Web Audio path.

Intermediate evidence is retained, not counted as clean passes:

- Data progressed through 304, 306 and finally 307 passing checks as regressions
  were added. The queue regression failed before its guard and passed afterward
  (`.train-runtime-queue-before.log`).
- Early affected Edge runs were 19/41, 54/65, 38/42 and 23/24. They exposed popup
  remount/close races, delayed committed cues and stale-editor presentation, plus
  fixtures that assumed discarded navigation, old preparation, or multiple live
  workouts. Fixtures now explicitly seed legacy records only in disposable DBs.
- Firefox's first affected matrix was **51/52**: a running-note save reported a
  stale revision while preserving the note. Reentrant queue admission now has a
  failing-before/passing-after regression. An eight-repeat investigation was
  **7/8**, with a separate Escape/confirmation visibility failure, not another
  confirmed revision error. Subsequent menu checks re-exercise both paths.
- Firefox closeout was **53/54**: a test compared reload to a pause value captured
  before a subsequent Start/Pause. It now compares the actual later checkpoint;
  no tolerance was added to hide elapsed time. Other runtime/timer/Train cases
  passed in both Firefox viewport projects.
- The added older tests required automatic recovery expectations, excluding the
  new local-only pointer from backup export comparisons, explicit native HTML
  audio fallback selection, immediate count-up expectations and foreground clock
  advancement for an audible event. A fixed-Date overdue fixture now uses a
  checkpoint beyond the cross-tab grace period instead of freezing inside it.
  These two old timer tests failed at all four Edge project mounts (**116/124**);
  corrected assertions pass in the final **24/24** matrix. No pending test failure
  remains in the affected cases. Full unrelated browser suites were not rerun.
- Final source-start rejection checks additionally verify Web Audio cleanup of
  short-alert focus, including synchronous source-start failure, without stopping
  timestamp advancement. The native Web Audio and HTML fallback probes each
  observed the intended three completion plays; this is not acoustic evidence.

No acoustic, physical-phone, Home Screen, Bluetooth/headphone, external-music,
Safari/WebKit Blob, assistive-technology, native-file-sheet or live Ko-fi acceptance
is claimed. Browser phone projects emulate layout/touch only. Controlled
speech/visibility/wake-lock probes are mocks; the native audio probes verify
browser dispatch and decoding, not hearing the sound or another app resuming.

## Seven-step owner check

Use a disposable workout/profile in your normal browser and repeat through the
Home Screen icon if used. Keep a backup of real data; do not clear site storage.
Report phone/OS/browser, launch context, sound setting and whether the screen was
visible for any failure.

1. Play music in your usual app. With Boros Sound On, start a Strength rest. It
   starts immediately without a startup chime; at completion expect three chimes.
   Record whether music mixes/ducks/continues afterward. Repeat Sound Off/On.
2. Start another rest and close its popup. Expect the same timer and completion
   sequence. Reopen it: no repeat alerts. Check Reset and Close have equal width.
3. Enter results and a note, start a timer, visit Create, Calendar, Progress and
   Settings, then return to Train. Expect the same workout/input/clock/scroll and
   no destructive leave warning. Repeat with a planned and standalone Interval.
4. Repeat once with the phone deliberately locked and once after switching apps.
   Observe actual device behavior; wake lock does not block locking. On return,
   timestamps should catch up without a burst. Missing suspended-device audio is
   a browser limitation, not proof that the workout was lost.
5. Start an Interval circuit and Continuous workout: one 00:10 Warm Up each. Pause
   and resume without another. Confirm repetitions/final rests remain and
   independent Post-Workout Rest starts immediately.
6. Save repeated Incline Bench A/B with different actuals. Start the next workout
   in the same plan run: matching sets receive their own hints, new/incompatible
   sets remain blank. Clear an entered field to restore its hint; inspect History
   and change kg/lb. A newly restarted plan run must not inherit old-run hints.
7. While a workout is active, try another through Calendar, a second browser tab
   and another profile. Expect it blocked and Return to workout available. Clear
   or Stop must retain ownership; successful Save or confirmed Cancel releases it.
   Reload an unfinished Interval and explicitly recover/start the same checkpoint.

# Workout actions, Interval presentation and independent rest - 2026-10-08

Historical record: [the 2026-10-09 Train update](train-runtime-verification.md) supersedes preparation periods, route-disposal behavior and workout ownership below.

Implementation and automated verification passed. Physical acceptance remains
separate. This record supersedes older instructions that
ordinary Interval rests must be silent. It does not change Strength timer audio.

No applicable AGENTS.md was found in the repository or its ancestors. The prior
uncommitted implementation was inspected and preserved. No commit, push, deploy,
dependency installation, manifest, origin, navigation or hosting change occurred.
No owner browser storage was opened or cleared. Data tests use unique disposable
DB names; browser tests use isolated Playwright contexts on loopback static hosts.

## Changes and decisions

- Strength and Interval use `WorkoutActions` beside the session workout name,
  with Note then Instructions. The existing Note dialog is shared. Notes remain
  session-local; Interval note saves serialize behind pending checkpoints without
  pausing/advancing the timer. Failed writes retain text and an actionable error.
  Existing timer errors remain frozen until explicit saved-checkpoint recovery.
- Instructions read the started `day.instructions` snapshot. Existing copy/start
  plumbing was already correct; no parent-plan or live-library fallback was added.
  Empty snapshots say No instructions. User text stays plain. Exercise Information
  is now labeled Instructions; content, tutorial player, Note/Replace remain.
- Shared dialogs contain keyboard focus and block the background. The exercise read-only dialog initially focuses Close instead of allowing the
  tutorial iframe to receive the initial keyboard event. An explicit menu return
  target preserves focus after closing; nested dialogs keep their focus. Workout menus never navigate or control the clock.
- Circuit headings stay 16px, bold and centered. Initial circuit starts say Start
  Circuit; continuous, resume, modal and independent rest retain Start. Exercise
  names are bold; centered targets use `--training-target`; circuit rests use
  `--text`. Compiled repeat groups use 1st through 11th, starting again per circuit.
  Unrepeated circuits get no ordinal. One shared `hr` separates distinct circuits,
  even with zero rest, in addition to internal repeat grouping.
- Removed Interval Edit pending exercises and its exclusive picker/editor UI.
  The owner chose to keep NEW custom Interval creation unavailable rather than
  move it into a builder. The disabled type option explains this. Existing custom
  Interval drafts and their notes/snapshots remain supported. Strength Add/Replace
  and service amendment validation remain available and unchanged.
- Positive post-workout rest gets its own section and independent Start. Scope
  `execution.mode: rest` runs exactly preparation + workout-rest; it never writes
  activity/rest actuals. Its Stop/completion preserves every prior result and
  note, including a continuous-mode rest actual. Shared transaction, revision,
  ownership, paused-slot and rapid-click guards apply. No auto-save/completion.
- Rest-only running/paused drafts appear in Unfinished sessions for recovery.
  This is separate from meaningful exercise activity and does not relax Save or
  empty-session leave rules. Recovery is paused and excludes closed time.
- Sticky text is one flex row: complete phase time / smaller scope total, then
  an ellipsized name with full accessible description. The ring and Pause/Play
  remain separate. It also appears when the main timer is below the viewport,
  keeping independent rest reachable while scrolling up through circuit results.
  Scope totals exclude preparation; main/modal keep the original
  block ring/denominator. Sprint Madness is 480 continuous / 240 first circuit /
  60 independent-rest seconds, while its large block denominators remain 90,
  150, 30 and 60 seconds.
- Positive recovery and circuit/legacy set-rest entry now speak Rest once.
  Workout-rest entry speaks Post-Workout Rest (continuous or independent). Rest
  announcements use underlying kinds and execution/phase identities, including
  repeats and consecutive identically named rests. Preparation/zero rests stay
  silent; ordinary rests gain NO start/end beeps. Existing active start/warning/
  end assets, local-only active-name speech and triple rest-complete remain.
  Sound Off cancels speech/media; late/background/observer/resume events do not
  replay. Rest speech starts immediately, ducking an overlapping exercise-end
  cue to 35% volume rather than waiting behind its two-second asset; even a
  one-second rest announces on entry. Speech cannot advance or delay the clock.

## Persistence

Stable `boros` **v11** adds no stores/indexes and rewrites no records. Optional
rest execution and cue enums extend the existing versioned state. Phase IDs,
repeat semantics and existing engine versions remain intact. **Backup v17** uses
40 CSV tables with unchanged columns, adding enum values only. Original v16
backup/timer/session validators are frozen; originals validate before promotion.
SHA-256, Blob validation, profile/reference checks and atomic restore remain.
Restored checkpoints have no owner/anchor, are paused, and start no timer/audio.
AI remains v8. See [backup format](backup-format.md).

## Verification record

All required available automated checks pass. The broader matrices preceded the
last below-viewport sticky adjustment; final targeted matrices cover that exact
production bundle. Tests use Edge/Firefox engines with emulated phone viewports,
not physical phones. No tests are skipped.

- `npm run test:data`: **294/294 passed**, no skipped tests. Includes independent
  scope/results, actual-only Save, rapid/paused/foreign owners, stale/deleted
  callbacks, note and instruction scopes, one-second consecutive speech, zero/
  hidden/off/resume suppression, preserved v10 records/Blob bytes, strict v16
  archive validation and inert v17 restore.
- `npm run build`, `npm run typecheck`, `npm run lint`, `git diff --check`: passed; lint is clean. Git emits only existing LF/CRLF conversion notices.
- Installed Firefox focused suite: **32/32 passed** on desktop/phone viewports,
  both themes, before the final below-viewport sticky reachability adjustment.
  Command: `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright npx playwright
  test -c playwright.engines.config.ts --project=firefox-desktop
  --project=firefox-phone workout-actions-rest.spec.ts interval-timer.spec.ts
  interval.spec.ts --output=test-results/workout-actions-firefox`.
- Edge static affected suite: **224/224 passed**, root and `/project-check/`,
  desktop/phone, both themes and keyboard. Command:
  `npm run test:browser:static -- workout-actions-rest.spec.ts interval-timer.spec.ts interval-repeat.spec.ts interval.spec.ts interval-layout.spec.ts train.spec.ts train-refinements.spec.ts session-amendments.spec.ts workout-library.spec.ts journey.spec.ts group2.spec.ts restores.spec.ts --output=test-results/workout-actions-confirmed`.
  This includes full profile/photo/export/restore journeys (also without native
  randomUUID), saved data/isolation, notes, immutable history, failed writes,
  unload/leave guards, stale tabs, timer ownership and both training types.
- Final Edge timer/menu/repeat suite after below-viewport sticky access:
  **64/64 passed**, same four static projects. Command:
  `npm run test:browser:static -- workout-actions-rest.spec.ts interval-timer.spec.ts interval-repeat.spec.ts --output=test-results/workout-actions-last-timers`.
  Independent rest was scrolled BELOW the viewport, opened through sticky, resumed/
  paused through the modal and reloaded from a rest-only checkpoint. Current ID,
  notes, circuit results and owner protection survive; no session auto-completes.
  Screenshots plus geometry assertions cover 320px/light/dark, ellipsis, complete
  times, scope totals, bold targets, ordinals and zero-rest circuit boundaries.
- Final Firefox timer/menu suite after that adjustment: **22/22 passed**. Command:
  `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright npx playwright test -c playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone workout-actions-rest.spec.ts interval-timer.spec.ts --output=test-results/workout-actions-last-firefox`.
- Final production `dist/index.html` SHA-256:
  `62da58bf079be940f79fbde6e460490ec7e07be766dbfe7cc79aa74358c40e39`.
  Build receipts: `.workout-actions-build.log`, `.workout-actions-type.log`,
  `.workout-actions-lint.log`, `.workout-actions-data.log`; browser logs and
  artifacts use the matching `workout-actions-*` names under the workspace/test-results.
  Package/lock/Vite/manifest/entry source files have no diff. No hosting changes.
- Intermediate static Edge receipts: **61/88**, **200/224**, then **216/224** before
  the initial tutorial focus fix. Those are failed intermediate attempts, not
  acceptance passes. The diagnostic confirmed the iframe was still open and
  focused (Escape was consumed inside it); initial focus is now set explicitly
  AFTER `showModal()`, with an explicit return-to-menu target. No tests were skipped.

The last audio review added a delayed-media regression: immediate mocks alone
had hidden rest announcements waiting behind (and expiring during) an end asset.
Rest speech now has a separate entry path with ducking, while media stays bounded.
Earlier attempts are retained rather than counted as passes:

- The first sandboxed Node data command could not spawn test subprocesses. The
  approved local subprocess rerun executed; no dependency install was needed.
- Initial code checks caught frozen v16 type imports and the archive DB-version
  allowlist; both were updated. Existing current-version assertions and the old
  generic final Rest expectation were updated without loosening older readers.
- Initial Edge checks exposed initial focus landing inside the cross-origin tutorial
  iframe (Escape could be consumed there) and test assumptions
  about pause-write completion, scrolling under a frozen clock, unavailable custom
  Interval and the moved note control. The tests now await committed UI states,
  scroll/animate deliberately and exercise the same behavior through its new entry.
- The broader journey still expected Strength to skip the already-established
  five-second preparation; its fixed-clock assertion now checks preparation first.
  Rest-only recovery was added after reviewing the activity-filtered draft list.

## Still unverified / owner test

Automated speech tests use mocked local synthesis/media callbacks; they are not
proof of real phone sound, voice availability, mobile audio permission, lock-screen
or background behavior. Physical iOS/Android, Safari/WebKit with functioning Blob
storage, screen readers, native file dialogs and live Ko-fi remain unverified.
Prior Phase 10/11 gates and the reported production disappearance investigation
remain open; isolated passes do not establish that report's cause or resolution.

Use a disposable profile, leaving your real records untouched:

1. In Strength and Interval, open the workout hamburger. Check Note/Instructions,
   Save/Cancel, return focus and that workout notes differ from exercise/plan notes.
2. Use Repeat circuit = 2. Confirm 1st, 2nd, 3rd; check the next circuit restarts
   its numbering and there is just one distinct-circuit divider.
3. Start Circuit, scroll to the sticky timer and open its modal. Confirm one text
   row, readable times, truncated long name, synchronized Pause/Start and a scope
   total excluding preparation (large/modal denominator stays block-specific).
4. With Sound On, hear each positive ordinary Rest once and Post-Workout Rest at
   its entry. Check actual voice/cue clarity and foreground/background transitions.
5. Record a circuit, then start independent Post-Workout Rest. Pause/reload/reopen,
   resume and Stop it; verify notes/circuit results survive and no session is saved
   until you explicitly Save actual exercise activity.
6. Repeat with Sound Off. Try starts while another timer is preparing/running/
   paused, including another tab: only one timer may own the slot. Check on your
   physical phone in both themes and with its software keyboard.

# Train, library lifecycle and Progress verification - 2026-10-07

Implementation and available local verification are complete. Physical-device
acceptance remains pending. This is a
local candidate based on `dcaaab3`. No commit, push, deploy, dependency, hosting,
manifest or service-worker changes were made. Tests use disposable databases and
browser contexts; the owner's storage was not opened or cleared. No applicable
AGENTS.md was found in the project or its ancestors.

## Implemented behavior and ownership

- Train Preview reuses the Create workout summary, has no editing menu, does not
  allocate a draft, and returns focus to its underlying action. It resolves the
  current occurrence again, honoring protected drafts, saved sessions and outcomes.
- Ordinary plan edits append compatible content revisions from the current
  run-local Monday while retaining each future segment's assignments/boundaries.
  Pending current/future starts and previews use edited content. Started drafts,
  completed sessions, explicit outcomes and earlier missed weeks retain snapshots.
  Changed duration, workout identities/counts and unique-week structure still use
  the existing review/repair path. Library exercise/workout edits remain independent.
  Starts and plan saves serialize over the shared schedule transaction scope.
- Active exercise menus are Information / Note / Replace. Note titles use the
  workout name and Save retains occurrence ownership. Replacement uses the shared
  single picker with editable preset tags, requires confirmation for entered
  results/notes, commits one blank replacement snapshot, preserves position/group
  and other set/result identities, and stops an invalidated timer. Sparse unequal
  rounds omit empty rows without renumbering surviving rounds. Failed writes keep
  recoverable input and surface an error.
- Train headings/subtitles, Add Plan sizing/divider, Create Import/Save and per-set
  labels, tag initialization, builder spacing/menu/movement controls, archive color
  and additive Show archived follow the owner's request. Preview menus expose the
  requested actions; Merge remains exercise-only. Edited A defaults to source,
  picked B to destination, and Switch changes the real operation.
- Delete is implemented in one profile-scoped transaction with a conservative
  saved-scope fingerprint checked again at confirmation. Exercise deletion resolves
  merged aliases and removes only their standalone occurrences/results. Workout
  deletion uses explicit standalone/custom workout ownership. Both preserve plan
  copies/results. Plan deletion removes its template, all runs/sessions/drafts,
  outcomes/mappings/selection and timer, without a Previous Plans entry. Active
  plans use the exact requested warning. Cancel writes nothing; stale scope or
  injected failure cannot partially delete. Other profiles, measurements/photos
  and independent templates are retained.
- Minimum deleted-source identities prevent template repair from resurrecting
  deleted sources and allow copied prescriptions to remain viewable, editable,
  trainable, exportable and restorable. No deleted performance is hidden in another
  record. Mixed standalone sessions retain surviving results/notes; empty pairs
  without independent content disappear.
- Exercise and Body weight graphs share fixed axis, scrollable plot, angled labels,
  visible points, date-filter interaction and one-time initial positioning. Closing
  exercise point details retains graph position/filter. Exercise results never
  expose measurement forms, photos or deletion. As in Body weight, about ten points
  fit wide plots; the existing 44 px minimum point spacing shows fewer on narrow
  phones rather than overlapping tap targets. Plan detail adds one Exercises
  divider/heading without changing analytics ownership.

## Timer findings and incomplete workout actions

The audio unlock path reused the completion MP3 and unmuted it after preparation.
Preparation now stays muted at volume zero, including cancellation/reset; only a
successful atomic claim for the due active countdown token unmutes playback.
Generation checks reject stale callbacks, a local token guard plus persisted claim
prevents duplicate observers, and three ended-driven plays remain unchanged.
An overdue unacknowledged countdown can claim on remount; an acknowledged one cannot
replay. Count-up never alarms. The reported physical startup chime was not reproduced
on the owner's device; automated checks establish media state/callback behavior,
not acoustic or locked-phone guarantees.

Rest Timer now centers name/group, Set N/Post-Exercise, clockwise ring and the exact
Stop/Reset/Close actions. The compact sticky indicator uses the same ring and mm:ss;
Close preserves the timer. Blank rest is labeled Rest and honestly counts up.

For an incomplete occurrence, Discard Progress and Reset had the same user-visible
scope: remove its recoverable draft/notes/input/timer and return it to Pending.
Reset also maintains the existing run revision/outcome bookkeeping. Incomplete
occurrences cannot simultaneously have a saved completed session. Only Reset is
shown, with its existing scoped confirmation; no distinct recovery path was removed.

Actual unmocked capability inspection in clean Windows browser contexts:

| Browser | Secure localhost context | `typeof navigator.vibrate` |
| --- | --- | --- |
| Edge 154 | true | `function` |
| Firefox 155 | true | `undefined` |

The existing optional call is retained: Sound Off attempts one 100 ms vibration;
unsupported browsers safely do nothing. No physical motor response was verified.
No permission hack, service worker, native wrapper or browser-security bypass was added.

## Database and backup compatibility

Stable `boros` adds **database v7** with `deletedSources` only. Existing v1-v6
migrations remain; initialization errors never create an empty replacement DB.
**Backup v13** adds identity tombstones and optional paired `prunedAt` metadata,
with **33 linked CSV tables**. Strict original v1-v12 files validate before
promotion; checksums and photo verification remain required. A restore merge that
conflicts with a live/deleted identity rejects with an explicit New/Replace route;
other reviewed precedence rules remain. Clear Data includes tombstones. AI stays v5.
See [format specification](backup-format.md).

## Commands and evidence

- `npm run build`: passed (TypeScript and Vite production build).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:data`: **243/243 passed**, zero skipped, about 12 seconds.
- `npx playwright test --config playwright.static.config.ts --workers 4 --max-failures 8`: **644/644 passed** in 11.6 minutes, root/project mounts and desktop/phone layouts.
- With `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright`, `npx playwright test --config playwright.engines.config.ts lifecycle-refinements.spec.ts exercise-merge.spec.ts progress.spec.ts train.spec.ts workout-library.spec.ts backups.spec.ts restores.spec.ts --project firefox-desktop --project firefox-phone`: **68 passed; 4 harness failures** in 5.2 minutes. The failures are two older `progress.spec.ts` cases in each layout calling Chromium-only `newCDPSession`; they never reached the app. Those cases passed in Edge's full matrix. No Firefox claim is made for runtime CDP timezone overrides.
- Final saved-round display follow-up: `npx playwright test --config playwright.static.config.ts plan-content.spec.ts lifecycle-refinements.spec.ts group2.spec.ts session-amendments.spec.ts --workers 4`: **75 passed; 1 test-selector failure** in 2.0 minutes. The root-desktop worker had loaded a broad `h4` selector including exercise headings; it was corrected to direct round headings. `npx playwright test --config playwright.static.config.ts plan-content.spec.ts --workers 4`: **12/12 passed** in 29.7 seconds across all four projects. Together, all 76 affected cases pass with the corrected selector.
- With the same browser-cache environment, `npx playwright test --config playwright.engines.config.ts plan-content.spec.ts lifecycle-refinements.spec.ts group2.spec.ts session-amendments.spec.ts --project firefox-desktop --project firefox-phone`: **38/38 passed** in 2.8 minutes on the final build.
- Final `npm run build` passed (Vite 756 ms); typecheck, lint and `git diff --check` passed again after the saved-round correction. Desktop timer, light/dark views, phone prescription inputs and exercise-graph screenshots were visually inspected.
- `node tests/updates/prepare.mjs 'node_modules/.cache/gh-pages/https!github.com!jsaldana92!boros.git' a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64`: prepared read-only cached release archives and two separate current builds.
- With `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright`, `npm run test:browser:updates`: **6/6 passed** in 2.1 minutes after rebuilding the final candidate (the preceding run also passed 6/6 in 2.2 minutes) (Edge root desktop, Edge project phone, Firefox desktop). Each case retains one context/origin through both old releases and two rebuilds; IDs, active profile, photo bytes, measurements, templates, sessions/drafts and new deleted-source identities survive. The injected open failure remains actionable and does not allocate Guest.

The data suite covers 2 to 3 to 1 plan edits, unique-week/repeated copies, protected
started/history/outcome snapshots, coherent concurrent starts, independent library
edits, replacement/unequal rounds/failure recovery, deletion ownership (including
custom Save Yes), stale confirmation, injected rollback, cross-profile preservation,
no resurrection, sparse/pruned draft continuation, v6 to v7 preservation with photo
bytes, original v11/v12 archive validation and v13 export/restore/clear.

The added browser cases check real Create plan edits from 2 to 3 to 1 sets,
Train and Calendar starts, protected history, sparse saved-round labels,
read-only Preview/focus, preset tags and single Swap,
entered-data Cancel/confirm, other member results, timer invalidation, reload/saved
replacement, additive archives/retired merges, real merge direction/Switch, Delete
Cancel/confirm and active-plan removal, graph scroll/filter/modal state, and timer
media flags/ring progression/claiming/count-up. Existing suites cover guards,
profile isolation, stale saves, navigation, both themes and root/project hosting.
Timer tests mock media calls where counting playback flags; the existing separate
MP3 test observes native play/ended events. Neither proves physical sound/vibration.

During verification, the asynchronous Preview initially lost focus because its
trigger was disabled during loading; explicit return focus fixed it. Saved review
also used compressed round indices after sparse replacement; it now uses retained
round coordinates, covered by a dedicated browser regression. Earlier suite
runs also caught outdated labels/menus, archive-only expectations and old version
assertions. Those tests were updated to assert the requested behavior rather than
weakening persistence checks. PowerShell logs can contain the benign Node
NO_COLOR/FORCE_COLOR warning. The first Firefox capability probe used the default
cache path; rerunning with the repository's configured browser path succeeded.

## Owner checks still required

Use a disposable named profile and both themes. Keep real profiles/backups separate.

1. Activate a plan containing a two-set exercise. Start one workout and enter a
   result; leave it recoverable through Settings. Edit that specific occurrence in
   Create from 2 to 3 sets, then to 1. Preview/start another eligible occurrence
   through Train and Calendar: new starts use the latest count; the started draft,
   saved history, other copied workouts and independent library defaults stay intact.
2. In a repeated/superset workout enter results and a note. Replace one member:
   Cancel once, then Swap to an exercise with a different set count. Check the preset
   tags can be cleared, only that occurrence starts blank, others stay exact, reload
   resumes the swap, and Save/Calendar/Progress show the performed replacement.
3. In the disposable profile, use Delete for each library kind; Cancel each first.
   Exercise/workout deletion must preserve existing plan copies/results. Confirm
   active-plan deletion only after reviewing its warning: its Train/Calendar/Progress
   records disappear, while standalone work, measurements/photos and another profile
   remain. Download and import the resulting ZIP under a new name; inspect snapshots.
4. On the actual phone, test Sound On countdown start/Reset/open (silent), completion
   (three plays), Close/reopen, Settings detour, background/lock and resume. Test Sound
   Off vibration if supported. Check clockwise rings, compact mm:ss, and blank-rest
   count-up without an alarm. Report OS/browser and whether background restrictions
   suppress feedback; desktop emulation cannot establish these behaviors.
5. With more than ten exercise results, scroll older points, filter Start/End, open
   and close details, and confirm position/filter stay put. Check phone keyboard,
   long labels, touch targets and nested modal focus; repeat with a real screen reader.

Real iOS Safari/phone Firefox, software keyboards, assistive technology, physical
vibration/background audio, real quota/download save sheets and live Ko-fi remain
unverified. The prior Windows WebKit native IndexedDB Blob blocker remains recorded;
this update does not claim Safari acceptance. Earlier Phase 10/11 gates and the
unresolved production disappearance investigation are unchanged. Controlled local
upgrade tests do not establish the root cause of the owner's production report.

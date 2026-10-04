# Create title paths, exercise details and YouTube verification

2026-10-04. Source HEAD remains `b672c6d1329e3e9abafa1dcbca926158623ffa4f`.
No applicable AGENTS.md was found. This task started with the prior persistence
investigation's uncommitted tests/docs/npm alias and the owner's AppShell edits;
those were preserved. No database/schema/service, navigation, manifest, Vite,
lockfile, dependency, deployment or hosting change. No commit, push or deployment.

## Implemented

- `EditorTitle` replaces `EditorBreadcrumbs`. Each visible Create screen has one
  h1 with the complete plain-text path: Create, Create > Plan,
  Create > Plan > Exercise, Create > Exercise, or Create > AI for pasted input.
  AI previews use the corresponding Plan/Exercise path. There are no breadcrumb
  links/buttons or breadcrumb-only Back actions. Existing Cancel, Apply, Save and
  Close behavior/discard confirmations and route/unload guards remain.
- Shared `ActionDialog` still uses native `dialog.showModal()`. It now locks and
  restores page scroll, keeps lower dialogs inert, wraps Tab/Shift+Tab, guards
  focus, and prevents backdrop presses from blurring or clicking through.
  Only the top dialog responds to Escape. Dialog content can scroll independently
  within the viewport. Existing occurrence, confirmation and training dialogs use
  the same implementation; no second modal framework/dependency was added.
- `ExerciseDetails` retains the prescription/name/Close control and adds a
  top-right hamburger named **Exercise actions**. Its second dialog contains
  vertical Edit, Duplicate, Archive; archived templates offer Restore. Archive
  uses the existing destructive style and explicit confirmation. Closing actions
  focuses the hamburger; closing details focuses the card. Edit/duplicate/confirm
  transitions dispose of the prior dialogs. Canceling archive focuses the card.
- All actions retain the captured profile, template ID and revision, and use the
  existing services. Edits retain IDs, duplication keeps editable distinct names,
  and archive keeps the underlying record. Plans/history remain snapshots.
- Saved `instructions` and `notes` appear as separate Instructions and Note
  sections, in that order, with a divider and preserved text line breaks. Empty
  sections are omitted; user text is never rendered as HTML. Neither section reads
  plan/session notes. The tutorial follows both sections when its URL is valid.

## Player behavior and authorization

Opening a saved library exercise explicitly authorizes the third-party request.
The helper reuses existing supported HTTPS URL validation, extracts the 11-character
ID, discards **all** supplied query/fragment parameters, and constructs only
`https://www.youtube.com/embed/ID?autoplay=0&controls=1&playsinline=1&fs=1`.
No arbitrary iframe HTML, API key or player dependency is accepted. The iframe
has a fixed accessible title and fullscreen permission; no exercise name, notes,
profile ID or workout results are included in the player URL. Its cross-origin
referrer contains only the website origin. No player is mounted in library cards,
editors, import previews or unopened details. Train still has its existing
explicit external link. README/TODO now state this authorized exception; earlier
verification handoffs remain historical.

The player is responsive, at least 200×200, with standard controls and no autoplay.
This follows [YouTube's player parameters and minimum dimensions](https://developers.google.com/youtube/player_parameters).
`strict-origin-when-cross-origin` preserves the identifying referrer required by
[YouTube's embed requirements](https://developers.google.com/youtube/terms/required-minimum-functionality).
YouTube's own navigation, branding, fullscreen and app-opening choices are left
intact; app opening is not guaranteed across devices.

Closing details or entering an editor removes the iframe and its playback context.
Opening actions also removes it, so a stacked popup does not obscure an active
player. Returning to details mounts a fresh paused player, without preserving
play position. Network/embedding restrictions leave the details and Close control
available; Boros never redirects or opens another tab as a fallback. A cross-origin
iframe cannot reliably expose every player/network error to the parent without
adding an API integration; no fabricated "playback succeeded" UI is shown.

## Automated checks

All browser data is disposable and isolated from owner records. The same-context
update suite retains its one test context across releases rather than using a
fresh context per build.

- `npm run test:data`: **133/133 passed**, 8.42s. Adds valid watch/short/live/embed/
  short-link extraction and malformed/credential/host/port/duplicate-ID rejection;
  injected autoplay/private parameters are dropped. Existing migration, ownership,
  rollback, backup-integrity and saved-data tests remain intact.
- `npm run build`, `npm run typecheck`, `npm run lint`,
  `git -c core.safecrlf=false diff --check`: **passed**.
- `npm run test:browser:static -- tests/browser/create-details.spec.ts tests/browser/create-refinements.spec.ts tests/browser/exercises.spec.ts tests/browser/plans.spec.ts tests/browser/imports.spec.ts tests/browser/train.spec.ts tests/browser/progress.spec.ts tests/browser/navigation.spec.ts tests/browser/journey.spec.ts --max-failures=5`:
  **188/188 passed**, 3.0m, Edge at root/project static mounts and desktop/phone
  viewports. No SPA rewrite. Includes both themes, one title/no breadcrumb buttons,
  blocked pointer/focus/scroll, keyboard wrap and layered Escape, focus restoration,
  correct action IDs/names/archive cancellation, independent plans, separate text
  sections, valid/invalid player mounting, disposal, failed iframe requests, profile
  isolation/stale writes, guarded navigation/unload and complete export/restore
  journeys. Previous no-embed assertions were narrowed to unopened/background
  screens; authorized detail requests are intercepted and checked exactly.
- With `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright`:
  `npx playwright test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone tests/browser/create-details.spec.ts tests/browser/create-refinements.spec.ts`:
  **20/20 passed**, 57.9s, using already-installed Firefox. Same focused modal/
  editor checks in desktop and phone layouts; no browser installation.
- Reprepared the old published a87dc13/current published aa9126e artifacts and
  **two new builds of this candidate** using `tests/updates/prepare.mjs`, then ran
  `npm run test:browser:updates`: **6/6 passed**, 1.2m, Edge desktop/root, emulated
  phone/project and Firefox/root. IDs, records, photo bytes and selection survive;
  documented legacy repair is additive and initialization errors do not reset
  data. The current rebuilt entry is `index-G3qItG0i.js`. The update JSON report
  now describes this rerun; the prior investigation's published doc results remain
  historical. The actual owner-reported loss is still unresolved.

Initial focused preview: **2 passed, 2 failed, 4 not run** after the Tab test found
native dialog focus could reach browser chrome. Added explicit wrapping. Follow-up
preview runs passed 6/8, with two phone failures traced to the test clicking a
scrolled-off header coordinate outside the viewport. Two isolated phone probes
confirmed active BODY while the dialog remained modal, rather than a background
control receiving focus. The corrected test checks blocked Settings/Calendar
clicks and a visible backdrop coordinate. The final static/Firefox runs pass those
checks. Shared focus/backdrop guards remain. No data assertions were weakened.

Reviewed dark/light phone detail screenshots, including long-content scrolling,
Note separation, minimum-size simulated player and reachable Close; also inspected
the actual desktop player screenshot. Artifacts are under ignored
`test-results/static`, `test-results/engines`, and `test-results/update-runs`.
No full 352-scenario rerun or physical-device acceptance is claimed.

## Simulated versus actual YouTube verification

Automated regression players are controlled iframe fixtures or aborted requests;
they verify URL/referrer/DOM/disposal/focus behavior, **not real video playback**.

A separate network-enabled check on **2026-10-04 at 13:03 EDT** used a disposable
local Boros profile in Edge **154.0.4258.53** and Google's documented sample video
`M7lc1UVf-VE`. Actual embed returned **200** and displayed the YouTube poster and
controls. After an explicit click on Play, native video reported:
`currentTime: 0.366922`, `paused: false`, `readyState: 4`. Closing details removed
the iframe; there was still exactly one browser tab. Certificate checking stayed
enabled. Reports/screenshots: `test-results/youtube-live-check.*` and
`test-results/youtube-live-playback.*`.

The first playback probe timed out on an obsolete `.ytp-large-play-button`
selector; the visible player used `ytmCuedOverlayPlayButton` / **Play video**.
Retrying through the visible control demonstrated real playback. This was not a
network failure and did not require changing application code. It verifies this
sample on this desktop environment only, not every saved video or device.

## Exact remaining manual checks

1. On an actual iPhone/Safari and Android browser, in both themes, open a saved
   exercise with a supported, embeddable tutorial. Check that the header/tabs and
   page stay blocked while the long popup scrolls, and Close remains reachable.
2. Start playback manually; check sound, inline playback, rotation and fullscreen.
   Open Exercise actions, then dismiss it: the player should restart paused.
   Start again, then Close or Edit: playback must stop. Exercise unavailable-video/
   network restrictions without accepting a redirect or losing details/Close.
3. With a keyboard/screen reader, verify focus/announcements in details and actions,
   Tab/Shift+Tab including the real cross-origin player, Escape top-first, and focus
   return to hamburger/card. Browser/YouTube fullscreen may consume Escape first.
4. Edit a library note, save, then reopen an existing plan/session and confirm its
   original snapshot remains. Check Cancel/discard from both exercise and plan
   forms and the single plain-text title path.

Earlier device, screen-reader/voice-control, live Ko-fi, Blob-capable Safari/restore,
quota, spreadsheet and suspended-timer checks stay pending. The persistence report
still needs affected-browser before/after evidence; see its separate verification
record and read-only diagnostics. No production changes were published.

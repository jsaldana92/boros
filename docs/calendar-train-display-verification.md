# Calendar and Train display refinements — 2026-10-05

Scope: the owner's `ccd02cce` attachment. Inspected the working implementation,
TODO, configuration and existing tests before editing. No applicable AGENTS.md
was found. Existing unrelated changes, owner records, deployment configuration
and installed-app identity are preserved. No dependencies, commits, push, deploy
or hosting changes. Earlier phase/hash-routing handoffs remain historical.

## Implementation and decisions

- Create, Calendar and Train share the weeks / training days / rest days summary.
  Counts describe one program week, not progress. Legacy unbounded duration stays
  explicit. Train cards have two subtitle rows derived from the committed instance
  and current saved-zone week, independent of detail browsing. Upcoming, Paused
  and Ended replace invalid week numbers. Active instances take precedence over
  previous ones; existing ambiguous active instances have separate cards.
- Train details bind by the clicked instance ID. Removing that instance in another
  tab produces an unavailable state; it never falls back to another. No context
  selector remains. Scheduled / Unscheduled replaces the checkmark label.
- Full Train weeks include noninteractive Rest rows. Scheduled exceptions retain
  their dates, even when two different occurrences share one date. Unscheduled
  training uses saved order visually Monday onward without changing any record.
  Excluded weeks and inactive boundaries stay empty. Rest rows are not occurrences.
- Calendar has a separate service read model. Scheduled occurrences retain existing
  obligations/outcomes. Unscheduled pending/draft/skip records produce no dated
  entries. Saved sessions appear at `completedAt`; partials stay Incomplete.
  Explicit completion markers use `updatedAt`, the last completion action rather
  than the initial marker's creation time. Occurrence zones are frozen; old logs
  without an occurrence use the profile zone (browser zone only if absent).
  Saved-session keys suppress duplicate manual markers. Opening a saved session
  uses its actual session ID, never a reconstructed occurrence date. The Calendar
  marker dialog displays the actual activity date, while retaining its original
  reference for correction/reset.
- Month consists of complete Monday–Sunday row sections, each with a centered
  Week N heading and divider. These labels are not program weeks. Adjacent dates,
  Today, selection and original theme surfaces remain. Seven columns align on
  desktop; each row scrolls horizontally on narrow screens with keyboard focus.
  Day/Week are single periods. Existing pointer/modal/scroll behavior is retained.
- Ten muted plan accents are allocated by stable plan ID in a profile-scoped
  `boros.calendar-colors.<profileId>` localStorage preference. Existing assignments
  survive list order/additions/removals; unused colors are preferred and colors
  repeat beyond ten plans. The map retains removed IDs for later reappearance.
  This cosmetic preference is separate from records/backups and falls back to
  memory if localStorage is unavailable. Names/day labels/statuses remain visible.
- Plan/Completed/Skipped rings use shared blue/green/amber tokens in both themes.
  Neutral tracks, percentages, accessible counts and status-pill semantics remain.
- Current/Previous action dialogs show only their actions and dismissal, with an
  invisible accessible name. Incidental timezone/internal identifier display text
  is removed. Reset/End/Delete have exactly the requested title/body/actions;
  existing transactional scopes, history preservation and failure errors remain.
- Edit captures the run/results/drafts fingerprint and effective week at opening.
  Direct Save validates chosen mappings and rechecks that baseline transactionally.
  Concurrent writes keep input and produce an actionable error. The baseline read
  deliberately accepts an existing invalid mapping so repair can open; commit
  still validates the replacement. No extra confirmation step or weakened guard.
- Database **boros v5**, AI **v3**, backup **v8** and strict old-format readers stay
  unchanged. All new Calendar dates/layout/colors are derived or cosmetic.

## Verification record

Complete in available local verification. Physical-device/AT acceptance remains
pending. Results below identify the exact stage tested; earlier phase gates are
not newly marked complete.

- Production build passed after the initial sandbox blocked native Vite/Tailwind
  access (`spawn EPERM`, secondary native-module decoding error). The approved
  local execution succeeded. Typecheck, lint and diff checks passed.
- Final data suite: **189/189**, **7.820s**. Nine new tests cover actual completion
  dates, partial/manual/deduplication, zone/midnight/DST, profile isolation, legacy
  and reassigned unscheduled records, stale editor baselines, mapping repair,
  current progression/boundaries, full-week collision/rest layout, month boundaries,
  and color stability. Existing destructive scope/rollback/backup tests pass.
- Initial data run: **187/188**; a newly copied legacy fixture retained its unique
  occurrence key. Corrected the fixture, then **188/188** before the repair test.
- Initial affected static suite: **96/112**, **2.7m**. All new scenarios passed;
  16 old weekly cases still expected the removed plan-note subtitle. Updated those
  expectations and the old Leave confirmation selectors to the requested UI.
- Firefox new scenarios: **12/12**, **1.7m**, desktop/phone, before the final
  mapping-repair baseline adjustment. Includes actual activity dates, identity,
  gaps, remapping, direct-save conflicts, colors, month rows and exact dialogs.
- Retained-context updates: **6/6**, **1.8m**, with two freshly prepared candidates
  including the mapping-repair baseline. Preserved original profile IDs, active
  selection, all linked records and photo bytes across local previous/deployed
  fixtures and two rebuilds. This preceded only the cosmetic change to allocate
  colors for plans with runs/history rather than unused library templates.
- Complete static suite: **488/496**, **10.4m**, before the final baseline and palette
  adjustments. Eight failures were two obsolete expectations repeated across the
  four configurations: the old Create editor summary and Group 3's removed Save
  popup. Both tests are corrected; the final affected rerun includes them.
- Final rebuilt affected static suite: **120/120**, **2.5m**, including every
  previously failing case, all Calendar display/repair/stale-save cases and the
  affected Create/Group 3 flows. Final Firefox: **14/14**, **2.0m**, serial desktop
  and phone contexts, including the new mapping-repair and color-addition cases.
  Full 496-case suite was not repeated after these focused corrections; its other
  passed checks remain the recorded broader regression evidence.
- Visually reviewed dark phone and light desktop month screenshots: aligned week
  rows, distinct restrained accents, preserved theme surfaces and fixed navigation.

Commands and artifacts:

```text
npm run build
npm run typecheck
npm run lint
git diff --check
npm run test:data
npm run test:browser:static
npm run test:browser:static -- calendar-train-display.spec.ts calendar-refinements.spec.ts calendar.spec.ts group3.spec.ts plans.spec.ts plan-details.spec.ts
node node_modules/@playwright/test/cli.js test --config playwright.engines.config.ts calendar-train-display.spec.ts --project=firefox-desktop --project=firefox-phone --workers=1
node tests/updates/prepare.mjs test-results/persistence-deployed a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
npm run test:browser:updates
```

Set `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright` for installed Firefox
and update tests. Logs are `test-results/calendar-train-*.log`; screenshots/traces
are in the configured static/engines output directories. Static tests use Edge,
root and `/project-check/`, desktop/phone, no SPA rewrite, isolated browser contexts.
New layout assertions also cover 800px tablet and both themes. Data tests create
and delete only their uniquely named disposable databases. Update tests use the
same isolated origin/context/storage through old release, deployed fixture and
two fresh builds; no owner browser or production data is touched.

## Exact manual checks still required

Use a disposable profile on an actual phone and Safari, without changing the
owner's original storage context. Existing physical-device/AT/audio/vibration,
live Ko-fi and deployment-loss release gates remain unverified.

1. In dark/light Month view, swipe each complete week horizontally through Sunday;
   scroll vertically, change month across December/January, use Today and open an
   event with one tap. Check that dates, dialogs, buttons and text stay reachable
   above the keyboard, safe area and fixed navigation. Repeat Day and Week.
2. In Train, open an unscheduled three-day plan: Monday–Wednesday are training and
   Thursday–Sunday are Rest. Save a full day, a partial day and Mark as Complete on
   today's actual date. Calendar should show exactly those three activities today,
   with the partial Incomplete and no pending obligations on visual weekdays.
3. Complete a scheduled Monday, then Edit its mapping and move another untouched
   day onto Monday. Save should return directly to Current Plans. Train/Calendar
   should retain both Monday occurrences; next week should use the new mappings.
   Move a free week forward: the main card pauses for the excluded week, and detail
   week browsing must not change the main card's actual progression label.
4. With VoiceOver/TalkBack or a desktop screen reader, navigate the week sections,
   Rest rows and colored events; verify plan/day/status remain understandable
   without color. Check accessible names, modal focus/dismissal and focus return.
5. In a disposable plan only, cancel then confirm Reset, End and historical Delete.
   Confirm the exact short copy, retained completed history after End, removed
   unfinished sessions, and unaffected other plans/profiles. Keep valued data backed
   up before destructive spot checks.

The production deployment-persistence report is still unresolved. Local update
passes are regression evidence, not a confirmed cause or production fix. No
deployment was performed or authorized by this task.

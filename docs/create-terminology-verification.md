# Workout terminology and Create refinements (2026-10-05)

Status: complete in available local verification. Physical-device release gates
remain unverified. Historical handoffs are preserved in TODO.

## Scope and decisions

Read the attached request, TODO, PlanEditor, shared PrescriptionEditor, library
filters, scheduling/session/progress labels, validation/AI contracts, styles,
configuration and tests before editing. No applicable AGENTS.md was found in the
repository or ancestor directories. Started clean at
`b9b89ba` (plans with different trainnig weeks).

- Workout means the ordered collection of exercises previously called a training
  day. Exercise still means one movement. Labels, headings, summaries, move/delete
  controls, errors, Progress metrics/ring names, and AI instruction prose use the
  new terms. Calendar dates, Day/Week/Month views and rest days retain their meaning.
- No schema, version, identity or stored-field renaming: **boros v5**, **AI v4**,
  **backup v10** remain. Literal `trainingDaysPerWeek`, `days`, `dayId`, internal
  `TrainingDay` types and CSS classes are intentional. The legacy AI
  `kind: "workout"` / `workout` key still mean an individual exercise, explicitly
  explained in the exercise formatting prompt. Earlier payload readers are intact.
- No rewriting of saved/default workout names or user instructions/notes/imported
  text. A browser regression saves literal "Training day movement", "Training days
  stay as written." and a plan with those words, then verifies exact preservation.
- Unique training weeks? retains the accessible switch and boolean behavior with
  **Yes/No** visible choices. The existing two-column row aligns its groups left
  and right. At 320px the right label wraps inside its column without overflow.
- `.plan-top-fields` uses one **18px** gap token, matching the established field
  spacing. Input-to-label spacing stays 6px; nested workout/exercise/week sections
  are outside that wrapper. Only the Plan builder's two add-button types use
  `.plan-add-button` with **80%** width and automatic inline margins.
- `TagPills` is shared by library filtering and prescription assignment. It retains
  the existing compact pill styling, pressed state, visible focus and three-row
  horizontal scroll area, sorted by normalized name. The editor starts expanded
  and supports collapse; it contains no filtering/ANY-match caption.
- Available pill choices combine this profile's active tags with retained initial
  snapshot tags and locally entered names. Deselecting a newly created draft tag
  keeps it available for reselection until leaving the editor. Normalized duplicate
  entry reuses the existing choice; the 50-assignment limit remains. No render-time
  database writes. Save/cancel and library-versus-plan ownership rules are unchanged.

## Verification

- `npm run build`: pass on final application source.
- `npm run typecheck`: pass.
- `npm run lint`: pass, no findings.
- `npm run test:data`: **213/213**, 10.360 s final. Includes strict AI v1-v4,
  backup v1-v10 validation/round trips, populated database reopen, cycles,
  prescription validation, ownership, concurrency and frozen snapshots.
- Initial focused static Create suite: **21/25**. Two exact-label checks found the
  implicit select label included option text; added explicit `aria-label`.
  Two obsolete assertions still expected the old move destination/error wording.
  Corrected focused rerun: **15/15**, 22.2 s (Plan, Create refinements and new tests).
- Final affected Edge static matrix: **308/308 pass**, 6.4 m. Invoked the installed CLI directly:

  ```powershell
  $affectedSpecs = @(git diff --name-only -- tests/browser | Where-Object { $_ -like '*.spec.ts' }) + @('tests/browser/create-terminology.spec.ts')
  node node_modules/@playwright/test/cli.js test --config playwright.static.config.ts @affectedSpecs
  ```

  This runs 308 cases: 77 each at root-desktop, root-phone, project-desktop and
  project-phone. Plain static server, no rewrite fallback. Suites: calendar-redesign,
  calendar-refinements, calendar-train-display, create-refinements, exercises,
  imports, journey, plan-details, plans, session-amendments, train-refinements,
  train, unique-weeks, weekly, plus new create-terminology. An initial `npx`
  invocation failed executable resolution before tests started; direct CLI worked.
- Focused Firefox: **28/28 pass**, 2.0 m. Exact command:

  ```powershell
  $env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
  npx playwright test --config playwright.engines.config.ts tests/browser/create-terminology.spec.ts tests/browser/create-refinements.spec.ts tests/browser/unique-weeks.spec.ts --project=firefox-desktop --project=firefox-phone
  ```

- Retained-context upgrade regression: **6/6 pass**, 2.3 m. Preparation passed:

  ```powershell
  node tests/updates/prepare.mjs 'node_modules/.cache/gh-pages/https!github.com!jsaldana92!boros.git' a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
  $env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
  npm run test:browser:updates
  ```

  Read-only release archives and two fresh local builds retain the SAME context
  and origin throughout each test; profiles, active selection, all record IDs,
  exercise/plan/session/draft/measurement/photo data and cycle amendments survive.
  No owner browser/profile or saved record is accessed or cleared.
- `git diff --check`: pass, including final documentation.

New UI tests cover both themes, 1440/390/320px layout, measured 18px gaps and 80%
buttons, Yes/No and canceled populated mode change, keyboard Space/Enter selection,
alphabetic order, duplicate entry, validation retention, cancellation, reload,
profile switching, independent plan tags and AI-preview cancellation. Existing
large-tag-library tests cover 38 options, collapse, scrolling and keyboard focus.
Inspected narrow-phone dark Plan, desktop light Exercise and phone light Exercise
screenshots; artifacts are retained with the suites. Automation does not simulate
a real software keyboard, assistive technology or Safari.

### Candidate fingerprint

- `dist/index.html` SHA-256:
  `5655d8ed0a84a994cb5c2241f5a2de66b977da464ebd16ba17f621c81b5f7836`
- `assets/index-DorE8heI.js` SHA-256:
  `60462d56d8fe6a90464beddc5c8900665e46693898eefccc62800b9c7f7e4816`

Logs: ignored `terminology-*.log`. Artifacts: `test-results/static`,
`test-results/engines`, `test-results/update-runs`; four-stage build receipts in
`test-results/update-builds/builds.json`. The full unrelated browser suite was not
rerun for this wording/control change; earlier totals remain historical.

## Terminology audit

Searched source case-insensitively for `training day`, `training days`, and hyphenated
forms. Only internal `.training-day-card(s)` selectors remain as literal matches;
camelCase types/fields and versioned examples retain their published keys. No
user-facing training-day UI string remains. User-owned names can intentionally
contain the old words. Current README/AI terminology was updated; historical TODO
handoffs and verification documents retain their original text and results.

## Exact remaining manual checks

Use a disposable profile on a physical phone, in both themes:

1. Create Plan: check left/right Duration and Yes/No controls with the keyboard
   open. Enter duration 4, choose Yes and 2 unique weeks. Confirm both weeks show
   Workouts labels and centered reachable Add exercise/Add workout buttons.
   Populate Week 2, choose No, Cancel, and verify its contents remain.
2. Edit an exercise: select and deselect pills, create a tag, enter the same name
   with different case/outer spaces, and verify one selected pill. Save/reload,
   then change selections and Cancel; saved assignments must stay unchanged.
   With many tags, swipe their area and ensure the bottom navigation/gesture area
   is not accidentally activated. Repeat in a nested plan editor and AI preview.
3. In Safari and with VoiceOver/TalkBack/hardware keyboard, check label reading,
   switch state, pill pressed state, visible focus, expand/collapse, scroll
   reachability, field errors and dialog focus return.
4. Carry forward physical background/locked-device timers, sound/vibration and
   live Ko-fi checks. The prior production data-loss report remains unresolved;
   local same-context update success is not a production diagnosis or fix.

No commit, push, deploy, dependency installation, hosting/manifest change, data
migration, browser-data deletion, remote storage or security bypass was performed.

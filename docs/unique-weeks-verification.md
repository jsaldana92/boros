# Unique-week cycles — implementation and verification (2026-10-05)

Status: implemented and passed available local verification. Data, build, types,
lint, full Edge matrix, Firefox and retained-context updates pass. Physical gates
are unverified.

## Scope and preservation

Read the owner's attached request, TODO, current plan/schedule/session/analytics,
AI/backup/restore models, navigation guards, configuration and tests before edits.
No applicable AGENTS.md was found in the repository or ancestor directories.
Started at HEAD `6179937de8523885d9d8ba6c15d300a397044b36` with the preceding
Calendar/Support/Train changes already uncommitted. Those changes are retained.
No dependency, IndexedDB store/index/name, manifest identity, hosting, commit,
push, deployment or owner-browser-data change was made.

- `src/schemas/plan.ts` owns divisor validation, ordered week definitions and the
  shared actual-program-week resolver. Optional `weeks: [{id, dayIds}]` partitions
  the flattened day snapshots. Each week has 1-7 days; unique counts are at least
  two and divide finite duration. Absence retains legacy repeating/unbounded plans.
- Set UUIDs live beside the cycle occurrence's prescription in `setIds`. Existing
  snapshots are not rewritten. New session structures reuse those identities;
  session-only additions append fresh IDs and preserve the original target prefix.
- Calendar/Train share `occurrences`, with gap-aware actual program week and the
  cycle resolver. New cycle runs use program-week occurrence keys; old identities
  remain unchanged. Per-definition mappings permit the same weekday across weeks
  but reject duplicates inside one definition. Protected dates retain frozen refs.
- Create reuses the existing editors, including unequal supersets, rest and tags.
  Exact labels and headings are applied; invalid duration retains all sections.
  Reductions/Off confirm populated loss; duplication remaps full weekly structure.
  Compact summaries use ranges and Progress counts prescribed occurrences, not
  the flattened number of days multiplied by duration.
- Custom Create leave guards cover the overall parent draft, including nested
  prescriptions and AI previews. Cancel retains fields/focus/scroll; Leave only
  abandons unsaved component state. Reverted empty input and generated empty
  sections do not create dirty state. Real reload/close warnings and the Train
  Settings flush/return behavior remain.
- AI v4 adds strict repeating/unique shapes and optional notes; original v1-v3
  readers are frozen. Backup v10 adds definitions and prescribed set UUIDs plus
  a linked `unique_weeks.csv` table (31 tables total), preserving strict v1-v9
  field/CSV contracts and original CRC/SHA-256 checks before envelope promotion.
  Whole-plan-family restore and template repair remain profile-scoped.

## Commands and actual results

- `npm run build`: **pass** (TypeScript and production bundle).
- `npm run typecheck`: **pass**.
- `npm run lint`: **pass**, no findings.
- `git diff --check`: **pass**, including the final documentation updates.
- `npm run test:data`: **213/213 pass**, 11.85 s on final run. Disposable named
  fake-IndexedDB databases only. Includes divisors, legacy behavior, 4/3-day cycle
  totals, repeated identity, per-week mappings, protected drafts, year/DST moves,
  stable hints, immutable/session-only snapshots, lifecycle, ownership/concurrency,
  heterogeneous AI groups, strict older versions, populated v5 reopen and v10
  round trips with photos and both whole-family merge priorities.
- `npm run test:browser -- tests/browser/unique-weeks.spec.ts --project=desktop`:
  **4/4 pass**, 15.4 s, including the final semantic dirty-state correction.
- `npm run test:browser:static`: **564/564 pass**, 9.8 m, full root/project
  desktop/phone production matrix (141 per project). Uses a plain static server
  without rewrites.
- `$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'; npx playwright test --config playwright.engines.config.ts tests/browser/unique-weeks.spec.ts tests/browser/session-amendments.spec.ts --project=firefox-desktop --project=firefox-phone`:
  **20/20 pass**, 1.6 m (Firefox desktop and phone viewport).
- `node tests/updates/prepare.mjs 'node_modules/.cache/gh-pages/https!github.com!jsaldana92!boros.git' a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64`:
  **pass**. Read-only cached Git archives, isolated output folders and two local
  builds; no network, checkout modification or deployment.
- `$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'; npm run test:browser:updates`:
  **6/6 pass on the final source**, 2.1 m (also 6/6 before the final guard refinement). Each case retains the SAME context and fixed origin across two
  historical release archives and two candidate builds. Verifies active owner,
  record IDs/values, committed drafts, sessions, measurements and photo bytes.
  After candidate build 1, it also creates a unique cycle, marks an outcome and
  postpones a week; build 2 must preserve the resulting definitions, set UUIDs,
  revision snapshots, keys, mappings and gaps exactly. Root Edge, project-path
  touch Edge and Firefox each cover normal and legacy-AI fixtures.

Intermediate failures are not counted as passes. The first sandboxed Node test
run could not spawn child processes (EPERM); reruns enabled local test processes.
Version assertions and a mapping-schema assertion were updated for the new wire
contract; service-level weekday conflict coverage remains. New Node photo tests
needed the existing injected image decoder and allowance for established restore
materialization of missing library references. Initial UI checks exposed implicit
select label matching and a mistaken test assumption that Appearance was a select;
controls now have exact accessible names and the test uses the existing Light
button. The first broad matrix was **556/564**: four stale last-round REST nesting
assertions, three missing trace artifacts caused by overlapping output cleanup,
and a late-added empty-form test against the preceding production build. The
REST assertion now follows the existing post-group control; final suites use
separate output directories and a fresh matching build. The full final matrix
was repeated and passed all 564 checks; no tests were omitted to claim success.

## Candidate fingerprint

Final build matches both regenerated update candidates:

- `dist/index.html` SHA-256:
  `43a1a80cc570cc6cc0bdb06699bacd3bc9b5bd1cf8431d5044f4860419987773`
- Entry `assets/index-DQx2BpzD.js` SHA-256:
  `76272b1cd1412fd3ce344bafb8e69e04b9c07ca3ef6b5a228390c47d93737358`

Logs are ignored `unique-weeks-*-final.log`; browser artifacts are isolated under
`test-results/static`, `test-results/engines`, and `test-results/update-runs`.
Release archives/receipts are under `test-results/update-builds`. Do not run a
Playwright command with default `test-results` output while another suite is
using its descendants; supply a distinct `--output` for ad-hoc runs.

## Remaining manual checks

Use a disposable profile; retain a downloaded backup before touching real data.

1. On a physical phone, create a four-week plan with two unique weeks containing
   four and three training days. Give the same exercise different targets in the
   two weeks. Test the keyboard, scrolling to Save, and the bottom gesture area.
   Reduce the week count or turn Off and cancel; verify all input remains. From a
   nested exercise, open Settings, cancel the exact Create dialog, then confirm
   Leave on another attempt. Verify saved records are still present after reload.
2. Assign weekdays separately (including Monday in both definitions). Inspect
   Train weeks 1-4; weeks 3/4 repeat 1/2 and Progress has 14 prescribed days.
   Complete or skip one occurrence, then check its later repeat remains pending.
   Move an untouched week forward and verify the same program content moves.
3. Repeat these flows in Safari and with a screen reader: field/week announcements,
   switch state, error announcements, dialog focus containment, Cancel focus/scroll
   return, and keyboard reachability. Firefox automation is not Safari or assistive
   technology verification.
4. Carry forward real background/locked-phone timer, sound/vibration and live
   Ko-fi checks from the preceding handoff. No live payment/support action was run.

The owner's production deployment-loss report remains unresolved. Local retained-
context success is evidence against a reset during these tested upgrades, not a
confirmed diagnosis or production fix. Preserve the original browser/Home Screen
context and collect the existing read-only diagnostic evidence before recovery;
export there and import in the intended context if isolation is established.

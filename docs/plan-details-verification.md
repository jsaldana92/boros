# Create plan details and Instructions — 2026-10-04

Implementation and available local regression verification are complete.
Physical-device/accessibility acceptance remains pending. Phase 10 remains
Verification pending and Phase 11 In progress. Earlier handoffs are historical.

## Scope and preservation

Read the owner request, TODO and current Create, modal, plan/import/snapshot and
backup implementation before editing. No applicable AGENTS.md was found in the
project or its ancestors. The starting tree already contained the uncommitted
Train refinements recorded in `train-refinements-verification.md`; those changes
are preserved. HEAD remains `07e5ba787fa0c1cef319e8fcbed9292bb9d8afcb`.
No commit, push, deployment, hosting edit, dependency install or owner-data access.

The new `PlanDetails.tsx` reads saved plan prescriptions. It uses `trainingBlocks`
for Train's exact standalone/group execution order, renders repeated occurrences
by stable ID, and uses one bordered box per superset. The stored group model has
an editable number, not a free-text name, so details retain `Superset N`.
Uniform targets have compact summaries; differing reps/RIR show each set without
invented shared targets. Zero RIR remains visible and unspecified RIR is omitted.
Legacy duration remains `No end date`; rest days are derived from the day count.

Plan and exercise details now share `DetailsActionsButton` and `DetailsActions`,
using the existing native `ActionDialog` stack. Only Close remains in the details
footer. The actions popup has Edit/Duplicate/Archive/Close, or Restore for archived
records. Archive cancellation returns to details; a failed archive remains in its
confirmation with an actionable error. Busy confirmations cannot dismiss while
the transaction runs. Card focus survives menu/editor/confirmation transitions.

Plan `instructions` is optional plain text, max 20,000 characters, separate from
plan notes, exercise instructions and session notes. Validation, manual editor,
AI preview/save, persistence and duplicate drafts preserve it. Blank sections and
their unneeded final divider disappear; line breaks and literal markup are safe.
Forms retain unsaved text on validation/stale/write failure; refresh recovery of
unsaved Create forms is not added.

New schedule revisions, explicit outcomes, session drafts and completed sessions
freeze `planInstructions`. Plan edits do not rewrite existing snapshots/library
defaults. Calendar's explicit refresh captures new text only in its new segment.
No Train subtitle or other Train presentation was added by this task.

Database `boros` remains Dexie v5, with no migration/reset or eager text defaults.
AI advances to v3 because v1/v2 reject unknown fields. Those older field sets stay
strict; omitted instructions stay absent. Both generated prompts preserve exact
JSON/single-code-block requirements. Backups advance to v7, preserving strict
v1–v6 JSON/CSV contracts and original CRC/SHA-256/photo validation before envelope
promotion. Plan and frozen instruction fields appear in five existing CSV tables;
the inventory remains 28 tables. All four restore choices retain winning plan
families and snapshot text.

## Verification results

- `npm run build`: passed (production bundle).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:data`: **159/159 passed**, final direct-exit run 8.325s (earlier
  complete pass 5.066s). Includes five new focused
  tests for summaries, optional text, stale/failed/profile-bound writes,
  duplicates, frozen snapshots, AI v1/v2/v3, JSON/CSV and all four restore choices.
  Existing compatibility tests now exercise original backup versions 1–6.
- `npm run test:browser:static -- tests/browser/plan-details.spec.ts`:
  **16/16 passed**, 25.3s. Same build at `/` and `/project-check/`, plain static
  server without SPA rewrites, desktop and emulated phone Edge contexts.
- With `PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/playwright`,
  `node node_modules/@playwright/test/cli.js test --config playwright.engines.config.ts tests/browser/plan-details.spec.ts tests/browser/create-details.spec.ts tests/browser/imports.spec.ts --project=firefox-desktop --project=firefox-phone`:
  **26/26 passed**, 1.6m. Includes shared exercise modal regression.
- `npm run test:browser:static`: final clean rerun **424/424 passed**, 7.1m.
  Includes all profile/exercise/plan/import/Train/Calendar/Progress/backup/restore
  and navigation suites at both static mounts and Edge viewports. The initial
  broad run was **419 passed / 5 failed**, 7.5m; the clean rerun resolves every
  failure after the test-locator corrections described below.
- `node tests/updates/prepare.mjs test-results/persistence-deployed a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64`,
  then with the browser path above, `npm run test:browser:updates`:
  **6/6 passed**, 1.7m. Each case keeps the same origin, browser context and
  storage through actual prior/published release artifacts and two independently
  built candidate bundles. Includes Edge root desktop, Edge subpath phone and
  Firefox root, plus legacy AI repair. Every existing ID/record, active selection
  and photo byte survives. After build 1, the test adds AI v3 plan instructions,
  frozen weekly marker/revisions, moved week, closed/fresh run and Sound preference;
  all remain identical after build 2 and page reopen. Failed initialization still
  reports an error without replacing the workspace.
- Final diff/working-tree review: `git diff --check` passed. Package/lockfile,
  Vite, database schema, HTML, manifest/assets and owner AppShell are unchanged
  by this task. Existing uncommitted navigation/Train changes remain preserved.

Browser checks cover saved order, repeated names, unequal superset counts,
heterogeneous reps/RIR, optional sections, plain markup/newlines, manual create,
save/reload/edit/duplicate, duplicate-name and stale-save input retention,
archive confirmation/cancel/restore, two-profile isolation, old AI imports,
top-only interaction, background focus/scroll locking, Escape, action menu Close,
card focus return, no extra overlays, both themes and unchanged address. Long
names/instructions and 200% root text pass at 320, 768 and 1280px. Screenshots were
visually inspected for light desktop and dark Firefox phone hierarchy, dividers,
shared superset border and dimmed target summaries. Real devices are not implied.

Initial diagnostic runs: the sandbox blocked Node test-worker spawning with
`EPERM`; rerunning outside the sandbox used only disposable databases. The first
executable data run was 158 passed/1 failed: the new schedule-refresh fixture used
a past date. It was corrected to the next local Monday, respecting the production
guard; the final data run passed all 159. PowerShell's trailing `rg` returned 1
because no failures remained; the TAP suite itself reports zero failures.

The initial broad browser run found two test-only locator issues: the old plan
restore-conflict test used an unqualified Close selector, now ambiguous across
two dialogs (four mounts/viewports), and a new test's generic Instructions label
matched the read-only region before asynchronous Duplicate opened the editor
(one case). Tests now target the named popup and actual form controls respectively.
No application change was needed for those failures. The final full rerun uses
those corrected tests. Firefox and retained-context passes used the same final
application code; their earlier test-only locators had already passed there.

## Exact remaining manual checks

1. On a disposable profile in an actual iPhone/Safari and Android browser, create
   a plan with two days, a repeated exercise, a superset with unequal counts,
   varied reps/RIR including zero, multiline Instructions and a separate Note.
   Open its card in both themes; confirm the order, group box, omitted optional
   RIR, long-text scrolling and reachable Close with enlarged system text.
2. Open Plan actions; close it and reopen, then Edit, save, reload and Duplicate.
   Confirm Instructions/Note stay distinct. Cancel an Archive confirmation and
   verify details return; with a disposable copy, archive/restore. Check touch
   targets, rotation, keyboard visibility and safe-area spacing.
3. With a real screen reader and/or hardware keyboard, traverse details/actions;
   verify heading/target announcements, background exclusion, top-first Escape
   and focus return to hamburger/card. Automated keyboard checks do not establish
   assistive-technology acceptance.
4. On a Blob-capable Safari/iOS browser, export the disposable profile and restore
   under a new name; compare plan instructions, notes, frozen history and photos.
   Open exported instruction CSVs in the intended spreadsheet application to
   check multiline/formula-looking text presentation. Automated byte/CSV tests
   do not establish those applications' behavior.

Carried forward: live YouTube/Ko-fi behavior, real quota/download sheets,
suspended-device timers/audio/vibration, and earlier Safari/photo/AT gates remain
unverified here. External-chatbot adherence to prompts is not guaranteed.
The owner's reported post-deploy blank workspace is still unresolved. Local
same-context tests do not identify its cause. Preserve accessible exports and
collect read-only before/after diagnostics at the next separately authorized
deployment using `deployment-persistence-verification.md`. No new publication or
phone pass is claimed.

# Train refinements verification — 2026-10-04

Implemented locally from the owner's latest attachment. Read the repository TODO,
approved UI, prior Train/persistence handoffs, source and installed configuration.
No applicable AGENTS.md was present. Started clean at
`07e5ba787fa0c1cef319e8fcbed9292bb9d8afcb`. No commit, push, deployment, hosting
change, dependency installation or access to the owner's browser data occurred.

## Behavior and persistence

- Recovery cards require entered results, explicit skips or applied notes. Zero
  is entered data; timers, placeholders and opening a day are not. Empty persisted
  artifacts after an interruption stay available through the day, without a card.
  Nothing is deleted on unload, backgrounding or unmount. Autosave remains 400 ms
  plus write time; unapplied notes and the last pending edits are not guaranteed
  recovery data. Existing unload warnings remain for unsaved input.
- Cancel and every deliberate top-level departure from an entered session use
  the exact Stay/Leave confirmation. Confirmed Leave serializes after any active
  autosave, then deletes the draft/timer. Empty Cancel deletes without prompting.
  Failed deletion retains input and reports an error. Clear confirms separately,
  resets actual input/notes/timer only, and keeps the prescription/editor open.
- Reset uses profile/run/occurrence identity, run revision and a preview
  fingerprint, rechecked inside one write transaction. It deletes that occurrence's
  saved session, finalized/recovery draft, marker and timer. Remaining records drive
  Calendar/Progress. Run revision prevents stale Start; missing drafts reject
  autosave, Clear, Save and timer writes. Deletion is never an upsert.
- Leave Plan records `closedAt`, updates the schedule cutoff, deletes all unfinished
  run drafts and their timer, and updates selection in the same transaction. All
  weeks/days are included. Saved history/markers, templates, body measurements and
  other profiles/plans/runs stay intact. Other open runs of the same template remain
  selectable. Adding the template after all its runs close creates a fresh run.
  Services reject closed-run starts, updates and markers; committed retries are
  harmless and failed transactions roll back. Timer removal stops mounted feedback,
  including in another tab; controller generation guards cancel pending playback.
- Old **Remove from Train** stored selection only. It did not record definitive
  abandonment. **Stop Scheduling** also intentionally retained drafts. Neither is
  evidence that a run was left. The startup/profile-selection/restore repair only
  removes drafts with an exact owned run/template and a valid explicit `closedAt`,
  excluding anything linked to completed history. Ambiguous legacy drafts remain.
  To intentionally discard one such draft, resume it and use Cancel → Leave after
  reviewing/exporting anything wanted. Automatic deletion by name/archive/selection
  would be unsafe and is not implemented.
- Database name `boros` and Dexie schema **5** remain. Optional closure metadata
  needs no new index/store or eager migration. Backup **6** retains closure and adds
  its schedules CSV column; strict **1–5** versions keep their frozen original
  schemas, CSVs, CRC and SHA-256 checks. Reviewed restore normalizes conclusively
  closed unfinished drafts after family choice and ownership/remapping. Counts
  distinguish omitted imports from deleted local remnants. Completed history stays.
  See [backup format](backup-format.md).

## Presentation and hints

Recovery cards contain only plan/date and smaller day name, with an accessible
resume label. Add Plan/empty text are centered; plans use one/two columns and
recovery uses one/two/three at 650/1000 px. Plan detail omits its note, uses Week N,
Incomplete/Resume/Discard Progress and equal Back to Plans/Leave Plan controls.
Returning from a session preserves its run and displayed week.

Session subtitle is plan name only; the started date uses the stored occurrence
zone (profile/device fallback for legacy unassigned records), retaining the original
full timestamp. Set headings/targets are centered with shared contrasting orange
tokens. Input unit labels remain. Information uses the frozen session prescription
in training and historical review: optional Instructions, Note, trusted YouTube
embed; separators only between present sections; plain empty message and only
Close. The shared modal retains focus behavior and disposes the iframe on close.

Hints match the exact profile, plan, run, day, occurrence and set. Candidate weeks
must precede this week, with completion no later than the draft's start. Order is
completion timestamp descending, logged timestamp descending, then UUID descending.
Each set uses one non-skipped actual result, falling back to an older corresponding
set if the newer one was skipped. Fields are never assembled across results.
Unknown RIR stays missing; zero is preserved; kg converts only for display. Sets
have no stable IDs, so changed target/count arrays, names or provenance do not match.
Repeated exercises/superset members remain separate. Placeholders have a muted
token and accessible explanation; they never count as input, validation or a set.
No historical prescription or result is rewritten for hints.

Calculated from the actual CSS foreground/background tokens: target contrast is
12.32:1 dark and 6.62:1 light; previous-result placeholders are 7.31:1 dark and
5.14:1 light against their input surfaces. This does not replace device/AT review.

## Actual verification

Available local automated checks pass. Device/live-service checks remain separate.

| Check | Result |
| --- | --- |
| Build / typecheck / lint | Final candidate passed; lint reports no warnings |
| Data suite | **154/154**, 4.490 s; uniquely named fake IndexedDB databases |
| Focused root desktop | **11/11**, 21.9 s; new Train cases plus Calendar |
| Full plain-static root/project × Edge desktop/phone | Final **408/408**, 6.9 min, without SPA fallback |
| Firefox affected Train/weekly/navigation, desktop/phone | **50/50**, 3.3 min |
| Same-context releases → two local rebuilds | Final rebuilt candidate **6/6**, 1.7 min |
| Physical phone/Safari/assistive technology/live services | Not performed; manual gates below |

Firefox's affected 50-test run preceded the final restore-preview count-only
correction; Train/navigation code did not change afterward. The final full static,
data and retained-context update runs include that correction. `git diff --check`
passes. Logs live in ignored `test-results/train-refinements-data-final.txt`,
`train-refinements-browser-final-2.txt`, `train-refinements-firefox-final.txt`, and
`train-refinements-updates-final-2.txt`; update build hashes/receipts remain under
`test-results/update-builds` and `test-results/update-runs`.

The nine new data tests cover input presence; queued/running autosaves; deletion
failure; stale revisions; occurrence-only Reset and rollback; scheduled Pending,
Due Today and Past Due; future cutoff with historical retention; multi-week Leave
and complete rollback; other run/plan/profile/measurement isolation; idempotent
cleanup; new/replace/device/import normalization; strict backup compatibility;
deterministic partial/repeated/superset/zero/unit hints. Existing populated migration,
restoration, photo, ownership and hostile-archive tests remain in the data suite.

Seven new browser scenarios cover both themes, 390/800/1280 px cards, timer-only
Cancel, interruption/zero recovery, exact destructive copy and cancellation,
failed delete/Clear, multi-week Leave/re-add, reset statistics/Calendar, placeholders,
optional information and focus, and two tabs attempting to save after Reset/Leave.
Embeds are simulated; these tests do not establish live video availability.

Commands (PowerShell, no deploy):

```powershell
npm run build
npm run typecheck
npm run lint
npm run test:data
npm run test:browser:static
$env:PLAYWRIGHT_BROWSERS_PATH = 'node_modules/.cache/playwright'
node node_modules/@playwright/test/cli.js test --config playwright.engines.config.ts tests/browser/train-refinements.spec.ts tests/browser/train.spec.ts tests/browser/weekly.spec.ts tests/browser/navigation.spec.ts --project=firefox-desktop --project=firefox-phone
node tests/updates/prepare.mjs test-results/persistence-deployed a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
npm run test:browser:updates
git diff --check
```

The update harness uses the existing isolated gh-pages checkout, actual prior and
published artifacts, and two independently built candidates. Each case retains
the same browser context/storage and exact origin while server files switch;
native IDB reads compare IDs, every record, active selection and photo bytes across
refresh/page reopening. Build 1 adds a weekly marker/gap, then closes and re-adds
that run before build 2, which must preserve both closed and fresh identities.
Tests also retain storage-opening errors without an empty Guest replacement.
Edge root, Edge phone subpath and Firefox root each run normal/legacy-AI fixtures.
The owner's live deployment loss remains **unresolved**, not a claimed code fix.

Diagnostic history: initial browser fixtures used an invalid AI notes property,
then were corrected to enter the note through the actual editor. First focused
run: 13 pass / 4 fail (1.8 min). One real return-week issue was fixed; remaining
failures expected old navigation/empty-card behavior or implicitly selected an
arbitrary independent run. Next focused run: 26 pass / 1 fail (1.5 min), another
old Calendar departure assumption. Corrected focused run: 11/11. The initial broad
suite finished **392 passed / 16 failed**, 8.6 min: four assertions repeated across
the four hosting/viewport projects. It exposed hostname checks matching the new local `youtube-*.js` chunk and old
timer-only recovery/departure assumptions. Test corrections keep external requests
blocked unless explicitly opened, and use actual interruption for recovery cases.
Initial data failures were obsolete version/status expectations; no check is
represented as passed until its corrected rerun passes. Restore review was also
corrected to count omitted imported remnants separately from removed local drafts,
without claiming that whole families were removed by draft-only cleanup. Final
data and rebuilt update checks above include that correction.

The final complete static rerun passed **408/408**. No remaining automated failure
is being relabeled as a manual check.

Inspected screenshots: dark phone recovery, light desktop recovery, and dark 320 px
session. The scripts additionally assert responsive columns/no horizontal overflow
and focused fields/actions above fixed navigation. Full-page captures do not prove
physical keyboard/safe-area behavior.

## Exact pending manual checks

Use a disposable named profile and plan; export any real data before reviewing
destructive actions. Do not reset a real workout merely for testing.

1. On a physical phone in both themes/orientations, enter zero load/reps/RIR and
   apply a note. Wait for Saving to disappear, background/close/reopen Boros and
   resume. Confirm the original started date and input; use Cancel → Stay, then
   Cancel → Leave. Verify its recovery card stays absent after refresh. Check
   keyboard reachability, long names, large text and bottom safe spacing.
2. In the disposable run, save one week and leave two later unfinished weeks.
   Cancel Leave Plan first; then confirm it. Verify saved Progress history remains,
   all unfinished cards disappear, any sound stops, and re-adding starts Week 1.
   Test Reset on one disposable completed day and confirm only its results vanish.
3. With VoiceOver/TalkBack or a desktop screen reader, traverse recovery cards,
   previous-result field descriptions, targets and stacked confirmations; confirm
   focus returns on Close/Stay. In information, check the real YouTube player,
   controls and that closing stops playback. Test native device audio/vibration,
   interruption and background timer behavior; desktop engine success is not this.
4. Carry forward real Safari/iOS photo-bearing export → new-name import → reload,
   device download/save sheets, live Ko-fi, real quota/storage eviction, spreadsheet
   apps and all outstanding release gates. Windows WebKit's prior Blob limitation
   is not a Safari acceptance pass. These were not rerun as live/device checks.
5. For the separate deployment incident, follow the read-only before/after
   diagnostics in [the persistence investigation](deployment-persistence-verification.md)
   at the next separately authorized deployment in the same affected context.
   No deployment or owner-data clearing was performed here.

# Strict hints, contextual History and Strength L/R Distinction

Verified locally on 2026-10-13. Implemented with passing available automated
coverage; physical-device acceptance remains pending. Earlier phase/release gates
and the separate production persistence investigation remain open.

## Behavior and contracts

- Hints use one latest compatible saved exercise occurrence, ordered by actual
  performance time with stable ID ties. The entire ordered set/reps/RIR
  prescription, missing-versus-zero RIR, mode, canonical identity, independent
  occurrence and workout/plan/run context must match. Standalone saved workouts
  and Custom Workouts remain separate. No draft input becomes a hint or result.
- Instructions shows up to two saved exercise performances: current context
  first, then wider profile history. The compatible hint source is retained even
  if older. All recorded sets, targets, source, date and side labels are shown;
  empty/foreign/active performances are excluded. Existing content order remains.
- Shared Strength editors offer No/Yes; absent mode means No. Interval rejects
  the property. Each set holds one unsided result or two independent side results;
  prescribed set IDs/counts and shared rest/superset structure are unchanged.
- The exact requested conversion dialogs stage approval. Proceed alone writes
  nothing. Explicit editor Save commits mode, linked copies and results together.
  Cancel/editor cancellation/toggling back leave stored history untouched.
  Nested Apply stages changes until the parent is saved. Stale affected records
  require a new review; failed transactions roll back.
- No → Yes copies each stored tuple to both sides, preserving missing values,
  zeros and skips with internal conversion provenance. Yes → No selects one
  complete recorded tuple: canonical weight, then reps, then Left. Recorded
  results beat unstarted/skipped results; missing weight is not zero. Both skipped
  remain skipped; neither recorded remains unrecorded. Re-enabling copies only
  the survivor and cannot resurrect the discarded side. Retrying is idempotent.
- Conversion follows stable exercise references and established merge aliases
  within the selected profile. Library, workouts, plans, schedule revisions and
  outcome snapshots, drafts and saved sessions reconcile without changing targets,
  notes, original timestamps, set IDs or ownership. Saved active drafts reconcile;
  pending old-shape input stays recoverable with an actionable reload conflict,
  and delayed autosaves cannot restore the obsolete shape.
- Progress plots every actual set/side. Left uses circles and Right squares with
  consistent colors and selectable details, including coincident results. Missing
  sides do not create points; extrema retain their actual tuple and side.
  Completion counts stay based on original workouts/exercises/set groups. No
  Strength volume aggregation exists to multiply; body-weight graphs are unchanged.
- Analysis CSV adds `l_r_distinction` immediately after `exercise`: `left`,
  `right` or `no`. Two/four Strength sets yield 2/4 unsided or 4/8 sided rows.
  Interval retains one `no` row per execution. Shared set numbers, independent
  status, HH:mm:ss, UTC metadata, units, formula protection and missing/zero
  distinctions remain. Export reads stored conversion results without converting.
- Stable `boros` database **14 → 15**, AI **10**, ZIP backup **21**, same **40 CSV
  tables**. No store/index changes or ordinary legacy record rewrites. Existing
  valid structured sides can establish Yes only for an absent snapshot mode;
  explicit modes and identities are never guessed. Strict prior contracts are
  frozen, including v20 ZIP/v14 models. Checksums and original CSVs validate before
  promotion. New backups retain side mode, actuals, provenance and relationships.
  Reviewed conflicting merges use the same conversion functions in the proposed
  restore; cancellation writes nothing and commit rechecks the existing fingerprint.
  New/replace restores do not repeat historical conversion. AI accepts supported
  versions 1–10; current Strength mode is a real boolean and conflicts need review.

Legacy unlinked or deleted-source snapshots without a resolvable canonical
library relationship are preserved. They cannot safely participate in a shared
mode conversion by name alone. Owner data was not inspected, so the number of
such owner records is unknown; this is not a claim of complete legacy linkage.

## Actual verification

No dependencies installed, commit/push/deploy performed, owner databases accessed
or cleared, or navigation/hosting/deployment settings changed. An unrelated owner
`index.html` edit was preserved. Local production builds and Edge subprocesses
required the existing sandbox escalation; the initial `spawn EPERM` restrictions
were environment failures, not application failures.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run build` | Pass, final production bundle |
| `git diff --check` | Pass; existing owner `index.html` LF/CRLF advisory only |
| `npm run test:data` | **353/353**, no failures/skips |
| Broad production browser command below | **132/136** initially; four obsolete `Week 2` selectors corrected to current `Week Type 2` and passed in affected run |
| Affected production browser command below | **34/36**; two phone tests read storage before Save completed, fixed to await saved-session UI |
| Superset browser command below | **4/4**, all root/project and desktop/phone cases pass |
| Final conversion browser command below | **8/8** on the final rebuilt bundle, both themes at all four mounts/viewports |

Together the browser runs provide passing coverage for **156 distinct checks**,
not 156 checks in a single run. No known failed case remains from these commands.
Earlier development runs also caught a new test's incorrect repetition-field
label and an implicit select label containing option text. The test selector was
corrected and the new mode chooser now has an explicit associated label. An
original-v20 fixture comparison was corrected to compare serialized JSON values
(absent fields versus JavaScript `undefined`); the complete data suite then passed. Final review added a delayed-autosave-response regression: a response arriving after conversion cannot clear the actionable conflict. Its initial block-identity fixture typo was corrected; the final complete run is 353/353.

```text
npm run test:browser:static -- tests/browser/lr-distinction.spec.ts tests/browser/train-runtime.spec.ts tests/browser/analysis.spec.ts tests/browser/exercise-merge.spec.ts tests/browser/exercises.spec.ts --workers=2

npm run test:browser:static -- tests/browser/lr-distinction.spec.ts tests/browser/exercise-merge.spec.ts tests/browser/restores.spec.ts tests/browser/profiles.spec.ts --grep "L/R|nested authoring|parent anchors|new profile and rename restore|Guest conversion|theme and approved|unavailable IndexedDB" --workers=2

npm run test:browser:static -- tests/browser/lr-distinction.spec.ts --grep "AI mode conflicts" --workers=2

npm run test:browser:static -- tests/browser/lr-distinction.spec.ts --grep "staged conversion" --workers=2
```

These use installed Edge, isolated contexts, desktop 1440×1000 and phone-emulated
390×844/touch viewports at `/` and `/project-check/`, through the existing plain
static server without SPA rewrites. Both themes cover authoring, staged
conversion, saved active-draft reconciliation, side input/reload/partial save,
strict hints/History, chart selection/colors/shapes, CSV and profile/restore
behavior. Repeated superset slots, two rounds, shared rest, AI conflict review,
nested parent Save, root/subpath navigation, Guest conversion/photo/units/profile
isolation and actionable unavailable storage are included. Screenshots were
inspected for dark desktop Progress, light phone Progress and dark phone superset
Train. Playwright traces/screenshots live under ignored `test-results/static` and
are replaced by subsequent runs; local `.lr-*.log` files record run output.

New data coverage in `strict-history.test.ts` and `lr-distinction.test.ts` checks
context/targets/slots/aliases/history selection, zeros, missing and side-specific
hints, placeholder exclusion, conversion tuples/ties/units, idempotency,
stale approvals/autosaves, recoverable active input, rollback/profile isolation,
schedule markers/supersets, set identities, two/four-set CSV counts, graphs and
counts, reviewed AI/exercise/backup conflicts, ZIP side/provenance roundtrip,
original v20 checksum/CSV validation and all-store v14 upgrade preservation
(including photos and remembered selection). Test databases are disposable
`boros-test-*` instances. They do not access the owner's storage.

## Short owner check

Use a disposable profile. Retain a ZIP backup before testing conversion on real
history; turning Yes off intentionally removes the nonwinning side.

1. Create a saved Strength workout with a two-set exercise, 2–5 target reps and
   target RIR 2 in both sets. Save actual results, then start it again. Hints should
   appear as placeholders and Instructions → History should show that performance.
   Edit that workout's exercise and change only set 2's prescribed RIR to 1, then save and restart: all hints should be
   empty while History remains. Restore its targets to regain hints. A different
   workout/plan must not supply those hints.
2. Edit the library exercise, choose Yes, then Cancel the warning. Choose Yes →
   Proceed, then cancel the editor: history must still be unsided. Repeat and Save:
   each of the original two sets now has Left and Right, with the old actuals on
   both. Check there is only one rest between set groups. Reload a new draft after
   entering different side values; a blank opposite side must stay blank.
3. Record Left **30 kg / 12 reps / RIR 2**, Right **35 kg / 8 reps / RIR 1** for one
   set; leave or skip another side and save partial. Turn No → Proceed → Save:
   that set must keep exactly **35 kg / 8 reps / RIR 1**. Turn Yes on and save again:
   both sides start from that survivor; the removed 30/12/2 tuple does not return.
4. In Progress, select both copied equal-value points and the independently
   recorded Left/Right points, in both themes. Details must identify the correct
   side/set; unrecorded sides have no point and completion counts do not double.
   Download Data CSV: for one two-set session expect four rows when sided, two
   after collapsing, with the same set numbers and the correct new column.
   Download/restore its ZIP as a new profile and verify sides/History again.
5. On an actual phone, check keyboard reachability, scroll to the last Left/Right
   row and Save above the navigation, popup focus, zoom and reload persistence.
   Check both normal-tab and Home Screen contexts separately. Physical iOS,
   current-update Safari/Firefox, real screen readers, native file sheets and
   spreadsheet opening remain unverified. Earlier sound/vibration/silent-mode,
   music/Bluetooth/background lifecycle and live Ko-fi checks also remain open.

Next step: owner/device acceptance above. The unrelated production persistence
report still needs real production evidence; these isolated checks do not prove
its root cause or a production fix.

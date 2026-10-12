# Explicit week types, workout integrity and interface verification — 2026-10-11

Implementation and available automated verification are complete; physical-device
acceptance remains pending. No deployment, hosting, manifest, routing, dependency,
commit/push, or owner-browser-data changes were made. Earlier handoffs remain
historical evidence, including the unresolved production persistence investigation.

## Implemented behavior and decisions

- Analysis CSV uses `HH:mm:ss` from the existing stored time source in the captured
  exporting-browser zone. UTC timestamps retain milliseconds. Strength sets and
  Interval execution rows are unchanged. Appended `workout_id` follows canonical
  redirects; historical display names and occurrence/session identities remain.
- Shared dialogs set a noneditable autofocus target **before** native `showModal`,
  preventing the browser from choosing an input first. A requested noneditable
  control may still receive focus. Trap, nested-dialog inertness, Escape, scroll
  locking and focus return remain; rerenders do not refocus intentional editing.
  Mobile text-entry controls are at least 16px; zoom is unrestricted.
- Sound retains browser-wide `settings.workspace` ownership and a narrow immediate
  write, independent of the profile form/revision. Failure restores the latest
  persisted runtime preference and shows a recoverable error. Off cancels audio
  and speech and attempts vibration once per logical timer boundary. Unsupported
  or rejected vibration is harmless. Document visibility, not the internal screen
  or popup, controls alerts. Hidden/overdue cues are consumed without later replay.
- `public/circuit-10s-warning.mp3` exists (38,688 bytes). Runtime no longer uses the
  five-second asset. Active phases >=15 seconds create one warning cue when crossing
  ten seconds remaining; shorter phases and rests create none. Attempt/phase IDs
  prevent duplicates. Pause/recovery/background handling preserves timing records.
- Train's Existing Workout picker is horizontal at every width. Create's workout
  catalog switches only at **max-width: 360px**. Existing geometry is retained at
  390px, tablet and desktop widths; long names and Added dates remain contained.
- Stable week types own independent workout IDs and explicit `programWeeks`.
  New maps allow 1 through Duration types; every week belongs to exactly one used
  type. Pills cannot steal another type's assignment. Duration growth leaves new
  weeks unassigned; reductions confirm affected assignments/populated content.
  Calendar/Train use one resolver, retain actual program-week numbers, and do not
  consume a program week during a gap. Structural edits suspend eligible future
  scheduling until the existing Edit review adopts the new map. Started/completed
  references retain old snapshots/dates. Progress includes any additionally retained
  started occurrence when its old type is replaced.
- Reusable workout comparison checks canonical exercise identity, ordered repeated
  occurrences, set/RIR/rest values, supersets and Interval circuit prescriptions.
  Missing and zero remain different. Generated nested IDs and workout names are
  ignored. Automatic reuse also requires equivalent authored notes/instructions,
  tags and ancillary content. Unlinked legacy exercises are conservatively distinct
  across unrelated workouts; a known source copy can compare its legacy positions.
- Plan publication checks and writes in the same transaction, choosing an equivalent
  active record deterministically. Identical workouts in one save publish once but
  keep distinct plan occurrence IDs. Standalone manual/import/custom Save Yes paths
  show **Similar workout exists**. Cancel writes nothing and preserves input; Save
  keeps an independent record, excluding self on edit. Match/revision tokens recheck
  concurrent changes; normalized `Name (n)` allocation happens inside the transaction.
- Workout Merge uses the shared picker, excludes self/retired/incompatible types,
  defaults A into B and supports Switch. Destination defaults stay unchanged; source
  metadata becomes a durable redirect. Both records/history are never concatenated.
  Started drafts, plan copies, saved snapshots, session counts and note branches stay
  independent. Future starts/current instructions and CSV canonical identity honor
  chains. Archive and confirmed deletion retain existing ownership rules; deleting
  a canonical workout includes its retired family's standalone ownership. Plans have
  no Merge action.

## Persistence and contracts

Stable database `boros` upgrades **13 → 14**, with no new stores/indexes. Only editable
finite cyclic plans gain explicit assignments, preserving their old sequence and
stable IDs. Settings, profiles, photos, measurements and immutable records are not
rewritten; unbounded plans retain legacy behavior until explicitly made finite.
Upgrade failures abort and remain actionable errors.

**AI 9** adds explicit `programWeeks`; versions 1–8 retain their original validators
and meanings. **Backup 20** adds assignment cells and workout redirect columns to
the existing 40 CSV tables. Frozen v19 schema/model copies validate old JSON, CSVs,
relationships and SHA-256 checksums before promotion. Restore remaps chains, preserves
separate sessions and prevents a pre-merge imported source from becoming active
again. Original photos/checksums remain required. See [AI](ai-formatting.md),
[backup](backup-format.md), and [analysis CSV](analysis-csv.md) for exact contracts.

## Actual verification

- `npm run build`, `npm run typecheck`, `npm run lint`, `git diff --check`: passed.
- `npm run test:data`: **337/337 passed** on final source. Added explicit-map,
  gap/total/repair, all-store/Blob migration preservation, rejected-upgrade rollback,
  original v19 ZIP/checksum, AI9/legacy, comparison/publication/suffix concurrency,
  merge/rollback/profile/type/stale/chain/history/restore/deletion, CSV seconds and
  foreground alert tests. All databases use disposable `boros-test-*` names.
- Production Edge browser checks use the repository's plain static server at `/`
  and `/project-check/`, with isolated desktop and phone contexts. They never
  attach to the owner's normal browser storage. No SPA rewrite fallback is used.

Exact browser commands and results:

```text
npm run test:browser:static -- week-types-updates.spec.ts unique-weeks.spec.ts workout-library.spec.ts analysis.spec.ts profiles.spec.ts navigation.spec.ts backups.spec.ts restores.spec.ts imports.spec.ts interval-timer.spec.ts train-runtime.spec.ts --workers=2
240 passed / 16 failed (8.0m)

npm run test:browser:static -- backups.spec.ts restores.spec.ts interval-timer.spec.ts week-types-updates.spec.ts unique-weeks.spec.ts workout-library.spec.ts --workers=2
100 passed / 0 failed (3.9m), final production bundle

npm run test:browser:static -- create-terminology.spec.ts interval.spec.ts --workers=2
36 passed / 0 failed (2.8m), final production bundle
```

The 16 broad-run failures were four obsolete expectations repeated across the four
projects: four published workouts instead of one shared equivalent, a malformed-photo
fixture still declaring backup19 with data20, an old completion label, and the old
restart-confirmation text. The final 100-check run covers all 16 corrections; all
**256 distinct broad-suite checks have passing coverage** across these runs.

The additional **36/36** affected Create/Interval checks pass after updating old
week labels/assignments, duplicate-publication counts and preexisting restart/partial
expectations. Together, **292 distinct browser checks have passing coverage**.
Local command logs are `.updates-build.log`, `.updates-data.log`, `.updates-static.log`,
`.updates-closeout.log` and `.updates-compatibility.log` (ignored test artifacts).
Screenshots/card geometry were inspected at the retained ordinary-phone layout;
automated geometry assertions cover 320, 360, 390, 800 and 1440px. This does not
establish physical iOS input-zoom behavior.

Early runs exposed old version/count/label expectations, a conservative legacy-copy
comparison issue, restore name matching, and a protected-occurrence denominator edge
case. These were corrected with coverage. A new timer test initially accelerated
the simulated clock enough to consume a stale cue; it now advances in 250ms steps
with time for committed IndexedDB updates. New card checks assert the actual retained
geometry, rather than assuming the original cards were square. Failed exploratory
runs are not reported as passing evidence.

## Short owner checks still needed

Use a disposable profile and keep a ZIP backup of any important records.

1. On a physical phone, open a picker and a Note popup from a hamburger menu. The
   keyboard should stay closed until tapping a field; typing should keep focus and
   require no manual zoom-out. Check nested Cancel/Escape/focus return with keyboard
   or a real screen reader. Pinch zoom must remain available.
2. Change Sound with an unsaved profile name. The name must remain unsaved, Sound
   must apply immediately and survive reload/later Save profile. Try 14-, 15- and
   20-second Interval exercises: no warning, then warnings after 5 and 10 active
   seconds. With Off, listen for silence and check vibration where supported. Change
   Boros tabs/close the timer popup; then hide/lock/return and check for no replay.
   Check actual silent mode, volume, music/Bluetooth and independent YouTube playback.
3. Make a five-week, two-type plan assigned `[1,2,4]` and `[3,5]`, with different
   workout counts. Check disabled pills, deselect/reassign, Calendar weekdays, Train
   Week 3, gap-week shifting, and reviewed structural changes around saved activity.
4. Save an equivalent workout: Cancel must retain all input, Save must retain an
   independent record with a safe suffix. Repeat inside a plan and confirm distinct
   plan workouts share one appropriate library source.
5. Merge two same-type workouts with history. Check A into B and Switch, then Cancel,
   Merge, active-session recovery, history/notes/CSV, and ZIP restore under a new
   profile name. Destination defaults should remain intact.

Physical phone/Home Screen lifecycle, Safari/Firefox coverage of this update, actual
screen readers, native download/upload sheets, spreadsheet opening and live Ko-fi
remain unverified. Historical Firefox evidence is not a new-update pass. A website
cannot promise to override silent mode, blocked playback, zero volume or unavailable
vibration, and wake lock does not enable background execution.

# Training analysis CSV and note ownership

Settings has separate **Data**, **Profile Backup**, **Restore Profile from Backup**,
and **Clear data** sections. Data downloads the CSV described here. Profile Backup
downloads the complete ZIP described in [backup-format.md](backup-format.md).
Only a validated Boros ZIP can restore a profile. Neither file is encrypted.

## Analysis contract

Export takes one readonly IndexedDB transaction for the selected profile, saved
sessions/finalized inputs, outcome markers and canonical exercise identities. It
does not load photos, write records, include other profiles, or treat pending
workouts/templates/unfinished drafts as history. Export cancellation, errors,
navigation or profile switching cannot retarget the captured owner. Empty history
produces an honest empty state and no download. A successful handoff says download
started; the browser decides where/if the file is saved.

UTF-8 CSV has a BOM, a header, CRLF record separators and Papa Parse escaping.
Multiline text, Unicode, commas and quotes remain valid cells. Spreadsheet-facing
text beginning with formula-like characters (including leading whitespace and
full-width variants) receives an apostrophe under the existing backup export
policy. Canonical records are never changed. The filename is
`Boros_<profile>_analysis_<UTC export date-time>.csv`; that filename timestamp is
not a performance timestamp.

Rows sort chronologically by saved completion/outcome timestamp with stable ID
ties. Within a workout, Strength follows original exercise/set order. Interval
follows the compiled prescribed active-phase order, with that phase's own recovery
in the same row. Repeats remain separate: Repeat circuit 3 produces four executions.
Warm Up, circuit rest, legacy set rest and post-workout rest produce no rows/time.
Legacy pending-exercise amendments can leave a performed phase absent from the
final day copy. Its retained phase name/identity/target/activity is still exported
after current prescribed rows; unavailable old instructions/notes are `None`, never
substituted from a replacement exercise.

The first 22 columns, in order, are:

```text
username,date,time,type,plan,workout,circuit,exercise,reps_target,reps,weight,rir_target,rir,exercise_time_target,exercise_time,plan_instructions,plan_notes,workout_instructions,workout_notes,exercise_instructions,exercise_notes,youtube_link
```

| Column(s) | Meaning |
| --- | --- |
| username | Current selected profile name; Guest fallback if unnamed. |
| date, time | `dd/mm/yyyy`, `HH:mm`, in the exporting browser's time zone captured with the snapshot. Hidden legacy profile-zone preferences are not applied. |
| type | `strength` or `interval`. |
| plan, workout, circuit, exercise | Saved historical names; plan is `NA` for standalone/custom, circuit is `NA` for Strength. |
| reps_target, rir_target | Prescribed set targets: `8` or `5-8`. Missing Strength RIR is `None`. Interval is `NA`. |
| reps, weight, rir | Actual set values. Canonical kg converts to the captured profile kg/lb preference (up to six decimal places). Zero stays zero; missing RIR is `None`. Interval is `NA`. |
| exercise_time_target | Interval active seconds and own recovery seconds, `X, Y`; Strength `NA`. |
| exercise_time | Interval retained actual seconds, `X, Y`, with millisecond precision; Strength `NA`. Explicit skipped execution is `Skipped`; a manual completion is `None`. |
| plan_instructions, plan_notes | Session/outcome snapshots of the plan's own text; standalone/custom `NA`. |
| workout_instructions, workout_notes | Started workout instructions and effective saved session note; markers use their saved copy. |
| exercise_instructions, exercise_notes, youtube_link | Historical exercise snapshot instructions/link and effective session note. |

Empty optional text uses `None`. Fields that do not apply use `NA`. A legacy
missing plan-note snapshot stays `None`; export never fills it from today's plan.

These columns follow in this exact order:

| Column | Meaning |
| --- | --- |
| session_id | Saved session UUID, or `NA` for an outcome marker. |
| plan_instance_id | Schedule/run UUID when available, else `NA`. |
| workout_occurrence_id | Stable occurrence key when available, else `NA`. |
| exercise_id | Canonical library identity through recorded merge redirects, or `None` for an unlinked exercise. |
| exercise_occurrence_id | Stable nested identity; repeated entries never collapse into one. |
| set_number | One-based Strength set number; Interval `NA`. |
| circuit_execution | One-based Interval execution number; untouched legacy circuits use `set.round`. Strength `NA`. |
| weight_unit | Captured profile kg/lb preference for Strength; Interval `NA`. |
| status | Row result status listed below. |
| performed_at_utc | Unambiguous ISO UTC timestamp. |
| time_source | `phase_started_at`, `session_completed_at`, or `outcome_recorded_at`. |
| circuit_id, phase_id | Interval circuit and active-phase identities; Strength `NA`. Together with exercise occurrence and execution, distinguish repeated entries and circuits. |
| workout_status | `Completed` for saved sessions (including partials) and manual completion; `Skipped` for a skipped workout. |
| time_zone | IANA display zone for date/time. No time-zone text is added to ordinary app screens. |

For Interval timing with attempts, the earliest recorded start for that prescribed
active execution supplies the timestamp. Where no phase timestamp exists, use the
session completion timestamp, never export time or a future scheduled date.
Outcome markers use their stored recorded timestamp.

| status | Actual values |
| --- | --- |
| Recorded | Valid Strength set, or Interval active/recovery completed. Optional missing values remain `None`. |
| Partial | Some Interval time recorded without full completion. |
| Skipped | Explicit skip; applicable actual fields are `Skipped`, prescribed targets remain. |
| Unrecorded | Blank/omitted Strength set: actuals `None`, not a deliberate skip. Finalized input distinguishes old generic skipped result records where available. |
| Unstarted | Known new Interval execution with zero recorded time: `0, 0`. |
| Unknown | Legacy execution without sufficient timing evidence; unknown components are `None`. |
| Marked complete | Manual workout completion; actuals `None`, never invented results. |

## Retained Interval activity

Database v13 adds optional `interval.activity` version 1. The existing timer cursor
and latest-scope `results` continue to control execution. The separate ledger owns
attempts keyed by execution UUID and results keyed by prescribed phase ID. Each
checkpoint replaces the same attempt/phase's cumulative milliseconds, rather than
adding tick counts. Active and exercise recovery are recorded independently.

Pause freezes the segment, Resume reanchors it, and Stop captures elapsed time
before resetting the cursor. Restart creates another attempt and retains earlier
activity. CSV/review sum only the same prescribed phase across attempts, so actual
time may exceed its target. Separate repetitions retain different IDs/rows. Paused,
stopped, preparation, circuit-rest and post-workout-rest time never inflates
exercise time. Natural completions remain recorded; repeated retries do not add
duplicate attempts. Retained activity participates in draft recovery/discard
guards. Explicit Clear or confirmed cancellation can discard it. Saved partials
remain Completed at the calendar/workout level.

Legacy known timed results are retained once, separate from new attempts. Missing
old timing stays unknown. Old zero-valued generic skipped timer results cannot
prove a deliberate skip; absent evidence is not converted to known zero or precise
activity. Time already discarded by an older Stop/Reset cannot be recovered.
This is timer-recorded activity, not proof of physical movement.

## Notes and current instructions

Library exercise notes are defaults. Workout/plan additions copy them independently;
copying a workout into a plan copies its workout and exercise notes. Authored
workouts inside plans start without a workout note and seed a published library
workout once. Later edits never rewrite the other copy's notes. Existing publication
rules still publish prescription variants; a note/instruction-only difference does
not create another library variant.

Optional `noteOverride` distinguishes authored copy text (including clear) from a
copied default. Legacy nonempty template notes are conservatively treated as authored;
legacy empty text is not proof of clear. Session inputs keep optional `noteInitial`,
`noteEdited`, and `noteInheritedClear`. Inherited/default text alone is not entered
progress. Explicit clears survive subsequent inheritance and saved performances.

Only new-session initialization resolves history. Existing draft text is never
recomputed during render or a history update. For exercise notes, precedence is:
exact stable branch occurrence's latest matching saved note/clear; authored copied
template override; matching note from another workout of the same plan; copied
default; empty. Standalone branches use their own workout ID and occurrence, never
a plan or a matching display name. Custom workouts without a saved identity use
defaults. Workout notes carry only within their own branch. History is profile-bound
and ordered by completion time, logged timestamp, then stable ID. Canceled/unfinished
drafts are not history.
Adding or swapping an exercise during a session initializes only the new occurrence
from its copied defaults; it does not reinitialize other draft notes. Clear stays blank.

Strength matching uses canonical exercise identity and the entire ordered set list:
rep min/max and RIR min/max or missing. Missing RIR differs from zero. Interval
matching uses canonical exercise identity, active/recovery durations, circuit repeat
count, circuit rest, and the ordered circuit members' canonical identities and
active/recovery targets. Untouched legacy circuit set/round/rest metadata is compared
as stored, never converted for history matching. Names and actual results are excluded.

Current linked views and new sessions resolve exercise instructions from the current
canonical library exercise and workout instructions from the linked library workout.
Plan instructions belong to the plan. Nested editors display shared instructions
read-only and direct editing to the existing base library editor. Unlinked new items
can author instructions before their atomic save. Deleted/missing sources retain a
usable copied instruction snapshot; no item is recreated by name. Started drafts and
saved history always retain their snapshots.

AI remains strict schema v8: no new public fields are needed. Conflicting shared
instructions require an explicit preview choice; existing library instructions/default
notes are not overwritten. New repeated exercise names use the first occurrence in
the ordered editable preview for the library default, with the choice exposed when
notes differ. Other nested notes remain independent. Identity/type/name conflicts
remain recoverable, atomic-save errors, and retries retain the preview's creation ID.

# Training and measurement analysis CSV and note ownership

Settings has separate **Data**, **Profile Backup**, **Restore Profile from Backup**,
and **Clear data** sections. Data downloads the CSV described here. Profile Backup
downloads the complete ZIP described in [backup-format.md](backup-format.md).
Only a validated Boros ZIP can restore a profile. Neither file is encrypted.

## Analysis contract

Export takes one readonly IndexedDB transaction for the selected profile, saved
sessions/finalized inputs, outcome markers, all historical measurements and canonical exercise/workout identities. It
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

Rows sort chronologically by saved completion/outcome/measurement timestamp with stable ID
ties. Within a workout, Strength follows original exercise/set order, then Left
and Right. Two unsided sets produce two rows; two L/R sets produce four (four
sets produce four or eight). Sides retain the same original set number and context,
with independent values and status. A blank side is `Unrecorded`; an explicit
skip is `Skipped`. Missing values never become zero. Conversion is saved before
export; export never copies or collapses sides itself. Interval
follows the compiled prescribed active-phase order, with that phase's own recovery
in the same row. Repeats remain separate: Repeat circuit 3 produces four executions.
Warm Up, circuit rest, legacy set rest and post-workout rest produce no rows/time.
Legacy pending-exercise amendments can leave a performed phase absent from the
final day copy. Its retained phase name/identity/target/activity is still exported
after current prescribed rows; unavailable old instructions/notes are `None`, never
substituted from a replacement exercise.

The first 23 columns, in order, are:

```text
username,date,time,type,plan,workout,circuit,exercise,l_r_distinction,reps_target,reps,weight,rir_target,rir,exercise_time_target,exercise_time,plan_instructions,plan_notes,workout_instructions,workout_notes,exercise_instructions,exercise_notes,youtube_link
```

| Column(s) | Meaning |
| --- | --- |
| username | Current selected profile name; Guest fallback if unnamed. |
| date, time | `dd/mm/yyyy`, 24-hour `HH:mm:ss`. Exercise rows use the exporting browser's time zone captured with the snapshot. Measurement rows use their saved local date/time or UTC for context-free legacy records. Seconds come from the stored timestamp, never elapsed exercise time. Hidden legacy profile-zone preferences are not applied. |
| type | `strength` or `interval`. |
| plan, workout, circuit, exercise | Saved historical names; plan is `NA` for standalone/custom, circuit is `NA` for Strength. |
| l_r_distinction | `left` or `right` for a sided Strength result; `no` for unsided Strength and all Interval rows. |
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
| workout_id | Canonical library workout identity through durable workout redirects, or `None` when unlinked. Appended after `time_zone`; historical names, session/occurrence IDs and row counts stay unchanged. |
| record_type | `exercise_result` or `measurement`. Filter this before counting exercise sets/executions. |
| body_weight | Measurement canonical kg converted to the captured profile unit (up to six decimal places), or `None` if absent; `NA` on exercise rows. Never exercise load. |
| body_weight_unit | Captured profile kg/lb for a present body weight, `None` if weight absent; `NA` on exercise rows. |
| body_fat_percentage | Numeric percentage such as `24.5`, without `%`; `None` if absent, `NA` on exercise rows. |
| measurement_date | Selected/stored measurement date as `dd/mm/yyyy`; `NA` on exercise rows. |
| measurement_id | Stable shared entry ID; `NA` on exercise rows. |
| measurement_logged_at_utc | Original entry creation instant; `NA` on exercise rows. |
| measurement_updated_at_utc | Last edit instant or `None` for old entries without one; `NA` on exercise rows. |

Each measurement produces exactly one row, including a combined weight/body-fat
entry. A measurement-only profile is exportable. Missing optional metrics are
`None`, never zero. Exercise fields (`type`, `weight`, `weight_unit`, targets,
set/status/context/notes and `l_r_distinction`) are `NA` on measurement rows.
The profile's current values are never copied onto exercise rows. Existing
Strength/L/R/Interval row counts and value conventions remain unchanged.

On measurement rows, `performed_at_utc` is `measuredAt`; `date` and
`measurement_date` use the saved wall date so backdating and cross-zone exports
do not shift it. `time` stays `HH:mm:ss`. `time_source` is `device_clock` for
automatic current-day capture, `date_only_noon` for automatic noon on another
selected date, or `legacy_preserved_time` after moving a context-free legacy
entry's date. Without source metadata it is `measurement_time_legacy`.
None of these imply the user entered an exact clock time. `time_zone` is the
saved zone or UTC for context-free legacy entries. Full millisecond precision
remains in UTC metadata and the restorable ZIP. Date edits retain original clock
time/zone; DST gaps reject rather than shift, folds prefer the saved offset.

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

Calendar edits to a saved Strength workout replace its existing session and
finalized input atomically. Exports read those corrected results, including
independent Left/Right values and explicit skip versus unrecorded intent. The
same session/set IDs and original event dates remain; editing does not append an
extra completion or duplicate old results. Session-local added sets/exercises
produce their own rows. No new CSV columns are needed for this edit workflow.

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

AI now uses strict schema v9 for explicit week assignments; the note/instruction
fields retain their v8 meanings. Conflicting shared
instructions require an explicit preview choice; existing library instructions/default
notes are not overwritten. New repeated exercise names use the first occurrence in
the ordered editable preview for the library default, with the choice exposed when
notes differ. Other nested notes remain independent. Identity/type/name conflicts
remain recoverable, atomic-save errors, and retries retain the preview's creation ID.

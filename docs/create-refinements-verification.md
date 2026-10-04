# Create refinements — verification record

Historical record. The 2026-10-04 ownership/editor revision supersedes the
plan-sourced catalog behavior below; see [current verification](template-ownership-verification.md).
Earlier test counts describe that earlier candidate, not the current revision.

2026-10-03. Starting HEAD `e65acd536e25718713b835bd3b401a060573db29`
(`group 4 updated`), initially clean. This work changes Create presentation,
source-aware catalog reads, AI instructions/parser errors and rest entry. The
Train correction enables final post-group rest when a superset ends the session.
No dependencies, deployment configuration or database schemas changed. No commit,
push, publication, hosting mutation or owner-data clearing was performed.

## Behavior and boundaries

- Workout/Plan/AI are compact horizontal action cards. Exercise cards show names;
  their dialogs expose prescriptions, source context and source-specific actions.
  Phone lists show about five rows with scroll/keyboard access to the full set.
  Search/sort and ANY-match pressed tag pills combine. Plan cards show the name
  and training/rest-day/duration summary with lifecycle actions in a dialog.
- The catalog reads the active owner's templates, plans and tags in one read
  transaction and verifies that the owner exists. Identity and deduplication
  rules are documented in README. Every grouped source remains accessible.
  Plan-sourced edits open the exact saved plan/day/occurrence and retain its
  revision for the existing compare-and-save check. No template insertion,
  plan/history rewrite, name-based identity join or migration occurs.
- Superset controls follow the last member, with unchanged numeric naming/group
  semantics. Confirmed Delete dissolves grouping, retaining every prescription.
  Movement keeps IDs; the destination dialog excludes the current day, disables
  full days, ungroups moved members and restores/moves focus. Existing one-member
  group validation remains. Nested input, stale writes and navigation guards use
  the existing editors and services.
- One shared rest control represents integer seconds as Minutes/Seconds. Both
  blank stays unspecified, one filled component permits the other to mean zero,
  and explicit zero remains zero. Seconds must be 0–59, minutes nonnegative
  integers, total at most `Number.MAX_SAFE_INTEGER`. Conversion uses exact integer
  arithmetic and preserves 75, 180 and the safe-integer limit without rounding.
- Train renders one group boundary per round: between-round rest before another
  round, post-group rest after the last, including the final session block. No
  member rest or second final-round boundary is added. Unequal members stop at
  their existing set counts. Existing timer ownership/revisions/limits remain.
- Both initial AI prompts require a complete fenced `json` object with ASCII
  delimiters. The parser retains raw/one-fence support and strict validation;
  smart-delimiter guidance does not replace valid Unicode. Clipboard fallback,
  profile-bound unsaved Draft previews and failed-input recovery remain. See
  [AI formatting notes](ai-formatting.md).

## Verification

The production build passed the complete static regression suite. A final focused
static run also checks the strengthened real-keyboard focus sequence.

| Check | Actual result |
| --- | --- |
| `npm run build` | Passed; no chunk-size warning |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with no warnings |
| `npm run test:data` | **126/126 passed**, no skips/failures; four new focused tests |
| `npx playwright test create-refinements --reporter=line` | **8/8 passed**, 16.5s, Edge desktop/emulated phone |
| `npm run test:browser:static -- --reporter=line` | **344/344 passed**, 6.1m; no skips/failures; root/project × desktop/phone |
| `npm run test:browser:static -- create-refinements --reporter=line` | **16/16 passed**, 26.6s; strengthened real-keyboard sequence on all four static projects |
| Affected Firefox production suite (command below) | **88 passed / 2 failed**, 5.2m; corrected keyboard setup, focused rerun below |
| Same Firefox command restricted to `create-refinements` | **8/8 passed**, 23.7s, including both formerly failing checks; no application change |
| `node node_modules/playwright/cli.js test --config playwright.capacity.config.ts --reporter=line` | **1/1 passed**, 17.0s |
| Root and project build-resource audits | **26/26 HTTP 200 and exact byte/hash matches at each mount**, zero findings |
| `git diff --check` | Passed |

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
node node_modules/playwright/cli.js test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone create-refinements exercises plans imports group1 group2 group3 group4 train journey --reporter=line
```

Only isolated browser contexts and `boros-test-*` fake IndexedDB databases are
used. Browser seeders add synthetic records to their fresh contexts without
clearing existing records. Static tests use the existing plain server on 4174
with no rewrite fallback at `/` and `/project-check/`. Source and configuration
for memory routing, profile/settings data, photos, schedules, backups and analytics
are preserved; complete static regression includes their existing tests.

Earlier attempts are retained as evidence, not relabeled passed:

- Sandboxed Node test workers failed with `spawn EPERM`; approved subprocess
  execution worked. Initial data **120/122** found the old rest-field test shape
  and the deliberately changed final-group boundary assertion. Updated assertions
  plus new coverage passed **126/126**.
- Initial affected development run **76 passed / 4 failed / 2 expected skips**
  (2.2m). Failures were two viewport variants each of a prescription assertion
  still targeting a name-only card and a two-page helper given the wrong page.
  The assertions now inspect the opened dialog on the correct page.
  The two development skips are production Support configuration checks, which
  passed in the static/Firefox production runs.
- New/corrected development subset **26 passed / 2 failed** (47.8s): the new
  reload-timer check omitted the established Resume action. It now resumes the
  saved draft before asserting timer recovery; final focused **8/8** passed.
- Firefox **88/90** exposed two variants of the new outline assertion starting
  from programmatic `.focus()`. Firefox did not assign keyboard focus styling to
  that setup. The test now uses real Shift+Tab/Tab before Enter and checks a
  visible outline both before opening and after Escape. The complete focused
  Firefox rerun passed **8/8** with no application workaround or weaker assertion.
- A successful resource audit initially used the wrong receipt filename in the
  copy command. Corrected copies retain the reports under
  `test-results/create-root-resources.json` and `create-project-resources.json`.

The candidate has **26 files / 2,132,551 bytes**, inventory SHA-256
`0c8533415eb47c2051a498e38d768ed8cd0487e5493903dfa8085c2d67de98ad`.
Create chunk: **55.61 kB / 16.38 kB gzip**. Test logs and screenshots are ignored
local artifacts. Both-theme desktop/phone screenshots were inspected for card
spacing, scroll regions, plan/action and Move dialogs, adjacent arrows, readable
group footers and keyboard focus. Native dialog, Escape/focus restoration, no
horizontal overflow, reload/isolation, failed writes and dirty navigation also
have automated coverage. Emulation does not establish physical-phone behavior.

The isolated capacity fixture retains 100 library exercises, 20 plans, 5 schedules,
500 drafts, 500 sessions, 730 measurements and 12 photos. Observed Create load
was **403 ms**, search **38 ms**, Progress **1042 ms**, export **1044 ms**, and
restore commit **236 ms**. The 10,835,894-byte ZIP validated and restored, all
730 points and the selected 75-set graph remained present, and chart operations
read zero photo records. These are one desktop observation, not a physical-device,
quota or storage-capacity guarantee.

## Owner checks and release limits

Use the local candidate (`npm run dev`, normally `http://127.0.0.1:5173/`) or a
separately approved candidate deployment. The published site was not changed.

1. Open Create with an existing AI plan. Find its exercises without reimport;
   open a card, choose the intended source, edit one occurrence and save/reload.
   Confirm other days/plans stay unchanged. Try Search/Sort and two tag pills.
2. On your physical phone in both themes, scroll the catalog, open plan actions,
   use adjacent arrows and Move/Cancel/Escape, and enter rest with the software
   keyboard. Confirm controls remain reachable above the keyboard/navigation.
   Delete a superset only after reviewing the confirmation; exercises should remain.
3. Copy both AI instruction variants into your chosen chatbot. Confirm the complete
   response is one `json` block and review every target before saving. For an
   A20/B8 two-round group, check one inter-round and one post-group REST control.

Carry-forward unverified checks: physical phones/keyboards/safe areas/download
sheets, real screen reader/voice control, Blob-capable Safari/iOS photo and backup
round trips, live Ko-fi account content, actual quota, spreadsheet applications
and suspended-device timers. The established Windows WebKit Blob limitation was
not reprobed and is not a Safari pass. Owner-confirmed HTTPS resolution remains
accepted; this task makes no new live certificate or published-version claim.
Phase 10 stays Verification pending; Phase 11 stays In progress. Publication,
final published-version smoke and overall release acceptance are separate actions.

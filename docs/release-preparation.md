# Release preparation — 2026-10-03

**Not ready to publish.** Phase 10 remains **Verification pending** for photo-backed
restore in Blob-capable WebKit/Safari. Phase 11 is **In progress: preparation only**.
The public custom domain additionally fails HTTPS hostname validation from this
environment. Group 1 now supplies the owner's Ko-fi destination in `.env.production`;
its live account content is blocked by a Cloudflare challenge in automation.
See [Group 1 verification](group1-verification.md) for the current changes, candidate
and owner-confirmed certificate warning. The artifact/test observations below are
the **historical pre-Group-1 preparation**, not verification of the revised build.
No publication, commit,
staging, push, tag, DNS change or GitHub settings change was performed.

## Existing deployment, inspected read-only

- Repository/origin: [jsaldana92/boros](https://github.com/jsaldana92/boros), public,
  default branch `main`. Local starting HEAD: `d062772` (Phase 9), with uncommitted
  Phase 10 work and concurrent owner favicon/image changes. That HEAD alone is
  **not** an identifier for the tested working-tree build.
- `npm run deploy` invokes the existing `predeploy` lifecycle (`npm run build`),
  then **`gh-pages -d dist --cname boros-app.com --nojekyll`**. The installed CLI
  is pinned to **6.1.1**; its defaults publish `dist` to `origin`'s `gh-pages`
  branch root. It creates `CNAME` and `.nojekyll` during publication. Their absence
  from local `dist`/`public` does not require duplicate files or configuration.
- Public `gh-pages` HEAD at inspection: `01edf4154ef05ca6bc7d94361dfe155137694416`.
  Raw branch requests returned 200 for `CNAME` (expected domain), `.nojekyll`
  (empty), and `index.html`. Repository Pages settings returned 404 to an
  unauthenticated request: settings/Enforce HTTPS remain owner-verifiable;
  that response is not proof that Pages is disabled.
- Live target: [https://boros-app.com/](https://boros-app.com/). Fresh isolated Edge
  rejected it with `net::ERR_CERT_COMMON_NAME_INVALID`; independent Node HTTPS
  rejected it with `ERR_TLS_CERT_ALTNAME_INVALID`. The returned certificate names
  `*.github.io`, valid August 2–October 31, 2026: this is a hostname mismatch,
  not an expired certificate. The observed A records are the four GitHub Pages
  `185.199.108–111.153` addresses. No certificate bypass was used; the cause of
  certificate provisioning/configuration has not been established.
- The branch HTML references `index-B9oak4NB.js` and `boros.svg`, unlike the
  candidate's split entry `index-BQ08g7K6.js` and `favicon.ico`. Branch HTML SHA-256:
  `fa31274da5f5e77ada0fc977218b001ab7c4c4de24864d2233bb67afde2effa8`.
  This establishes a different deployment-branch artifact, not successful loading
  or the exact bytes served by the TLS-blocked custom domain.
- Vite retains `base: './'`; root and `/project-check/` serve the same build without
  rewrites. Memory navigation never creates screen URLs or browser history entries.
  Refresh remembers only a successfully opened screen; saved data is separate.

## Historical preparation candidate identity and output review

The build inspected on this date contains **22 files / 2,045,178 bytes** (uncompressed
disk total, not startup transfer). Inventory SHA-256:

`f907033f818dbc35bb6178877601468aba34e535296e5758ba01734750c18415`

Entry: **274.59 kB / 88.01 kB gzip**; largest shared chunk **165.01 kB / 48.55 kB
gzip**; five screen chunks **11.59–43.26 kB**; CSS **18.97 kB / 5.04 kB gzip**;
export/import workers **197.72/200.83 kB**. Shared/route downloads are additional.
There is no Vite large-chunk warning. `logo.png` and `snake.png` account for
1,013,053 bytes of the disk total; they and the owner's favicon were preserved.
Existing unused `favicon.svg`/`icons.svg` starter artwork is inert, unreferenced by
the application, and retained rather than changing unrelated branding work.

`node scripts/release-audit.mjs` inventories and hashes the existing build, checks
HTML resource references, required workers, output filenames, and common
credential/test/development markers. It writes an ignored receipt in `test-results`.
The audit found no matching secrets, test fixtures, source maps, environment files,
development entrypoints or other unexpected output files. Source/public marker
searches also found no fixture or credential matches; tracked environment content
is only the blank `.env.example`. These bounded checks are not an exhaustive
security audit. No environment values are included in reports.

With `--url`, the audit requires default TLS validation, rejects redirects, and
compares every resource's SHA-256 to local `dist`, including lazy chunks, workers
and images. It exits nonzero on a mismatch/error. All 22 resources returned 200 and
matched at both local static mounts. It does not simulate UI interactions or
write user records. The full browser suite supplies the functional checks.

Changing application files, public images or build-time configuration changes the
candidate. Rebuild, rerun affected verification and record a new fingerprint before
calling it tested. Package version `0.0.0` remains unchanged and cannot identify
this release. A receipt's `sourceDirty: true` explicitly records an uncommitted build.
Keep the tested fingerprint outside ignored receipts too: browser runs can remove
their output folders. After the owner commits, record that commit alongside the
fingerprint; do not invent a release tag/version.

## Verification and remaining boundaries

Fresh build/typecheck/lint passed; data **90/90**; Edge static root/project
desktop/phone **252/252 (3.3m)**; Firefox production desktop/phone **118 passed,
2 expected static-host-only skips (3.6m)**. No failures in these final suites.
Three CDP-only scenarios are excluded in Firefox and covered in Edge. Full
command results are recorded in TODO.md's release-preparation handoff and
[the Phase 10 record](phase10-verification.md). The static browser suite covers
root/project desktop/phone startup, all screens/refresh at one address, legacy
hash cleanup, focus, dirty navigation/unload guards, profile isolation, saved
exercise/plan/session reload, original photo-backed export/restore, both workers,
chunk failure recovery and canceled destructive actions. All contexts/databases
are disposable; owner records were not cleared.

Previously demonstrated application focus/visibility defects have fixes and
regression evidence. The remaining Windows WebKit failure is a native IndexedDB
Blob failure independently reproduced without Boros; it is **not** a passing Safari
check. No suitable alternative environment was available (no WSL installation or
Docker executable; no macOS/Safari device or remote browser provider). The unchanged
failing probes were not rerun. Prior focused WebKit and capacity evidence remains
historical valid evidence for unchanged application chunks; no fresh full WebKit
pass is claimed.

Physical phone keyboards/download sheets/safe areas, real assistive technology,
actual quota exhaustion, spreadsheet applications and suspended-device timers are
unverified limitations, distinct from known application bugs. Export/restore holds
records and photo payloads in memory, history is not paginated, and exports can
exceed importer limits. There is no offline cold-start or background alarm guarantee.

At the preparation checkpoint before Group 1, Support was unconfigured and correctly
showed unavailable. Group 1 now supplies the owner's actual URL in `.env.production`
and verifies protected opening in the new production build. Live account-page
confirmation remains pending because Ko-fi returned a Cloudflare challenge. Any
future URL change requires a new build and affected checks. Do not put secrets in
any `VITE_*` setting: these values become public build content.

## Current owner checklist

Earlier TODO handoff checklists are historical. Use this checklist and disposable
profiles; preserve an original exported ZIP before any destructive experiment.

1. **Required Phase 10 gate:** on Blob-capable WebKit/Safari, save an avatar and a
   dated progress photo, reload, complete the manual/AI journey, export a completed
   session and unfinished draft, restore under a new name, reload/resume, and
   re-export. Compare canonical records and original photo bytes; verify notes,
   units, schedule completion and the untouched second profile. Record browser/OS
   and results. Do not weaken photo validation to accommodate Windows WebKit.
2. **Release blockers/inputs:** inspect the existing repository's Pages custom-domain
   and HTTPS status and resolve the certificate mismatch before trusting the public
   smoke test. Follow the exact [Group 1 hosting checks](group1-verification.md#separate-owner-hosting-correction).
   Group 1 configures `https://ko-fi.com/jhonatansaldana` in `.env.production`; confirm
   the intended account page in an ordinary browser because automation encounters a
   Cloudflare challenge. Do not bypass either a browser security warning or the
   challenge to claim a passing live check. Use the current Group 1 fingerprint,
   not the historical preparation fingerprint above, for the next owner release.
3. **Device checks, still unverified:** on a physical phone in both themes, portrait/
   landscape and enlarged text, edit with the keyboard open and reach Save/Clear
   and tabs; check dialogs/focus, file pickers and ZIP save/share sheets. Check timer
   lock/background/resume behavior without assuming an alarm. With NVDA/VoiceOver
   and voice control check labels, errors, dialog announcements, status and focus
   return. In a disposable environment test actual denied/full storage and recovery;
   inspect Unicode, quoting and inert formula-like CSV text in the intended
   spreadsheet app. Record any unavailable checks rather than marking them passed.
4. **Only after gates and owner approval:** review all changed/untracked files,
   including branding, then run the commit/deploy sequence below. Stop on any
   command failure. Keep the tested artifact fingerprint and source commit.
5. **After publication:** first run the HTTPS artifact comparison below. Then use
   the short published-origin smoke procedure. Record actual deployment commit,
   URL, date/time, browser/OS, fingerprint, results and limitations in TODO.md.
   Only then reassess Phase 11 completion.

## Owner-only commit and deployment sequence

These are instructions, **not actions performed during preparation**. Existing
dependencies are already installed here; use `npm ci` only when setting up another
checkout. Git credentials/publication rights are the owner's responsibility.
Review `git status`/`git diff` and untracked files first. `git add -A` below is
appropriate only after approving **all** listed changes; otherwise stage the
intended paths explicitly. Run commands individually and stop on failure.

```powershell
git status --short
git diff
npm run typecheck
npm run lint
npm run test:data
npm run build
npm run test:browser:static
node scripts/release-audit.mjs
git add -A
git diff --cached
git commit -m "Prepare Boros verified release"
git rev-parse HEAD
git push origin main
npm run deploy
node scripts/release-audit.mjs --url https://boros-app.com/
```

`npm run deploy` automatically rebuilds before pushing `dist` to `gh-pages`.
Compare the post-deploy audit fingerprint with the **pre-deploy tested** fingerprint;
both must agree, and `remote.matchesCandidate` must be true. If any changed build
differs, stop and retest it; a successful upload alone is not acceptance. The audit
uses no-cache requests and compares actual decoded bytes, rather than trusting
filenames or the static `0.0.0` package version. Allow Pages propagation, then retry
if needed; never disable TLS validation. CNAME and `.nojekyll` are generated by the
existing CLI and are outside the local content fingerprint.

## Published-origin smoke (not yet performed)

Use a fresh isolated browser profile/context at **https://boros-app.com/** after
artifact comparison succeeds. Do not clear an existing user's site storage to
avoid caches. Check Network/Console for failed resources, especially lazy screens
and both backup workers; HTTP success alone does not prove the app runs.

1. Confirm valid HTTPS, correct domain and Train startup. Open all five screens;
   address stays identical, titles/active states/focus follow the screen, and each
   refresh restores the last successfully opened screen. Cancel an unsaved edit
   navigation and confirm input/current screen remain. Browser Back may leave Boros.
2. In Settings create `Release A` and `Release B`. Give A an avatar/measurement
   photo and keep B distinct. In A create a three-set exercise, a one-day plan,
   reopen it, start Train and save a session with zero RIR/rest and a note. Reload
   and verify plan, results/units/note and photos. B must have none of A's records.
3. Download A's saved-data backup; locate the actual ZIP on disk. In a second
   isolated context on the same production origin, upload the original ZIP, review
   and import under a new name, reload, reopen the plan/session/photos and re-export.
   Compare original image bytes and canonical data (allow documented ownership/name
   and export-metadata changes). Create a distinct neighbour there before restore
   and verify it remains unchanged. Cancel a restore/Clear Data preview and confirm
   no data changes. Never use Clear Data against real owner records.
4. At phone width check both themes, tab navigation, fields and fixed-control
   clearance. Physical-device checks remain separate. If configured, explicitly
   click Settings → Support, verify the intended HTTPS Ko-fi page opens in a new
   tab, the opener is inaccessible, and no link is opened automatically. Missing
   configuration is an unavailable state, not a passed live destination test.

Data does not transfer with deployment. Use the [cross-origin backup procedure](backup-format.md#moving-between-website-addresses)
to move real saved records only after the target is verified. Keep the source and
original ZIP until the restored destination has been checked.

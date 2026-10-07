# Deployment persistence investigation

2026-10-04. Source HEAD `b672c6d1329e3e9abafa1dcbca926158623ffa4f`
(`Create updated`). The working tree was clean at the start; no applicable
AGENTS.md was found. No application, IndexedDB schema, manifest identity, hosting,
dependency or deployment configuration was changed. No commit, push or deployment
was performed. Tests used disposable browser contexts and an ignored, isolated
checkout of the public `gh-pages` branch; owner browser data was never accessed.

## Finding and limits

**The reported loss is not reproduced; its cause is still unconfirmed.** The
owner reports the final address is `https://boros-app.com/`, an empty Guest with
no other selectable profiles, ordinary reloads preserve records, and deployments
cause the loss across mobile and desktop browsers. This is broader than a phone
Home Screen issue. No before/after storage evidence from an affected browser is
available yet. Do not label the report resolved, or claim context isolation,
eviction or deletion as its confirmed cause.

Actual previous/current deployed files and two new local production builds
preserve populated data at one unchanged origin in the **same browser context**.
That establishes preservation for the tested releases/fixtures; it does not
reproduce a live GitHub Pages rollout, the owner's browser settings/extensions,
an OS storage purge, or an installed phone app. No speculative application fix
was made. A database reset or new manifest identity would risk the very records
being investigated.

## Implementation audit

- `src/db/database.ts`: stable name **`boros`**, Dexie schema **5** (native
  IndexedDB version **50**). Versions 1–5 add stores/indexes without dropping old
  stores or clearing records. No build version, asset hash, domain or pathname
  appears in its name or ownership keys.
- `src/db/profiles.ts`: startup validates existing `settings.workspace`, keeps
  its `activeProfileId`, and fails if that owner is missing. If settings are
  missing but **any** store contains records, it reports an actionable error.
  Guest is created only when every store is empty. No catch/delete/recreate
  fallback exists. A displayed fresh Guest alone therefore does not establish
  whether an old database was removed or a different storage context was opened.
- `src/app/WorkspaceProvider.tsx`: opening failures show **Browser storage
  unavailable** and retry; later failures keep recoverable editor state. They
  do not select a replacement Guest. Resetting the screen preference only changes
  navigation. The sole application sessionStorage key is the constant
  `boros.navigation.screen`; active profile and records remain in IndexedDB.
- Current initialization/selection can add a missing profile time zone and run
  `src/db/template-repair.ts`. Repair is transactional and adds missing library
  defaults/links; it neither erases history nor creates a new profile. Identity
  conflicts fail with an error. Existing service tests cover rollback/concurrency;
  the new release test exercises a real old AI plan through this repair.
- Whole-profile deletion is confined to **explicitly previewed and confirmed**
  Clear Data/restore operations in `src/db/restores.ts` and
  `src/features/backups/RestoreData.tsx`. Train Clear affects one draft; explicit
  measurement/photo/timer removal affects those owned records. None runs during
  startup, a build, or a deployment. No application `deleteDatabase` call exists.
- `predeploy` runs `npm run build`; `deploy` runs
  `gh-pages -d dist --cname boros-app.com --nojekyll`. Inspected the installed
  gh-pages implementation: its removal/copy operations replace files in its
  separate Git checkout, not browser IndexedDB. The scripts/config are unchanged.
- No service-worker registration or Cache Storage cleanup exists in the app.
  Backup import/export use ordinary web workers. Hashed Vite assets are not
  database keys. Stale/missing assets can prevent a screen loading; no asset-error
  handler resets the workspace. The local update server disables HTTP caching
  so each transition demonstrably executes the specified release.

## Manifest and public-site evidence

The previous deployment had no `site.webmanifest`. The current file specifies
`start_url: "./"`, `scope: "./"`, `display: "browser"`, and **no explicit `id`**.
Neither the current source `index.html` nor the live HTML links this manifest.
The file/icons were left unchanged. This alone does not identify an existing
phone installation's launch context or prove that it uses shared browser storage.

Read-only public checks on 2026-10-04, including 16:10 UTC:

- `curl.exe -I -L` and `curl.exe -L` obtained HTTP **200**, final address
  **https://boros-app.com/**, without a redirect or certificate bypass.
- Fresh disposable Edge **154.0.4258.53**: secure context **true**,
  `crypto.randomUUID` **function**, `crypto.subtle` **object**, manifest link
  **absent**, normal browser display, **zero** service-worker registrations.
- All five screens loaded at that address. All **19 observed document/asset
  responses** were 200 and had **no `Clear-Site-Data` header**. The main response
  had `Cache-Control: max-age=600`, server GitHub.com and Last-Modified
  `Sun, 04 Oct 2026 08:22:23 GMT`. This is a snapshot, not evidence about headers
  or redirects during an earlier rollout.
- The live entry `assets/index-Cq5rwT6C.js` matches the currently published
  `gh-pages` artifact tested below. No test deployed new files to obtain this result.

Browser storage is origin-bound; protocol, hostname and port matter. Path/asset
hash changes within the same origin do not select a different IndexedDB database.
See [IndexedDB's same-origin rule](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).
Separately, WebKit documents that Home Screen apps do not share ongoing website
data with their originating browser, and local storage other than cookies is not
copied at installation. On iOS 26, a user can create a Home Screen web app even
without a manifest. These are possible distinctions to inspect, **not this
incident's diagnosis**. See [WebKit 17.2 web-app storage](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
and [WebKit 26 Home Screen behavior](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).

## Same-context update regression

New files: `tests/updates/prepare.mjs`, `tests/updates/persistence.spec.ts`,
`playwright.updates.config.ts`. The only package change adds
`npm run test:browser:updates`; deploy scripts and dependencies are untouched.

Preparation reads an isolated public deployment checkout and extracts exact Git
artifacts into separate directories. It then invokes the installed Vite twice,
without installing anything or publishing. `builds.json` records commits and
SHA-256 hashes. It does not reconstruct the previous release using today's code.

| Stage | Commit / source | Loaded entry |
| --- | --- | --- |
| Previous deployment, 2026-10-03 23:05:22 UTC | `a87dc13014fe54dad0b407572f7fdc1afe4dd132` | `index-CkjvT5ih.js` |
| Current deployment, 2026-10-04 08:22:04 UTC | `aa9126efd67244ddb9c7c8818896a32822a56b64` | `index-Cq5rwT6C.js` |
| First local production build | source `b672c6d1329e3e9abafa1dcbca926158623ffa4f` | `index-DzENKJjv.js` |
| Second independent local rebuild | same source/config, deterministic identical bytes | `index-DzENKJjv.js` |

Each case starts one local static server, fixes its origin for the entire test,
and changes only the directory it serves. There is no SPA rewrite. Playwright
creates one isolated context **per scenario, never per build**. It reloads and
closes/reopens pages inside that same context after each update. Test-owned
profiles are created through the previous deployed UI, not seeded using the new
schema or recovered using a storage-state export.

Each fixture contains Guest plus a different active named profile, a library
exercise/tag, a plan/schedule, selected Train plan, a completed session with
notes, a separately committed unfinished draft with raw `12.` input and notes,
a 72.5 kg measurement, a real PNG avatar Blob, and Light appearance. Before any
update an ordinary reload must preserve the dataset exactly.

- The linked-plan case compares **all 11 stores**, all record fields/IDs and
  exact photo bytes before/after every update and page reopen. Counts remain
  profiles 2, settings 1, exercises 1, tags 1, plans 1, schedules 1, drafts 2,
  sessions 1, measurements 1, photos 1, timers 0.
- The legacy AI-plan case allows only the documented first-upgrade changes:
  one added template and one plan revision/link update. Its two existing tags
  remain exact (the old release already saved the AI tag). All original
  records remain; profile/selection/history/drafts/photos/measurements/schedules
  are exact, as are plan contents/provenance/timestamps apart from the allowed
  link/revision. Every subsequent update/reopen is a complete exact comparison.
- On the first local build, a deliberately failing IndexedDB open must show the
  explicit startup error. Independent native reads prove records remain exact
  while that error is visible. Removing the test fault and reloading recovers
  the original active profile without any replacement Guest.
- The final UI resumes the committed draft, displays the original avatar/weight,
  and switches to Guest and back to prove isolation and active selection. The
  read-only diagnostic script also runs and must leave all records exact.

Commands (from the project root; the clone destination must be new):

```powershell
git clone --branch gh-pages --single-branch --depth 8 https://github.com/jsaldana92/boros.git test-results/persistence-deployed
node tests/updates/prepare.mjs test-results/persistence-deployed a87dc13014fe54dad0b407572f7fdc1afe4dd132 aa9126efd67244ddb9c7c8818896a32822a56b64
$env:PLAYWRIGHT_BROWSERS_PATH='node_modules/.cache/playwright'
npm run test:browser:updates
```

Reuse the already-created checkout on this machine rather than cloning over it.
The old UI fixture intentionally targets the named previous artifact; changing
the baseline release may require its controls to be updated. Firefox was already
installed; no browser/dependency installation was performed. To run just Edge,
use `-- --project=root-desktop --project=project-phone`. Inputs are in ignored
`test-results/update-builds`; Playwright's update output is a separate
`test-results/update-runs`. Other suites which clean the entire default
`test-results` directory can remove these inputs; prepare again if needed.

## Results

- Final update matrix: **6/6 passed**, **61.56 seconds**, no skips/retries/flaky
  results — linked and legacy fixtures on desktop
  Edge at `/`, emulated-phone Edge at `/project-check/`, and desktop Firefox at
  `/` (Edge 154, Firefox 155). Three update transitions per scenario, with the
  same context retained. Final run began `2026-10-04T16:21:34.120Z`.
  JSON report: `test-results/update-runs/results.json`, including before-update
  snapshots, per-update origin/commit/count receipts and diagnostic output.
  The linked/legacy fixed addresses respectively were ports 52992/61975 for
  desktop Edge, 53260/55945 for project-phone, and 57286/63872 for Firefox, all
  on `http://127.0.0.1`. Different scenarios have isolated origins/contexts;
  **each individual scenario keeps its address/context for all four releases**.
- `npm run test:data`: **131/131 passed**, 4.34 seconds. Includes existing
  populated v1/v2/v3/v4-to-current migration tests, Guest/selection consistency,
  profile isolation, repair rollback, and backup/restore integrity.
- `npm run build`, `npm run typecheck`, `npm run lint`: **passed**.
  `git -c core.safecrlf=false diff --check`: **passed**.
- Initial data invocation could not spawn test workers in the sandbox (`EPERM`);
  reran with subprocess execution allowed and all passed. Two early update-test
  runs failed on test locators (exact implicit profile label, and the previous
  release's Copy-to-day control). After correction desktop passed 2/2. The first
  matrix passed 4 Edge cases but failed to launch 2 Firefox cases because its
  config inherited the Edge channel; fixed the test config and all 6 passed.
  Adding a stricter tag-count assertion then exposed an incorrect fixture
  assumption in 3 legacy cases: the old release had already persisted the AI
  tag. The final assertion requires all tags to remain exact, not an extra tag.
  No product behavior was changed to make these tests pass.

No full 352-scenario regression rerun is claimed for this test/documentation-only
task. Prior phase/group results remain historical. Physical phones, actual Safari,
screen readers/voice control, live Ko-fi content, real quota exhaustion, suspended
timers and other existing acceptance gates remain unverified here.

## Exact next evidence and recovery checks

Do not clear site data, uninstall/recreate a Home Screen app, use Clear Data,
or replace a profile to investigate. None is necessary for a normal update.

1. In one affected desktop browser and one affected phone context, record the
   OS/browser version, normal/private mode, browser profile, tab versus Home
   Screen launch, and the **final full address**. Check Settings → Active profile.
   Record the selected name and all available profiles. Try the original launch
   method/browser context without removing or resetting anything.
2. Where original data is accessible, export **each profile** using Settings →
   Data → check **I understand this exports saved data only.** → **Download data**.
   Keep the original ZIP files. Verify their counts in an import preview in a
   disposable test context, without replacing the source profile.
3. On desktop DevTools, run the contents of `scripts/storage-diagnostics.js` in
   the affected page and save its printed JSON. This is read-only and reports the
   full URL, browser/display mode, loaded entry, database names/version, profile
   IDs/creation times, active ID and store counts. It does not export names,
   measurements, notes or photo contents. If enumeration/opening fails it records
   the error; it never silently reports an empty successful database. The phone
   equivalent needs remote Web Inspector/DevTools or the same screenshots/details
   if remote inspection is unavailable.
4. At the **next separately authorized deployment**, keep that exact browser
   profile/tab or installed app. Capture the same JSON immediately before,
   after an ordinary pre-deploy reload, and after the new build loads. Include
   console errors and any Network response `Clear-Site-Data` header/redirect.
   Record the deployment commit/time. No new live deployment is requested or
   performed by this investigation.
5. Compare: same old IDs/counts but a different active ID indicates selection;
   same records plus an opening error indicates loading; different origin or
   browser/installation context indicates a different storage namespace. A new
   Guest ID with old rows absent **in a proven unchanged context** establishes
   record loss there, but still needs the before/after build and error/header
   evidence to attribute its cause. `persistent: false` alone does not establish
   that eviction happened.

If the original browser/Home Screen context still contains the records, export
there, open the intended destination at valid HTTPS, then Settings → **Backup
ZIP** → validate → choose **Import under a new name** if a name matches, enter a
distinct **Imported profile name**, **Preview import**, review counts, check the
confirmation and **Confirm and save**. If no name matches, the preview already
creates an independent profile. Verify plans, saved sessions, resumed drafts,
measurements and photos before doing anything to the original context. This is
conditional recovery guidance, not a confirmed fix. If the records are absent
from every original context, use an existing downloaded backup; GitHub Pages
does not contain a remote copy of these local user records. Never bypass HTTPS
warnings or disable checksum validation to recover a backup.


## 2026-10-07 additive v7 follow-up

The Train/library lifecycle candidate adds only the deletedSources store to stable
boros. A populated v6 fake-IndexedDB database upgrades to v7 without changing
existing records/IDs/photo bytes. Backup v13 preserves minimal deleted identities;
initialization/error handling, manifest identity, hosting and deploy commands remain
unchanged. This does not diagnose or claim to fix the earlier production report.

The cached a87dc13 -> aa9126e -> two new production-build regression passed **6/6**
in 2.2 minutes using `npm run test:browser:updates` with the repository browser cache.
A final rebuild after the saved-round display correction passed **6/6** again in
2.1 minutes with the same unchanged persistence checks.
Every case keeps exactly one origin/context, including page close/reopen. The test
now also deletes a disposable library source, preserving its plan copy and tombstone
across the second rebuild alongside the original IDs, active profile, measurement,
photo bytes, templates, sessions and committed draft. Injected IndexedDB open failure
still shows an error and leaves all records intact. Edge root desktop/project phone
and Firefox desktop passed. No owner storage, actual deployment or hosting change
was involved. See [current verification](train-library-lifecycle-verification.md)
for final follow-up results and physical-device limitations. The evidence checklist
above remains required for the unresolved production disappearance report.

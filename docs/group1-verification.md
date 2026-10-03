# Group 1 — compatibility and owner UI revisions

Date: 2026-10-03. Scope: Group 1 only; Groups 2–4 are unchecked in TODO.md.
No commit, push, deployment, DNS/GitHub settings change or owner-data clearing.

## Production diagnosis

The owner confirmed **HTTPS with a red strikethrough**, loading only after choosing
to proceed past Chrome's warning, and provided a `*.github.io` certificate issued
by Let's Encrypt YR1. This is not evidence that the owner was opening HTTP.

Fresh isolated Edge with default certificate validation attempted
`https://boros-app.com/`, observed no redirect, and stopped before document load with
`net::ERR_CERT_COMMON_NAME_INVALID` (`about:blank` after failure). Node independently
returned `ERR_TLS_CERT_ALTNAME_INVALID`. Certificate validity: August 2, 2026
23:38:02 UTC through October 31, 2026 23:38:01 UTC, so it was not expired. Its SANs
are `*.github.com`, `*.github.io`, `*.githubusercontent.com` and their apex names;
**none covers boros-app.com**. The owner's certificate details agree. This is a
confirmed certificate hostname problem, before mixed-content checks can run.

The HTTPS document, its final successful post-redirect address, `isSecureContext`,
`crypto.randomUUID`, `crypto.subtle`, and mixed-content requests cannot be measured
in a normally validated session here because loading fails first. No security
interstitial was bypassed. The owner's post-bypass API values remain unknown; do
not infer them from the HTTPS spelling or from the independent HTTP test below.
Additional mixed content or browser-specific issues in that bypassed session have
not been ruled out, but are not needed to explain the observed certificate warning.

A **separate diagnostic HTTP request**, not an assumption about the owner's URL,
returned 200 at `http://boros-app.com/` with no redirect/Location header. Edge there
reported `isSecureContext: false`, `randomUUID: undefined`,
`getRandomValues: function`, `subtle: undefined`, and reproduced the exact
“Browser storage unavailable / crypto.randomUUID is not a function” startup error.
Its HTTP-loaded assets are not mixed content in an HTTPS document. HTTPS enforcement
was therefore not taking effect for that observed HTTP request.

At the start of this task the public gh-pages HTML matched the then-local pre-edit
dist/index.html: SHA-256
`98cd37a9b880b3601af047ea062da2572dc5e6a90053322e7d84da4c6ed2d146`, with
`index-C_gTw0vp.js`, `calendar-dates-Cz0j_8y0.js`, `index-DL8g_Jp3.css` and the owner's
favicon. The HTTP app requested that entry and reproduced the direct UUID call.
This supersedes the prior release-preparation observation of a different older
deployment. It does not prove every deployed file matched source, nor verify this
task's new Group 1 candidate. No Group 1 changes have been published by this task.

Observed apex DNS A records: `185.199.108.153`, `185.199.109.153`,
`185.199.110.153`, `185.199.111.153`; AAAA and CAA queries returned ENODATA.
Those A records match GitHub Pages' documented values. This does not establish the
registrar's full configuration, GitHub's domain association or certificate job state.

## Separate owner hosting correction

In `jsaldana92/boros` → Settings → Pages, verify the existing custom domain is
`boros-app.com`, its DNS check passes and its certificate provisioning completes.
The certificate must cover that exact hostname. Check for conflicting DNS records
if GitHub reports an error; the observed A records themselves do not justify a blind
DNS replacement. If provisioning is stuck, GitHub documents removing/re-saving the
custom domain to restart it; that is an **owner hosting action**, not performed here.
Enable Enforce HTTPS once a valid certificate is available, then verify HTTP redirects
to the correct HTTPS address and HTTPS loads without clicking through a warning.
See [GitHub's HTTPS and provisioning instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

After correction, record the browser/OS, final full address, certificate SANs and
validity, Security panel result, and this console result from a normally loaded page:

```js
({
  url: location.href,
  secure: window.isSecureContext,
  randomUUID: typeof globalThis.crypto?.randomUUID,
  getRandomValues: typeof globalThis.crypto?.getRandomValues,
  subtle: typeof globalThis.crypto?.subtle
})
```

Expected for a supported current browser: correct HTTPS origin, `secure: true`,
secure randomness, and `subtle: "object"`. Check Console/Network for mixed content
and failed assets. Do not disable certificate validation or use an interstitial
bypass to obtain a passing release result. HTTP/HTTPS storage has separate ownership;
use original-ZIP export/import from a securely accessible source if a transfer is
needed. Do not clear the HTTP workspace or promise hashing works there.

## Application changes

- `src/lib/browser-crypto.ts` owns ID generation: native randomUUID when available,
  otherwise 16 getRandomValues bytes with UUID version 4 and RFC variant bits.
  No Math.random, time/counter identities or record rewrites. Initialization probes
  compatibility before writes. Every application UUID call uses this helper,
  including Guest/profiles/photos, plan/day/exercise copies, imports, schedules,
  training/timers, measurements and restore ownership. Workers don't generate IDs;
  deterministic restore remapping still uses its existing SHA-256 algorithm.
- Initialization retains the actual Error, so unsupported random sources report a
  compatibility issue instead of storage permissions, disk space or a stale profile.
  Existing transactions still roll back partially staged records on failure. An
  insecure context displays a connection notice. The UUID fallback **does not fix
  HTTPS or establish that a connection is trusted**.
- Both backup workers share the guarded SHA-256 function. Missing Web Crypto fails
  explicitly; UI preflights avoid claiming export/restore success. No hash/checksum
  is skipped or substituted. Clipboard failure still selects instructions for manual
  copying rather than claiming success. Browser API documentation distinguishes
  [secure-context randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)
  from [getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).
- `.env.production` supplies the owner-approved public Ko-fi URL using the existing
  Vite mechanism. Production Support is in Settings, explicit-click only, with
  `_blank` and `noopener noreferrer`. Development can retain blank/unavailable
  configuration; local environment overrides must be checked when building.
- Header uses unchanged `public/snake.png` and `public/logo.png`, with proportional
  rendering and light-theme inversion. Both images share the guarded Train action.
  The avatar alone opens Settings, with accessible name/tooltip; favicon unchanged.
- Height and weight units sit beside their respective input(s); Age stays separate.
  Removed only the requested weight explanation. Sort/search/filter spacing is more
  compact with readable labels and at least 44px controls. Display timestamps omit
  seconds/milliseconds; datetime inputs show minute precision. Existing measuredAt,
  measuredLocal, zone/offset and creation timestamps survive unrelated edits, even
  checking “Change measurement date/time” without changing the value. A deliberate
  new minute uses the existing DST validation. Backups retain full precision.

Database version 5, backup schema 1, single-address navigation, protections against
stale writes, all deployment scripts/pins and original assets remain unchanged.

## Verification

All available local checks are complete. Live HTTPS/Support acceptance and the
carried-forward device checks remain pending; this is not full release acceptance.

| Command/check | Actual result |
| --- | --- |
| `npm run build` | Passed, no large-chunk warning |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, including after the final test-fixture correction |
| `npm run test:data` | **97 passed**, including seven new compatibility/precision tests; no failures/skips |
| `npm run test:browser:static` | **268 passed / 12 failed** initially; four root/project desktop/phone projects |
| `npm run test:browser:static -- --last-failed` | **12/12 passed** after test-only fixture corrections; production artifact unchanged |
| Firefox engine command below | **130 passed / 2 failed / 2 expected static-only skips** initially |
| Same Firefox command with `--last-failed` | **2/2 passed** after touch-target assertion rounding; application CSS unchanged |
| `npm run test:browser -- tests/browser/group1.spec.ts tests/browser/profiles.spec.ts tests/browser/progress.spec.ts tests/browser/shell.spec.ts tests/browser/journey.spec.ts` | **44 passed / 2 expected production-only Support skips**; development's unconfigured Support state passes |
| `node scripts/release-audit.mjs`; `node scripts/release-audit.mjs --url http://127.0.0.1:4174/` and same with `/project-check/` | **23/23 files** returned matching bytes/hashes at each mount; no rewrite fallback, zero audit findings |
| `git diff --check` | Passed |

Exact Firefox invocation (PowerShell, cached browser installation):

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/node_modules/.cache/playwright"
node node_modules/playwright/cli.js test --config playwright.engines.config.ts --project=firefox-desktop --project=firefox-phone --workers=2
```

Append `--last-failed` for the recorded two-test rerun. The passing static/Firefox
evidence combines each initial run with its targeted correction run; no fresh full
280/280 static or 132/132 Firefox pass is claimed. CDP-only scenarios are excluded
from the Firefox configuration and exercised in Edge. All browser contexts and data
fixtures are isolated; existing owner records were not cleared.

Current candidate: **23 files / 2,047,113 bytes**, inventory SHA-256
`33a2a1cc3b7ba3090f829c52bc0e1788f93bbb4c7e19951285a8ee33cfa73e68`.
The receipt is ignored `test-results/release-candidate.json`, with per-mount receipts
`test-results/group1-root-resources.json` and `group1-project-resources.json`.
Base HEAD is `d062772de62be76c9755d5de6fa717a5401738a9` plus the preserved dirty
working tree; no release commit was created. Entry **274.37 kB / 87.99 kB gzip**,
shared module **166.06 kB**, export/import workers **198.09/201.20 kB**, CSS
**19.44 kB**. Rebuild and re-verify after any source/configuration/asset change.

The full UI-created journey runs with native UUID and with randomUUID removed:
manual/AI creation, profile isolation, scheduled sessions/timers, saved draft,
photos, export/restore and original byte comparison. Additional browser tests cover
existing-ID reload, no secure random source/no writes, missing hash APIs without
false success, manual clipboard fallback, guarded brand navigation, avatar-only
header, both themes, 320px paired units and minute editing with precise stored data.
Static root/project checks cover real image/chunk/worker resources without rewrites.

The first static run exposed obsolete visible-profile-name and ISO-display test
expectations, plus a new header check that had scrolled to Appearance before
asserting viewport visibility. Those three fixtures were corrected. Firefox then
reported a computed 44px target as 43.999996px in two shell assertions; comparison
now rounds to hundredths of a pixel while preserving the 44px requirement. No
application change was needed for these failures. Dark/light 320px and light 1440px
screenshots were also inspected for image proportions, avatar, paired units and
layout. Emulation is not a physical-keyboard/safe-area check.

Support browser tests intercept only the explicit click to verify the exact supplied
destination/new-tab protection without automatic third-party loading. A separate
live Ko-fi navigation reached a certificate-valid `ko-fi.com` response but returned
403/“Just a moment…” (Cloudflare challenge); the initial network-idle attempt timed
out. No challenge bypass. **Account-page content is not verified**; owner must open
the supplied destination in their ordinary browser and confirm their page.

Physical phone keyboards/download sheets, screen readers/voice control, real quota,
spreadsheet apps, suspended timers and photo-backed Blob-capable WebKit/Safari
remain unverified. The unchanged Windows WebKit Blob probes were not rerun.
Neither Group 1 nor a UUID fallback establishes full release acceptance or implements
supersets, plan duration, active-plan selection or redesigned Calendar/Progress.

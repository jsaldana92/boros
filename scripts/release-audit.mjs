// Read-only build audit. Writes a local receipt, never publishes or edits dist.
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve, relative, sep } from 'node:path'

const root = resolve('dist')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--url')) throw new Error('Usage: node scripts/release-audit.mjs [--url https://host/base/]')
const base = args.length ? new URL(args[1]) : undefined
if (base && (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)))) throw new Error('Use HTTPS, or HTTP localhost for static verification.')
if (base && (base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/'))) throw new Error('Use a trailing-slash base URL without credentials, query or hash.')
const files = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not accepted in the release output.')
    if (entry.isDirectory()) await walk(path)
    else files.push({ path: relative(root, path).split(sep).join('/'), bytes: await readFile(path) })
  }
}
await walk(root)
files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
const findings = []
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['credential-token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[A-Z0-9]{16}|sk-proj-[A-Za-z0-9_-]{30,})/],
  ['test-fixture', /boros-test-|Untouched neighbour|Capacity disposable|Only in imported history/],
  ['development-entry', /@vite\/client|\/src\/main\.tsx/],
]
for (const file of files) {
  if (!/^(?:index\.html|[^/]+\.(?:ico|svg|png|webp)|assets\/[^/]+\.(?:js|css|woff2?|svg|png|webp))$/.test(file.path)) findings.push({ path: file.path, kind: 'unexpected-output-file' })
  if (/\.(?:js|css|html|svg)$/.test(file.path)) for (const [kind, pattern] of patterns) if (pattern.test(file.bytes.toString())) findings.push({ path: file.path, kind })
}
const html = files.find((f) => f.path === 'index.html')?.bytes.toString()
if (!html) throw new Error('Build dist/index.html first.')
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
for (const ref of references) if (!ref.startsWith('./') || !files.some((f) => f.path === ref.slice(2))) findings.push({ kind: 'missing-or-nonrelative-html-resource' })
for (const worker of ['export.worker-', 'import.worker-']) if (!files.some((f) => f.path.startsWith(`assets/${worker}`))) findings.push({ kind: 'missing-backup-worker' })
const inventory = files.map((f) => ({ path: f.path, bytes: f.bytes.length, sha256: sha(f.bytes) }))
const fingerprint = sha(JSON.stringify(inventory))
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const report = {
  generatedAt: new Date().toISOString(), fingerprint,
  sourceCommit: git('rev-parse', 'HEAD'), sourceDirty: !!git('status', '--porcelain', '--untracked-files=normal'),
  node: process.version, files: inventory, findings,
  scanScope: 'Output filenames, relative HTML resources, worker presence, common credential/test/development markers. Not an exhaustive secret audit.',
}
if (base) {
  const resources = []
  for (const file of inventory) {
    try {
      const response = await fetch(new URL(file.path === 'index.html' ? './' : file.path, base), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) })
      const bytes = new Uint8Array(await response.arrayBuffer())
      resources.push({ path: file.path, status: response.status, matches: response.ok && sha(bytes) === file.sha256 })
    } catch (error) {
      resources.push({ path: file.path, matches: false, error: error.cause?.code ?? error.name })
      // A failed origin/TLS check cannot establish any release identity. Do not
      // hammer every asset or disable certificate validation after that failure.
      if (!resources.some((r) => r.status)) break
    }
  }
  report.remote = { base: base.href, resources, matchesCandidate: resources.length === inventory.length && resources.every((r) => r.matches) }
}
await mkdir('test-results', { recursive: true })
const receipt = `test-results/release-${base ? 'comparison' : 'candidate'}.json`
await writeFile(receipt, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ fingerprint, fileCount: files.length, totalBytes: inventory.reduce((sum, f) => sum + f.bytes, 0), findings, remote: report.remote, receipt }, null, 2))
if (findings.length || report.remote && !report.remote.matchesCandidate) process.exitCode = 1

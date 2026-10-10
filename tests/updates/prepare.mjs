// Read-only release inputs; local builds only. Never invokes npm run deploy.
// Run from the project root. See docs/deployment-persistence-verification.md.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import JSZip from 'jszip'

const [repository, previous, deployed] = process.argv.slice(2)
if (!repository || !previous || !deployed) throw new Error('Usage: node tests/updates/prepare.mjs <isolated gh-pages checkout> <previous commit> <current deployed commit>')
const output = resolve('test-results/update-builds')
await mkdir(output, { recursive: true })
const stages = []
for (const [label, revision] of [['previous', previous], ['deployed', deployed]]) {
  const commit = execFileSync('git', ['-C', repository, 'rev-parse', '--verify', `${revision}^{commit}`], { encoding: 'utf8' }).trim()
  const archive = await JSZip.loadAsync(execFileSync('git', ['-C', repository, 'archive', '--format=zip', commit], { maxBuffer: 64 * 1024 * 1024 }))
  // Unique directories prevent leftover files from masking a missing old asset.
  const directory = resolve(output, `${label}-${Date.now()}`)
  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue
    const file = resolve(directory, entry.name)
    if (!file.startsWith(directory + sep)) throw new Error('Archive path escapes its build directory')
    await mkdir(resolve(file, '..'), { recursive: true })
    await writeFile(file, await entry.async('nodebuffer'))
  }
  stages.push({ label, directory, commit })
}
// The source immediately before this working-tree change is available locally.
// Build an isolated archive with existing dependencies; no checkout/deploy/reset.
{
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const archive = await JSZip.loadAsync(execFileSync('git', ['archive', '--format=zip', commit], { maxBuffer: 64 * 1024 * 1024 }))
  const source = resolve(output, `pre-interval-source-${Date.now()}`)
  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue
    const file = resolve(source, entry.name)
    if (!file.startsWith(source + sep)) throw new Error('Archive path escapes source directory')
    await mkdir(resolve(file, '..'), { recursive: true }); await writeFile(file, await entry.async('nodebuffer'))
  }
  const directory = resolve(output, `pre-interval-${Date.now()}`)
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', source, '--outDir', directory], { stdio: 'inherit' })
  stages.push({ label: 'pre-interval', directory, commit })
}
for (const label of ['build-1', 'build-2']) {
  const directory = resolve(output, `${label}-${Date.now()}`)
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', directory], { stdio: 'inherit' })
  stages.push({ label, directory, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() })
}
for (const stage of stages) {
  const html = await readFile(resolve(stage.directory, 'index.html'), 'utf8')
  stage.htmlSha256 = createHash('sha256').update(html).digest('hex')
  stage.entry = html.match(/<script[^>]+src="([^"]+)"/)?.[1]
  if (!stage.entry?.startsWith('./assets/')) throw new Error(`Missing relative production entry: ${stage.label}`)
  stage.entrySha256 = createHash('sha256').update(await readFile(resolve(stage.directory, stage.entry))).digest('hex')
}
await writeFile(resolve(output, 'builds.json'), JSON.stringify({ preparedAt: new Date().toISOString(), stages }, null, 2))
console.log('Prepared five release directories in test-results/update-builds/builds.json')

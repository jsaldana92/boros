// The first directory is an untouched production build captured before editing.
// Build twice locally; never use the deploy script or change hosting.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
const previous=resolve(process.argv[2]??'test-results/repeat-baseline-v9/dist')
const root=resolve('test-results/repeat-update-builds');await mkdir(root,{recursive:true})
const stages=[{label:'previous-v9',directory:previous}]
for(const label of ['build-1','build-2']){const directory=resolve(root,label+'-'+Date.now());execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',directory],{stdio:'inherit'});stages.push({label,directory})}
for(const s of stages){const html=await readFile(resolve(s.directory,'index.html'),'utf8'),entry=html.match(/<script[^>]+src="([^"]+)"/)?.[1];if(!entry?.startsWith('./assets/'))throw new Error('Missing relative production build');s.entry=entry;s.sha256=createHash('sha256').update(await readFile(resolve(s.directory,entry))).digest('hex')}
await writeFile(resolve(root,'builds.json'),JSON.stringify({preparedAt:new Date().toISOString(),stages},null,2))

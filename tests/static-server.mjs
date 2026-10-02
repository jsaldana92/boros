// Test-only plain static host: the same build is mounted at root and a sample
// project directory. Missing files return 404; there is NO SPA fallback.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'

const root = resolve('dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (path === '/project-check') { response.writeHead(301, { Location: '/project-check/' }); response.end(); return }
    if (path.startsWith('/project-check/')) path = path.slice('/project-check'.length)
    if (path.endsWith('/')) path += 'index.html'
    const file = resolve(root, `.${path}`)
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error('Not found')
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    response.end(await readFile(file))
  } catch { response.writeHead(404); response.end('Not found') }
}).listen(4174, '127.0.0.1')

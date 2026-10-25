// A GET/HEAD handler for the app shell and nothing else. Only files in the
// shell list are served, so tests, docs, dotfiles and anything outside the
// root cannot be reached however the path is written.

import { readFile, stat } from 'node:fs/promises'
import { join, extname, resolve, sep } from 'node:path'
import { renderServiceWorker } from './shell.js'
import { securityHeaders, cachePolicy, MIME } from './headers.js'

function send (response, request, status, headers, body) {
  response.writeHead(status, { ...securityHeaders(), ...headers, 'Content-Length': Buffer.byteLength(body ?? '') })
  response.end(request.method === 'HEAD' ? undefined : body)
}

function plain (response, request, status, text, extra = {}) {
  send(response, request, status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra }, `${text}\n`)
}

/** The path as a relative file name, or null if it is not a plausible one. */
export function cleanPath (rawUrl) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return null
  return pathname === '/' ? 'index.html' : pathname.slice(1)
}

/**
 * @param options { root, shell, pluginsDir (dev only), log }
 */
export function createHandler ({ root, shell, pluginsDir = null, log = () => {} }) {
  return async function handle (request, response) {
    const started = Date.now()
    const done = status => log(`${request.method} ${request.url} ${status} ${Date.now() - started}ms`)
    try {
      const status = await route(request, response)
      done(status)
    } catch (error) {
      log(`error ${request.method} ${request.url}: ${error.message}`)
      if (!response.headersSent) plain(response, request, 500, 'Internal error')
      done(500)
    }
  }

  async function route (request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      plain(response, request, 405, 'Method not allowed', { Allow: 'GET, HEAD' })
      return 405
    }
    const relative = cleanPath(request.url)
    if (relative === null) { plain(response, request, 400, 'Bad request'); return 400 }

    if (relative === 'healthz') { plain(response, request, 200, 'ok'); return 200 }

    const { files, set, version } = shell.get()

    if (relative === 'shell.json') {
      send(response, request, 200, { 'Content-Type': MIME['.json'], 'Cache-Control': cachePolicy(relative) },
        JSON.stringify({ version, files }))
      return 200
    }
    if (relative === 'sw.js') {
      send(response, request, 200, { 'Content-Type': MIME['.js'], 'Cache-Control': cachePolicy(relative) },
        renderServiceWorker(root, version))
      return 200
    }
    if (set.has(relative)) return sendFile(request, response, join(root, relative), relative)

    if (pluginsDir && relative.startsWith('plugins/')) {
      const target = resolve(pluginsDir, relative.slice('plugins/'.length))
      if (target.startsWith(resolve(pluginsDir) + sep)) {
        return sendFile(request, response, target, relative, { 'Access-Control-Allow-Origin': '*' })
      }
    }

    plain(response, request, 404, 'Not found')
    return 404
  }

  async function sendFile (request, response, path, relative, extra = {}) {
    let info
    try {
      info = await stat(path)
      if (!info.isFile()) throw new Error('not a file')
    } catch {
      plain(response, request, 404, 'Not found')
      return 404
    }
    const etag = `W/"${info.size}-${Math.round(info.mtimeMs)}"`
    const headers = {
      'Content-Type': MIME[extname(path).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': cachePolicy(relative),
      ETag: etag,
      ...extra
    }
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, { ...securityHeaders(), ...headers })
      response.end()
      return 304
    }
    send(response, request, 200, headers, await readFile(path))
    return 200
  }
}

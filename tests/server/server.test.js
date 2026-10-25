import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { startServer } from '../../server/serve.js'
import { cleanPath } from '../../server/static.js'
import { listShell } from '../../server/shell.js'
import { CSP } from '../../server/headers.js'

const PROJECT = join(import.meta.dirname, '..', '..')
let server
let base

// node:http rather than fetch: fetch normalises the path, and these tests need to send it raw.
function get (path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const { port } = server.address()
    const req = request({ host: '127.0.0.1', port, path, method, headers }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end()
  })
}

beforeAll(async () => {
  server = await startServer({ root: PROJECT, port: 0 })
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve) }))

describe('what is served', () => {
  it('serves the app at / with revalidation and the security headers', async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toBe(CSP)
    expect(res.body).toMatch(/<title>Melogen<\/title>/)
  })

  it('serves modules as JavaScript, with a cache lifetime', async () => {
    const res = await get('/src/app.js')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(res.headers['cache-control']).toBe('public, max-age=3600')
  })

  it('serves the manifest, styles and icons with the right types', async () => {
    expect((await get('/manifest.webmanifest')).headers['content-type']).toBe('application/manifest+json; charset=utf-8')
    expect((await get('/styles/main.css')).headers['content-type']).toBe('text/css; charset=utf-8')
    expect((await get('/icons/icon-192.png')).headers['content-type']).toBe('image/png')
    expect((await get('/icons/icon.svg')).headers['content-type']).toBe('image/svg+xml')
  })

  it('answers conditional requests with 304', async () => {
    const first = await get('/src/app.js')
    const again = await get('/src/app.js', { headers: { 'if-none-match': first.headers.etag } })
    expect(again.status).toBe(304)
    expect(again.body).toBe('')
  })

  it('HEAD returns the headers and no body', async () => {
    const res = await get('/', { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(Number(res.headers['content-length'])).toBeGreaterThan(100)
    expect(res.body).toBe('')
  })

  it('has a health check', async () => {
    const res = await get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body).toBe('ok\n')
    expect(res.headers['cache-control']).toBe('no-store')
  })
})

describe('what is not served', () => {
  const hidden = ['/docs/plan.md', '/docs/idea.md', '/tests/size.test.js', '/tests/fixtures/monochord.ttl', '/package.json',
    '/package-lock.json', '/vitest.config.js', '/server/serve.js', '/deploy/melogen.service', '/bin/check-size.js',
    '/node_modules/vitest/package.json', '/.git/config', '/.gitignore', '/LICENSE', '/README.md', '/sw.js.bak', '/nothing']

  for (const path of hidden) {
    it(`404 for ${path}`, async () => {
      expect((await get(path)).status).toBe(404)
    })
  }

  it('cannot be walked out of the root', async () => {
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/src/../../package.json', '/src/%2e%2e/%2e%2e/package.json',
      '/..%2fpackage.json', '/src/..%5c..%5cpackage.json', '/%00', '/src/app.js%00.png', '//etc/passwd', '/src//app.js']) {
      const res = await get(path)
      expect([400, 404], path).toContain(res.status)
      expect(res.body).not.toMatch(/"name": "melogen"/)
    }
  })

  it('a directory is not listed', async () => {
    expect((await get('/src')).status).toBe(404)
    expect((await get('/src/')).status).toBe(404)
  })

  it('rejects methods other than GET and HEAD', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const res = await get('/', { method })
      expect(res.status, method).toBe(405)
      expect(res.headers.allow).toBe('GET, HEAD')
    }
  })

  it('does not serve /plugins unless a plugins folder is mounted', async () => {
    expect((await get('/plugins/monochord/profile.ttl')).status).toBe(404)
  })
})

describe('the app shell', () => {
  it('lists exactly the files that exist, and every module under src', async () => {
    const { version, files } = JSON.parse((await get('/shell.json')).body)
    expect(version).toMatch(/^[0-9a-f]{12}$/)
    expect(files).toEqual(listShell(PROJECT))
    expect(files).toContain('index.html')
    expect(files).toContain('src/app.js')
    expect(files).toContain('src/audio/jig-loader.js')
    expect(files).toContain('styles/main.css')
    expect(files.some(f => f.startsWith('tests/') || f.startsWith('docs/') || f.startsWith('server/'))).toBe(false)
    for (const file of files) expect((await get('/' + file)).status, file).toBe(200)
  })

  it('fills the service worker version from the shell hash', async () => {
    const { version } = JSON.parse((await get('/shell.json')).body)
    const sw = await get('/sw.js')
    expect(sw.status).toBe(200)
    expect(sw.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(sw.headers['cache-control']).toBe('no-cache')
    expect(sw.body).toContain(`const VERSION = '${version}'`)
    expect(sw.body).not.toContain('__VERSION__')
  })

  it('the version changes when a file changes, so a deploy invalidates the cache', async () => {
    const root = mkdtempSync(join(tmpdir(), 'shell-'))
    for (const dir of ['src', 'styles', 'icons']) mkdirSync(join(root, dir))
    writeFileSync(join(root, 'index.html'), '<p>a</p>')
    writeFileSync(join(root, 'sw.js'), "const VERSION = '__VERSION__'")
    writeFileSync(join(root, 'src', 'x.js'), 'one')
    const live = await startServer({ root, port: 0, live: true })
    const frozen = await startServer({ root, port: 0 })
    const versionOf = async s => {
      const port = s.address().port
      return new Promise(resolve => request({ host: '127.0.0.1', port, path: '/shell.json' }, res => {
        let body = ''; res.on('data', c => { body += c }); res.on('end', () => resolve(JSON.parse(body).version))
      }).end())
    }
    const before = await versionOf(live)
    writeFileSync(join(root, 'src', 'x.js'), 'two')
    expect(await versionOf(live)).not.toBe(before)
    expect(await versionOf(frozen)).toBe(before) // production hashes once, at start
    for (const s of [live, frozen]) { s.closeAllConnections?.(); await new Promise(r => s.close(r)) }
  })
})

describe('a mounted plugins folder (development only)', () => {
  it('serves files from it with CORS, and nothing outside it', async () => {
    const pluginsDir = mkdtempSync(join(tmpdir(), 'plugins-'))
    mkdirSync(join(pluginsDir, 'p'))
    writeFileSync(join(pluginsDir, 'p', 'profile.ttl'), '<> a <x> .')
    writeFileSync(join(pluginsDir, '..', 'outside.txt'), 'secret')
    const dev = await startServer({ root: PROJECT, port: 0, pluginsDir })
    const port = dev.address().port
    const fetchRaw = path => new Promise(resolve => request({ host: '127.0.0.1', port, path }, res => {
      let body = ''; res.on('data', c => { body += c }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    }).end())
    const ok = await fetchRaw('/plugins/p/profile.ttl')
    expect(ok.status).toBe(200)
    expect(ok.headers['access-control-allow-origin']).toBe('*')
    expect(ok.headers['content-type']).toBe('text/turtle; charset=utf-8')
    expect((await fetchRaw('/plugins/../outside.txt')).status).toBe(404)
    expect((await fetchRaw('/plugins/%2e%2e/outside.txt')).status).toBe(404)
    expect((await fetchRaw('/plugins/p/missing')).status).toBe(404)
    dev.closeAllConnections?.()
    await new Promise(r => dev.close(r))
  })
})

describe('cleanPath', () => {
  it('maps the root to index.html and decodes escapes', () => {
    expect(cleanPath('/')).toBe('index.html')
    expect(cleanPath('/src/app.js?x=1')).toBe('src/app.js')
    expect(cleanPath('/a%20b')).toBe('a b')
  })

  it('rejects bad escapes, NUL and backslashes', () => {
    expect(cleanPath('/%E0%A4%A')).toBe(null)
    expect(cleanPath('/a%00b')).toBe(null)
    expect(cleanPath('/a%5Cb')).toBe(null)
  })

  it('exposes the base-URL for the test', () => { expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/) })
})

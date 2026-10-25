// The service worker, run against fake caches and fetch.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

const SOURCE = readFileSync(join(import.meta.dirname, '..', 'sw.js'), 'utf8').replaceAll('__VERSION__', 'v1')
const SCOPE = 'https://strandz.it/melogen/'

class FakeRequest {
  constructor (input, init = {}) {
    this.url = typeof input === 'string' ? new URL(input, SCOPE).href : input.url
    this.method = init.method ?? 'GET'
    this.mode = init.mode ?? 'cors'
    this.cache = init.cache
  }
}

const response = (body, { ok = true, type = 'basic' } = {}) => ({ ok, type, body, clone () { return { ...this } }, json: async () => JSON.parse(body) })

function makeWorker ({ files = ['index.html', 'src/app.js'], network = {} } = {}) {
  const stores = new Map()
  const open = name => {
    if (!stores.has(name)) stores.set(name, new Map())
    const map = stores.get(name)
    return {
      addAll: async requests => { for (const r of requests) { const res = await fetchImpl(r); if (!res.ok) throw new Error('bad ' + r.url); map.set(r.url, res) } },
      match: async (request) => map.get(typeof request === 'string' ? new URL(request, SCOPE).href : request.url),
      put: async (request, res) => { map.set(request.url, res) },
      map
    }
  }
  const caches = {
    open: async name => open(name),
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name)
  }
  const fetchCalls = []
  const fetchImpl = vi.fn(async (input, init) => {
    const url = typeof input === 'string' ? new URL(input, SCOPE).href : input.url
    fetchCalls.push(url)
    if (url === SCOPE + 'shell.json') return response(JSON.stringify({ version: 'v1', files }))
    const hit = network[url]
    if (hit === 'fail') throw new TypeError('network down')
    if (hit) return typeof hit === 'function' ? hit() : hit
    return response('net:' + url)
  })
  const listeners = {}
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn },
    location: { origin: 'https://strandz.it' },
    registration: { scope: SCOPE },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) }
  }
  vm.runInNewContext(SOURCE, { self, caches, fetch: fetchImpl, Request: FakeRequest, URL, Promise, console })

  const dispatch = async (type, event) => {
    let pending
    listeners[type]({ ...event, waitUntil: p => { pending = p }, respondWith: p => { pending = p } })
    return pending
  }
  return { stores, fetchImpl, fetchCalls, self, listeners, dispatch, caches }
}

const fetchEvent = (url, extra = {}) => ({ request: new FakeRequest(url, extra) })
const respondedWith = async (worker, url, extra) => {
  let answered = false
  let result
  worker.listeners.fetch({ ...fetchEvent(url, extra), respondWith: p => { answered = true; result = p } })
  return answered ? result : undefined
}

describe('service worker', () => {
  it('installs by caching every file in shell.json and takes over at once', async () => {
    const w = makeWorker({ files: ['index.html', 'src/app.js', 'styles/main.css'] })
    await w.dispatch('install', {})
    const cache = w.stores.get('melogen-shell-v1')
    expect([...cache.keys()]).toEqual([SCOPE + 'index.html', SCOPE + 'src/app.js', SCOPE + 'styles/main.css'])
    expect(w.self.skipWaiting).toHaveBeenCalled()
  })

  it('fails to install if a shell file is missing, rather than caching half an app', async () => {
    const w = makeWorker({ network: { [SCOPE + 'src/app.js']: response('', { ok: false }) } })
    await expect(w.dispatch('install', {})).rejects.toThrow()
  })

  it('activation removes old shell caches but keeps the current one and the runtime cache', async () => {
    const w = makeWorker()
    for (const name of ['melogen-shell-old', 'melogen-shell-v1', 'melogen-runtime', 'other-app']) await w.caches.open(name)
    await w.dispatch('activate', {})
    expect(await w.caches.keys()).toEqual(['melogen-shell-v1', 'melogen-runtime', 'other-app'])
    expect(w.self.clients.claim).toHaveBeenCalled()
  })

  it('answers a navigation inside the scope from the cached index.html, offline', async () => {
    const w = makeWorker({ network: { [SCOPE]: 'fail' } })
    await w.dispatch('install', {})
    const result = await respondedWith(w, SCOPE, { mode: 'navigate' })
    expect((await result).body).toBe('net:' + SCOPE + 'index.html')
  })

  it('serves shell files from the cache without touching the network', async () => {
    const w = makeWorker()
    await w.dispatch('install', {})
    const before = w.fetchCalls.length
    const result = await respondedWith(w, SCOPE + 'src/app.js')
    expect((await result).body).toBe('net:' + SCOPE + 'src/app.js')
    expect(w.fetchCalls.length).toBe(before)
  })

  it('plugin files go to the network first, and are kept for when it is down', async () => {
    const url = 'https://strandz.it/jigdaw/plugins/monochord/monochord.wasm'
    const w = makeWorker({ network: { [url]: response('wasm-bytes', { type: 'cors' }) } })
    await w.dispatch('install', {})
    expect((await (await respondedWith(w, url))).body).toBe('wasm-bytes')
    expect(w.stores.get('melogen-runtime').has(url)).toBe(true)

    w.fetchImpl.mockImplementation(async () => { throw new TypeError('offline') })
    expect((await (await respondedWith(w, url))).body).toBe('wasm-bytes')
  })

  it('a fresh network copy wins over a stored one', async () => {
    const url = 'https://strandz.it/jigdaw/plugins/index.json'
    let version = 'old'
    const w = makeWorker({ network: { [url]: () => response(version, { type: 'cors' }) } })
    await w.dispatch('install', {})
    await (await respondedWith(w, url))
    version = 'new'
    expect((await (await respondedWith(w, url))).body).toBe('new')
  })

  it('does not store failures, and fails when offline with nothing stored', async () => {
    const url = 'https://strandz.it/jigdaw/plugins/gone/profile.ttl'
    const w = makeWorker({ network: { [url]: response('nope', { ok: false, type: 'cors' }) } })
    await w.dispatch('install', {})
    await (await respondedWith(w, url))
    expect(w.stores.get('melogen-runtime')?.has(url) ?? false).toBe(false)

    const down = 'https://other.test/x.js'
    const w2 = makeWorker({ network: { [down]: 'fail' } })
    await w2.dispatch('install', {})
    await expect(respondedWith(w2, down)).rejects.toThrow('network down')
  })

  it('leaves non-GET requests and non-http schemes alone', async () => {
    const w = makeWorker()
    await w.dispatch('install', {})
    expect(await respondedWith(w, SCOPE + 'x', { method: 'POST' })).toBeUndefined()
    expect(await respondedWith(w, 'chrome-extension://abc/x.js')).toBeUndefined()
  })

  it('the version in the source is what names the cache', () => {
    expect(readFileSync(join(import.meta.dirname, '..', 'sw.js'), 'utf8')).toContain("const VERSION = '__VERSION__'")
  })
})

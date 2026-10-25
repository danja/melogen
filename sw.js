// Melogen service worker: the app shell works offline, and plugin files are
// kept for when the network is not.
//
// The server fills in __VERSION__ with a hash of the shell, so this file's
// bytes (and so the worker) change whenever any shell file does, and the
// browser installs the new version without a manual cache bump.

const VERSION = '__VERSION__'
const SHELL_CACHE = `melogen-shell-${VERSION}`
const RUNTIME_CACHE = 'melogen-runtime'

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch('shell.json', { cache: 'no-store' })
    if (!response.ok) throw new Error(`shell.json answered ${response.status}`)
    const { files } = await response.json()
    const cache = await caches.open(SHELL_CACHE)
    // 'reload' skips the HTTP cache so the stored copies match this version.
    await cache.addAll(files.map(file => new Request(file, { cache: 'reload' })))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('melogen-shell-') && name !== SHELL_CACHE) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return

  const sameOrigin = url.origin === self.location.origin
  const inScope = sameOrigin && url.pathname.startsWith(new URL(self.registration.scope).pathname)

  if (request.mode === 'navigate' && inScope) {
    event.respondWith(caches.open(SHELL_CACHE).then(cache => cache.match('index.html')).then(hit => hit ?? fetch(request)))
    return
  }
  if (inScope) {
    event.respondWith(shellFirst(request))
    return
  }
  // Anything else (plugin files, the catalogue): network first, so a fresh
  // copy always wins and a poisoned stored one can only matter offline.
  // The page checks every plugin file against its digest before running it.
  event.respondWith(networkFirst(request))
})

async function shellFirst (request) {
  const cache = await caches.open(SHELL_CACHE)
  const hit = await cache.match(request, { ignoreSearch: true })
  return hit ?? networkFirst(request)
}

async function networkFirst (request) {
  const cache = await caches.open(RUNTIME_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok && (response.type === 'basic' || response.type === 'cors')) cache.put(request, response.clone())
    return response
  } catch (error) {
    const hit = await cache.match(request)
    if (hit) return hit
    throw error
  }
}

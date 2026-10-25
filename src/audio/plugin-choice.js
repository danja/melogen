// Which instrument plugin to use, remembered across visits.
//
// First load: nothing is stored, so the default is written to localStorage.
// After that the stored IRI wins. `?plugin=<iri>` overrides it for one
// session without being saved. Every storage access is guarded: it throws in
// some private windows, and the app must work without it.

export const PLUGIN_KEY = 'melogen.plugin'
export const VALUES_PREFIX = 'melogen.instrument.'

function guard (fn, fallback) {
  try { return fn() } catch { return fallback }
}

/** An http(s) URL, or null. */
export function normalizeIri (value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * @returns { iri, source: 'url' | 'stored' | 'default' }
 */
export function choosePlugin ({ storage, search = '', defaultIri }) {
  const fromUrl = normalizeIri(new URLSearchParams(search).get('plugin'))
  if (fromUrl) return { iri: fromUrl, source: 'url' }

  const stored = normalizeIri(guard(() => storage.getItem(PLUGIN_KEY), null))
  if (stored) return { iri: stored, source: 'stored' }

  // First load, or a stored value that is not a URL: seed the default.
  guard(() => storage.setItem(PLUGIN_KEY, defaultIri))
  return { iri: defaultIri, source: 'default' }
}

export function savePlugin (storage, iri) {
  return guard(() => { storage.setItem(PLUGIN_KEY, iri); return true }, false)
}

/** Instrument control values are kept per plugin so switching back restores them. */
export function loadValues (storage, iri) {
  return guard(() => {
    const parsed = JSON.parse(storage.getItem(VALUES_PREFIX + iri) ?? 'null')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  }, {})
}

export function saveValues (storage, iri, values) {
  return guard(() => { storage.setItem(VALUES_PREFIX + iri, JSON.stringify(values)); return true }, false)
}

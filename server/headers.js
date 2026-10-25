// Response headers: security policy and caching.

// 'wasm-unsafe-eval' is needed because plugins compile WebAssembly inside an
// AudioWorklet, which inherits this policy. blob: is how the verified
// processor bytes are handed to addModule. connect-src allows https: for any
// plugin address and localhost for developing one.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "img-src 'self' data:",
  "style-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

export function securityHeaders () {
  return {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY'
  }
}

// These are re-read on every visit so a deploy is picked up at once; the
// versioned shell cache in the service worker handles offline use.
const REVALIDATE = new Set(['index.html', 'sw.js', 'manifest.webmanifest', 'shell.json'])

export function cachePolicy (relativePath) {
  return REVALIDATE.has(relativePath) ? 'no-cache' : 'public, max-age=3600'
}

export const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.ttl': 'text/turtle; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
})

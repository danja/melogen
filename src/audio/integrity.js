// Subresource-integrity digests: "sha384-<base64>", as jig:integrity carries.
// Nothing fetched for a plugin is run until it matches.

const ALGORITHMS = Object.freeze({ sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' })

export class IntegrityError extends Error {
  constructor (message) {
    super(message)
    this.name = 'IntegrityError'
  }
}

function toBase64 (bytes) {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

/** SRI string for bytes. */
export async function digest (bytes, algorithm = 'sha384') {
  const name = ALGORITHMS[algorithm]
  if (!name) throw new IntegrityError(`unsupported digest algorithm "${algorithm}"`)
  const hash = await globalThis.crypto.subtle.digest(name, bytes)
  return `${algorithm}-${toBase64(new Uint8Array(hash))}`
}

/** True if `value` looks like an SRI digest this module can check. */
export function isIntegrity (value) {
  return typeof value === 'string' && value.trim().split(/\s+/).every(item => {
    const match = /^(sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}$/.exec(item)
    return match !== null
  })
}

/**
 * Throws IntegrityError unless the bytes match one of the digests in
 * `expected` (space separated, as SRI allows). `label` names the file.
 */
export async function verifyIntegrity (bytes, expected, label) {
  if (!isIntegrity(expected)) throw new IntegrityError(`${label}: the profile gives no usable digest (${JSON.stringify(expected)})`)
  const candidates = expected.trim().split(/\s+/)
  for (const candidate of candidates) {
    const algorithm = candidate.slice(0, candidate.indexOf('-'))
    if (await digest(bytes, algorithm) === candidate) return
  }
  throw new IntegrityError(`${label}: the file does not match its digest, so it was not run`)
}

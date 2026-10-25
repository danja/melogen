import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { digest, verifyIntegrity, isIntegrity, IntegrityError } from '../../src/audio/integrity.js'

const bytes = new TextEncoder().encode('hello jig')

describe('integrity', () => {
  it('matches node crypto for each algorithm', async () => {
    for (const algorithm of ['sha256', 'sha384', 'sha512']) {
      expect(await digest(bytes, algorithm)).toBe(`${algorithm}-${createHash(algorithm).update(bytes).digest('base64')}`)
    }
  })

  it('accepts a matching digest', async () => {
    await expect(verifyIntegrity(bytes, await digest(bytes), 'x')).resolves.toBeUndefined()
  })

  it('accepts any of several space separated digests', async () => {
    const good = await digest(bytes)
    await expect(verifyIntegrity(bytes, `sha384-AAAA ${good}`, 'x')).resolves.toBeUndefined()
  })

  it('rejects a mismatch, naming the file', async () => {
    const wrong = await digest(new Uint8Array([1, 2, 3]))
    await expect(verifyIntegrity(bytes, wrong, 'the module at m.wasm')).rejects.toThrow(/the module at m\.wasm.*does not match/)
    await expect(verifyIntegrity(bytes, wrong, 'x')).rejects.toBeInstanceOf(IntegrityError)
  })

  it('rejects a missing or malformed digest rather than skipping the check', async () => {
    for (const bad of [undefined, '', 'sha384-', 'md5-abcd', 'not a digest', 42]) {
      await expect(verifyIntegrity(bytes, bad, 'x')).rejects.toBeInstanceOf(IntegrityError)
    }
  })

  it('recognises SRI strings', () => {
    expect(isIntegrity('sha384-tmGPQMMRS1k+wweUG/bic10hX+PTqy2pRbZpbIOmqvp/CFUpUmGPr6gakTVDl+V6')).toBe(true)
    expect(isIntegrity('sha1-abc')).toBe(false)
  })
})

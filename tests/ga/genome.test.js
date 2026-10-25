import { describe, it, expect } from 'vitest'
import {
  createGenome, cloneGenome, sameMusic, resizeGenome, genomeToJSON, genomeFromJSON, NOTE, HOLD, REST
} from '../../src/ga/genome.js'

function sample (length = 32) {
  const g = createGenome(length, { id: 'g0-1', origin: 'random' })
  for (let i = 0; i < length; i++) {
    g.kind[i] = [NOTE, HOLD, REST][i % 3]
    g.degree[i] = i % 14
    g.velocity[i] = i % 4
  }
  return g
}

describe('genome', () => {
  it('clones deeply', () => {
    const a = sample()
    const b = cloneGenome(a)
    b.degree[0] = 99
    expect(a.degree[0]).not.toBe(99)
    expect(sameMusic(a, cloneGenome(a))).toBe(true)
  })

  it('sameMusic ignores the pitch of non-notes', () => {
    const a = sample()
    const b = cloneGenome(a)
    b.degree[1] = 7 // step 1 is a HOLD
    expect(sameMusic(a, b)).toBe(true)
    b.degree[0] = 7 // step 0 is a NOTE
    expect(sameMusic(a, b)).toBe(false)
  })

  it('round-trips through JSON', () => {
    const a = sample()
    const b = genomeFromJSON(JSON.parse(JSON.stringify(genomeToJSON(a))))
    expect(b).toEqual(a)
  })

  it('rejects mismatched arrays', () => {
    const j = genomeToJSON(sample())
    j.degree.pop()
    expect(() => genomeFromJSON(j)).toThrow()
  })

  it('truncates when shrinking', () => {
    const a = sample(64)
    const b = resizeGenome(a, 2, 16)
    expect(b.kind).toHaveLength(32)
    expect(Array.from(b.kind)).toEqual(Array.from(a.kind.slice(0, 32)))
  })

  it('cycles bars when growing', () => {
    const a = sample(32)
    const b = resizeGenome(a, 5, 16)
    expect(b.kind).toHaveLength(80)
    expect(Array.from(b.degree.slice(32, 48))).toEqual(Array.from(a.degree.slice(0, 16)))
    expect(Array.from(b.degree.slice(48, 64))).toEqual(Array.from(a.degree.slice(16, 32)))
  })
})

import { describe, it, expect } from 'vitest'
import { distance, pitchTrack } from '../../src/ga/distance.js'
import { generateGenome } from '../../src/ga/generate.js'
import { cloneGenome, createGenome, NOTE, HOLD, REST } from '../../src/ga/genome.js'
import { transposeRange } from '../../src/ga/mutate.js'
import { ctxFor, genomeOf } from './helpers.js'

const ctx = ctxFor(3)
const make = n => Array.from({ length: n }, (_, i) => generateGenome(ctx, { id: `d${i}` }))

describe('pitchTrack', () => {
  it('follows holds and breaks on rests', () => {
    const g = genomeOf([[NOTE, 3], [HOLD], [REST], [HOLD], [NOTE, 5]])
    expect(Array.from(pitchTrack(g))).toEqual([3, 3, -1, -1, 5])
  })
})

describe('distance', () => {
  const genomes = make(12)

  it('is zero from a genome to itself and to its copy', () => {
    for (const g of genomes) {
      expect(distance(g, g, ctx)).toBe(0)
      expect(distance(g, cloneGenome(g), ctx)).toBe(0)
    }
  })

  it('is symmetric and within [0, 1]', () => {
    for (const a of genomes) for (const b of genomes) {
      const d = distance(a, b, ctx)
      expect(d).toBeCloseTo(distance(b, a, ctx), 12)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(1)
    }
  })

  it('two silent genomes are identical, a silent and a sounding one are far', () => {
    const silent = createGenome(128)
    expect(distance(silent, createGenome(128), ctx)).toBe(0)
    expect(distance(silent, genomes[0], ctx)).toBeGreaterThan(0.3)
  })

  it('a transposed copy is closer than an unrelated genome', () => {
    let closer = 0
    for (let i = 0; i < genomes.length - 1; i++) {
      const original = genomes[i]
      const shifted = cloneGenome(original)
      transposeRange(shifted, 0, 128, 2, ctx.D)
      if (distance(original, shifted, ctx) < distance(original, genomes[i + 1], ctx)) closer++
    }
    expect(closer).toBeGreaterThanOrEqual(genomes.length - 2)
  })

  it('a one-note change is a small distance', () => {
    const g = genomes[0]
    const near = cloneGenome(g)
    const at = Array.from(g.kind).indexOf(NOTE)
    near.degree[at] = (near.degree[at] + 1) % ctx.D
    expect(distance(g, near, ctx)).toBeLessThan(0.05)
  })

  it('contour tells apart rising and falling lines with the same rhythm', () => {
    const rise = genomeOf(Array.from({ length: 32 }, (_, i) => [NOTE, i % 14]))
    const fall = genomeOf(Array.from({ length: 32 }, (_, i) => [NOTE, 13 - (i % 14)]))
    const same = genomeOf(Array.from({ length: 32 }, (_, i) => [NOTE, i % 14]))
    expect(distance(rise, same, ctx)).toBe(0)
    expect(distance(rise, fall, ctx)).toBeGreaterThan(0.25)
  })
})

import { describe, it, expect } from 'vitest'
import { generateGenome } from '../../src/ga/generate.js'
import { ctxFor, assertValid, onsetDensity } from './helpers.js'
import { NOTE, HOLD, REST } from '../../src/ga/genome.js'

function sample (n, overrides) {
  const ctx = ctxFor(7, overrides)
  return { ctx, genomes: Array.from({ length: n }, (_, i) => generateGenome(ctx, { id: `s${i}` })) }
}

describe('generateGenome', () => {
  it('produces valid genomes of the right length', () => {
    const { ctx, genomes } = sample(200)
    for (const g of genomes) assertValid(g, ctx)
    expect(genomes[0].kind).toHaveLength(128)
  })

  it('never starts with, or rests before, a hold', () => {
    const { genomes } = sample(200)
    for (const g of genomes) {
      expect(g.kind[0]).not.toBe(HOLD)
      for (let i = 1; i < g.kind.length; i++) {
        if (g.kind[i] === HOLD) expect(g.kind[i - 1]).not.toBe(REST)
      }
    }
  })

  it('melody density is in the expected band', () => {
    const { genomes } = sample(200)
    const mean = genomes.reduce((s, g) => s + onsetDensity(g), 0) / genomes.length
    expect(mean).toBeGreaterThan(0.35)
    expect(mean).toBeLessThan(0.55)
  })

  it('bass is sparser than melody', () => {
    const melody = sample(200)
    const bass = sample(200, { mode: 'bass' })
    const mean = set => set.genomes.reduce((s, g) => s + onsetDensity(g), 0) / set.genomes.length
    expect(mean(bass)).toBeLessThan(mean(melody) - 0.1)
    expect(mean(bass)).toBeGreaterThan(0.2)
    for (const g of bass.genomes) assertValid(g, bass.ctx)
  })

  it('repeats material, as the forms require', () => {
    const { ctx, genomes } = sample(100)
    const key = (g, bar) => {
      const a = bar * ctx.perBar
      const b = a + ctx.perBar
      return [Array.from(g.kind.slice(a, b)), Array.from(g.degree.slice(a, b)).map((d, i) => g.kind[a + i] === NOTE ? d : -1)].join('|')
    }
    let withRepeat = 0
    for (const g of genomes) {
      const keys = Array.from({ length: ctx.bars - 1 }, (_, bar) => key(g, bar))
      if (new Set(keys).size < keys.length) withRepeat++
    }
    expect(withRepeat / genomes.length).toBeGreaterThan(0.8)
  })

  it('varies between calls', () => {
    const { genomes } = sample(10)
    const seen = new Set(genomes.map(g => Array.from(g.degree).join(',')))
    expect(seen.size).toBeGreaterThan(8)
  })

  it('works across time signatures, bar counts and scales', () => {
    for (const overrides of [{ timeSignature: '3/4' }, { timeSignature: '7/8', bars: 4 }, { bars: 1 }, { bars: 3, scale: 'minorPentatonic' }, { scale: 'chromatic', mode: 'bass' }]) {
      const { ctx, genomes } = sample(30, overrides)
      for (const g of genomes) assertValid(g, ctx)
    }
  })

  it('is reproducible for a seed', () => {
    const a = generateGenome(ctxFor(5), { id: 'a' })
    const b = generateGenome(ctxFor(5), { id: 'a' })
    expect(Array.from(a.degree)).toEqual(Array.from(b.degree))
    expect(Array.from(a.kind)).toEqual(Array.from(b.kind))
  })

  it('ends on a chord tone when it cadences', () => {
    const { ctx, genomes } = sample(200)
    let cadences = 0
    for (const g of genomes) {
      if (g.kind[g.kind.length - 1] !== HOLD) continue
      let i = g.kind.length - 1
      while (g.kind[i] === HOLD) i--
      if (g.kind[i] === NOTE && [0, 2, 4].includes(g.degree[i]) && g.velocity[i] === 2) cadences++
    }
    expect(cadences / genomes.length).toBeGreaterThan(0.5)
    expect(ctx.D).toBe(14)
  })
})

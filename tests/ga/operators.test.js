import { describe, it, expect } from 'vitest'
import { generateGenome } from '../../src/ga/generate.js'
import { crossover, barOnePoint, barTwoPoint, barUniform, beatOnePoint } from '../../src/ga/crossover.js'
import { mutate, transposeRange, nudgeNote, nearestNote } from '../../src/ga/mutate.js'
import { sameMusic, cloneGenome, NOTE, REST } from '../../src/ga/genome.js'
import { eligible, tournament, pickParents } from '../../src/ga/select.js'
import { distance } from '../../src/ga/distance.js'
import { ctxFor, assertValid, genomeOf } from './helpers.js'

const ctx = ctxFor(21)
const A = generateGenome(ctx, { id: 'A' })
const B = generateGenome(ctx, { id: 'B' })

function barsOf (g, bar) {
  const s = bar * ctx.perBar
  return [g.kind, g.degree, g.velocity].map(arr => Array.from(arr.slice(s, s + ctx.perBar)).join(','))
}
const sameBar = (x, y, bar) => barsOf(x, bar).join('|') === barsOf(y, bar).join('|')

describe('crossover', () => {
  it('bar operators take every bar whole from one parent', () => {
    for (const op of [barOnePoint, barTwoPoint, barUniform]) {
      for (let trial = 0; trial < 30; trial++) {
        const child = op(A, B, ctx)
        assertValid(child, ctx)
        for (let bar = 0; bar < ctx.bars; bar++) {
          expect(sameBar(child, A, bar) || sameBar(child, B, bar)).toBe(true)
        }
      }
    }
  })

  it('one-point takes a prefix from A and the rest from B', () => {
    const child = barOnePoint(A, B, ctx)
    let switched = false
    for (let bar = 0; bar < ctx.bars; bar++) {
      const fromA = sameBar(child, A, bar) && !sameBar(A, B, bar)
      const fromB = sameBar(child, B, bar) && !sameBar(A, B, bar)
      if (fromB) switched = true
      if (switched) expect(fromA).toBe(false)
    }
  })

  it('beat one-point is A before a beat-aligned cut and B after it', () => {
    const at = (g, i) => `${g.kind[i]}/${g.degree[i]}/${g.velocity[i]}`
    for (let trial = 0; trial < 30; trial++) {
      const child = beatOnePoint(A, B, ctx)
      let found = false
      for (let cut = ctx.beatSteps; cut < child.kind.length && !found; cut += ctx.beatSteps) {
        found = true
        for (let i = 0; i < child.kind.length && found; i++) {
          if (at(child, i) !== at(i < cut ? A : B, i)) found = false
        }
      }
      expect(found).toBe(true)
    }
  })

  it('records parents and origin, and keeps the length', () => {
    const child = crossover(A, B, ctx)
    expect(child.parents).toEqual(['A', 'B'])
    expect(child.origin).toBe('crossover')
    assertValid(child, ctx)
  })

  it('degrades to a copy for a single bar', () => {
    const one = ctxFor(2, { bars: 1 })
    const a = generateGenome(one, { id: 'a' })
    const b = generateGenome(one, { id: 'b' })
    expect(sameMusic(barOnePoint(a, b, one), a)).toBe(true)
    assertValid(barTwoPoint(a, b, one), one)
  })
})

describe('mutate', () => {
  it('rate 0 is the identity and does not alias', () => {
    const copy = mutate(A, 0, ctx)
    expect(sameMusic(copy, A)).toBe(true)
    copy.degree[0] = 13
    expect(A.degree[0]).not.toBe(13)
  })

  it('keeps every genome valid across rates', () => {
    const c = ctxFor(5)
    for (const rate of [0.05, 0.1, 0.5, 1]) {
      for (let i = 0; i < 40; i++) assertValid(mutate(generateGenome(c, { id: 'm' }), rate, c), c)
    }
  })

  it('never mutates its input', () => {
    const before = cloneGenome(A)
    mutate(A, 1, ctx)
    expect(sameMusic(before, A)).toBe(true)
    expect(Array.from(before.degree)).toEqual(Array.from(A.degree))
  })

  it('changes about as many steps as the rate predicts', () => {
    const c = ctxFor(99)
    const trials = 300
    let changed = 0
    for (let i = 0; i < trials; i++) {
      const g = generateGenome(c, { id: 'p' })
      const m = mutate(g, 0.1, c)
      for (let s = 0; s < g.kind.length; s++) {
        if (g.kind[s] !== m.kind[s] || g.degree[s] !== m.degree[s] || g.velocity[s] !== m.velocity[s]) changed++
      }
    }
    // 128 steps x 0.025 point rate = 3.2 point edits, plus bar edits (0.4 bars x many steps)
    const perChild = changed / trials
    expect(perChild).toBeGreaterThan(2)
    expect(perChild).toBeLessThan(25)
  })

  it('a higher rate moves further from the parent', () => {
    const c = ctxFor(8)
    let low = 0
    let high = 0
    for (let i = 0; i < 60; i++) {
      const g = generateGenome(c, { id: 'p' })
      low += distance(g, mutate(g, 0.05, c), c)
      high += distance(g, mutate(g, 0.6, c), c)
    }
    expect(high).toBeGreaterThan(low * 2)
  })

  it('transposeRange keeps the shape and never leaves the range', () => {
    const g = genomeOf([[NOTE, 0], [NOTE, 3], [REST, 9], [NOTE, 13]])
    expect(transposeRange(g, 0, 4, 5, 14)).toBe(false) // top note is already at the ceiling
    const h = genomeOf([[NOTE, 2], [NOTE, 5], [NOTE, 4]])
    expect(transposeRange(h, 0, 3, 20, 14)).toBe(true)
    expect(Array.from(h.degree)).toEqual([10, 13, 12])
    expect(transposeRange(h, 0, 3, -20, 14)).toBe(true)
    expect(Array.from(h.degree)).toEqual([0, 3, 2])
  })

  it('nudgeNote finds the owning note and clamps', () => {
    const g = genomeOf([[NOTE, 13], [2], [REST]])
    expect(nearestNote(g, 1)).toBe(0)
    expect(nudgeNote(g, 1, 5, 14)).toBe(true)
    expect(g.degree[0]).toBe(13)
    expect(nudgeNote(genomeOf([[REST], [REST]]), 0, 1, 14)).toBe(false)
  })
})

describe('select', () => {
  const entries = [{ rating: 1 }, { rating: -1 }, { rating: null }, { rating: 0 }]
  const fitness = i => [1, -1, 0.2, 0][i]

  it('excludes genomes rated -1', () => {
    expect(eligible(entries)).toEqual([0, 2, 3])
  })

  it('tournament favours higher fitness', () => {
    const c = ctxFor(4)
    const counts = [0, 0, 0, 0]
    for (let i = 0; i < 3000; i++) counts[tournament([0, 1, 2, 3], fitness, c.rng, 3)]++
    expect(counts[0]).toBeGreaterThan(counts[2])
    expect(counts[2]).toBeGreaterThan(counts[3])
    expect(counts[3]).toBeGreaterThan(counts[1])
  })

  it('never picks a pool member that was left out', () => {
    const c = ctxFor(6)
    for (let i = 0; i < 500; i++) {
      for (const p of pickParents(eligible(entries), fitness, c.rng, 3)) expect(p).not.toBe(1)
    }
  })

  it('picks distinct parents when it can', () => {
    const c = ctxFor(7)
    let same = 0
    for (let i = 0; i < 300; i++) {
      const [a, b] = pickParents([0, 1, 2, 3, 4, 5, 6, 7], i => (i * 7) % 5, c.rng, 3)
      if (a === b) same++
    }
    expect(same).toBeLessThan(10)
    expect(pickParents([2], fitness, c.rng, 3)).toEqual([2, 2])
  })
})

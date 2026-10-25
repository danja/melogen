import { describe, it, expect } from 'vitest'
import { estimateFitness } from '../../src/ga/estimate.js'
import { addToArchive, buildEvidence } from '../../src/ga/archive.js'
import { generateGenome } from '../../src/ga/generate.js'
import { cloneGenome } from '../../src/ga/genome.js'
import { nudgeNote } from '../../src/ga/mutate.js'
import { ctxFor } from './helpers.js'

const ctx = ctxFor(11)
const g = (id) => generateGenome(ctx, { id })

describe('estimateFitness', () => {
  it('with no evidence is the prior with maximal uncertainty', () => {
    expect(estimateFitness(g('a'), [], 0.4, ctx)).toEqual({ f: 0.4, u: 1 })
  })

  it('next to a +1 rating is high with low uncertainty', () => {
    const liked = g('liked')
    const near = cloneGenome(liked, { id: 'near' })
    nudgeNote(near, 0, 1, ctx.D)
    const { f, u } = estimateFitness(near, [{ genome: liked, rating: 1, age: 0 }], 0, ctx)
    expect(f).toBeGreaterThan(0.6)
    // one identical rating gives u = lambda / (1 + lambda) = 1/3 at best
    expect(u).toBeLessThan(0.4)
  })

  it('next to a -1 rating is low', () => {
    const disliked = g('disliked')
    const near = cloneGenome(disliked, { id: 'near' })
    const { f } = estimateFitness(near, [{ genome: disliked, rating: -1, age: 0 }], 0, ctx)
    expect(f).toBeLessThan(-0.6)
  })

  it('far from every rating falls back to the prior', () => {
    const others = Array.from({ length: 5 }, (_, i) => ({ genome: g(`o${i}`), rating: 1, age: 0 }))
    const far = g('far')
    const { f, u } = estimateFitness(far, others, 0, ctx)
    expect(Math.abs(f)).toBeLessThan(0.1)
    expect(u).toBeGreaterThan(0.8)
  })

  it('old ratings count for less', () => {
    const liked = g('liked')
    const near = cloneGenome(liked, { id: 'near' })
    const fresh = estimateFitness(near, [{ genome: liked, rating: 1, age: 0 }], 0, ctx)
    const old = estimateFitness(near, [{ genome: liked, rating: 1, age: 4 }], 0, ctx)
    expect(old.f).toBeLessThan(fresh.f)
    expect(old.u).toBeGreaterThan(fresh.u)
  })

  it('ignores the genome itself in the evidence', () => {
    const a = g('a')
    expect(estimateFitness(a, [{ genome: a, rating: 1, age: 0 }], 0, ctx)).toEqual({ f: 0, u: 1 })
  })
})

describe('archive', () => {
  it('replaces by id and caps from the oldest', () => {
    let archive = []
    for (let i = 0; i < 5; i++) archive = addToArchive(archive, g(`a${i}`), 1, i, 3)
    expect(archive.map(e => e.genome.id)).toEqual(['a2', 'a3', 'a4'])
    archive = addToArchive(archive, g('a3'), -1, 9, 3)
    expect(archive.map(e => e.genome.id)).toEqual(['a2', 'a4', 'a3'])
    expect(archive[2].rating).toBe(-1)
  })

  it('evidence ages archive entries and prefers current ratings', () => {
    const a = g('a')
    const b = g('b')
    const archive = addToArchive(addToArchive([], a, -1, 1, 10), b, 1, 2, 10)
    const current = [{ genome: a, rating: 1 }, { genome: g('c'), rating: null }]
    const evidence = buildEvidence(current, archive, 4)
    expect(evidence.map(e => [e.genome.id, e.rating, e.age])).toEqual([['a', 1, 0], ['b', 1, 2]])
  })
})

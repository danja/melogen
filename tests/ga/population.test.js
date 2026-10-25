import { describe, it, expect } from 'vitest'
import { Population } from '../../src/ga/population.js'
import { distance } from '../../src/ga/distance.js'
import { chooseToShow } from '../../src/ga/choose.js'
import { generateGenome } from '../../src/ga/generate.js'
import { sameMusic } from '../../src/ga/genome.js'
import { ctxFor, assertValid } from './helpers.js'

describe('chooseToShow', () => {
  const ctx = ctxFor(31)
  const mk = (i, f, u) => ({ index: i, genome: generateGenome(ctx, { id: `c${i}` }), f, u })

  it('returns K distinct indices', () => {
    const picks = chooseToShow(Array.from({ length: 12 }, (_, i) => mk(i, 0, 1)), 5, ctx)
    expect(picks).toHaveLength(5)
    expect(new Set(picks).size).toBe(5)
  })

  it('prefers a higher estimate first', () => {
    const candidates = [mk(0, 0, 0), mk(1, 0.9, 0), mk(2, -0.5, 0)]
    expect(chooseToShow(candidates, 3, ctx)[0]).toBe(1)
  })

  it('values uncertainty', () => {
    const candidates = [mk(0, 0, 0), mk(1, 0, 1)]
    expect(chooseToShow(candidates, 1, ctx)).toEqual([1])
  })

  it('spreads the picks: near-copies are not chosen together', () => {
    const base = generateGenome(ctx, { id: 'base' })
    const twin = { index: 1, genome: { ...base, id: 'twin' }, f: 0.5, u: 0 }
    const first = { index: 0, genome: base, f: 0.5, u: 0 }
    const stranger = mk(2, 0.3, 0)
    const picks = chooseToShow([first, twin, stranger], 2, ctx)
    expect(picks).toHaveLength(2)
    expect(picks).toContain(2)
  })

  it('returns fewer when fewer are offered', () => {
    expect(chooseToShow([mk(0, 0, 0)], 5, ctx)).toEqual([0])
    expect(chooseToShow([], 5, ctx)).toEqual([])
  })
})

describe('Population', () => {
  it('starts with N valid genomes and five shown rows', () => {
    const ctx = ctxFor(1)
    const pop = Population.create(ctx)
    expect(pop.entries).toHaveLength(20)
    for (const e of pop.entries) assertValid(e.genome, ctx)
    expect(pop.rows).toHaveLength(5)
    expect(new Set(pop.rows).size).toBe(5)
    expect(pop.generation).toBe(0)
    expect(pop.canEvolve).toBe(false)
    expect(pop.canShowMore).toBe(true)
  })

  it('More shows five different melodies until all are used', () => {
    const ctx = ctxFor(2)
    const pop = Population.create(ctx)
    const seen = new Set(pop.rows)
    for (let round = 0; round < 3; round++) {
      const rows = pop.showNext(ctx)
      expect(rows).toHaveLength(5)
      for (const r of rows) { expect(seen.has(r)).toBe(false); seen.add(r) }
    }
    expect(seen.size).toBe(20)
    expect(pop.canShowMore).toBe(false)
    expect(pop.showNext(ctx)).toEqual([])
  })

  it('voting enables Evolve; clearing disables it again', () => {
    const ctx = ctxFor(3)
    const pop = Population.create(ctx)
    pop.rate(pop.rows[0], 1)
    expect(pop.canEvolve).toBe(true)
    expect(pop.ratedCount).toBe(1)
    pop.rate(pop.rows[0], null)
    expect(pop.canEvolve).toBe(false)
  })

  it('Evolve keeps N, carries liked elites unchanged, and has no duplicates', () => {
    const ctx = ctxFor(4)
    const pop = Population.create(ctx)
    const liked = pop.rows.slice(0, 3)
    liked.forEach(i => pop.rate(i, 1))
    pop.rate(pop.rows[3], -1)
    const likedGenomes = liked.map(i => pop.entries[i].genome)

    const rows = pop.evolve(ctx)
    expect(pop.generation).toBe(1)
    expect(pop.entries).toHaveLength(20)
    expect(rows).toHaveLength(5)
    for (const e of pop.entries) assertValid(e.genome, ctx)

    const elites = pop.entries.filter(e => e.genome.origin === 'elite')
    expect(elites).toHaveLength(2)
    for (const e of elites) {
      expect(e.rating).toBe(1)
      expect(e.carried).toBe(true)
      expect(likedGenomes.some(g => g.id === e.genome.id && sameMusic(g, e.genome))).toBe(true)
    }
    for (let i = 0; i < pop.entries.length; i++) {
      for (let j = i + 1; j < pop.entries.length; j++) {
        expect(sameMusic(pop.entries[i].genome, pop.entries[j].genome)).toBe(false)
      }
    }
    expect(new Set(pop.entries.map(e => e.genome.id)).size).toBe(20)
    expect(pop.entries.some(e => e.genome.origin === 'immigrant')).toBe(true)
  })

  it('shows one carried elite in the first round, pre-rated', () => {
    const ctx = ctxFor(5)
    const pop = Population.create(ctx)
    pop.rate(pop.rows[0], 1)
    const rows = pop.evolve(ctx)
    const carried = rows.filter(i => pop.entries[i].carried)
    expect(carried).toHaveLength(1)
    expect(pop.entries[carried[0]].rating).toBe(1)
  })

  it('children never descend from a genome rated -1', () => {
    const ctx = ctxFor(6)
    const pop = Population.create(ctx)
    const hated = pop.rows.slice(0, 2).map(i => pop.entries[i].genome.id)
    pop.rate(pop.rows[0], -1)
    pop.rate(pop.rows[1], -1)
    pop.rate(pop.rows[2], 1)
    pop.rate(pop.rows[3], 1)
    pop.evolve(ctx)
    for (const e of pop.entries) {
      for (const parent of e.genome.parents) expect(hated).not.toContain(parent)
    }
  })

  it('all -1 votes give mostly immigrants and still a full population', () => {
    const ctx = ctxFor(7)
    const pop = Population.create(ctx)
    pop.entries.forEach((_, i) => pop.rate(i, -1))
    pop.evolve(ctx)
    expect(pop.entries).toHaveLength(20)
    expect(pop.entries.filter(e => e.genome.origin === 'immigrant').length).toBe(20)
  })

  it('archives ratings so later generations learn from them', () => {
    const ctx = ctxFor(8)
    const pop = Population.create(ctx)
    pop.rows.forEach(i => pop.rate(i, 1))
    pop.evolve(ctx)
    expect(pop.archive.length).toBe(5)
    expect(pop.evidence().length).toBeGreaterThanOrEqual(5)
  })

  it('honours a changed population size at the next Evolve', () => {
    const pop = Population.create(ctxFor(9))
    pop.rate(pop.rows[0], 1)
    pop.evolve(ctxFor(9, { populationSize: 12 }))
    expect(pop.entries).toHaveLength(12)
    pop.rate(pop.rows[0], 1)
    pop.evolve(ctxFor(9, { populationSize: 30 }))
    expect(pop.entries).toHaveLength(30)
  })

  it('resizes every genome when the bar count changes', () => {
    const ctx = ctxFor(10)
    const pop = Population.create(ctx)
    pop.rate(pop.rows[0], 1)
    pop.evolve(ctx)
    pop.resize(4, ctx.perBar)
    for (const e of pop.entries) expect(e.genome.kind).toHaveLength(4 * ctx.perBar)
    for (const e of pop.archive) expect(e.genome.kind).toHaveLength(4 * ctx.perBar)
  })

  it('round-trips through JSON', () => {
    const ctx = ctxFor(11)
    const pop = Population.create(ctx)
    pop.rate(pop.rows[0], 1)
    pop.rate(pop.rows[1], -1)
    pop.evolve(ctx)
    const back = Population.fromJSON(JSON.parse(JSON.stringify(pop.toJSON())))
    expect(back.generation).toBe(pop.generation)
    expect(back.rows).toEqual(pop.rows)
    expect(back.entries.map(e => e.genome.id)).toEqual(pop.entries.map(e => e.genome.id))
    expect(back.entries.every((e, i) => sameMusic(e.genome, pop.entries[i].genome))).toBe(true)
    expect(back.archive).toHaveLength(pop.archive.length)
    expect(distance(back.entries[3].genome, pop.entries[3].genome, ctx)).toBe(0)
  })
})

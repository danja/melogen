// The end-to-end check of the GA: a scripted user with a hidden target melody
// votes on what is shown. If selection, the fitness estimate and the operators
// work together, the population drifts towards the target; random votes must
// not do that, and backwards votes must drive it away.
//
// The score is exact step agreement with the target, which is independent of
// the distance the estimator uses.

import { describe, it, expect } from 'vitest'
import { Population } from '../../src/ga/population.js'
import { generateGenome } from '../../src/ga/generate.js'
import { createRng } from '../../src/util/rng.js'
import { NOTE } from '../../src/ga/genome.js'
import { ctxFor } from './helpers.js'

function agreement (genome, target) {
  let n = 0
  for (let i = 0; i < target.kind.length; i++) {
    const sameOnset = (genome.kind[i] === NOTE) === (target.kind[i] === NOTE)
    if (sameOnset && (target.kind[i] !== NOTE || genome.degree[i] === target.degree[i])) n++
  }
  return n / target.kind.length
}

function meanAgreement (pop, target) {
  return pop.entries.reduce((sum, e) => sum + agreement(e.genome, target), 0) / pop.entries.length
}

/** Votes on the shown rows by rank: best two +1, middle 0, worst two -1. */
function simulate (seed, voter, { generations = 15, roundsPerGeneration = 2 } = {}) {
  const ctx = ctxFor(seed)
  const target = generateGenome(ctxFor(seed + 1000), { id: 'target' })
  const voteRng = createRng(seed + 5000)
  const pop = Population.create(ctx)
  const start = meanAgreement(pop, target)

  for (let gen = 0; gen < generations; gen++) {
    for (let round = 0; round < roundsPerGeneration; round++) {
      const rows = round === 0 ? pop.rows : pop.showNext(ctx)
      const taste = i => {
        if (voter === 'random') return voteRng.next()
        const a = agreement(pop.entries[i].genome, target)
        return voter === 'inverted' ? -a : a
      }
      rows.map(i => ({ i, s: taste(i) })).sort((a, b) => b.s - a.s).forEach(({ i }, rank) => {
        if (!pop.entries[i].carried) pop.rate(i, rank < 2 ? 1 : rank >= 3 ? -1 : 0)
      })
    }
    pop.evolve(ctx)
  }
  return { start, end: meanAgreement(pop, target) }
}

const SEEDS = [1, 2, 3, 4, 5, 6]
const mean = values => values.reduce((a, b) => a + b, 0) / values.length

describe('simulated user', () => {
  const honest = SEEDS.map(seed => simulate(seed, 'honest'))
  const random = SEEDS.map(seed => simulate(seed, 'random'))
  const inverted = SEEDS.map(seed => simulate(seed, 'inverted'))

  it('honest votes move the population towards the target in every run', () => {
    for (const run of honest) expect(run.end).toBeGreaterThan(run.start)
    expect(mean(honest.map(r => r.end)) - mean(honest.map(r => r.start))).toBeGreaterThan(0.08)
  })

  it('random votes do not', () => {
    expect(mean(random.map(r => r.end)) - mean(random.map(r => r.start))).toBeLessThan(0.03)
    expect(mean(honest.map(r => r.end)) - mean(random.map(r => r.end))).toBeGreaterThan(0.08)
  })

  it('backwards votes drive it away', () => {
    expect(mean(inverted.map(r => r.end))).toBeLessThan(mean(inverted.map(r => r.start)) - 0.05)
  })

  it('works when the user rates only one round per generation', () => {
    const runs = SEEDS.map(seed => simulate(seed, 'honest', { roundsPerGeneration: 1 }))
    expect(mean(runs.map(r => r.end)) - mean(runs.map(r => r.start))).toBeGreaterThan(0.05)
  })
})

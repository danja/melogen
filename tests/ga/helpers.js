import { makeContext } from '../../src/ga/context.js'
import { createRng } from '../../src/util/rng.js'
import { createGenome, NOTE, HOLD } from '../../src/ga/genome.js'

export const SETTINGS = Object.freeze({
  mode: 'melody', scale: 'major', root: 0, octave: 4, bars: 8, timeSignature: '4/4',
  tempo: 120, crossoverRate: 0.7, mutationRate: 0.1, populationSize: 20
})

export function ctxFor (seed = 1, overrides = {}, paramOverrides = {}) {
  return makeContext({ ...SETTINGS, ...overrides }, createRng(seed), paramOverrides)
}

/** Genome from rows of [kind, degree, velocity]. */
export function genomeOf (steps, id = 'x') {
  const g = createGenome(steps.length, { id })
  steps.forEach(([kind, degree = 0, velocity = 1], i) => {
    g.kind[i] = kind; g.degree[i] = degree; g.velocity[i] = velocity
  })
  return g
}

/** Invariants every valid genome must satisfy. */
export function assertValid (genome, ctx) {
  if (genome.kind.length !== ctx.length) throw new Error(`length ${genome.kind.length} != ${ctx.length}`)
  for (let i = 0; i < genome.kind.length; i++) {
    if (genome.kind[i] > HOLD) throw new Error(`bad kind at ${i}`)
    if (genome.degree[i] >= ctx.D) throw new Error(`degree ${genome.degree[i]} out of range at ${i}`)
    if (genome.velocity[i] > 3) throw new Error(`velocity out of range at ${i}`)
  }
}

export function onsetDensity (genome) {
  let n = 0
  for (const k of genome.kind) if (k === NOTE) n++
  return n / genome.kind.length
}

// Estimated fitness for a genome the user has not rated: a kernel-weighted
// average of the ratings of similar genomes, shrunk towards a prior.
// docs/algorithm.md section 5.4.

import { distance } from './distance.js'

/**
 * @param genome
 * @param evidence [{ genome, rating, age }] rated genomes, age in generations
 * @param prior mean fitness of the genome's parents (0 for new genomes)
 * @returns { f, u } estimate and uncertainty in [0, 1]
 */
export function estimateFitness (genome, evidence, prior, ctx) {
  const { SIGMA, GAMMA, LAMBDA } = ctx.params
  let weightSum = 0
  let weighted = 0
  for (const item of evidence) {
    if (item.genome.id === genome.id) continue
    const d = distance(genome, item.genome, ctx) / SIGMA
    const w = Math.exp(-d * d) * Math.pow(GAMMA, item.age)
    weightSum += w
    weighted += w * item.rating
  }
  return {
    f: (weighted + LAMBDA * prior) / (weightSum + LAMBDA),
    u: LAMBDA / (weightSum + LAMBDA)
  }
}

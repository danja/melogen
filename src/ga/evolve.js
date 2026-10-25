// Building the next generation: elites, offspring, immigrants.
// docs/algorithm.md section 7.

import { cloneGenome, sameMusic } from './genome.js'
import { eligible, pickParents } from './select.js'
import { crossover } from './crossover.js'
import { mutate } from './mutate.js'
import { generateGenome } from './generate.js'

function newEntry (genome, extra = {}) {
  return { genome, rating: null, voted: false, carried: false, shown: false, prior: 0, ...extra }
}

function chooseElites (entries, fitness, ctx) {
  const { E, ELITE_ESTIMATE_MIN } = ctx.params
  const liked = []
  entries.forEach((entry, index) => { if (entry.rating === 1) liked.push(index) })
  if (liked.length > 0) {
    return ctx.rng.shuffle(liked).slice(0, E).map(index => ({ index, carried: true }))
  }
  let best = -1
  entries.forEach((entry, index) => {
    if (entry.rating === null && (best < 0 || fitness(index) > fitness(best))) best = index
  })
  if (best >= 0 && fitness(best) > ELITE_ESTIMATE_MIN) return [{ index: best, carried: false }]
  return []
}

function duplicates (genome, among) {
  return among.some(entry => sameMusic(entry.genome, genome))
}

/**
 * @param entries current generation [{ genome, rating, ... }]
 * @param fitness (index) => number, the rating if rated else the estimate
 * @param generation number of the generation being built
 * @returns new entries, length ctx.params.N
 */
export function evolveGeneration (entries, fitness, generation, ctx) {
  const { rng, params } = ctx
  const N = params.N
  const out = []
  const label = () => `g${generation}-${out.length}`

  // Elites keep their genome, id and rating; a liked one carries its +1.
  for (const { index, carried } of chooseElites(entries, fitness, ctx).slice(0, N)) {
    const source = entries[index]
    out.push(newEntry(cloneGenome(source.genome, { origin: 'elite' }), {
      rating: carried ? 1 : null, carried, prior: fitness(index)
    }))
  }

  const pool = eligible(entries)
  let immigrants = Math.max(1, Math.round(params.IMMIGRANT_FRACTION * N))
  if (pool.length < 2) immigrants = Math.max(0, N - out.length)
  const offspring = Math.max(0, N - out.length - immigrants)

  for (let k = 0; k < offspring; k++) {
    const [ia, ib] = pickParents(pool, fitness, rng, params.TOURNAMENT)
    const a = entries[ia].genome
    const b = entries[ib].genome
    let child = rng.chance(ctx.crossoverRate) ? crossover(a, b, ctx) : cloneGenome(a, { parents: [a.id], origin: 'mutation' })
    child = mutate(child, ctx.mutationRate, ctx)
    for (let tries = 0; tries < params.DEDUP_TRIES && duplicates(child, out); tries++) {
      child = mutate(child, Math.max(ctx.mutationRate, 0.1), ctx)
    }
    child.id = label()
    const prior = child.origin === 'crossover' ? (fitness(ia) + fitness(ib)) / 2 : fitness(ia)
    out.push(newEntry(child, { prior }))
  }

  while (out.length < N) {
    out.push(newEntry(generateGenome(ctx, { id: label(), origin: 'immigrant' })))
  }
  return out
}

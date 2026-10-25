// Parent selection: tournaments over everything not rated -1.
// docs/algorithm.md section 6.

/** Entries a parent may be drawn from: a -1 vote is an instruction. */
export function eligible (entries) {
  const out = []
  entries.forEach((entry, index) => { if (entry.rating !== -1) out.push(index) })
  return out
}

/**
 * Draw `size` candidates at random and return the best; ties are broken at random.
 * @param pool array of indices
 * @param fitness (index) => number
 */
export function tournament (pool, fitness, rng, size) {
  const drawn = []
  for (let k = 0; k < size; k++) drawn.push(rng.pick(pool))
  let best = -Infinity
  for (const index of drawn) best = Math.max(best, fitness(index))
  const winners = drawn.filter(index => fitness(index) === best)
  return rng.pick(winners)
}

/** Two parents, distinct where the pool allows. */
export function pickParents (pool, fitness, rng, size) {
  const a = tournament(pool, fitness, rng, size)
  let b = tournament(pool, fitness, rng, size)
  for (let tries = 0; b === a && pool.length > 1 && tries < 8; tries++) {
    b = tournament(pool, fitness, rng, size)
  }
  return [a, b]
}

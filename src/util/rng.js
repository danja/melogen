// Seeded PRNG (mulberry32). Every random choice in the GA goes through one of
// these, so a run reproduces and the tests are deterministic.

export function createRng (seed = 1) {
  let state = seed >>> 0

  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng = {
    next,
    /** Integer in [0, n). */
    int: n => Math.floor(next() * n),
    /** Integer in [lo, hi] inclusive. */
    range: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: p => next() < p,
    pick: items => items[Math.floor(next() * items.length)],
    /** Index chosen with probability proportional to weights[i]. */
    weightedIndex (weights) {
      let total = 0
      for (const w of weights) total += w
      let r = next() * total
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i]
        if (r < 0) return i
      }
      return weights.length - 1
    },
    /** Value from a [[value, weight], ...] table. */
    weighted (table) {
      return table[rng.weightedIndex(table.map(entry => entry[1]))][0]
    },
    /** New shuffled array; the input is untouched. */
    shuffle (items) {
      const out = items.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    getState: () => state,
    setState: value => { state = value >>> 0 },
    /** Independent generator seeded from this one. */
    fork: () => createRng(Math.floor(next() * 4294967296))
  }
  return rng
}

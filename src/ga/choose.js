// Which melodies to put in front of the user: likely to be good, not yet well
// judged, and different from each other. docs/algorithm.md section 5.5.

import { distance } from './distance.js'

/**
 * @param candidates [{ index, genome, f, u }] melodies not yet shown
 * @param count how many to pick
 * @returns picked `index` values, best first
 */
export function chooseToShow (candidates, count, ctx) {
  const { KAPPA, BETA } = ctx.params
  const score = c => c.f + KAPPA * c.u
  const remaining = candidates.slice()
  const chosen = []

  while (chosen.length < count && remaining.length > 0) {
    let bestAt = 0
    let bestScore = -Infinity
    remaining.forEach((c, at) => {
      let s = score(c)
      if (chosen.length > 0) {
        let nearest = Infinity
        for (const other of chosen) nearest = Math.min(nearest, distance(c.genome, other.genome, ctx))
        s += BETA * nearest
      }
      if (s > bestScore) { bestScore = s; bestAt = at }
    })
    chosen.push(remaining.splice(bestAt, 1)[0])
  }
  return chosen.map(c => c.index)
}

// Crossover on bar and beat boundaries, so phrases are not cut mid-figure.
// docs/algorithm.md section 7.3. No repair is needed: a HOLD that follows a
// cut with nothing to hold decodes as a rest.

import { createGenome, copySteps } from './genome.js'

function bars (ctx) { return Math.floor(ctx.length / ctx.perBar) }

function fromParent (a, b, ctx, segments) {
  // segments: [{ from, to, parent }] covering [0, length)
  const child = createGenome(a.kind.length)
  for (const { from, to, parent } of segments) copySteps(child, from, parent === 0 ? a : b, from, to - from)
  return child
}

export function barOnePoint (a, b, ctx) {
  const n = bars(ctx)
  if (n < 2) return fromParent(a, b, ctx, [{ from: 0, to: a.kind.length, parent: 0 }])
  const cut = ctx.rng.range(1, n - 1) * ctx.perBar
  return fromParent(a, b, ctx, [{ from: 0, to: cut, parent: 0 }, { from: cut, to: a.kind.length, parent: 1 }])
}

export function barTwoPoint (a, b, ctx) {
  const n = bars(ctx)
  if (n < 3) return barOnePoint(a, b, ctx)
  const first = ctx.rng.range(1, n - 2)
  const second = ctx.rng.range(first + 1, n - 1)
  return fromParent(a, b, ctx, [
    { from: 0, to: first * ctx.perBar, parent: 0 },
    { from: first * ctx.perBar, to: second * ctx.perBar, parent: 1 },
    { from: second * ctx.perBar, to: a.kind.length, parent: 0 }
  ])
}

export function barUniform (a, b, ctx) {
  const n = bars(ctx)
  const segments = []
  for (let bar = 0; bar < n; bar++) {
    segments.push({ from: bar * ctx.perBar, to: (bar + 1) * ctx.perBar, parent: ctx.rng.chance(0.5) ? 0 : 1 })
  }
  return fromParent(a, b, ctx, segments)
}

export function beatOnePoint (a, b, ctx) {
  const beats = Math.floor(a.kind.length / ctx.beatSteps)
  if (beats < 2) return barOnePoint(a, b, ctx)
  const cut = ctx.rng.range(1, beats - 1) * ctx.beatSteps
  return fromParent(a, b, ctx, [{ from: 0, to: cut, parent: 0 }, { from: cut, to: a.kind.length, parent: 1 }])
}

/**
 * @returns a new genome (origin 'crossover') with `parents` set to the parents' ids
 */
export function crossover (a, b, ctx) {
  const w = ctx.params.CROSSOVER_WEIGHTS
  const operator = ctx.rng.weighted([
    [barOnePoint, w.barOne], [barTwoPoint, w.barTwo], [barUniform, w.barUniform], [beatOnePoint, w.beatOne]
  ])
  const child = operator(a, b, ctx)
  child.parents = [a.id, b.id]
  child.origin = 'crossover'
  return child
}

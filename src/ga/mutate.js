// Mutation: point operators on single steps and segment operators on whole
// bars. docs/algorithm.md section 7.5.

import { REST, NOTE, HOLD, cloneGenome, copySteps } from './genome.js'

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))

/** The NOTE step that owns step i: i itself, else the nearest before, else the nearest after. */
export function nearestNote (genome, i) {
  const length = genome.kind.length
  if (genome.kind[i] === NOTE) return i
  for (let j = i - 1; j >= 0; j--) if (genome.kind[j] === NOTE) return j
  for (let j = i + 1; j < length; j++) if (genome.kind[j] === NOTE) return j
  return -1
}

/** Move a note's pitch by `delta` degrees, clamped. */
export function nudgeNote (genome, i, delta, D) {
  const n = nearestNote(genome, i)
  if (n < 0) return false
  genome.degree[n] = clamp(genome.degree[n] + delta, 0, D - 1)
  return true
}

/**
 * Shift every degree in [from, from+count) by delta, limiting delta so no
 * note leaves the range and the bar keeps its shape.
 */
export function transposeRange (genome, from, count, delta, D) {
  let lo = Infinity
  let hi = -Infinity
  for (let i = from; i < from + count; i++) {
    if (genome.kind[i] !== NOTE) continue
    lo = Math.min(lo, genome.degree[i])
    hi = Math.max(hi, genome.degree[i])
  }
  if (lo === Infinity) return false
  const limited = clamp(delta, -lo, D - 1 - hi)
  if (limited === 0) return false
  for (let i = from; i < from + count; i++) genome.degree[i] = clamp(genome.degree[i] + limited, 0, D - 1)
  return true
}

const sign = rng => (rng.chance(0.5) ? 1 : -1)

// ---- point operators -------------------------------------------------------

const POINT_OPS = [
  [pitchNudge, 0.35],
  [pitchLeap, 0.10],
  [toggleOnset, 0.20],
  [toggleRest, 0.15],
  [changeVelocity, 0.20]
]

function pitchNudge (g, i, ctx) { nudgeNote(g, i, sign(ctx.rng), ctx.D) }
function pitchLeap (g, i, ctx) { nudgeNote(g, i, sign(ctx.rng) * ctx.rng.range(2, 5), ctx.D) }

function toggleOnset (g, i, ctx) {
  const { rng, D } = ctx
  if (g.kind[i] === NOTE) {
    g.kind[i] = HOLD
  } else if (g.kind[i] === HOLD) {
    const owner = nearestNote(g, i)
    const base = owner >= 0 && owner < i ? g.degree[owner] : rng.int(D)
    g.kind[i] = NOTE
    g.degree[i] = clamp(base + rng.range(-2, 2), 0, D - 1)
    g.velocity[i] = rng.range(0, 2)
  } else {
    toggleRest(g, i, ctx)
  }
}

function toggleRest (g, i) {
  g.kind[i] = g.kind[i] === REST ? NOTE : REST
}

function changeVelocity (g, i, ctx) {
  const n = nearestNote(g, i)
  if (n >= 0) g.velocity[n] = clamp(g.velocity[n] + sign(ctx.rng), 0, 3)
}

// ---- segment operators -----------------------------------------------------

const SEGMENT_OPS = [
  [transposeBar, 0.30],
  [copyBar, 0.25],
  [invertBar, 0.15],
  [retrogradeBar, 0.10],
  [shiftBar, 0.20]
]

function transposeBar (g, bar, ctx) {
  transposeRange(g, bar * ctx.perBar, ctx.perBar, sign(ctx.rng) * ctx.rng.range(1, 3), ctx.D)
}

function copyBar (g, bar, ctx) {
  if (ctx.bars < 2) return
  let from = ctx.rng.int(ctx.bars - 1)
  if (from >= bar) from++
  copySteps(g, bar * ctx.perBar, g, from * ctx.perBar, ctx.perBar)
}

function invertBar (g, bar, ctx) {
  const start = bar * ctx.perBar
  const first = nearestNoteIn(g, start, ctx.perBar)
  if (first < 0) return
  const axis = g.degree[first]
  for (let i = start; i < start + ctx.perBar; i++) g.degree[i] = clamp(2 * axis - g.degree[i], 0, ctx.D - 1)
}

function nearestNoteIn (g, start, count) {
  for (let i = start; i < start + count; i++) if (g.kind[i] === NOTE) return i
  return -1
}

function retrogradeBar (g, bar, ctx) {
  const start = bar * ctx.perBar
  const slots = []
  for (let i = start; i < start + ctx.perBar; i++) if (g.kind[i] === NOTE) slots.push(i)
  const degrees = slots.map(i => g.degree[i]).reverse()
  const velocities = slots.map(i => g.velocity[i]).reverse()
  slots.forEach((slot, k) => { g.degree[slot] = degrees[k]; g.velocity[slot] = velocities[k] })
}

function shiftBar (g, bar, ctx) {
  const start = bar * ctx.perBar
  const n = ctx.perBar
  const by = sign(ctx.rng) * ctx.rng.range(1, 2)
  const kind = g.kind.slice(start, start + n)
  const degree = g.degree.slice(start, start + n)
  const velocity = g.velocity.slice(start, start + n)
  for (let i = 0; i < n; i++) {
    const to = start + ((i + by + n) % n)
    g.kind[to] = kind[i]; g.degree[to] = degree[i]; g.velocity[to] = velocity[i]
  }
}

/**
 * Returns a mutated copy. At rate 0 the copy is identical.
 * @param rate mutation rate in [0, 1]
 */
export function mutate (genome, rate, ctx) {
  const child = cloneGenome(genome)
  if (rate <= 0) return child
  const { rng, params } = ctx
  const bars = Math.floor(child.kind.length / ctx.perBar)

  const segmentRate = rate * params.SEGMENT_RATE_FACTOR
  for (let bar = 0; bar < bars; bar++) {
    if (rng.chance(segmentRate)) rng.weighted(SEGMENT_OPS)(child, bar, ctx)
  }
  const pointRate = rate * params.POINT_RATE_FACTOR
  for (let i = 0; i < child.kind.length; i++) {
    if (rng.chance(pointRate)) rng.weighted(POINT_OPS)(child, i, ctx)
  }
  return child
}

export const operators = { POINT_OPS, SEGMENT_OPS }

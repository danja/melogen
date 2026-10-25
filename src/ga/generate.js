// Random genomes with musical priors: a motif repeated in a form such as
// AABA, with rhythm weighted to the strong beats and pitch moving by step.
// docs/algorithm.md section 4.

import { createGenome, copySteps, NOTE, HOLD, REST } from './genome.js'
import { stepStrength } from '../music/timing.js'
import { isChordTone } from '../music/scales.js'
import { nudgeNote, transposeRange } from './mutate.js'

const FORMS = ['AAAA', 'AABA', 'ABAB', 'AABB', 'ABAC']

// Chance of an onset by metrical strength (0 sixteenth .. 3 downbeat).
const ONSET = { melody: [0.28, 0.5, 0.75, 0.95], bass: [0.08, 0.3, 0.6, 0.95] }
const HOLD_CHANCE = { melody: 0.6, bass: 0.7 }
const VARIATION_CHANCE = 0.5
const CADENCE_CHANCE = 0.7

function reflect (value, D) {
  if (value < 0) value = -value
  if (value > D - 1) value = 2 * (D - 1) - value
  return Math.max(0, Math.min(D - 1, value))
}

function chordTones (ctx) {
  const tones = []
  for (let d = 0; d < ctx.D; d++) if (isChordTone(d, ctx.scale)) tones.push(d)
  return tones
}

function startDegree (ctx) {
  const tones = chordTones(ctx).filter(d => d <= Math.ceil(ctx.D * 0.7))
  return ctx.rng.pick(tones.length ? tones : [0])
}

function nextDegree (degree, ctx) {
  const { rng, D } = ctx
  const direction = rng.chance(0.5) ? 1 : -1
  if (ctx.mode === 'bass') {
    const r = rng.next()
    if (r < 0.5) return rng.pick(chordTones(ctx))
    const size = r < 0.8 ? 1 : rng.range(2, 4)
    return reflect(degree + direction * size, D)
  }
  const size = rng.weighted([[1, 0.6], [2, 0.25], [rng.range(3, 5), 0.15]])
  return reflect(degree + direction * size, D)
}

function generateSection (ctx, nBars) {
  const { rng, perBar, mode } = ctx
  const section = createGenome(nBars * perBar)
  let degree = startDegree(ctx)
  let sounding = false
  for (let i = 0; i < section.kind.length; i++) {
    const strength = stepStrength(i % perBar, ctx.timeSignature)
    if (rng.chance(ONSET[mode][strength])) {
      degree = nextDegree(degree, ctx)
      section.kind[i] = NOTE
      section.degree[i] = degree
      section.velocity[i] = strength >= 2 ? rng.range(2, 3) : rng.range(1, 2)
      sounding = true
    } else if (sounding && rng.chance(HOLD_CHANCE[mode])) {
      section.kind[i] = HOLD
      section.degree[i] = degree
    } else {
      section.kind[i] = REST
      sounding = false
    }
  }
  return section
}

/** A light variation of a repeated section: one nudged note or a small transposition. */
function vary (genome, from, count, ctx) {
  const { rng, D } = ctx
  if (rng.chance(0.5)) {
    nudgeNote(genome, from + rng.int(count), rng.chance(0.5) ? 1 : -1, D)
  } else {
    transposeRange(genome, from, count, (rng.chance(0.5) ? 1 : -1) * rng.range(1, 2), D)
  }
}

function addCadence (genome, ctx) {
  const { rng, D, perBar } = ctx
  const length = genome.kind.length
  const barStart = length - perBar
  let last = -1
  for (let i = length - 1; i >= barStart; i--) {
    if (genome.kind[i] === NOTE) { last = i; break }
  }
  if (last < 0) { last = barStart; genome.kind[last] = NOTE }
  const tones = [0, 2, 4].filter(d => d < D)
  genome.degree[last] = rng.pick(tones)
  genome.velocity[last] = 2
  for (let i = last + 1; i < length; i++) genome.kind[i] = HOLD
}

/** @param meta { id, parents, origin } */
export function generateGenome (ctx, meta = {}) {
  const { rng, bars, perBar } = ctx
  const genome = createGenome(ctx.length, { origin: 'random', ...meta })
  const motifBars = Math.min(bars, rng.chance(0.5) ? 1 : 2)
  const form = rng.pick(FORMS)

  const sections = {}
  for (const letter of new Set(form)) sections[letter] = generateSection(ctx, motifBars)

  const seen = new Set()
  const sectionCount = Math.ceil(bars / motifBars)
  for (let s = 0; s < sectionCount; s++) {
    const letter = form[s % form.length]
    const firstBar = s * motifBars
    const count = Math.min(motifBars, bars - firstBar)
    copySteps(genome, firstBar * perBar, sections[letter], 0, count * perBar)
    if (seen.has(letter) && rng.chance(VARIATION_CHANCE)) vary(genome, firstBar * perBar, count * perBar, ctx)
    seen.add(letter)
  }

  if (rng.chance(CADENCE_CHANCE)) addCadence(genome, ctx)
  return genome
}

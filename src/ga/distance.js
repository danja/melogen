// Distance between two genomes in [0, 1]: rhythm, pitch and contour, weighted.
// docs/algorithm.md section 5.3.

import { NOTE, HOLD } from './genome.js'

/** Scale degree sounding on each step, or -1 for silence. */
export function pitchTrack (genome) {
  const track = new Int16Array(genome.kind.length)
  let current = -1
  for (let i = 0; i < track.length; i++) {
    const kind = genome.kind[i]
    if (kind === NOTE) current = genome.degree[i]
    else if (kind !== HOLD) current = -1
    track[i] = current
  }
  return track
}

function onsetDistance (a, b, length) {
  let differing = 0
  for (let i = 0; i < length; i++) {
    if ((a.kind[i] === NOTE) !== (b.kind[i] === NOTE)) differing++
  }
  return differing / length
}

function pitchDistance (trackA, trackB, length, D) {
  let sum = 0
  let both = 0
  let anyA = false
  let anyB = false
  for (let i = 0; i < length; i++) {
    const pa = trackA[i]
    const pb = trackB[i]
    if (pa >= 0) anyA = true
    if (pb >= 0) anyB = true
    if (pa >= 0 && pb >= 0) {
      sum += Math.abs(pa - pb) / D
      both++
    }
  }
  if (both === 0) return anyA || anyB ? 1 : 0
  return Math.min(1, sum / both)
}

const CONTOUR_POINTS = 16

function notePitches (genome) {
  const out = []
  for (let i = 0; i < genome.kind.length; i++) if (genome.kind[i] === NOTE) out.push(genome.degree[i])
  return out
}

/** Directions (-1, 0, 1) of the 15 steps between 16 evenly resampled notes. */
function contour (pitches) {
  const n = pitches.length
  const sampled = []
  for (let i = 0; i < CONTOUR_POINTS; i++) sampled.push(pitches[Math.round((i * (n - 1)) / (CONTOUR_POINTS - 1))])
  const directions = []
  for (let i = 1; i < CONTOUR_POINTS; i++) directions.push(Math.sign(sampled[i] - sampled[i - 1]))
  return directions
}

function contourDistance (a, b) {
  const pa = notePitches(a)
  const pb = notePitches(b)
  if (pa.length < 2 && pb.length < 2) return 0
  if (pa.length < 2 || pb.length < 2) return 1
  const ca = contour(pa)
  const cb = contour(pb)
  let differing = 0
  for (let i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) differing++
  return differing / ca.length
}

/**
 * @param ctx needs D and params.DIST_WEIGHTS
 */
export function distance (a, b, ctx) {
  const length = Math.min(a.kind.length, b.kind.length)
  const w = ctx.params.DIST_WEIGHTS
  const dR = onsetDistance(a, b, length)
  const dP = pitchDistance(pitchTrack(a), pitchTrack(b), length, ctx.D)
  const dC = contourDistance(a, b)
  return w.rhythm * dR + w.pitch * dP + w.contour * dC
}

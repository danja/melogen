// User settings: defaults, validation and what a change implies.

import { SCALES, MODES } from '../music/scales.js'
import { TIME_SIGNATURES } from '../music/timing.js'

export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'melody',
  root: 0,
  scale: 'major',
  octave: MODES.melody.octave,
  bars: 8,
  timeSignature: '4/4',
  tempo: 120,
  crossoverRate: 0.7,
  mutationRate: 0.1,
  populationSize: 20,
  loop: false
})

export const LIMITS = Object.freeze({
  octave: [0, 7],
  bars: [1, 32],
  tempo: [40, 240],
  crossoverRate: [0, 1],
  mutationRate: [0, 1],
  populationSize: [10, 50]
})

const clamp = (value, [lo, hi]) => Math.max(lo, Math.min(hi, value))

function num (value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** A complete, valid settings object from any partial one; bad values fall back to `base`. */
export function validateSettings (input = {}, base = DEFAULT_SETTINGS) {
  const out = { ...base }
  if (input.mode in MODES) out.mode = input.mode
  if (input.scale in SCALES) out.scale = input.scale
  if (TIME_SIGNATURES.includes(input.timeSignature)) out.timeSignature = input.timeSignature
  if ('root' in input) out.root = Math.round(clamp(num(input.root, base.root), [0, 11]))
  if ('octave' in input) out.octave = Math.round(clamp(num(input.octave, base.octave), LIMITS.octave))
  if ('bars' in input) out.bars = Math.round(clamp(num(input.bars, base.bars), LIMITS.bars))
  if ('tempo' in input) out.tempo = Math.round(clamp(num(input.tempo, base.tempo), LIMITS.tempo))
  if ('populationSize' in input) out.populationSize = Math.round(clamp(num(input.populationSize, base.populationSize), LIMITS.populationSize))
  for (const key of ['crossoverRate', 'mutationRate']) {
    if (key in input) out[key] = Math.round(clamp(num(input[key], base[key]), LIMITS[key]) * 100) / 100
  }
  if ('loop' in input) out.loop = input.loop === true
  return out
}

/** Apply a change. Switching mode also switches to that mode's usual octave, unless one is given. */
export function applyChange (settings, patch) {
  const next = validateSettings(patch, settings)
  if (next.mode !== settings.mode && !('octave' in patch)) next.octave = MODES[next.mode].octave
  return next
}

/** What a change means for the running population. */
export function describeChange (before, after) {
  return {
    newPopulation: before.timeSignature !== after.timeSignature,
    resize: before.bars !== after.bars && before.timeSignature === after.timeSignature,
    // These change how a genome sounds, so anything playing is stale.
    affectsPlayback: ['mode', 'root', 'scale', 'octave', 'bars', 'timeSignature', 'tempo'].some(key => before[key] !== after[key])
  }
}

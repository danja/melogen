// Everything the GA needs to know about the musical frame, derived from the
// settings once per operation so the operators stay pure functions of
// (genomes, context).

import { DEFAULTS } from './constants.js'
import { stepsPerBar, stepsPerBeat } from '../music/timing.js'
import { degreeRange } from '../music/scales.js'

export function makeContext (settings, rng, paramOverrides = {}) {
  const perBar = stepsPerBar(settings.timeSignature)
  return {
    rng,
    mode: settings.mode,
    scale: settings.scale,
    root: settings.root,
    octave: settings.octave,
    bars: settings.bars,
    timeSignature: settings.timeSignature,
    perBar,
    beatSteps: stepsPerBeat(settings.timeSignature),
    length: settings.bars * perBar,
    D: degreeRange(settings.scale, settings.mode),
    crossoverRate: settings.crossoverRate,
    mutationRate: settings.mutationRate,
    params: { ...DEFAULTS, N: settings.populationSize ?? DEFAULTS.N, ...paramOverrides }
  }
}

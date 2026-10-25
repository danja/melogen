// Genome -> notes. The decoder is the only place that interprets the step
// grid: playback and MIDI export both consume its output.

import { NOTE, HOLD } from '../ga/genome.js'
import { VELOCITY_LEVELS } from '../ga/constants.js'
import { degreeToMidi, degreeRange } from './scales.js'

/**
 * @param genome
 * @param music { root, scale, octave, mode }
 * @returns notes [{ startStep, lengthSteps, midi, velocity }]
 */
export function decode (genome, { root = 0, scale = 'major', octave = 4, mode = 'melody' } = {}) {
  const notes = []
  const maxDegree = degreeRange(scale, mode) - 1
  let open = null

  for (let i = 0; i < genome.kind.length; i++) {
    const kind = genome.kind[i]
    if (kind === NOTE) {
      const degree = Math.min(genome.degree[i], maxDegree)
      open = {
        startStep: i,
        lengthSteps: 1,
        midi: degreeToMidi(degree, { root, scale, octave }),
        velocity: VELOCITY_LEVELS[Math.min(genome.velocity[i], VELOCITY_LEVELS.length - 1)]
      }
      notes.push(open)
    } else if (kind === HOLD && open) {
      open.lengthSteps += 1
    } else {
      // REST, or a HOLD with nothing to hold.
      open = null
    }
  }
  return notes
}

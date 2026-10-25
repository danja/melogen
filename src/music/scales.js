// Scales, and the mapping from a scale degree to a MIDI note.
//
// A degree indexes the scale extended upward over several octaves: degree 0 is
// the root at the chosen octave, degree scale.length is the root an octave up.

export const SCALES = Object.freeze({
  major: { name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  harmonicMinor: { name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  majorPentatonic: { name: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  minorPentatonic: { name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  blues: { name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  wholeTone: { name: 'Whole tone', steps: [0, 2, 4, 6, 8, 10] },
  chromatic: { name: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
})

export const ROOT_NAMES = Object.freeze(['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'])

export const MODES = Object.freeze({
  melody: { name: 'Melody', octave: 4, spanOctaves: 2 },
  bass: { name: 'Bass', octave: 2, spanOctaves: 1.5 }
})

export function scaleSteps (scale) {
  const entry = SCALES[scale]
  if (!entry) throw new Error(`unknown scale "${scale}"`)
  return entry.steps
}

/** D: how many degrees a genome may use, for a scale and mode. */
export function degreeRange (scale, mode = 'melody') {
  const span = MODES[mode]?.spanOctaves ?? 2
  return Math.ceil(scaleSteps(scale).length * span)
}

/**
 * MIDI note for a degree. `octave` is scientific pitch notation, so C4 = 60.
 * The result is clamped to the MIDI range.
 */
export function degreeToMidi (degree, { root = 0, scale = 'major', octave = 4 } = {}) {
  const steps = scaleSteps(scale)
  const octaveOffset = Math.floor(degree / steps.length)
  const within = degree - octaveOffset * steps.length
  const midi = 12 * (octave + 1) + root + 12 * octaveOffset + steps[within]
  return Math.max(0, Math.min(127, midi))
}

/** Degrees that are chord tones of the scale's tonic triad: 1st, 3rd and 5th, in every octave. */
export function isChordTone (degree, scale) {
  const length = scaleSteps(scale).length
  if (length < 5) return degree % length === 0
  const within = ((degree % length) + length) % length
  return within === 0 || within === 2 || within === 4
}

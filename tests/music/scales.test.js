import { describe, it, expect } from 'vitest'
import { degreeToMidi, degreeRange, scaleSteps, isChordTone, SCALES } from '../../src/music/scales.js'

describe('scales', () => {
  it('maps degrees to MIDI in C major at octave 4', () => {
    const m = { root: 0, scale: 'major', octave: 4 }
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(d => degreeToMidi(d, m))).toEqual([60, 62, 64, 65, 67, 69, 71, 72])
  })

  it('transposes by root and octave', () => {
    expect(degreeToMidi(0, { root: 2, scale: 'minor', octave: 2 })).toBe(38)
    expect(degreeToMidi(2, { root: 2, scale: 'minor', octave: 2 })).toBe(41)
  })

  it('works for a pentatonic scale across octaves', () => {
    const m = { root: 0, scale: 'minorPentatonic', octave: 3 }
    expect(degreeToMidi(0, m)).toBe(48)
    expect(degreeToMidi(5, m)).toBe(60)
    expect(degreeToMidi(7, m)).toBe(65)
  })

  it('clamps to the MIDI range', () => {
    expect(degreeToMidi(100, { octave: 9 })).toBe(127)
  })

  it('degree range depends on scale length and mode', () => {
    expect(degreeRange('major', 'melody')).toBe(14)
    expect(degreeRange('major', 'bass')).toBe(11)
    expect(degreeRange('minorPentatonic', 'bass')).toBe(8)
  })

  it('every scale starts on 0 and ascends', () => {
    for (const [key, { steps }] of Object.entries(SCALES)) {
      expect(steps[0]).toBe(0)
      for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1])
      expect(steps[steps.length - 1]).toBeLessThan(12)
      expect(scaleSteps(key)).toBe(steps)
    }
  })

  it('rejects an unknown scale', () => {
    expect(() => scaleSteps('nope')).toThrow(/unknown scale/)
  })

  it('identifies chord tones', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(d => isChordTone(d, 'major'))).toEqual(
      [true, false, true, false, true, false, false, true])
  })
})

import { describe, it, expect } from 'vitest'
import { decode } from '../../src/music/decode.js'
import { createGenome, NOTE, HOLD, REST } from '../../src/ga/genome.js'

function make (steps) {
  const g = createGenome(steps.length)
  steps.forEach(([kind, degree = 0, velocity = 1], i) => {
    g.kind[i] = kind; g.degree[i] = degree; g.velocity[i] = velocity
  })
  return g
}
const music = { root: 0, scale: 'major', octave: 4, mode: 'melody' }

describe('decode', () => {
  it('turns NOTE and HOLD into a sustained note', () => {
    const notes = decode(make([[NOTE, 0], [HOLD], [HOLD], [REST], [NOTE, 2]]), music)
    expect(notes).toEqual([
      { startStep: 0, lengthSteps: 3, midi: 60, velocity: 80 },
      { startStep: 4, lengthSteps: 1, midi: 64, velocity: 80 }
    ])
  })

  it('a HOLD at step 0 or after a REST is silent', () => {
    expect(decode(make([[HOLD], [HOLD], [NOTE, 1]]), music)).toHaveLength(1)
    expect(decode(make([[NOTE, 1], [REST], [HOLD], [HOLD]]), music)).toEqual([
      { startStep: 0, lengthSteps: 1, midi: 62, velocity: 80 }
    ])
  })

  it('a note running to the end is closed there', () => {
    const notes = decode(make([[REST], [NOTE, 4], [HOLD], [HOLD]]), music)
    expect(notes[0]).toMatchObject({ startStep: 1, lengthSteps: 3, midi: 67 })
  })

  it('a new NOTE ends the one before', () => {
    const notes = decode(make([[NOTE, 0], [HOLD], [NOTE, 1], [HOLD]]), music)
    expect(notes.map(n => n.lengthSteps)).toEqual([2, 2])
  })

  it('ignores the stored pitch of rests', () => {
    expect(decode(make([[REST, 5], [NOTE, 0]]), music)).toHaveLength(1)
  })

  it('maps velocity levels', () => {
    const notes = decode(make([[NOTE, 0, 0], [NOTE, 0, 1], [NOTE, 0, 2], [NOTE, 0, 3]]), music)
    expect(notes.map(n => n.velocity)).toEqual([60, 80, 100, 120])
  })

  it('clamps degrees beyond the range when the scale shrinks', () => {
    const wide = decode(make([[NOTE, 13]]), music)
    const narrow = decode(make([[NOTE, 13]]), { ...music, scale: 'minorPentatonic', mode: 'bass' })
    expect(wide[0].midi).toBe(83)
    // pentatonic bass range is 8 degrees: degree 7 is the 3rd step of the second octave
    expect(narrow[0].midi).toBe(72 + 5)
  })
})

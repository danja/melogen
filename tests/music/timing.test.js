import { describe, it, expect } from 'vitest'
import { stepsPerBar, stepsPerBeat, stepSeconds, stepStrength, parseTimeSignature, genomeLength } from '../../src/music/timing.js'

describe('timing', () => {
  it('steps per bar', () => {
    expect(stepsPerBar('4/4')).toBe(16)
    expect(stepsPerBar('3/4')).toBe(12)
    expect(stepsPerBar('6/8')).toBe(12)
    expect(stepsPerBar('5/4')).toBe(20)
    expect(stepsPerBar('7/8')).toBe(14)
  })

  it('genome length is bars times steps per bar', () => {
    expect(genomeLength(8, '4/4')).toBe(128)
  })

  it('beat length', () => {
    expect(stepsPerBeat('4/4')).toBe(4)
    expect(stepsPerBeat('6/8')).toBe(6)
    expect(stepsPerBeat('7/8')).toBe(2)
  })

  it('step duration at 120 bpm is 125 ms', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125, 10)
  })

  it('metrical strength in 4/4', () => {
    expect([0, 1, 2, 3, 4, 8].map(s => stepStrength(s, '4/4'))).toEqual([3, 0, 1, 0, 2, 2])
  })

  it('rejects bad signatures', () => {
    expect(() => parseTimeSignature('4-4')).toThrow()
    expect(() => parseTimeSignature('4/5')).toThrow(/unsupported/)
  })
})

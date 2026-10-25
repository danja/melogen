import { describe, it, expect } from 'vitest'
import { notesToEvents, panicEvents, eventsBetween } from '../../src/midi/events.js'

const opts = { stepSeconds: 0.125, startTime: 1, sampleRate: 48000 }
const notes = [
  { startStep: 0, lengthSteps: 2, midi: 60, velocity: 80 },
  { startStep: 2, lengthSteps: 2, midi: 60, velocity: 100 },
  { startStep: 4, lengthSteps: 1, midi: 64, velocity: 90 }
]

describe('notesToEvents', () => {
  const events = notesToEvents(notes, opts)

  it('uses absolute frames from the context clock', () => {
    expect(events[0].frame).toBe(48000)
    expect(Array.from(events[0].bytes)).toEqual([0x90, 60, 80])
  })

  it('computes frames for a known melody at 120 bpm', () => {
    const ons = events.filter(e => e.bytes[0] === 0x90).map(e => e.frame)
    expect(ons).toEqual([48000, 48000 + 12000, 48000 + 24000])
  })

  it('is in non-decreasing frame order', () => {
    for (let i = 1; i < events.length; i++) expect(events[i].frame).toBeGreaterThanOrEqual(events[i - 1].frame)
  })

  it('has a note off for every note on, before the next on of the same pitch', () => {
    const second = events.findIndex(e => e.bytes[0] === 0x90 && e.bytes[2] === 100)
    expect(events[second - 1].bytes[0]).toBe(0x80)
    expect(events[second - 1].bytes[1]).toBe(60)
    expect(events.filter(e => e.bytes[0] === 0x80)).toHaveLength(3)
  })

  it('sends on the requested channel', () => {
    expect(notesToEvents(notes, { ...opts, channel: 3 })[0].bytes[0]).toBe(0x93)
  })
})

describe('panicEvents', () => {
  it('releases every pitch then sends CC 123', () => {
    const events = panicEvents(notes, 5000)
    expect(events.map(e => Array.from(e.bytes))).toEqual([[0x80, 60, 0], [0x80, 64, 0], [0xB0, 123, 0]])
    expect(events.every(e => e.frame === 5000)).toBe(true)
  })
})

describe('eventsBetween', () => {
  it('selects a half-open range', () => {
    const events = notesToEvents(notes, opts)
    const some = eventsBetween(events, 48000, 60000)
    expect(some.every(e => e.frame >= 48000 && e.frame < 60000)).toBe(true)
    expect(some.length).toBeGreaterThan(0)
  })
})

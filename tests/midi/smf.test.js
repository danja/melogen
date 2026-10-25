import { describe, it, expect } from 'vitest'
import { vlq, writeSmf, keySignature, PPQ } from '../../src/midi/smf.js'
import { readSmf, readVlq } from './smf-reader.js'
import { createGenome, NOTE, HOLD, REST } from '../../src/ga/genome.js'
import { decode } from '../../src/music/decode.js'

describe('vlq', () => {
  it('matches the specification vectors', () => {
    const cases = [[0, [0x00]], [0x40, [0x40]], [0x7F, [0x7F]], [0x80, [0x81, 0x00]],
      [0x2000, [0xC0, 0x00]], [0x3FFF, [0xFF, 0x7F]], [0x4000, [0x81, 0x80, 0x00]],
      [0x1FFFFF, [0xFF, 0xFF, 0x7F]], [0x0FFFFFFF, [0xFF, 0xFF, 0xFF, 0x7F]]]
    for (const [value, bytes] of cases) {
      expect(vlq(value)).toEqual(bytes)
      expect(readVlq(Uint8Array.from(bytes), 0)[0]).toBe(value)
    }
  })

  it('rejects negatives', () => {
    expect(() => vlq(-1)).toThrow()
  })
})

describe('key signature', () => {
  it('computes sharps and flats', () => {
    expect(keySignature(0, 'major')).toEqual([0, 0])
    expect(keySignature(7, 'major')).toEqual([1, 0])
    expect(keySignature(3, 'major')).toEqual([-3, 0])
    expect(keySignature(9, 'minor')).toEqual([0, 1])
    expect(keySignature(2, 'minor')).toEqual([-1, 1])
    expect(keySignature(0, 'blues')).toBeNull()
  })
})

describe('writeSmf', () => {
  const notes = [
    { startStep: 0, lengthSteps: 2, midi: 60, velocity: 80 },
    { startStep: 2, lengthSteps: 1, midi: 60, velocity: 100 },
    { startStep: 8, lengthSteps: 4, midi: 67, velocity: 120 }
  ]
  const file = writeSmf(notes, { tempo: 100, timeSignature: '6/8', totalSteps: 32, root: 7, scale: 'major', name: 'x' })
  const { header, events } = readSmf(file)

  it('has a format 0 header at 480 PPQ', () => {
    expect(header).toEqual({ format: 0, tracks: 1, ppq: PPQ })
  })

  it('writes tempo, time signature and key meta events', () => {
    const tempo = events.find(e => e.meta === 0x51)
    expect(tempo.data[0] * 65536 + tempo.data[1] * 256 + tempo.data[2]).toBe(600000)
    expect(events.find(e => e.meta === 0x58).data).toEqual([6, 3, 24, 8])
    expect(events.find(e => e.meta === 0x59).data).toEqual([1, 0])
    expect(events.find(e => e.meta === 0x03).data).toEqual([120])
  })

  it('writes every note on and off at the right ticks', () => {
    const ons = events.filter(e => e.kind === 0x90)
    const offs = events.filter(e => e.kind === 0x80)
    expect(ons.map(e => e.tick)).toEqual([0, 240, 960])
    expect(ons.map(e => e.data)).toEqual([[60, 80], [60, 100], [67, 120]])
    expect(offs.map(e => e.tick)).toEqual([234, 354, 1434])
  })

  it('never puts a note off before its on', () => {
    const open = new Map()
    for (const e of events) {
      if (e.kind === 0x90) open.set(e.data[0], e.tick)
      if (e.kind === 0x80) {
        expect(open.has(e.data[0])).toBe(true)
        expect(e.tick).toBeGreaterThan(open.get(e.data[0]))
        open.delete(e.data[0])
      }
    }
    expect(open.size).toBe(0)
  })

  it('ends the track at the full length', () => {
    const end = events[events.length - 1]
    expect(end.meta).toBe(0x2F)
    expect(end.tick).toBe(32 * 120)
  })

  it('writes a decoded genome', () => {
    const g = createGenome(16)
    ;[NOTE, HOLD, REST, NOTE].forEach((k, i) => { g.kind[i] = k })
    const out = readSmf(writeSmf(decode(g), { totalSteps: 16 }))
    expect(out.events.filter(e => e.kind === 0x90)).toHaveLength(2)
  })

  it('omits the key signature for scales without one', () => {
    const { events: e } = readSmf(writeSmf(notes, { scale: 'blues' }))
    expect(e.some(x => x.meta === 0x59)).toBe(false)
  })
})

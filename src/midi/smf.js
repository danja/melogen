// Standard MIDI File writer: format 0, one track, 480 PPQ. One step (a
// sixteenth) is 120 ticks.

import { GATE_GAP } from './events.js'

export const PPQ = 480
export const TICKS_PER_STEP = PPQ / 4

/** Variable-length quantity. */
export function vlq (value) {
  if (value < 0 || !Number.isInteger(value)) throw new Error(`bad VLQ value ${value}`)
  const bytes = [value & 0x7F]
  while ((value >>= 7) > 0) bytes.unshift((value & 0x7F) | 0x80)
  return bytes
}

const u32 = n => [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF]
const u16 = n => [(n >>> 8) & 0xFF, n & 0xFF]
const ascii = text => Array.from(text, c => c.charCodeAt(0))

// Sharps (+) or flats (-) of the major key on each root, C = 0.
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5]

/** [sharps/flats, 0 major | 1 minor], or null for scales without a key signature. */
export function keySignature (root, scale) {
  if (scale === 'major') return [MAJOR_FIFTHS[root % 12], 0]
  if (scale === 'minor') return [MAJOR_FIFTHS[(root + 3) % 12], 1]
  return null
}

/** Time signature meta payload: numerator, log2(denominator), 24 clocks, 8 thirty-seconds. */
function timeSignatureBytes (timeSignature) {
  const [numerator, denominator] = timeSignature.split('/').map(Number)
  return [numerator, Math.log2(denominator), 24, 8]
}

function meta (type, data) {
  return [0xFF, type, ...vlq(data.length), ...data]
}

/**
 * @param notes [{ startStep, lengthSteps, midi, velocity }]
 * @param opts { tempo, timeSignature, totalSteps, root, scale, name, channel }
 * @returns Uint8Array
 */
export function writeSmf (notes, {
  tempo = 120, timeSignature = '4/4', totalSteps = 0, root = 0, scale = 'major', name = '', channel = 0
} = {}) {
  const messages = []
  for (const note of notes) {
    const on = note.startStep * TICKS_PER_STEP
    const length = note.lengthSteps * TICKS_PER_STEP
    const off = on + Math.max(1, Math.round(length - TICKS_PER_STEP * GATE_GAP))
    messages.push({ tick: on, order: 1, bytes: [0x90 | channel, note.midi, note.velocity] })
    messages.push({ tick: off, order: 0, bytes: [0x80 | channel, note.midi, 0] })
  }
  // Offs before ons at the same tick, so a retriggered pitch is not cut short.
  messages.sort((a, b) => a.tick - b.tick || a.order - b.order)

  const track = []
  if (name) track.push(0, ...meta(0x03, ascii(name)))
  const microsPerQuarter = Math.round(60000000 / tempo)
  track.push(0, ...meta(0x51, [(microsPerQuarter >> 16) & 0xFF, (microsPerQuarter >> 8) & 0xFF, microsPerQuarter & 0xFF]))
  track.push(0, ...meta(0x58, timeSignatureBytes(timeSignature)))
  const key = keySignature(root, scale)
  if (key) track.push(0, ...meta(0x59, [key[0] & 0xFF, key[1]]))

  let tick = 0
  for (const message of messages) {
    track.push(...vlq(message.tick - tick), ...message.bytes)
    tick = message.tick
  }
  const endTick = Math.max(tick, totalSteps * TICKS_PER_STEP)
  track.push(...vlq(endTick - tick), ...meta(0x2F, []))

  return Uint8Array.from([
    ...ascii('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(PPQ),
    ...ascii('MTrk'), ...u32(track.length), ...track
  ])
}

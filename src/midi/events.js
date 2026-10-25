// Decoded notes -> timed MIDI messages for a Jig processor.
//
// A processor takes { frame, bytes }, where frame is an absolute stream
// position (docs/messaging.md in jigdaw): the audio context's sample clock,
// not an offset within a block.

/** The note-off comes this fraction of a step early so repeated pitches retrigger. */
export const GATE_GAP = 0.05

/**
 * @param notes [{ startStep, lengthSteps, midi, velocity }]
 * @param opts { stepSeconds, startTime (seconds on the context clock), sampleRate, channel }
 * @returns [{ frame, bytes: Uint8Array }] in non-decreasing frame order
 */
export function notesToEvents (notes, { stepSeconds, startTime, sampleRate, channel = 0 }) {
  const events = []
  for (const note of notes) {
    const on = startTime + note.startStep * stepSeconds
    const off = on + note.lengthSteps * stepSeconds * (1 - GATE_GAP)
    events.push({ order: 1, frame: Math.round(on * sampleRate), bytes: Uint8Array.of(0x90 | channel, note.midi, note.velocity) })
    events.push({ order: 0, frame: Math.round(off * sampleRate), bytes: Uint8Array.of(0x80 | channel, note.midi, 0) })
  }
  // Offs before ons at the same frame, so a retriggered pitch ends first.
  events.sort((a, b) => a.frame - b.frame || a.order - b.order)
  return events.map(({ frame, bytes }) => ({ frame, bytes }))
}

/** Note-off for every distinct pitch in the melody, then all-notes-off (CC 123). */
export function panicEvents (notes, frame, channel = 0) {
  const pitches = [...new Set(notes.map(n => n.midi))]
  const events = pitches.map(midi => ({ frame, bytes: Uint8Array.of(0x80 | channel, midi, 0) }))
  events.push({ frame, bytes: Uint8Array.of(0xB0 | channel, 123, 0) })
  return events
}

/** Events with from <= frame < to. */
export function eventsBetween (events, from, to) {
  return events.filter(e => e.frame >= from && e.frame < to)
}

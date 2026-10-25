// Test-only SMF reader, so the writer is checked against an independent parse.

export function readVlq (bytes, pos) {
  let value = 0
  let b
  do {
    b = bytes[pos++]
    value = (value << 7) | (b & 0x7F)
  } while (b & 0x80)
  return [value, pos]
}

const text = (bytes, from, to) => String.fromCharCode(...bytes.slice(from, to))

export function readSmf (bytes) {
  if (text(bytes, 0, 4) !== 'MThd') throw new Error('no MThd')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const header = { format: view.getUint16(8), tracks: view.getUint16(10), ppq: view.getUint16(12) }
  if (text(bytes, 14, 18) !== 'MTrk') throw new Error('no MTrk')
  const length = view.getUint32(18)
  if (22 + length !== bytes.length) throw new Error(`track length ${length} does not match file`)

  const events = []
  let pos = 22
  let tick = 0
  while (pos < bytes.length) {
    let delta
    ;[delta, pos] = readVlq(bytes, pos)
    tick += delta
    const status = bytes[pos++]
    if (status === 0xFF) {
      const type = bytes[pos++]
      let len
      ;[len, pos] = readVlq(bytes, pos)
      events.push({ tick, meta: type, data: Array.from(bytes.slice(pos, pos + len)) })
      pos += len
    } else {
      const kind = status & 0xF0
      const data = [bytes[pos], bytes[pos + 1]]
      pos += 2
      events.push({ tick, kind, channel: status & 0x0F, data })
    }
  }
  return { header, events }
}

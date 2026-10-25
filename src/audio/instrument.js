// Reading and setting a plugin's control parameters. Each port's lv2:symbol is
// the AudioParam name on the node.

export function clampToPort (port, value) {
  let v = Number(value)
  if (Number.isNaN(v)) v = port.default
  v = Math.max(port.minimum, Math.min(port.maximum, v))
  if (port.properties.includes('integer') || port.properties.includes('enumeration') || port.properties.includes('toggled')) {
    v = Math.round(v)
  }
  return v
}

export function defaultValues (ports) {
  return Object.fromEntries(ports.map(port => [port.symbol, port.default]))
}

/** Stored values merged over defaults, ignoring unknown symbols and clamping the rest. */
export function mergeValues (ports, stored = {}) {
  const out = defaultValues(ports)
  for (const port of ports) {
    if (port.symbol in stored) out[port.symbol] = clampToPort(port, stored[port.symbol])
  }
  return out
}

export function setParam (node, symbol, value) {
  const param = node.parameters?.get(symbol)
  if (param) param.value = value
  return Boolean(param)
}

export function applyValues (node, values) {
  for (const [symbol, value] of Object.entries(values)) setParam(node, symbol, value)
}

/** Control kind to draw for a port. */
export function controlKind (port) {
  if (port.properties.includes('toggled')) return 'toggle'
  if (port.properties.includes('enumeration') && port.scalePoints.length > 0) return 'select'
  return 'slider'
}

/**
 * Slider position (0..1) <-> value. A range spanning many octaves (a decay of
 * 0.1 to 20 s, a cutoff of 100 to 18000 Hz) is far easier to play on a log
 * scale; the profile has no hint for it, so it is inferred from the range.
 */
export function sliderMap (port) {
  const { minimum: lo, maximum: hi } = port
  const log = lo > 0 && hi / lo >= 50 && controlKind(port) === 'slider'
  if (log) {
    const ratio = Math.log(hi / lo)
    return { log: true, toPosition: v => Math.log(Math.max(v, lo) / lo) / ratio, fromPosition: t => lo * Math.exp(ratio * t) }
  }
  return { log: false, toPosition: v => (hi === lo ? 0 : (v - lo) / (hi - lo)), fromPosition: t => lo + (hi - lo) * t }
}

const UNIT_LABEL = { s: 's', ms: 'ms', hz: 'Hz', db: 'dB', semitone12TET: 'st', pc: '%', khz: 'kHz', bpm: 'bpm' }

/** A short readout: 3 significant digits and the unit if there is one. */
export function formatValue (port, value) {
  let text
  if (port.properties.includes('integer') || port.properties.includes('enumeration')) text = String(Math.round(value))
  else if (Math.abs(value) >= 100) text = String(Math.round(value))
  else text = String(Number(value.toPrecision(3)))
  const unit = port.unit ? (UNIT_LABEL[port.unit.toLowerCase()] ?? UNIT_LABEL[port.unit] ?? '') : ''
  return unit ? `${text} ${unit}` : text
}

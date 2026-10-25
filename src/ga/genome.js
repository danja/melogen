// A genome is a fixed-length grid of steps. Each step has a kind, a scale
// degree and an accent level, kept in three typed arrays so cloning,
// comparing and storing are cheap. See docs/algorithm.md section 3.

export const REST = 0
export const NOTE = 1
export const HOLD = 2

export function createGenome (length, { id = '', parents = [], origin = 'random' } = {}) {
  return {
    id,
    kind: new Uint8Array(length),
    degree: new Uint8Array(length),
    velocity: new Uint8Array(length),
    parents: parents.slice(),
    origin
  }
}

export function genomeLength (genome) {
  return genome.kind.length
}

export function cloneGenome (genome, overrides = {}) {
  return {
    id: genome.id,
    kind: genome.kind.slice(),
    degree: genome.degree.slice(),
    velocity: genome.velocity.slice(),
    parents: genome.parents.slice(),
    origin: genome.origin,
    ...overrides
  }
}

/** Equality of the sounding content: ignores id, parents and origin. */
export function sameMusic (a, b) {
  if (a.kind.length !== b.kind.length) return false
  for (let i = 0; i < a.kind.length; i++) {
    if (a.kind[i] !== b.kind[i]) return false
    if (a.kind[i] === NOTE && (a.degree[i] !== b.degree[i] || a.velocity[i] !== b.velocity[i])) return false
  }
  return true
}

/** Copy `count` steps from `source` at `from` into `target` at `to`. */
export function copySteps (target, to, source, from, count) {
  target.kind.set(source.kind.subarray(from, from + count), to)
  target.degree.set(source.degree.subarray(from, from + count), to)
  target.velocity.set(source.velocity.subarray(from, from + count), to)
}

/**
 * Resize to a new number of bars. Shorter truncates; longer appends the
 * existing bars, cycling in order.
 */
export function resizeGenome (genome, bars, perBar) {
  const length = bars * perBar
  if (length === genome.kind.length) return cloneGenome(genome)
  const out = createGenome(length, genome)
  const have = Math.floor(genome.kind.length / perBar)
  if (have === 0) return out
  for (let bar = 0; bar < bars; bar++) {
    copySteps(out, bar * perBar, genome, (bar % have) * perBar, perBar)
  }
  return out
}

const toArray = typed => Array.from(typed)

export function genomeToJSON (genome) {
  return {
    id: genome.id,
    kind: toArray(genome.kind),
    degree: toArray(genome.degree),
    velocity: toArray(genome.velocity),
    parents: genome.parents,
    origin: genome.origin
  }
}

export function genomeFromJSON (json) {
  const length = json.kind.length
  if (json.degree.length !== length || json.velocity.length !== length) {
    throw new Error('genome arrays differ in length')
  }
  return {
    id: String(json.id ?? ''),
    kind: Uint8Array.from(json.kind),
    degree: Uint8Array.from(json.degree),
    velocity: Uint8Array.from(json.velocity),
    parents: Array.isArray(json.parents) ? json.parents.map(String) : [],
    origin: String(json.origin ?? 'random')
  }
}

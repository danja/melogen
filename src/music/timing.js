// The step grid: one step is a sixteenth note.

export const DENOMINATORS = Object.freeze([2, 4, 8, 16])
export const TIME_SIGNATURES = Object.freeze(['4/4', '3/4', '6/8', '5/4', '7/8'])

export function parseTimeSignature (text) {
  const match = /^(\d+)\/(\d+)$/.exec(String(text))
  if (!match) throw new Error(`bad time signature "${text}"`)
  const numerator = Number(match[1])
  const denominator = Number(match[2])
  if (numerator < 1 || !DENOMINATORS.includes(denominator)) {
    throw new Error(`unsupported time signature "${text}"`)
  }
  return { numerator, denominator }
}

export function stepsPerBar (timeSignature) {
  const { numerator, denominator } = parseTimeSignature(timeSignature)
  return (numerator * 16) / denominator
}

/** 6/8, 9/8 and 12/8 count in dotted beats of three eighths. */
function isCompound ({ numerator, denominator }) {
  return denominator === 8 && numerator >= 6 && numerator % 3 === 0
}

/** Steps in one beat: 4 for x/4, 6 for compound x/8, 2 for other x/8. */
export function stepsPerBeat (timeSignature) {
  const ts = parseTimeSignature(timeSignature)
  if (isCompound(ts)) return 6
  return 16 / ts.denominator
}

/** Seconds per step. Tempo is quarter notes per minute. */
export function stepSeconds (tempo) {
  return 60 / tempo / 4
}

/**
 * Metrical weight of a step within its bar: 3 downbeat, 2 beat,
 * 1 off-beat eighth, 0 sixteenth.
 */
export function stepStrength (stepInBar, timeSignature) {
  if (stepInBar === 0) return 3
  if (stepInBar % stepsPerBeat(timeSignature) === 0) return 2
  if (stepInBar % 2 === 0) return 1
  return 0
}

export function genomeLength (bars, timeSignature) {
  return bars * stepsPerBar(timeSignature)
}

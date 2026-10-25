// Every tunable value from docs/algorithm.md, in one place. Functions take
// these as a parameter (defaulting to this object) so tests can override any
// of them.

export const DEFAULTS = Object.freeze({
  N: 20,
  K: 5,
  E: 2,
  IMMIGRANT_FRACTION: 0.1,
  TOURNAMENT: 3,
  SIGMA: 0.18,
  GAMMA: 0.7,
  LAMBDA: 0.5,
  KAPPA: 0.6,
  BETA: 0.5,
  ARCHIVE_MAX: 200,
  ELITE_ESTIMATE_MIN: 0.3,
  DIST_WEIGHTS: Object.freeze({ rhythm: 0.4, pitch: 0.35, contour: 0.25 }),
  POINT_RATE_FACTOR: 0.25,
  SEGMENT_RATE_FACTOR: 0.5,
  CROSSOVER_WEIGHTS: Object.freeze({ barOne: 0.4, barTwo: 0.3, barUniform: 0.2, beatOne: 0.1 }),
  DEDUP_TRIES: 3
})

/** MIDI velocity for the genome's four accent levels. */
export const VELOCITY_LEVELS = Object.freeze([60, 80, 100, 120])

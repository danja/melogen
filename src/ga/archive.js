// The archive keeps rated genomes from earlier generations so the estimator
// can still learn from them. Capped, oldest dropped first.

import { genomeToJSON, genomeFromJSON } from './genome.js'

/** @returns new archive array; an entry with the same genome id is replaced. */
export function addToArchive (archive, genome, rating, generation, max) {
  const kept = archive.filter(entry => entry.genome.id !== genome.id)
  kept.push({ genome, rating, generation })
  return kept.length > max ? kept.slice(kept.length - max) : kept
}

/**
 * Evidence for the estimator: the current generation's ratings (age 0)
 * followed by archived ones, skipping archive entries superseded by an
 * entry of the same id in the current generation.
 *
 * @param current [{ genome, rating }] with rating null for unrated
 */
export function buildEvidence (current, archive, generation) {
  const evidence = []
  const seen = new Set()
  for (const entry of current) {
    if (entry.rating === null) continue
    seen.add(entry.genome.id)
    evidence.push({ genome: entry.genome, rating: entry.rating, age: 0 })
  }
  for (const entry of archive) {
    if (seen.has(entry.genome.id)) continue
    evidence.push({ genome: entry.genome, rating: entry.rating, age: Math.max(0, generation - entry.generation) })
  }
  return evidence
}

export function archiveToJSON (archive) {
  return archive.map(e => ({ genome: genomeToJSON(e.genome), rating: e.rating, generation: e.generation }))
}

export function archiveFromJSON (json) {
  return json.map(e => ({ genome: genomeFromJSON(e.genome), rating: e.rating, generation: e.generation }))
}

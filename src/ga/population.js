// One run of the GA: the current generation, the user's ratings, the archive
// of earlier ratings, and which five melodies are on screen.

import { genomeToJSON, genomeFromJSON, resizeGenome } from './genome.js'
import { generateGenome } from './generate.js'
import { estimateFitness } from './estimate.js'
import { addToArchive, buildEvidence, archiveToJSON, archiveFromJSON } from './archive.js'
import { chooseToShow } from './choose.js'
import { evolveGeneration } from './evolve.js'

export class Population {
  constructor () {
    this.generation = 0
    this.entries = []
    this.archive = []
    this.rows = []     // indices into entries: what the five rows show
    this.round = 0
  }

  /** A fresh random population, with its first round already chosen. */
  static create (ctx) {
    const pop = new Population()
    for (let i = 0; i < ctx.params.N; i++) {
      pop.entries.push(blank(generateGenome(ctx, { id: `g0-${i}`, origin: 'random' })))
    }
    pop.showNext(ctx)
    return pop
  }

  rate (index, rating) {
    const entry = this.entries[index]
    entry.rating = rating
    entry.voted = rating !== null
    entry.carried = false // once the person has touched it, it is theirs
  }

  get ratedCount () { return this.entries.filter(e => e.rating !== null && !e.carried).length }
  get canEvolve () { return this.entries.some(e => e.voted) }
  get canShowMore () { return this.entries.some(isCandidate) }

  evidence () {
    return buildEvidence(this.entries, this.archive, this.generation)
  }

  /** Estimated fitness and uncertainty for every entry (a rated one is its rating, u = 0). */
  estimates (ctx) {
    const evidence = this.evidence()
    return this.entries.map(entry => {
      if (entry.rating !== null) return { f: entry.rating, u: 0 }
      return estimateFitness(entry.genome, evidence, entry.prior, ctx)
    })
  }

  /** Choose and mark the next five melodies; returns their indices (empty if none are left). */
  showNext (ctx) {
    const estimates = this.estimates(ctx)
    const K = ctx.params.K
    const picked = []

    // The first round may carry one liked elite as a pre-rated reference.
    if (this.round === 0) {
      const carried = this.entries.findIndex(e => e.carried && !e.shown)
      if (carried >= 0) { picked.push(carried); this.entries[carried].shown = true }
    }

    const candidates = []
    this.entries.forEach((entry, index) => {
      if (isCandidate(entry)) candidates.push({ index, genome: entry.genome, ...estimates[index] })
    })
    for (const index of chooseToShow(candidates, K - picked.length, ctx)) {
      picked.push(index)
      this.entries[index].shown = true
    }

    this.rows = ctx.rng.shuffle(picked)
    if (this.rows.length > 0) this.round++
    return this.rows
  }

  /** Breed the next generation from the ratings so far. */
  evolve (ctx) {
    for (const entry of this.entries) {
      if (entry.rating !== null) {
        this.archive = addToArchive(this.archive, entry.genome, entry.rating, this.generation, ctx.params.ARCHIVE_MAX)
      }
    }
    const estimates = this.estimates(ctx)
    const fitness = index => estimates[index].f
    this.generation += 1
    this.entries = evolveGeneration(this.entries, fitness, this.generation, ctx)
    this.rows = []
    this.round = 0
    return this.showNext(ctx)
  }

  /** Change the number of bars, keeping the time signature. */
  resize (bars, perBar) {
    const fit = g => resizeGenome(g, bars, perBar)
    for (const entry of this.entries) entry.genome = fit(entry.genome)
    for (const entry of this.archive) entry.genome = fit(entry.genome)
  }

  toJSON () {
    return {
      generation: this.generation,
      round: this.round,
      rows: this.rows,
      entries: this.entries.map(e => ({ ...e, genome: genomeToJSON(e.genome) })),
      archive: archiveToJSON(this.archive)
    }
  }

  static fromJSON (json) {
    const pop = new Population()
    pop.generation = json.generation
    pop.round = json.round
    pop.rows = json.rows
    pop.entries = json.entries.map(e => ({ ...e, genome: genomeFromJSON(e.genome) }))
    pop.archive = archiveFromJSON(json.archive)
    return pop
  }
}

function blank (genome) {
  return { genome, rating: null, voted: false, carried: false, shown: false, prior: 0 }
}

/** Not yet shown, and not a liked elite that already has its rating. */
function isCandidate (entry) {
  return !entry.shown && !(entry.carried && entry.rating !== null)
}

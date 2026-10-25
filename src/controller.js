// The app's logic with no DOM: settings, the population, voting, playback and
// export. The views read `viewModel()` and call these methods; every change
// notifies subscribers and schedules a save.

import { makeContext } from './ga/context.js'
import { Population } from './ga/population.js'
import { createRng } from './util/rng.js'
import { decode } from './music/decode.js'
import { stepSeconds, stepsPerBar } from './music/timing.js'
import { writeSmf } from './midi/smf.js'
import { DEFAULT_SETTINGS, applyChange, describeChange } from './state/settings.js'
import { loadState, saveState, clearState } from './state/store.js'

export const SAVE_DELAY_MS = 400

// Wrapped: a browser's setTimeout throws "Illegal invocation" if called as a method of another object.
const DEFAULT_TIMERS = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) }

export class Controller {
  /**
   * @param storage localStorage-like
   * @param session InstrumentSession
   * @param player Player
   * @param seed for the random generator when nothing is saved
   * @param timers { set, clear } for the debounced save
   */
  constructor ({ storage, session, player, seed = (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0, timers = DEFAULT_TIMERS }) {
    this.storage = storage
    this.session = session
    this.player = player
    this.timers = timers
    this.listeners = new Set()
    this.saveTimer = null
    this.rng = createRng(seed)
    this.settings = { ...DEFAULT_SETTINGS }
    this.population = null
    this.playing = null // position of the playing row
    this.restore()
    player.onChange = key => { this.playing = key; this.emit() }
  }

  restore () {
    const saved = loadState(this.storage)
    if (saved) {
      this.settings = saved.settings
      if (saved.rngState !== null) this.rng.setState(saved.rngState)
      if (saved.population) {
        try {
          const population = Population.fromJSON(saved.population)
          if (this.matches(population)) this.population = population
        } catch { /* a bad save is ignored */ }
      }
    }
    if (!this.population) this.population = Population.create(this.ctx())
  }

  /** A saved population is only usable if its genomes fit the saved settings. */
  matches (population) {
    const length = this.settings.bars * stepsPerBar(this.settings.timeSignature)
    return population.entries.length > 0 && population.entries.every(e => e.genome.kind.length === length)
  }

  ctx () { return makeContext(this.settings, this.rng) }

  subscribe (listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit () {
    for (const listener of this.listeners) listener(this)
    this.scheduleSave()
  }

  scheduleSave () {
    if (this.saveTimer !== null) this.timers.clear(this.saveTimer)
    this.saveTimer = this.timers.set(() => this.saveNow(), SAVE_DELAY_MS)
  }

  saveNow () {
    this.saveTimer = null
    return saveState(this.storage, {
      settings: this.settings, population: this.population.toJSON(), rngState: this.rng.getState()
    })
  }

  // ---- settings --------------------------------------------------------

  /**
   * @returns { ok: true } or { needsConfirm: 'timeSignature' } when the change would discard the population
   */
  setSettings (patch, { confirmed = false } = {}) {
    const next = applyChange(this.settings, patch)
    const effect = describeChange(this.settings, next)
    if (effect.newPopulation && !confirmed) return { needsConfirm: 'timeSignature' }
    if (effect.affectsPlayback) this.player.stop()
    this.settings = next
    if (effect.newPopulation) this.population = Population.create(this.ctx())
    else if (effect.resize) this.population.resize(next.bars, stepsPerBar(next.timeSignature))
    this.emit()
    return { ok: true }
  }

  // ---- the five rows ---------------------------------------------------

  /** Vote on a row; voting the same value again clears it. */
  vote (position, rating) {
    const index = this.population.rows[position]
    if (index === undefined) return
    const current = this.population.entries[index].rating
    this.population.rate(index, current === rating && this.population.entries[index].voted ? null : rating)
    this.emit()
  }

  more () {
    if (!this.population.canShowMore) return
    this.player.stop()
    this.population.showNext(this.ctx())
    this.emit()
  }

  evolve () {
    if (!this.population.canEvolve) return
    this.player.stop()
    this.population.evolve(this.ctx())
    this.emit()
  }

  newPopulation () {
    this.player.stop()
    this.population = Population.create(this.ctx())
    this.emit()
  }

  /** Forget the saved session and start again with the defaults. */
  resetAll () {
    this.player.stop()
    clearState(this.storage)
    this.settings = { ...DEFAULT_SETTINGS }
    this.population = Population.create(this.ctx())
    this.emit()
  }

  // ---- playback and export ---------------------------------------------

  genomeAt (position) {
    const index = this.population.rows[position]
    return index === undefined ? null : this.population.entries[index].genome
  }

  melodyAt (position) {
    const genome = this.genomeAt(position)
    if (!genome) return null
    const s = this.settings
    return {
      notes: decode(genome, s),
      totalSteps: genome.kind.length,
      stepSeconds: stepSeconds(s.tempo)
    }
  }

  /** Start or stop a row. Loads the instrument first if needed. */
  async togglePlay (position) {
    if (this.player.playingKey === position) { this.player.stop(); return }
    const melody = this.melodyAt(position)
    if (!melody) return
    // Inside the tap, before any await: browsers only start audio from a gesture.
    const unlocked = this.session.unlock()
    this.player.stop()
    const ready = await this.session.ensure()
    if (!ready) return
    if (!(await unlocked)) {
      this.session.notify('Your browser has not started audio yet. Tap Play again.')
      return
    }
    this.session.clearNotice()
    this.player.play(position, melody, { loop: this.settings.loop })
  }

  stop () { this.player.stop() }

  /** @returns { bytes, filename } for the row's .mid file */
  midiAt (position) {
    const genome = this.genomeAt(position)
    if (!genome) return null
    const s = this.settings
    const bytes = writeSmf(decode(genome, s), {
      tempo: s.tempo,
      timeSignature: s.timeSignature,
      totalSteps: genome.kind.length,
      root: s.root,
      scale: s.scale,
      name: `Melogen ${genome.id}`
    })
    return { bytes, filename: `melogen-${genome.id}.mid` }
  }

  // ---- what the views draw ---------------------------------------------

  viewModel () {
    const pop = this.population
    return {
      settings: this.settings,
      generation: pop.generation,
      round: pop.round,
      populationSize: pop.entries.length,
      duration: this.settings.bars * stepsPerBar(this.settings.timeSignature) * stepSeconds(this.settings.tempo),
      ratedCount: pop.ratedCount,
      canMore: pop.canShowMore,
      canEvolve: pop.canEvolve,
      rows: pop.rows.map((index, position) => {
        const entry = pop.entries[index]
        return {
          position,
          id: entry.genome.id,
          rating: entry.rating,
          carried: entry.carried,
          origin: entry.genome.origin,
          parents: entry.genome.parents,
          playing: this.playing === position
        }
      })
    }
  }
}

// The instrument as the app sees it: which plugin, whether it is loaded, its
// control values, and the catalogue to choose from. Wraps the engine and the
// stored choice; the views and the controller talk to this.

import { choosePlugin, savePlugin, loadValues, saveValues, normalizeIri } from './plugin-choice.js'
import { mergeValues, applyValues, setParam, clampToPort } from './instrument.js'
import { fetchCatalogue } from './catalogue.js'
import { offeredCapabilities } from './capabilities.js'

export class InstrumentSession {
  constructor ({ engine, storage, defaultIri, catalogueUrl, search = '', fetchImpl, offered = offeredCapabilities() }) {
    this.engine = engine
    this.storage = storage
    this.catalogueUrl = catalogueUrl
    this.fetchImpl = fetchImpl
    this.offered = offered
    const chosen = choosePlugin({ storage, search, defaultIri })
    this.iri = chosen.iri
    this.source = chosen.source
    this.status = { state: 'idle', message: '' } // idle | loading | ready | error
    this.error = null // the last load failure; the previous plugin may still be ready
    this.profile = null
    this.values = {}
    this.catalogue = []
    this.catalogueError = null
    this.listeners = new Set()
    this.pending = null
  }

  subscribe (listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit () { for (const listener of this.listeners) listener(this) }

  setStatus (state, message = '') {
    this.status = { state, message }
    this.emit()
  }

  get ready () { return this.status.state === 'ready' && this.engine.current !== null }

  /** Load the current plugin if it is not loaded. Safe to call repeatedly. */
  ensure () {
    if (this.ready) return Promise.resolve(true)
    if (this.pending) return this.pending
    return this.load(this.iri)
  }

  /**
   * Load `iri`. On success it becomes the stored choice (unless it came from ?plugin=);
   * on failure the previous plugin keeps playing and the error is reported.
   */
  load (iri, { remember = this.source !== 'url' } = {}) {
    const target = normalizeIri(iri)
    if (!target) {
      this.error = `"${iri}" is not a web address`
      this.setStatus(this.engine.current ? 'ready' : 'error', this.profile?.label ?? this.error)
      return Promise.resolve(false)
    }
    const hadPlugin = this.engine.current !== null
    this.error = null
    this.setStatus('loading', `Loading ${target}`)
    const run = async () => {
      try {
        const plugin = await this.engine.load(target)
        this.iri = target
        this.profile = plugin.profile
        this.values = mergeValues(plugin.profile.ports, loadValues(this.storage, target))
        applyValues(plugin.node, this.values)
        if (remember) savePlugin(this.storage, target)
        this.source = remember ? 'stored' : this.source
        this.setStatus('ready', plugin.profile.label)
        return true
      } catch (error) {
        const kept = hadPlugin && this.profile ? ` Still using ${this.profile.label}.` : ''
        this.error = `${error.message}${kept}`
        this.setStatus(hadPlugin ? 'ready' : 'error', hadPlugin ? this.profile.label : error.message)
        return false
      } finally {
        this.pending = null
      }
    }
    this.pending = run()
    return this.pending
  }

  async loadCatalogue () {
    try {
      this.catalogue = await fetchCatalogue(this.catalogueUrl, this.offered, this.fetchImpl)
      this.catalogueError = null
    } catch (error) {
      this.catalogueError = error.message
    }
    this.emit()
  }

  setValue (symbol, value) {
    const port = this.profile?.ports.find(p => p.symbol === symbol)
    if (!port) return
    this.values[symbol] = clampToPort(port, value)
    if (this.engine.current) setParam(this.engine.current.node, symbol, this.values[symbol])
    saveValues(this.storage, this.iri, this.values)
    this.emit()
  }

  resetValues () {
    if (!this.profile) return
    this.values = mergeValues(this.profile.ports, {})
    if (this.engine.current) applyValues(this.engine.current.node, this.values)
    saveValues(this.storage, this.iri, this.values)
    this.emit()
  }
}

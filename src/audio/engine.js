// Owns the AudioContext and the currently loaded plugin. The context is made
// on the first user gesture; loading a plugin replaces the previous one.

import { loadPlugin } from './jig-loader.js'

export class AudioEngine {
  constructor ({ AudioContextImpl = globalThis.AudioContext, loader = loadPlugin, loaderOptions = {} } = {}) {
    this.AudioContextImpl = AudioContextImpl
    this.loader = loader
    this.loaderOptions = loaderOptions
    this.context = null
    this.plugin = null
    this.loading = null
  }

  /** Create (once) and resume the context. Call from a user gesture. */
  async ensureContext () {
    if (!this.context) this.context = new this.AudioContextImpl({ latencyHint: 'interactive' })
    if (this.context.state === 'suspended') await this.context.resume()
    return this.context
  }

  /** What the player needs, or null while no instrument is loaded. */
  get current () {
    return this.plugin && this.context ? { context: this.context, node: this.plugin.node } : null
  }

  /**
   * Load a plugin, replacing the current one. On failure the current one is kept.
   * Calls are serialised, so the last request wins and none overlap.
   */
  load (iri, options = {}) {
    const run = async () => {
      const context = await this.ensureContext()
      const next = await this.loader(iri, context, { ...this.loaderOptions, ...options })
      const previous = this.plugin
      this.plugin = next
      previous?.dispose()
      return next
    }
    this.loading = (this.loading ?? Promise.resolve()).catch(() => {}).then(run)
    return this.loading
  }
}

// Owns the AudioContext and the currently loaded plugin. The context is made
// on the first user gesture; loading a plugin replaces the previous one.
//
// Starting audio is never awaited as part of loading. A browser only lets a
// context start from a real tap or key press (on iOS, touchend or click, not
// pointerdown), and a resume() made at any other moment can stay pending for
// good, which used to leave the instrument "loading" forever. So loading
// proceeds on a suspended context, and `unlock()` is called from every gesture.

import { loadPlugin } from './jig-loader.js'
import { createMeter } from './meter.js'

export class AudioEngine {
  constructor ({ AudioContextImpl = globalThis.AudioContext, loader = loadPlugin, loaderOptions = {} } = {}) {
    this.AudioContextImpl = AudioContextImpl
    this.loader = loader
    this.loaderOptions = loaderOptions
    this.context = null
    this.plugin = null
    this.loading = null
    this.meter = null
  }

  /** Create the context if needed and ask it to start, without waiting for it. */
  ensureContext () {
    if (!this.context) {
      this.context = new this.AudioContextImpl({ latencyHint: 'interactive' })
      // iOS mutes Web Audio while the ringer switch is silent, unless the page says it is playing media.
      try { if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = 'playback' } catch { /* not supported */ }
    }
    if (this.context.state !== 'running') Promise.resolve(this.context.resume?.()).catch(() => {})
    return this.context
  }

  /**
   * Call from inside a tap or key press, before any await. Starts the context,
   * plays one silent sample (what unlocks older iOS), and resolves true once
   * it is running, or false if the browser has not allowed it within the time.
   */
  unlock (timeoutMs = 1500) {
    const context = this.ensureContext()
    try {
      const source = context.createBufferSource()
      source.buffer = context.createBuffer(1, 1, context.sampleRate)
      source.connect(context.destination)
      source.start(0)
    } catch { /* a fake or locked-down context */ }
    return this.whenRunning(timeoutMs)
  }

  whenRunning (timeoutMs) {
    const context = this.context
    if (!context || context.state === 'running') return Promise.resolve(Boolean(context))
    return new Promise(resolve => {
      const finish = ok => {
        clearTimeout(timer)
        context.removeEventListener?.('statechange', onChange)
        resolve(ok)
      }
      const onChange = () => { if (context.state === 'running') finish(true) }
      const timer = setTimeout(() => finish(context.state === 'running'), timeoutMs)
      context.addEventListener?.('statechange', onChange)
    })
  }

  /**
   * A beep straight to the output, not through any plugin. If this is silent
   * the fault is the browser's audio output, not the instrument. Call inside a tap.
   */
  testTone (seconds = 0.5) {
    const context = this.ensureContext()
    const started = this.unlock()
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 440
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02)
    gain.gain.setValueAtTime(0.15, now + seconds - 0.05)
    gain.gain.linearRampToValueAtTime(0, now + seconds)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + seconds)
    return started
  }

  get running () { return this.context?.state === 'running' }

  /** What the player needs, or null while no instrument is loaded. */
  get current () {
    return this.plugin && this.context ? { context: this.context, node: this.plugin.node } : null
  }

  /** Peak level (0 to 1) of what the instrument is producing, or null if nothing is loaded. */
  level () {
    const current = this.current
    if (!current) return null
    if (!this.meter || this.meter.node !== current.node) {
      this.meter?.dispose()
      this.meter = createMeter(current.context, current.node)
    }
    return this.meter.read()
  }

  /**
   * Load a plugin, replacing the current one. On failure the current one is kept.
   * Calls are serialised, so the last request wins and none overlap.
   */
  load (iri, options = {}) {
    const run = async () => {
      const context = this.ensureContext()
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

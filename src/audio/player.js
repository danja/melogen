// Plays one melody at a time through the loaded plugin.
//
// Events carry absolute frames on the audio context's clock. They are posted
// a short way ahead of the playhead rather than all at once, so a plugin's
// bounded event queue is never the limit. A processor has no way to drop
// queued events, so stopping cannot recall what was already posted: it sends
// all-notes-off now and again once the posted window has passed, and a melody
// started right afterwards waits until then.

import { notesToEvents, panicEvents } from '../midi/events.js'

export const LOOKAHEAD = 0.2
export const TICK_MS = 40
export const START_DELAY = 0.05

// Wrapped, not `{ set: setInterval }`: a browser's setInterval throws
// "Illegal invocation" when called as a method of another object.
const DEFAULT_TIMERS = { set: (fn, ms) => setInterval(fn, ms), clear: id => clearInterval(id) }

export class Player {
  /**
   * @param getEngine () => { context, node } | null
   * @param onChange (key | null) => void, called when the playing melody changes
   */
  constructor ({ getEngine, onChange = () => {}, timers = DEFAULT_TIMERS }) {
    this.getEngine = getEngine
    this.onChange = onChange
    this.timers = timers
    this.session = null
    this.timer = null
    this.cleanupUntil = 0
    this.posted = 0 // events sent to the plugin, for diagnostics
  }

  get playingKey () { return this.session?.key ?? null }

  /**
   * @param key identifies the melody (a row) for onChange
   * @param melody { notes, totalSteps, stepSeconds }
   * @returns false if no instrument is loaded
   */
  play (key, melody, { loop = false } = {}) {
    const engine = this.getEngine()
    if (!engine) return false
    if (this.session) this.stop()

    const { context } = engine
    const start = Math.max(context.currentTime + START_DELAY, this.cleanupUntil)
    const length = melody.totalSteps * melody.stepSeconds
    const session = {
      key, melody, engine, cycleStart: start, cycleEnd: start + length, length, next: 0, events: []
    }
    session.events = this.cycleEvents(session)
    session.loop = loop && session.events.length > 0
    this.session = session
    this.timer = this.timers.set(() => this.tick(), TICK_MS)
    this.tick()
    this.onChange(key)
    return true
  }

  cycleEvents (session) {
    const { melody, engine, cycleStart } = session
    return notesToEvents(melody.notes, {
      stepSeconds: melody.stepSeconds, startTime: cycleStart, sampleRate: engine.context.sampleRate
    })
  }

  tick () {
    const s = this.session
    if (!s) return
    const { context, node } = s.engine
    const horizon = (context.currentTime + LOOKAHEAD) * context.sampleRate

    for (;;) {
      const batch = []
      while (s.next < s.events.length && s.events[s.next].frame < horizon) batch.push(s.events[s.next++])
      if (batch.length > 0) { node.port.postMessage({ type: 'events', events: batch }); this.posted += batch.length }
      if (s.next < s.events.length || !s.loop) break
      s.cycleStart = s.cycleEnd
      s.cycleEnd += s.length
      s.events = this.cycleEvents(s)
      s.next = 0
    }

    if (!s.loop && s.next >= s.events.length && context.currentTime >= s.cycleEnd) this.finish()
  }

  finish () {
    this.clearTimer()
    this.session = null
    this.onChange(null)
  }

  clearTimer () {
    if (this.timer !== null) this.timers.clear(this.timer)
    this.timer = null
  }

  stop () {
    const s = this.session
    if (!s) return
    this.clearTimer()
    this.session = null
    const { context, node } = s.engine
    const now = Math.round(context.currentTime * context.sampleRate)
    const later = Math.round((context.currentTime + LOOKAHEAD + 0.02) * context.sampleRate)
    node.port.postMessage({ type: 'events', events: panicEvents(s.melody.notes, now) })
    node.port.postMessage({ type: 'events', events: panicEvents(s.melody.notes, later) })
    this.cleanupUntil = context.currentTime + LOOKAHEAD + 0.05
    this.onChange(null)
  }

  /** A short note, to hear an instrument setting. */
  audition (midi = 60, seconds = 0.6) {
    const engine = this.getEngine()
    if (!engine) return false
    const { context, node } = engine
    const events = notesToEvents([{ startStep: 0, lengthSteps: 1, midi, velocity: 100 }], {
      stepSeconds: seconds, startTime: context.currentTime + 0.02, sampleRate: context.sampleRate
    })
    node.port.postMessage({ type: 'events', events })
    return true
  }
}

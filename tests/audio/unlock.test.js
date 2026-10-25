import { describe, it, expect, vi } from 'vitest'
import { AudioEngine } from '../../src/audio/engine.js'
import { installUnlock } from '../../src/audio/unlock.js'
import { createMeter } from '../../src/audio/meter.js'
import { diagnosticsText, describeBeep } from '../../src/diagnostics.js'
import { loadPlugin } from '../../src/audio/jig-loader.js'
import { InstrumentSession } from '../../src/audio/session.js'
import { fakeContext, fakeNodeClass, fakeFetch, buildPlugin, fakeStorage } from './fakes.js'

/** A context that behaves like iOS before a tap: resume() never settles and it stays suspended. */
function lockedContext () {
  const listeners = new Set()
  const context = {
    ...fakeContext(),
    state: 'suspended',
    resume: vi.fn(() => new Promise(() => {})),
    addEventListener: (type, fn) => listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    createBufferSource: vi.fn(() => ({ connect: vi.fn(), start: vi.fn(), buffer: null })),
    createBuffer: vi.fn(() => ({})),
    start () { this.state = 'running'; for (const fn of [...listeners]) fn() }
  }
  return context
}

const engineWith = context => new AudioEngine({ AudioContextImpl: function () { return context } })

describe('starting audio', () => {
  it('ensureContext asks the context to start but never waits for it', () => {
    const context = lockedContext()
    const engine = engineWith(context)
    expect(engine.ensureContext()).toBe(context) // returns at once, not a promise that never settles
    expect(context.resume).toHaveBeenCalledTimes(1)
  })

  it('loading an instrument completes while the context is still locked', async () => {
    const context = lockedContext()
    const plugin = await buildPlugin()
    const engine = new AudioEngine({
      AudioContextImpl: function () { return context },
      loaderOptions: { fetchImpl: fakeFetch(plugin.files), AudioWorkletNodeImpl: fakeNodeClass(), offered: new Set(['http://purl.org/stuff/jigdaw/MidiEvents']), createObjectURL: () => 'blob:x' }
    })
    const loaded = await Promise.race([
      engine.load(plugin.base),
      new Promise(resolve => setTimeout(() => resolve('HUNG'), 500))
    ])
    expect(loaded).not.toBe('HUNG')
    expect(engine.current).not.toBeNull()
    expect(context.state).toBe('suspended')
  })

  it('unlock resolves false when the browser does not allow audio in time', async () => {
    const engine = engineWith(lockedContext())
    expect(await engine.unlock(30)).toBe(false)
  })

  it('unlock resolves true as soon as the context starts', async () => {
    const context = lockedContext()
    const engine = engineWith(context)
    const result = engine.unlock(1000)
    setTimeout(() => context.start(), 10)
    expect(await result).toBe(true)
  })

  it('unlock resolves true at once when audio is already running, and plays a silent sample otherwise', async () => {
    const running = engineWith({ ...lockedContext(), state: 'running' })
    expect(await running.unlock(10)).toBe(true)
    const locked = lockedContext()
    await engineWith(locked).unlock(10)
    expect(locked.createBufferSource).toHaveBeenCalled()
  })

  it('a context without the extras still unlocks (fakes, odd browsers)', async () => {
    const engine = engineWith(fakeContext())
    expect(await engine.unlock(10)).toBe(true)
  })

  it('asks iOS to treat the page as playback, so the silent switch does not mute it', () => {
    const nav = { audioSession: { type: 'auto' } }
    vi.stubGlobal('navigator', nav)
    engineWith(lockedContext()).ensureContext()
    expect(nav.audioSession.type).toBe('playback')
    vi.unstubAllGlobals()
  })

  it('a resume that rejects does not become an unhandled rejection', async () => {
    const context = { ...lockedContext(), resume: vi.fn(() => Promise.reject(new Error('not allowed'))) }
    expect(() => engineWith(context).ensureContext()).not.toThrow()
    await new Promise(resolve => setTimeout(resolve, 5))
  })
})

describe('test beep', () => {
  function toneContext () {
    const made = { oscillator: null, gain: null }
    const ramps = []
    const context = {
      ...lockedContext(),
      state: 'running',
      currentTime: 2,
      createOscillator: () => (made.oscillator = { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }),
      createGain: () => (made.gain = { gain: { setValueAtTime: (v, t) => ramps.push(['set', v, t]), linearRampToValueAtTime: (v, t) => ramps.push(['ramp', v, t]) }, connect: vi.fn() })
    }
    return { context, made, ramps }
  }

  it('plays 440 Hz straight to the output, quietly, with a fade in and out', async () => {
    const { context, made, ramps } = toneContext()
    const engine = engineWith(context)
    expect(await engine.testTone(0.5)).toBe(true)
    expect(made.oscillator.frequency.value).toBe(440)
    expect(made.oscillator.start).toHaveBeenCalledWith(2)
    expect(made.oscillator.stop).toHaveBeenCalledWith(2.5)
    expect(made.gain.connect).toHaveBeenCalledWith(context.destination)
    expect(made.oscillator.connect).toHaveBeenCalledWith(made.gain)
    const levels = ramps.map(r => r[1])
    expect(Math.max(...levels)).toBeLessThanOrEqual(0.2)
    expect(levels[0]).toBe(0)
    expect(levels.at(-1)).toBe(0)
  })

  it('also tries to start a locked context, and reports false if the browser refuses', async () => {
    const { context } = toneContext()
    context.state = 'suspended'
    context.createOscillator = lockedContext().createBufferSource
    const engine = engineWith({ ...context, createOscillator: () => ({ frequency: {}, connect () {}, start () {}, stop () {} }), createGain: () => ({ gain: { setValueAtTime () {}, linearRampToValueAtTime () {} }, connect () {} }) })
    expect(context.resume).toBeDefined()
    expect(await engine.testTone(0.1)).toBe(false)
  })
})

describe('installUnlock', () => {
  function setup () {
    const win = new EventTarget()
    const session = { engine: { running: false }, unlock: vi.fn(), ensure: vi.fn() }
    return { win, session, remove: installUnlock(win, session) }
  }

  it('reacts to every kind of gesture, until audio is running', () => {
    const { win, session } = setup()
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) win.dispatchEvent(new Event(type))
    expect(session.unlock).toHaveBeenCalledTimes(5)
    expect(session.ensure).toHaveBeenCalledTimes(5)
  })

  it('stops listening once audio runs', () => {
    const { win, session } = setup()
    session.engine.running = true
    win.dispatchEvent(new Event('pointerdown'))
    win.dispatchEvent(new Event('click'))
    expect(session.unlock).toHaveBeenCalledTimes(1)
  })

  it('can be removed', () => {
    const { win, session, remove } = setup()
    remove()
    win.dispatchEvent(new Event('click'))
    expect(session.unlock).not.toHaveBeenCalled()
  })
})

describe('load stages', () => {
  it('are reported in order, so a stall names its step', async () => {
    const plugin = await buildPlugin()
    const stages = []
    await loadPlugin(plugin.base, fakeContext(), {
      fetchImpl: fakeFetch(plugin.files), AudioWorkletNodeImpl: fakeNodeClass(),
      offered: new Set(['http://purl.org/stuff/jigdaw/MidiEvents']), createObjectURL: () => 'blob:x', onStatus: s => stages.push(s)
    })
    expect(stages).toEqual([
      'Fetching the instrument’s profile', 'Fetching and checking Tester', 'Registering the audio processor', 'Starting Tester'
    ])
  })

  it('the session shows them as the loading status', async () => {
    const plugin = await buildPlugin({ base: 'https://strandz.it/jigdaw/plugins/monochord/', name: 'monochord' })
    const engine = new AudioEngine({
      AudioContextImpl: function () { return fakeContext() },
      loaderOptions: { fetchImpl: fakeFetch(plugin.files), AudioWorkletNodeImpl: fakeNodeClass(), offered: new Set(['http://purl.org/stuff/jigdaw/MidiEvents']), createObjectURL: () => 'blob:x' }
    })
    const session = new InstrumentSession({ engine, storage: fakeStorage(), defaultIri: plugin.base, catalogueUrl: 'x' })
    const seen = []
    session.subscribe(s => seen.push(s.status.message))
    await session.ensure()
    expect(seen).toContain('Registering the audio processor')
    expect(seen).toContain('Starting Tester')
    expect(session.status).toEqual({ state: 'ready', message: 'Tester' })
  })

  it('the session keeps notices separate from load failures, and counts plugin trouble', () => {
    const session = new InstrumentSession({ engine: { current: null }, storage: fakeStorage(), defaultIri: 'https://a.test/p/', catalogueUrl: 'x' })
    session.notify('Tap again')
    expect(session.error).toBe('Tap again')
    session.clearNotice()
    expect(session.error).toBe(null)
    session.handleProcessorMessage({ type: 'dropped', count: 3 })
    session.handleProcessorMessage({ type: 'dropped', count: 2 })
    session.handleProcessorMessage({ type: 'error', message: 'bad wasm' })
    expect(session.diagnostics).toEqual({ dropped: 5, processorError: 'bad wasm' })
  })
})

describe('level meter and diagnostics', () => {
  it('reads the peak of the plugin output', () => {
    const wave = new Float32Array(1024)
    wave[10] = -0.4
    wave[20] = 0.25
    const analyser = { fftSize: 0, connect: vi.fn(), getFloatTimeDomainData: buf => buf.set(wave) }
    const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }
    const context = { createAnalyser: () => analyser, createGain: () => gain, destination: {} }
    const node = { connect: vi.fn(), disconnect: vi.fn() }
    const meter = createMeter(context, node)
    expect(meter.read()).toBeCloseTo(0.4)
    expect(gain.gain.value).toBe(0)
    expect(node.connect).toHaveBeenCalledWith(analyser)
    meter.dispose()
    expect(node.disconnect).toHaveBeenCalledWith(analyser)
  })

  it('the engine has no level without an instrument', () => {
    expect(engineWith(lockedContext()).level()).toBe(null)
  })

  it('diagnostics text covers what is needed to work out a silent device', () => {
    const context = { ...fakeContext(), state: 'suspended', currentTime: 0, baseLatency: 0.01 }
    const text = diagnosticsText({
      engine: { context },
      session: { status: { state: 'ready', message: 'Monochord' }, iri: 'https://a.test/p/', error: 'Tap again', diagnostics: { dropped: 1, processorError: null } },
      player: { posted: 42 },
      win: { navigator: { userAgent: 'TestBrowser/1', audioSession: { type: 'playback' }, serviceWorker: { controller: {} } }, isSecureContext: true }
    })
    for (const expected of ['TestBrowser/1', 'suspended', 'output channels', '48000 Hz', 'playback', 'ready (Monochord)', 'Tap again', 'events sent: 42', 'dropped by the plugin: 1']) {
      expect(text).toContain(expected)
    }
    const brave = diagnosticsText({ engine: { context: null }, session: { status: { state: 'idle', message: '' }, iri: 'x', error: null, diagnostics: { dropped: 0, processorError: null } }, player: { posted: 0 }, win: { navigator: { userAgent: 'Chrome', brave: {} }, isSecureContext: true } })
    expect(brave).toContain('(Brave)')
    expect(diagnosticsText({ engine: { context: null }, session: { status: { state: 'idle', message: '' }, iri: 'x', error: null, diagnostics: { dropped: 0, processorError: null } }, player: { posted: 0 }, win: { navigator: {}, isSecureContext: false } }))
      .toContain('not started yet')
  })
})

describe('describeBeep', () => {
  it('tells the three outcomes apart', () => {
    expect(describeBeep({ started: false, state: 'suspended', advanced: false })).toMatch(/did not let audio start \(it is suspended\).*Brave/)
    expect(describeBeep({ started: true, state: 'running', advanced: false })).toMatch(/clock is not moving.*no working audio output/)
    expect(describeBeep({ started: true, state: 'running', advanced: true })).toMatch(/audio clock is running.*volume, a muted tab/)
    expect(describeBeep({ started: false, state: undefined, advanced: false })).toMatch(/not created/)
  })
})

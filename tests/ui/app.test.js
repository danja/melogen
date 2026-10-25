// @vitest-environment jsdom
// The whole app, booted in jsdom with a fake plugin served from a fake fetch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../../src/app.js'
import { DEFAULT_PLUGIN, CATALOGUE_URL } from '../../config.js'
import { PLUGIN_KEY } from '../../src/audio/plugin-choice.js'
import { STATE_KEY } from '../../src/state/store.js'
import { buildPlugin, fakeFetch, fakeNodeClass, fakeContext, fakeStorage } from '../audio/fakes.js'

const catalogue = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'index.json'), 'utf8')
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))

async function until (predicate, label = 'condition') {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return
    await tick(5)
  }
  throw new Error(`timed out waiting for ${label}`)
}

let Node
let plugin
let fetchImpl
let storage
let downloads
const booted = []

function boot (options = {}) {
  document.body.innerHTML = '<div id="app"></div>'
  class FakeAudioContext {
    constructor () {
      Object.assign(this, fakeContext())
      const param = () => ({ value: 0, setValueAtTime () {}, linearRampToValueAtTime () {} })
      this.createOscillator = () => ({ frequency: param(), connect () {}, start () {}, stop () {} })
      this.createGain = () => ({ gain: param(), connect () {}, disconnect () {} })
    }
  }
  const app = createApp({ root: document.getElementById('app'), storage, search: '', win: window, fetchImpl, AudioContextImpl: FakeAudioContext, ...options })
  booted.push(app)
  return app
}

beforeEach(async () => {
  Node = fakeNodeClass()
  vi.stubGlobal('AudioWorkletNode', Node)
  plugin = await buildPlugin({ base: DEFAULT_PLUGIN, name: 'monochord' })
  fetchImpl = fakeFetch({ ...plugin.files, [CATALOGUE_URL]: catalogue })
  vi.stubGlobal('fetch', fetchImpl)
  storage = fakeStorage()
  downloads = []
  URL.createObjectURL = blob => { downloads.push(blob); return 'blob:test' }
  URL.revokeObjectURL = () => {}
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloads.push({ name: this.download }) })
})

afterEach(() => {
  // Each app adds listeners to the shared window and document; remove them so tests do not hear each other.
  for (const app of booted.splice(0)) app.dispose()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('app', () => {
  it('boots with four tabs, five rows, and the default plugin stored on first load', () => {
    boot()
    expect([...document.querySelectorAll('[role=tab]')].map(t => t.textContent)).toEqual(['Interact', 'Settings', 'Instrument', 'About'])
    expect(document.querySelectorAll('.row:not([hidden])')).toHaveLength(5)
    expect(storage.map.get(PLUGIN_KEY)).toBe(DEFAULT_PLUGIN)
    expect(document.querySelector('.run-title').textContent).toBe('Generation 1')
  })

  it('links to the GitHub repository, to the right of the subtitle', () => {
    boot()
    const subtitle = document.querySelector('.masthead .subtitle')
    expect(subtitle.firstElementChild.textContent).toBe('Breed melodies by ear')
    const link = subtitle.querySelector('a')
    expect(subtitle.lastElementChild).toBe(link)
    expect(link.href).toBe('https://github.com/danja/melogen')
    expect(link.textContent).toBe('GitHub')
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
  })

  it('the test beep reports whether the audio clock moves', async () => {
    const app = boot()
    document.querySelector('#tab-instrument').click()
    const button = [...document.querySelectorAll('.diagnostics button')].find(b => b.textContent === 'Play a test beep')
    button.click()
    await until(() => !/Playing a beep/.test(document.querySelector('.beep-status').textContent), 'beep result')
    // the fake context's clock never moves, which is exactly the "no working output" case
    expect(document.querySelector('.beep-status').textContent).toMatch(/clock is not moving/)
    expect(app.engine.context).not.toBeNull()
  })

  it('loads the catalogue into the instrument picker', async () => {
    boot()
    await until(() => document.querySelector('#plugin-select').options.length > 1, 'catalogue')
    const labels = [...document.querySelector('#plugin-select').options].map(o => o.textContent)
    expect(labels).toContain('Monochord')
    expect(labels).not.toContain('Sam')
    expect(document.querySelector('#plugin-select').value).toBe(DEFAULT_PLUGIN)
  })

  it('the first touch starts loading the instrument, and Play then plays', async () => {
    const app = boot()
    expect(app.session.status.state).toBe('idle')
    window.dispatchEvent(new Event('pointerdown'))
    expect(app.session.status.state).toBe('loading')
    await until(() => app.session.status.state === 'ready', 'plugin ready')
    expect(app.engine.context).not.toBeNull()
    expect(Node.instances).toHaveLength(1)

    document.querySelector('.row .play').click()
    await until(() => app.player.playingKey === 0, 'playing')
    expect(document.querySelector('.row').classList.contains('playing')).toBe(true)
    // The melody is random and may open with a rest, so let the (fake) clock reach well into it
    // before asking whether its notes were sent. Without this the test depended on the melody.
    app.engine.context.currentTime = 2
    app.player.tick()
    expect(Node.instances[0].posted.some(p => p.message.type === 'events')).toBe(true)

    document.querySelector('.row .play').click()
    expect(app.player.playingKey).toBe(null)
    expect(document.querySelector('.row').classList.contains('playing')).toBe(false)
  })

  it('pressing Play before anything has loaded loads the instrument and then plays', async () => {
    const app = boot()
    document.querySelector('.row .play').click()
    await until(() => app.player.playingKey === 0, 'playing after load')
    expect(app.session.status.state).toBe('ready')
  })

  it('voting shows in the row and Evolve starts the next generation', async () => {
    const app = boot()
    const row = n => document.querySelectorAll('.row')[n]
    row(0).querySelector('.vote-up').click()
    row(1).querySelector('.vote-down').click()
    expect(row(0).querySelector('.vote-up').getAttribute('aria-pressed')).toBe('true')
    expect(row(1).querySelector('.vote-down').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.run-progress').textContent).toMatch(/2 of 20 rated/)
    const evolve = [...document.querySelectorAll('.action')].find(b => b.textContent === 'Evolve')
    expect(evolve.disabled).toBe(false)
    evolve.click()
    expect(document.querySelector('.run-title').textContent).toBe('Generation 2')
    expect(app.controller.viewModel().generation).toBe(1)
  })

  it('More shows another five', () => {
    const app = boot()
    const first = app.controller.viewModel().rows.map(r => r.id)
    ;[...document.querySelectorAll('.action')].find(b => b.textContent === 'More').click()
    const second = app.controller.viewModel().rows.map(r => r.id)
    expect(second.some(id => first.includes(id))).toBe(false)
    expect(document.querySelector('.run-progress').textContent).toMatch(/Round 2 of 4/)
  })

  it('Download hands over a .mid file named for the melody', () => {
    const app = boot()
    document.querySelectorAll('.row')[3].querySelector('.download').click()
    const named = downloads.find(d => d.name)
    const blob = downloads.find(d => d.type)
    expect(named.name).toBe(`melogen-${app.controller.viewModel().rows[3].id}.mid`)
    expect(blob.type).toBe('audio/midi')
    expect(blob.size).toBeGreaterThan(40)
  })

  it('a settings change reaches the controller and writes back clamped', () => {
    const app = boot()
    const tempo = document.querySelector('#setting-tempo')
    tempo.value = '9999'
    tempo.dispatchEvent(new Event('change', { bubbles: true }))
    expect(app.controller.settings.tempo).toBe(240)
    expect(tempo.value).toBe('240')
  })

  it('restores the session after a reload', () => {
    const first = boot()
    first.controller.vote(0, 1)
    first.controller.setSettings({ scale: 'dorian' })
    first.controller.saveNow()
    expect(storage.map.has(STATE_KEY)).toBe(true)
    const second = boot()
    expect(second.controller.settings.scale).toBe('dorian')
    expect(second.controller.viewModel().rows[0].rating).toBe(1)
    expect(document.querySelector('#setting-scale').value).toBe('dorian')
  })

  it('?plugin= is used for the session but not remembered', async () => {
    const other = await buildPlugin({ base: 'https://other.test/p/', name: 'otherp', requires: ['jig:MidiEvents'] })
    fetchImpl = fakeFetch({ ...plugin.files, ...other.files, [CATALOGUE_URL]: catalogue })
    vi.stubGlobal('fetch', fetchImpl)
    const app = boot({ search: '?plugin=https://other.test/p/', fetchImpl })
    expect(app.session.iri).toBe('https://other.test/p/')
    await app.session.ensure()
    expect(app.session.profile.label).toBe('Tester')
    expect(storage.map.has(PLUGIN_KEY)).toBe(false)
  })

  it('a failed instrument is reported and Play does not pretend', async () => {
    fetchImpl = fakeFetch({ [CATALOGUE_URL]: catalogue })
    vi.stubGlobal('fetch', fetchImpl)
    const app = boot({ fetchImpl })
    document.querySelector('.row .play').click()
    await until(() => app.session.status.state === 'error', 'error state')
    expect(app.player.playingKey).toBe(null)
    expect(document.querySelector('.interact .notice').textContent).toMatch(/could not fetch a profile/)
    expect(document.querySelector('.interact .notice').classList.contains('error')).toBe(true)
  })

  it('keyboard: 1 plays the first row', async () => {
    const app = boot()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    await until(() => app.player.playingKey === 0, 'keyboard play')
  })

  it('dispose removes the first-touch and keyboard listeners', async () => {
    const app = boot()
    app.dispose()
    window.dispatchEvent(new Event('pointerdown'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    await tick(20)
    expect(app.session.status.state).toBe('idle')
    expect(app.player.playingKey).toBe(null)
  })

  it('works with no storage at all', () => {
    const app = boot({ storage: null })
    app.controller.vote(0, 1)
    expect(app.controller.viewModel().rows[0].rating).toBe(1)
  })
})

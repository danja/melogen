import { describe, it, expect, vi } from 'vitest'
import { Controller, SAVE_DELAY_MS } from '../src/controller.js'
import { Player } from '../src/audio/player.js'
import { STATE_KEY } from '../src/state/store.js'
import { readSmf } from './midi/smf-reader.js'
import { fakeStorage, throwingStorage, fakeContext, fakeNodeClass } from './audio/fakes.js'

function setup ({ storage = fakeStorage(), ready = true, seed = 5, unlocked = true } = {}) {
  const context = fakeContext()
  const node = new (fakeNodeClass())(context, 'x', {})
  const player = new Player({ getEngine: () => ({ context, node }), timers: { set: () => 1, clear: () => {} } })
  const calls = []
  const session = {
    ensure: vi.fn(async () => { calls.push('ensure'); return ready }),
    unlock: vi.fn(() => { calls.push('unlock'); return Promise.resolve(unlocked) }),
    notify: vi.fn(),
    clearNotice: vi.fn()
  }
  session.calls = calls
  const saves = []
  const timers = { set: fn => { saves.push(fn); return saves.length }, clear: () => {} }
  const controller = new Controller({ storage, session, player, seed, timers })
  return { controller, player, session, storage, saves, node, context }
}

describe('Controller', () => {
  it('starts with a fresh population and five rows', () => {
    const { controller } = setup()
    const vm = controller.viewModel()
    expect(vm.generation).toBe(0)
    expect(vm.rows).toHaveLength(5)
    expect(vm.populationSize).toBe(20)
    expect(vm.totalRounds).toBe(4) // twenty melodies, five at a time
    expect(vm.canEvolve).toBe(false)
    expect(vm.canMore).toBe(true)
    expect(vm.settings.bars).toBe(4)
  })

  it('voting toggles: the same vote again clears it', () => {
    const { controller } = setup()
    controller.vote(0, 1)
    expect(controller.viewModel().rows[0].rating).toBe(1)
    expect(controller.viewModel().canEvolve).toBe(true)
    controller.vote(0, 1)
    expect(controller.viewModel().rows[0].rating).toBe(null)
    expect(controller.viewModel().canEvolve).toBe(false)
    controller.vote(0, 0)
    expect(controller.viewModel().rows[0].rating).toBe(0)
    controller.vote(0, -1)
    expect(controller.viewModel().rows[0].rating).toBe(-1)
  })

  it('More shows different rows; Evolve starts the next generation', () => {
    const { controller } = setup()
    const first = controller.viewModel().rows.map(r => r.id)
    controller.more()
    const second = controller.viewModel().rows.map(r => r.id)
    expect(second.filter(id => first.includes(id))).toEqual([])
    expect(controller.viewModel().round).toBe(2)
    controller.vote(0, 1)
    controller.evolve()
    expect(controller.viewModel().generation).toBe(1)
    expect(controller.viewModel().rows).toHaveLength(5)
  })

  it('after Evolve only the kept elite carries a vote; everything else starts unrated', () => {
    const { controller } = setup()
    controller.vote(0, 1)
    controller.vote(1, 1)
    controller.vote(2, -1)
    controller.evolve()
    const rows = controller.viewModel().rows
    const withVote = rows.filter(r => r.rating !== null)
    expect(withVote).toHaveLength(1)
    expect(withVote[0]).toMatchObject({ rating: 1, carried: true, origin: 'elite' })
    // And it is a vote the person can clear, which leaves a normal unrated melody.
    controller.vote(withVote[0].position, 1)
    expect(controller.viewModel().rows[withVote[0].position].rating).toBe(null)
  })

  it('Evolve is ignored until something is voted', () => {
    const { controller } = setup()
    controller.evolve()
    expect(controller.viewModel().generation).toBe(0)
  })

  it('a settings change clamps and applies; mode switches the octave', () => {
    const { controller } = setup()
    expect(controller.setSettings({ tempo: 9999, mutationRate: 0.35 })).toEqual({ ok: true })
    expect(controller.settings.tempo).toBe(240)
    expect(controller.settings.mutationRate).toBe(0.35)
    controller.setSettings({ mode: 'bass' })
    expect(controller.settings.octave).toBe(2)
  })

  it('changing the bar count resizes the population, keeping it', () => {
    const { controller } = setup()
    expect(controller.population.entries.every(e => e.genome.kind.length === 64)).toBe(true)
    const id = controller.viewModel().rows[0].id
    controller.setSettings({ bars: 2 })
    expect(controller.population.entries.every(e => e.genome.kind.length === 32)).toBe(true)
    expect(controller.viewModel().rows[0].id).toBe(id)
    controller.setSettings({ bars: 6 })
    expect(controller.population.entries.every(e => e.genome.kind.length === 96)).toBe(true)
  })

  it('a time signature change needs confirmation, then starts a new population', () => {
    const { controller } = setup()
    expect(controller.setSettings({ timeSignature: '3/4' })).toEqual({ needsConfirm: 'timeSignature' })
    expect(controller.settings.timeSignature).toBe('4/4')
    controller.vote(0, 1)
    expect(controller.setSettings({ timeSignature: '3/4' }, { confirmed: true })).toEqual({ ok: true })
    expect(controller.settings.timeSignature).toBe('3/4')
    expect(controller.population.entries[0].genome.kind).toHaveLength(4 * 12)
    expect(controller.viewModel().canEvolve).toBe(false)
    expect(controller.viewModel().generation).toBe(0)
    expect(controller.viewModel().rows).toHaveLength(5)
    expect(controller.population.entries.every(e => e.rating === null && e.genome.id.startsWith('g0-'))).toBe(true)
  })

  it('exports a valid .mid for a row with the right name, tempo and length', () => {
    const { controller } = setup()
    controller.setSettings({ tempo: 90, timeSignature: '4/4' })
    const { bytes, filename } = controller.midiAt(2)
    expect(filename).toBe(`melogen-${controller.viewModel().rows[2].id}.mid`)
    const { header, events } = readSmf(bytes)
    expect(header.ppq).toBe(480)
    const tempo = events.find(e => e.meta === 0x51)
    expect(tempo.data[0] * 65536 + tempo.data[1] * 256 + tempo.data[2]).toBe(Math.round(60000000 / 90))
    expect(events.at(-1).tick).toBe(64 * 120) // 4 bars of 16 steps
    expect(events.some(e => e.kind === 0x90)).toBe(true)
    expect(controller.midiAt(9)).toBe(null)
  })

  it('plays a row after the instrument is ready, and a second press stops it', async () => {
    const { controller, session, node, player } = setup()
    await controller.togglePlay(1)
    expect(session.ensure).toHaveBeenCalled()
    expect(player.playingKey).toBe(1)
    expect(controller.viewModel().rows[1].playing).toBe(true)
    expect(node.posted.some(p => p.message.type === 'events')).toBe(true)
    await controller.togglePlay(1)
    expect(player.playingKey).toBe(null)
    expect(controller.viewModel().rows[1].playing).toBe(false)
  })

  it('starts audio inside the tap, before anything is awaited', async () => {
    const { controller, session } = setup()
    const pending = controller.togglePlay(2)
    expect(session.unlock).toHaveBeenCalledTimes(1) // synchronously, in the click handler
    expect(session.ensure).toHaveBeenCalledTimes(1)
    expect(session.calls).toEqual(['unlock', 'ensure'])
    await pending
  })

  it('if the browser has not started audio, says so and does not play', async () => {
    const { controller, session, player } = setup({ unlocked: false })
    await controller.togglePlay(0)
    expect(player.playingKey).toBe(null)
    expect(session.notify).toHaveBeenCalledWith(expect.stringMatching(/Tap Play again/))
    expect(session.clearNotice).not.toHaveBeenCalled()
  })

  it('clears an earlier notice when playback does start', async () => {
    const { controller, session } = setup()
    await controller.togglePlay(0)
    expect(session.clearNotice).toHaveBeenCalled()
  })

  it('does not play when the instrument cannot load', async () => {
    const { controller, player } = setup({ ready: false })
    await controller.togglePlay(0)
    expect(player.playingKey).toBe(null)
  })

  it('playing another row switches to it', async () => {
    const { controller, player } = setup()
    await controller.togglePlay(0)
    await controller.togglePlay(3)
    expect(player.playingKey).toBe(3)
  })

  it('stops playback when something musical changes, but not for a rate change', async () => {
    const { controller, player } = setup()
    await controller.togglePlay(0)
    controller.setSettings({ mutationRate: 0.2 })
    expect(player.playingKey).toBe(0)
    controller.setSettings({ tempo: 100 })
    expect(player.playingKey).toBe(null)
  })

  it('saves after a pause, and restores the same session', () => {
    const first = setup({ seed: 11 })
    first.controller.setSettings({ tempo: 77, scale: 'dorian' })
    first.controller.vote(0, 1)
    first.controller.vote(1, -1)
    first.controller.evolve()
    expect(first.saves.length).toBeGreaterThan(0)
    first.saves.at(-1)()
    expect(first.storage.map.has(STATE_KEY)).toBe(true)

    const second = setup({ storage: first.storage, seed: 999 })
    expect(second.controller.settings.tempo).toBe(77)
    expect(second.controller.settings.scale).toBe('dorian')
    expect(second.controller.viewModel().generation).toBe(1)
    expect(second.controller.viewModel().rows.map(r => r.id)).toEqual(first.controller.viewModel().rows.map(r => r.id))
    expect(second.controller.rng.getState()).toBe(first.controller.rng.getState())
  })

  it('debounces saves into one write', () => {
    const { controller, saves, storage } = setup()
    const spy = vi.spyOn(storage, 'setItem')
    controller.vote(0, 1)
    controller.vote(1, 1)
    controller.vote(2, 1)
    expect(spy).not.toHaveBeenCalled()
    expect(SAVE_DELAY_MS).toBeGreaterThan(0)
    saves.at(-1)()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('ignores a corrupt or mismatched save', () => {
    const corrupt = fakeStorage({ [STATE_KEY]: '{broken' })
    expect(setup({ storage: corrupt }).controller.viewModel().rows).toHaveLength(5)

    const first = setup()
    first.controller.saveNow()
    const saved = JSON.parse(first.storage.map.get(STATE_KEY))
    saved.settings.bars = 3 // genomes no longer fit the settings
    const mismatched = fakeStorage({ [STATE_KEY]: JSON.stringify(saved) })
    const { controller } = setup({ storage: mismatched })
    expect(controller.settings.bars).toBe(3)
    expect(controller.population.entries.every(e => e.genome.kind.length === 48)).toBe(true)
  })

  it('works with storage that throws', () => {
    const { controller, saves } = setup({ storage: throwingStorage() })
    controller.vote(0, 1)
    expect(() => saves.at(-1)()).not.toThrow()
    expect(controller.viewModel().rows[0].rating).toBe(1)
  })

  it('resetAll returns to the defaults and forgets the save', () => {
    const { controller, storage } = setup()
    controller.setSettings({ tempo: 60 })
    controller.saveNow()
    controller.resetAll()
    expect(controller.settings.tempo).toBe(120)
    expect(storage.map.has(STATE_KEY)).toBe(false)
  })
})

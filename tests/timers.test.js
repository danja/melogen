// Browsers throw "Illegal invocation" when setInterval or setTimeout is called
// with `this` set to some other object; Node does not. These stand-ins throw
// the way a browser does, so the default timers are exercised honestly.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { Player } from '../src/audio/player.js'
import { Controller } from '../src/controller.js'
import { fakeStorage, fakeContext, fakeNodeClass } from './audio/fakes.js'

function strict (real) {
  return function (...args) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
    return real(...args)
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('default timers work under browser rules', () => {
  it('Player starts and stops with the default interval timer', () => {
    const cleared = []
    vi.stubGlobal('setInterval', strict(() => 7))
    vi.stubGlobal('clearInterval', strict(id => cleared.push(id)))
    const context = fakeContext()
    const node = new (fakeNodeClass())(context, 'x', {})
    const player = new Player({ getEngine: () => ({ context, node }) })
    expect(player.play('a', { notes: [], totalSteps: 8, stepSeconds: 0.125 })).toBe(true)
    expect(() => player.stop()).not.toThrow()
    expect(cleared).toEqual([7])
  })

  it('Controller schedules its save with the default timeout timer', () => {
    const scheduled = []
    vi.stubGlobal('setTimeout', strict(fn => { scheduled.push(fn); return scheduled.length }))
    vi.stubGlobal('clearTimeout', strict(() => {}))
    const player = { onChange: null, stop () {} }
    const controller = new Controller({ storage: fakeStorage(), session: {}, player, seed: 1 })
    expect(() => controller.vote(0, 1)).not.toThrow()
    expect(scheduled.length).toBeGreaterThan(0)
  })
})

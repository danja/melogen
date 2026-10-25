import { describe, it, expect } from 'vitest'
import { Player, LOOKAHEAD, START_DELAY } from '../../src/audio/player.js'
import { fakeContext, fakeNodeClass } from './fakes.js'

const Node = fakeNodeClass()

function setup () {
  const context = fakeContext()
  const node = new Node(context, 'x', {})
  const changes = []
  const timers = { set: () => 1, clear: () => {} }
  const player = new Player({ getEngine: () => ({ context, node }), onChange: k => changes.push(k), timers })
  const sent = () => node.posted.filter(p => p.message.type === 'events').flatMap(p => p.message.events)
  return { context, node, player, changes, sent }
}

// 8 steps at 120 bpm = 1 second, one note per 2 steps
const melody = {
  notes: [0, 2, 4, 6].map((startStep, i) => ({ startStep, lengthSteps: 2, midi: 60 + i, velocity: 90 })),
  totalSteps: 8,
  stepSeconds: 0.125
}
const ons = events => events.filter(e => e.bytes[0] === 0x90)
const offs = events => events.filter(e => e.bytes[0] === 0x80)

describe('Player', () => {
  it('does nothing without an instrument', () => {
    const player = new Player({ getEngine: () => null })
    expect(player.play('a', melody)).toBe(false)
    expect(player.audition()).toBe(false)
  })

  it('posts only the events inside the lookahead window, with absolute frames', () => {
    const { player, sent, context } = setup()
    player.play('row-1', melody)
    const start = (context.currentTime + START_DELAY) * 48000
    expect(sent().length).toBeGreaterThan(0)
    expect(sent().every(e => e.frame < (context.currentTime + LOOKAHEAD) * 48000)).toBe(true)
    expect(ons(sent())[0].frame).toBe(Math.round(start))
    // the first note starts at 0.05 s; the second, at 0.30 s, is beyond the 0.2 s window
    expect(ons(sent())).toHaveLength(1)
  })

  it('posts everything exactly once as time advances, in order, ending with matched offs', () => {
    const { player, sent, context } = setup()
    player.play('row-1', melody)
    for (let t = 0; t < 1.5; t += 0.04) { context.currentTime = t; player.tick() }
    const events = sent()
    expect(ons(events)).toHaveLength(4)
    expect(offs(events)).toHaveLength(4)
    for (let i = 1; i < events.length; i++) expect(events[i].frame).toBeGreaterThanOrEqual(events[i - 1].frame)
    expect(ons(events).map(e => e.bytes[1])).toEqual([60, 61, 62, 63])
    expect(ons(events)[1].frame - ons(events)[0].frame).toBe(12000)
  })

  it('reports start and end of playback', () => {
    const { player, changes, context } = setup()
    player.play('row-1', melody)
    expect(changes).toEqual(['row-1'])
    expect(player.playingKey).toBe('row-1')
    context.currentTime = 2
    player.tick()
    expect(changes).toEqual(['row-1', null])
    expect(player.playingKey).toBe(null)
  })

  it('loops seamlessly: the next cycle starts exactly one melody later', () => {
    const { player, sent, context } = setup()
    player.play('row-1', melody, { loop: true })
    for (let t = 0; t < 2.3; t += 0.04) { context.currentTime = t; player.tick() }
    const first = ons(sent()).map(e => e.frame)
    expect(first.length).toBeGreaterThanOrEqual(8)
    expect(first[4] - first[0]).toBe(48000)
    expect(first[5] - first[1]).toBe(48000)
    expect(player.playingKey).toBe('row-1')
  })

  it('a silent melody with loop on still ends instead of spinning', () => {
    const { player, context, changes } = setup()
    player.play('row-1', { notes: [], totalSteps: 8, stepSeconds: 0.125 }, { loop: true })
    context.currentTime = 2
    player.tick()
    expect(changes).toEqual(['row-1', null])
  })

  it('stop sends note-offs and all-notes-off now and again after the posted window', () => {
    const { player, node, context, changes } = setup()
    player.play('row-1', melody)
    context.currentTime = 0.1
    const before = node.posted.length
    player.stop()
    const stops = node.posted.slice(before).map(p => p.message.events)
    expect(stops).toHaveLength(2)
    for (const events of stops) {
      expect(events.some(e => e.bytes[0] === 0xB0 && e.bytes[1] === 123)).toBe(true)
      for (const midi of [60, 61, 62, 63]) expect(events.some(e => e.bytes[0] === 0x80 && e.bytes[1] === midi)).toBe(true)
    }
    expect(stops[0][0].frame).toBe(Math.round(0.1 * 48000))
    expect(stops[1][0].frame).toBe(Math.round((0.1 + LOOKAHEAD + 0.02) * 48000))
    expect(changes.at(-1)).toBe(null)
    expect(player.playingKey).toBe(null)
  })

  it('a melody started right after a stop waits for the cleanup window', () => {
    const { player, sent, context } = setup()
    player.play('row-1', melody)
    context.currentTime = 0.1
    player.stop()
    const already = sent().length
    player.play('row-2', melody)
    // stop at 0.1 s: cleanup lasts until 0.1 + LOOKAHEAD + 0.05, later than the usual 0.1 + START_DELAY
    const cleanupEnd = 0.1 + LOOKAHEAD + 0.05
    context.currentTime = cleanupEnd
    player.tick()
    const fresh = ons(sent().slice(already))
    expect(fresh.length).toBeGreaterThan(0)
    expect(fresh[0].frame).toBe(Math.round(cleanupEnd * 48000))
    expect(fresh[0].frame).toBeGreaterThan(Math.round((0.1 + START_DELAY) * 48000))
  })

  it('starting another melody stops the first', () => {
    const { player, changes } = setup()
    player.play('a', melody)
    player.play('b', melody)
    expect(changes).toEqual(['a', null, 'b'])
  })

  it('stop with nothing playing is a no-op', () => {
    const { player, node } = setup()
    player.stop()
    expect(node.posted).toHaveLength(0)
  })

  it('auditions a short middle C', () => {
    const { player, sent } = setup()
    expect(player.audition()).toBe(true)
    expect(sent().map(e => Array.from(e.bytes))).toEqual([[0x90, 60, 100], [0x80, 60, 0]])
  })
})

import { describe, it, expect } from 'vitest'
import { createRng } from '../../src/util/rng.js'

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next())
  })

  it('differs between seeds and stays in [0,1)', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toBe(b.next())
    const r = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int and range respect bounds', () => {
    const r = createRng(3)
    for (let i = 0; i < 500; i++) {
      expect(r.int(5)).toBeLessThan(5)
      const v = r.range(-2, 2)
      expect(v).toBeGreaterThanOrEqual(-2)
      expect(v).toBeLessThanOrEqual(2)
    }
  })

  it('weighted follows the weights', () => {
    const r = createRng(9)
    const counts = { a: 0, b: 0 }
    for (let i = 0; i < 4000; i++) counts[r.weighted([['a', 3], ['b', 1]])]++
    expect(counts.a / 4000).toBeGreaterThan(0.7)
    expect(counts.a / 4000).toBeLessThan(0.8)
  })

  it('shuffle keeps elements and does not mutate input', () => {
    const r = createRng(5)
    const input = [1, 2, 3, 4, 5]
    const out = r.shuffle(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect(out.slice().sort()).toEqual(input)
  })

  it('state can be saved and restored', () => {
    const r = createRng(11)
    r.next(); r.next()
    const state = r.getState()
    const expected = [r.next(), r.next()]
    r.setState(state)
    expect([r.next(), r.next()]).toEqual(expected)
  })
})

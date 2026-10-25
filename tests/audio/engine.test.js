import { describe, it, expect, vi } from 'vitest'
import { AudioEngine } from '../../src/audio/engine.js'
import { fakeContext } from './fakes.js'

function fakeLoaded (name) {
  return { node: { name }, profile: { label: name }, dispose: vi.fn() }
}

function setup (loaderImpl) {
  const created = []
  const AudioContextImpl = function () { const c = fakeContext(); created.push(c); return c }
  const loader = vi.fn(loaderImpl ?? (async iri => fakeLoaded(iri)))
  return { engine: new AudioEngine({ AudioContextImpl, loader }), created, loader }
}

describe('AudioEngine', () => {
  it('has no instrument until one loads, and makes the context lazily', async () => {
    const { engine, created } = setup()
    expect(engine.current).toBe(null)
    expect(created).toHaveLength(0)
    await engine.load('a')
    expect(created).toHaveLength(1)
    expect(engine.current.node.name).toBe('a')
    expect(engine.current.context).toBe(created[0])
  })

  it('resumes a suspended context', async () => {
    const { engine, created } = setup()
    await engine.ensureContext()
    created[0].state = 'suspended'
    await engine.ensureContext()
    expect(created[0].resume).toHaveBeenCalled()
    expect(created).toHaveLength(1)
  })

  it('replaces the plugin and disposes the previous one only after the new one loaded', async () => {
    const loaded = {}
    const { engine } = setup(async iri => (loaded[iri] = fakeLoaded(iri)))
    await engine.load('a')
    await engine.load('b')
    expect(loaded.a.dispose).toHaveBeenCalledTimes(1)
    expect(loaded.b.dispose).not.toHaveBeenCalled()
    expect(engine.current.node.name).toBe('b')
  })

  it('keeps the current plugin when a load fails', async () => {
    const { engine } = setup(async iri => { if (iri === 'bad') throw new Error('nope'); return fakeLoaded(iri) })
    const good = await engine.load('good')
    await expect(engine.load('bad')).rejects.toThrow('nope')
    expect(engine.plugin).toBe(good)
    expect(good.dispose).not.toHaveBeenCalled()
  })

  it('serialises loads: the last request wins and none overlap', async () => {
    const order = []
    const { engine } = setup(async iri => {
      order.push(`start ${iri}`)
      await new Promise(resolve => setTimeout(resolve, iri === 'slow' ? 30 : 1))
      order.push(`end ${iri}`)
      return fakeLoaded(iri)
    })
    const first = engine.load('slow')
    const second = engine.load('fast')
    await Promise.all([first, second])
    expect(order).toEqual(['start slow', 'end slow', 'start fast', 'end fast'])
    expect(engine.current.node.name).toBe('fast')
  })
})

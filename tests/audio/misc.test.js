import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { offeredCapabilities, missingCapabilities, shortName, catalogueEntryRunnable } from '../../src/audio/capabilities.js'
import { fetchCatalogue, isUsableInstrument } from '../../src/audio/catalogue.js'
import { choosePlugin, savePlugin, loadValues, saveValues, normalizeIri, PLUGIN_KEY, VALUES_PREFIX } from '../../src/audio/plugin-choice.js'
import { clampToPort, defaultValues, mergeValues, setParam, applyValues, controlKind } from '../../src/audio/instrument.js'
import { readProfile } from '../../src/audio/profile.js'
import { DEFAULT_PLUGIN } from '../../config.js'
import { fakeFetch, fakeStorage, throwingStorage } from './fakes.js'

const fixtureDir = join(import.meta.dirname, '..', 'fixtures')
const JIG = 'http://purl.org/stuff/jigdaw/'

describe('capabilities', () => {
  it('always offers MIDI events and nothing about transport', () => {
    const offered = offeredCapabilities({})
    expect([...offered]).toEqual([JIG + 'MidiEvents'])
  })

  it('probes wasm features through WebAssembly.validate', () => {
    const accept = offeredCapabilities({ WebAssembly: { validate: () => true } })
    expect(accept.has(JIG + 'Simd128')).toBe(true)
    const reject = offeredCapabilities({ WebAssembly: { validate: () => false } })
    expect(reject.has(JIG + 'Simd128')).toBe(false)
  })

  it('reports what a profile needs that is not offered', () => {
    const profile = (name) => readProfile(readFileSync(join(fixtureDir, `${name}.ttl`), 'utf8'), `https://strandz.it/jigdaw/plugins/${name}/`)
    const offered = offeredCapabilities({})
    expect(missingCapabilities(profile('monochord'), offered)).toEqual([])
    expect(missingCapabilities(profile('sam'), offered).map(shortName)).toEqual(['HostTransport'])
    expect(missingCapabilities(profile('ferrite'), offered).map(shortName)).toEqual(['Simd128'])
    expect(missingCapabilities(profile('ferrite'), offeredCapabilities({ WebAssembly: { validate: () => true } }))).toEqual([])
  })

  it('judges catalogue entries by short names', () => {
    const offered = offeredCapabilities({})
    expect(catalogueEntryRunnable({ requires: [JIG + 'MidiEvents'] }, offered)).toBe(true)
    expect(catalogueEntryRunnable({ requires: ['MidiEvents', 'HostTransport'] }, offered)).toBe(false)
    expect(catalogueEntryRunnable({}, offered)).toBe(true)
  })
})

describe('catalogue', () => {
  const index = readFileSync(join(fixtureDir, 'index.json'), 'utf8')
  const offered = offeredCapabilities({})
  const url = 'https://strandz.it/jigdaw/plugins/index.json'

  it('lists only instruments that take MIDI and can run here', async () => {
    const list = await fetchCatalogue(url, offered, fakeFetch({ [url]: index }))
    expect(list.map(p => p.label)).toEqual(['8-Bit 8asterd', 'Canticle', 'DrumKit', 'Moka', 'Monochord', 'Mop', 'Pulse'])
    // Sam needs a transport; Boost is an effect; MelGen is a generator; Ferrite is an effect
    expect(list.find(p => p.label === 'Monochord')).toMatchObject({
      iri: DEFAULT_PLUGIN, comment: expect.stringMatching(/waveguide/), cautions: expect.any(Array)
    })
  })

  it('includes the default plugin', async () => {
    const list = await fetchCatalogue(url, offered, fakeFetch({ [url]: index }))
    expect(list.some(p => p.iri === DEFAULT_PLUGIN)).toBe(true)
  })

  it('skips entries marked as not web', () => {
    expect(isUsableInstrument({ web: false, roles: ['Instrument'], accepts: ['Midi'] }, offered)).toBe(false)
  })

  it('fails clearly on a bad response', async () => {
    await expect(fetchCatalogue(url, offered, fakeFetch({}))).rejects.toThrow(/answered 404/)
    await expect(fetchCatalogue(url, offered, fakeFetch({ [url]: '{"x":1}' }))).rejects.toThrow(/no plugins list/)
  })
})

describe('plugin choice', () => {
  it('seeds the default into an empty store on first load', () => {
    const storage = fakeStorage()
    expect(choosePlugin({ storage, defaultIri: DEFAULT_PLUGIN })).toEqual({ iri: DEFAULT_PLUGIN, source: 'default' })
    expect(storage.map.get(PLUGIN_KEY)).toBe(DEFAULT_PLUGIN)
  })

  it('uses the stored IRI afterwards, and does not rewrite it', () => {
    const storage = fakeStorage({ [PLUGIN_KEY]: 'https://strandz.it/jigdaw/plugins/pulse/' })
    const spy = vi.spyOn(storage, 'setItem')
    expect(choosePlugin({ storage, defaultIri: DEFAULT_PLUGIN })).toEqual({ iri: 'https://strandz.it/jigdaw/plugins/pulse/', source: 'stored' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('?plugin= overrides for the session without saving', () => {
    const storage = fakeStorage({ [PLUGIN_KEY]: 'https://strandz.it/jigdaw/plugins/pulse/' })
    const chosen = choosePlugin({ storage, search: '?plugin=http://localhost:47219/plugins/mop/', defaultIri: DEFAULT_PLUGIN })
    expect(chosen).toEqual({ iri: 'http://localhost:47219/plugins/mop/', source: 'url' })
    expect(storage.map.get(PLUGIN_KEY)).toBe('https://strandz.it/jigdaw/plugins/pulse/')
    const empty = fakeStorage()
    choosePlugin({ storage: empty, search: '?plugin=https://a.test/p/', defaultIri: DEFAULT_PLUGIN })
    expect(empty.map.has(PLUGIN_KEY)).toBe(false)
  })

  it('ignores a ?plugin= that is not a web URL', () => {
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'nonsense', '']) {
      const chosen = choosePlugin({ storage: fakeStorage(), search: `?plugin=${encodeURIComponent(bad)}`, defaultIri: DEFAULT_PLUGIN })
      expect(chosen.iri).toBe(DEFAULT_PLUGIN)
    }
  })

  it('replaces a corrupt stored value with the default', () => {
    const storage = fakeStorage({ [PLUGIN_KEY]: 'not a url' })
    expect(choosePlugin({ storage, defaultIri: DEFAULT_PLUGIN }).iri).toBe(DEFAULT_PLUGIN)
    expect(storage.map.get(PLUGIN_KEY)).toBe(DEFAULT_PLUGIN)
  })

  it('falls back to the default when storage throws', () => {
    const storage = throwingStorage()
    expect(choosePlugin({ storage, defaultIri: DEFAULT_PLUGIN })).toEqual({ iri: DEFAULT_PLUGIN, source: 'default' })
    expect(savePlugin(storage, 'https://a.test/')).toBe(false)
    expect(loadValues(storage, 'https://a.test/')).toEqual({})
    expect(saveValues(storage, 'https://a.test/', { a: 1 })).toBe(false)
  })

  it('choosing a plugin overwrites the stored one', () => {
    const storage = fakeStorage()
    choosePlugin({ storage, defaultIri: DEFAULT_PLUGIN })
    savePlugin(storage, 'https://strandz.it/jigdaw/plugins/mop/')
    expect(choosePlugin({ storage, defaultIri: DEFAULT_PLUGIN }).iri).toBe('https://strandz.it/jigdaw/plugins/mop/')
  })

  it('keeps instrument values per plugin', () => {
    const storage = fakeStorage()
    saveValues(storage, 'https://a.test/', { gain: 0.2 })
    saveValues(storage, 'https://b.test/', { gain: 0.9 })
    expect(loadValues(storage, 'https://a.test/')).toEqual({ gain: 0.2 })
    expect(loadValues(storage, 'https://b.test/')).toEqual({ gain: 0.9 })
    expect(loadValues(storage, 'https://c.test/')).toEqual({})
    storage.setItem(VALUES_PREFIX + 'https://d.test/', '[1,2]')
    expect(loadValues(storage, 'https://d.test/')).toEqual({})
    storage.setItem(VALUES_PREFIX + 'https://e.test/', '{broken')
    expect(loadValues(storage, 'https://e.test/')).toEqual({})
  })

  it('the default is the strandz.it Monochord', () => {
    expect(DEFAULT_PLUGIN).toBe('https://strandz.it/jigdaw/plugins/monochord/')
    expect(normalizeIri(DEFAULT_PLUGIN)).toBe(DEFAULT_PLUGIN)
  })
})

describe('instrument parameters', () => {
  const ports = [
    { symbol: 'gain', default: 0.5, minimum: 0, maximum: 1, properties: [], scalePoints: [] },
    { symbol: 'mode', default: 0, minimum: 0, maximum: 2, properties: ['enumeration'], scalePoints: [{ label: 'A', value: 0 }] },
    { symbol: 'on', default: 1, minimum: 0, maximum: 1, properties: ['toggled'], scalePoints: [] },
    { symbol: 'steps', default: 4, minimum: 1, maximum: 16, properties: ['integer'], scalePoints: [] }
  ]

  it('clamps and rounds', () => {
    expect(clampToPort(ports[0], 3)).toBe(1)
    expect(clampToPort(ports[0], -3)).toBe(0)
    expect(clampToPort(ports[1], 1.6)).toBe(2)
    expect(clampToPort(ports[3], 7.4)).toBe(7)
    expect(clampToPort(ports[0], 'abc')).toBe(0.5)
  })

  it('merges stored values over defaults, ignoring unknown symbols', () => {
    expect(mergeValues(ports, { gain: 0.9, steps: 99, ghost: 1 })).toEqual({ gain: 0.9, mode: 0, on: 1, steps: 16 })
    expect(defaultValues(ports)).toEqual({ gain: 0.5, mode: 0, on: 1, steps: 4 })
  })

  it('sets AudioParams by symbol and tolerates a missing one', () => {
    const params = new Map([['gain', { value: 0 }]])
    const node = { parameters: params }
    expect(setParam(node, 'gain', 0.7)).toBe(true)
    expect(params.get('gain').value).toBe(0.7)
    expect(setParam(node, 'nope', 1)).toBe(false)
    applyValues(node, { gain: 0.1, nope: 2 })
    expect(params.get('gain').value).toBe(0.1)
  })

  it('picks a control kind', () => {
    expect(ports.map(controlKind)).toEqual(['slider', 'select', 'toggle', 'slider'])
  })
})

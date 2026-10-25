import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { readProfile, ProfileError } from '../../src/audio/profile.js'
import { digest } from '../../src/audio/integrity.js'
import { TurtleError } from '../../src/audio/ttl.js'

const fixture = name => readFileSync(join(import.meta.dirname, '..', 'fixtures', `${name}.ttl`), 'utf8')
const BASE = 'https://strandz.it/jigdaw/plugins/'

describe('readProfile: Monochord (real profile)', () => {
  const p = readProfile(fixture('monochord'), BASE + 'monochord/')

  it('reads the identity and shape', () => {
    expect(p.label).toBe('Monochord')
    expect(p.comment).toMatch(/waveguide string/)
    expect(p.cautions).toHaveLength(4)
    expect(p.requires).toEqual(['http://purl.org/stuff/jigdaw/MidiEvents'])
    expect([p.audioInputs, p.audioOutputs, p.outputChannels, p.renderQuantum]).toEqual([0, 1, 2, 128])
  })

  it('reads the digests from the profile and resolves locations', () => {
    expect(p.processor).toMatchObject({
      location: BASE + 'monochord/monochord-processor.js',
      registeredName: 'monochord',
      integrity: 'sha384-8eq3/7qzGNHk2HvxkGpHcIRzCPmzdAgxSwxbaSXWQAs1q/ygioG5gbbNd3rWhtfB'
    })
    expect(p.module).toMatchObject({
      location: BASE + 'monochord/monochord.wasm',
      integrity: 'sha384-tmGPQMMRS1k+wweUG/bic10hX+PTqy2pRbZpbIOmqvp/CFUpUmGPr6gakTVDl+V6',
      wasmFeatures: []
    })
    expect(p.assets).toEqual([])
  })

  it('reads the 14 control ports in order with ranges', () => {
    expect(p.ports.map(x => x.symbol)).toEqual(['exciter', 'position', 'hardness', 'bow_pressure', 'decay', 'damping',
      'stiffness', 'body_size', 'body_level', 'pickup', 'release', 'master', 'velocity', 'bend_range'])
    const decay = p.ports.find(x => x.symbol === 'decay')
    expect(decay).toMatchObject({ name: 'Decay', default: 3, minimum: 0.1, maximum: 20, group: 'String', unit: 's', paramIndex: 4 })
    const exciter = p.ports[0]
    expect(exciter.properties).toContain('enumeration')
    expect(exciter.scalePoints).toEqual([{ label: 'Pluck', value: 0 }, { label: 'Bow', value: 1 }, { label: 'Hammer', value: 2 }])
  })
})

describe('readProfile: other real profiles', () => {
  it('Sam declares an asset and a transport requirement', () => {
    const p = readProfile(fixture('sam'), BASE + 'sam/')
    expect(p.assets).toHaveLength(1)
    expect(p.assets[0].name).toBe('text')
    expect(p.assets[0].location).toBe(BASE + 'sam/' + p.assets[0].location.split('/').pop())
    expect(p.requires.map(r => r.split('/').pop())).toEqual(['MidiEvents', 'HostTransport'])
  })

  it('Ferrite declares a wasm feature and two assets', () => {
    const p = readProfile(fixture('ferrite'), BASE + 'ferrite/')
    expect(p.module.wasmFeatures.map(f => f.split('/').pop())).toEqual(['Simd128'])
    expect(p.assets.length).toBe(2)
    for (const asset of p.assets) expect(asset.integrity).toMatch(/^sha384-/)
  })

  it('Pulse and DrumKit and Mop read cleanly with every integrity present', () => {
    for (const name of ['pulse', 'drumkit', 'mop']) {
      const p = readProfile(fixture(name), `${BASE}${name}/`)
      expect(p.ports.length).toBeGreaterThan(3)
      expect(p.processor.integrity).toMatch(/^sha384-/)
      for (const port of p.ports) {
        expect(port.default).toBeGreaterThanOrEqual(port.minimum)
        expect(port.default).toBeLessThanOrEqual(port.maximum)
      }
    }
    const mop = readProfile(fixture('mop'), BASE + 'mop/')
    expect(Math.max(...mop.ports.map(x => x.scalePoints.length))).toBeGreaterThan(100)
  })

  it('resolves locations against the IRI it was fetched from, not the profile @base', () => {
    const local = readProfile(fixture('monochord'), 'http://localhost:47219/plugins/monochord/')
    expect(local.processor.location).toBe('http://localhost:47219/plugins/monochord/monochord-processor.js')
    expect(local.iri).toBe('http://localhost:47219/plugins/monochord/')
  })
})

describe('readProfile: refusals', () => {
  it('refuses a processor with no digest', () => {
    const text = fixture('monochord').replace(/(<#processor>[\s\S]*?)jig:integrity "[^"]+"/, '$1')
    expect(() => readProfile(text, BASE + 'monochord/')).toThrow(ProfileError)
    expect(() => readProfile(text, BASE + 'monochord/')).toThrow(/no usable jig:integrity/)
  })

  it('refuses a module with a malformed digest', () => {
    const text = fixture('monochord').replace(/jig:integrity "sha384-tmG[^"]*"/, 'jig:integrity "sha1-abc"')
    expect(() => readProfile(text, BASE + 'monochord/')).toThrow(/module at .* no usable jig:integrity/)
  })

  it('refuses a profile that describes nothing at the IRI asked for', () => {
    const text = '@prefix jig: <http://purl.org/stuff/jigdaw/> .\n<https://a.test/x/> jig:audioOutputs 1 .\n<https://b.test/y/> jig:audioOutputs 1 .'
    expect(() => readProfile(text, 'https://elsewhere.test/other/')).toThrow(/describes no plugin/)
  })

  it('a mirrored profile that names itself by another absolute IRI is still read', () => {
    const text = fixture('pulse').replace(/^<>$/m, '<https://strandz.it/jigdaw/plugins/pulse/>')
    expect(text).not.toBe(fixture('pulse'))
    const p = readProfile(text, 'http://localhost:9/plugins/pulse/')
    expect(p.label).toBe('Pulse')
    expect(p.processor.integrity).toMatch(/^sha384-/)
  })

  it('refuses a profile with no processor', () => {
    const text = fixture('monochord').replace('jig:processor <#processor> ;', '')
    expect(() => readProfile(text, BASE + 'monochord/')).toThrow(/no jig:processor/)
  })

  it('refuses a processor with no registered name', () => {
    const text = fixture('monochord').replace('jig:registeredName "monochord" ;', '')
    expect(() => readProfile(text, BASE + 'monochord/')).toThrow(/registeredName/)
  })

  it('passes parse errors through with their line number', () => {
    expect(() => readProfile('<> <http://e.test/p> [ ] .', BASE + 'x/')).toThrow(TurtleError)
  })
})

// The one check that needs the real files: that the digest mechanism agrees with jigdaw's own.
const JIGDAW = '/home/danny/github/jigdaw/plugins/monochord'
describe.skipIf(!existsSync(JIGDAW))('against the real Monochord files on disk', () => {
  it('their sha384 digests equal the ones in the profile', async () => {
    const p = readProfile(fixture('monochord'), BASE + 'monochord/')
    expect(await digest(new Uint8Array(readFileSync(join(JIGDAW, 'monochord.wasm'))))).toBe(p.module.integrity)
    expect(await digest(new Uint8Array(readFileSync(join(JIGDAW, 'monochord-processor.js'))))).toBe(p.processor.integrity)
  })
})

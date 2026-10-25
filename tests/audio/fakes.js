// Fakes for the browser APIs the audio layer touches, so it runs in Node.

import { vi } from 'vitest'
import { digest } from '../../src/audio/integrity.js'

export function fakeResponse (status, body) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    json: async () => JSON.parse(new TextDecoder().decode(bytes))
  }
}

/** fetch over a map of url -> string | Uint8Array | number (a bare status). Records calls. */
export function fakeFetch (files) {
  const calls = []
  const impl = vi.fn(async (url, init) => {
    calls.push({ url: String(url), init })
    const body = files[String(url)]
    if (body === undefined) return fakeResponse(404, 'not found')
    if (typeof body === 'number') return fakeResponse(body, '')
    return fakeResponse(200, body)
  })
  impl.calls = calls
  return impl
}

export function fakeContext () {
  return {
    sampleRate: 48000,
    currentTime: 0,
    state: 'running',
    destination: { name: 'destination' },
    audioWorklet: { addModule: vi.fn(async () => {}) },
    resume: vi.fn(async function () { this.state = 'running' })
  }
}

/** behaviour: 'ready' | 'error' | 'silent' */
export function fakeNodeClass (behaviour = 'ready') {
  return class FakeNode {
    static instances = []
    constructor (context, name, options) {
      this.context = context
      this.name = name
      this.options = options
      this.posted = []
      this.connected = []
      this.disconnected = 0
      this.parameters = new Map()
      this.port = {
        onmessage: null,
        postMessage: (message, transfer) => {
          this.posted.push({ message, transfer })
          if (message.type !== 'init') return
          queueMicrotask(() => {
            if (behaviour === 'ready') this.port.onmessage?.({ data: { type: 'ready', latencyFrames: 0 } })
            if (behaviour === 'error') this.port.onmessage?.({ data: { type: 'error', fatal: true, phase: 'instantiate', message: 'boom' } })
          })
        }
      }
      FakeNode.instances.push(this)
    }

    connect (target) { this.connected.push(target) }
    disconnect () { this.disconnected++ }
  }
}

const bytesOf = text => new TextEncoder().encode(text)

/**
 * A complete synthetic plugin served from `base`: profile.ttl with real
 * digests of the fake files.
 */
export async function buildPlugin ({
  base = 'https://plugins.test/tester/',
  name = 'tester',
  processor = 'class P {}',
  wasm = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0),
  requires = ['jig:MidiEvents'],
  extra = '',
  assets = {},
  processorDigest,
  moduleDigest,
  omitModuleDigest = false
} = {}) {
  const processorBytes = bytesOf(processor)
  const assetLines = Object.keys(assets)
  const files = {
    [base + `${name}-processor.js`]: processorBytes,
    [base + `${name}.wasm`]: wasm
  }
  let assetTtl = ''
  for (const key of assetLines) {
    const bytes = bytesOf(assets[key])
    files[base + `${key}.txt`] = bytes
    assetTtl += `<#${key}> a jig:Asset ; jig:location <${key}.txt> ; jig:integrity "${await digest(bytes)}" .\n`
  }
  const ttl = `@base <${base}> .
@prefix jig: <http://purl.org/stuff/jigdaw/> .
@prefix trn: <http://purl.org/stuff/transmissions/> .
@prefix lv2: <http://lv2plug.in/ns/lv2core#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<> a jig:WebPlugin ; rdfs:label "Tester" ;
    ${requires.map(r => `trn:requires ${r}`).join(' ;\n    ')} ;
    jig:audioInputs 0 ; jig:audioOutputs 1 ; jig:outputChannels 2 ; jig:renderQuantum 128 ;
    jig:module <#module> ; jig:processor <#processor> ;
    ${assetLines.map(k => `jig:asset <#${k}>`).join(' ;\n    ')}${assetLines.length ? ' ;' : ''}
    ${extra}
    lv2:port <#gain> .
<#module> a jig:Module ; jig:location <${name}.wasm> ;${omitModuleDigest ? '' : ` jig:integrity "${moduleDigest ?? await digest(wasm)}"`} .
<#processor> a jig:Processor ; jig:location <${name}-processor.js> ; jig:registeredName "${name}" ;
    jig:integrity "${processorDigest ?? await digest(processorBytes)}" .
${assetTtl}<#gain> a lv2:InputPort , lv2:ControlPort ; lv2:symbol "gain" ; lv2:name "Gain" ;
    lv2:default 0.5 ; lv2:minimum 0 ; lv2:maximum 1 .
`
  files[base + 'profile.ttl'] = ttl
  return { base, name, files, ttl, processorBytes, wasm }
}

export function fakeStorage (initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: key => { map.delete(key) }
  }
}

export function throwingStorage () {
  const fail = () => { throw new Error('storage is blocked') }
  return { getItem: fail, setItem: fail, removeItem: fail }
}

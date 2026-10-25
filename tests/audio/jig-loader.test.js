import { describe, it, expect, vi } from 'vitest'
import { loadPlugin, PluginLoadError, profileBase } from '../../src/audio/jig-loader.js'
import { buildPlugin, fakeContext, fakeFetch, fakeNodeClass } from './fakes.js'

const offered = new Set(['http://purl.org/stuff/jigdaw/MidiEvents'])

async function setup (pluginOptions = {}, behaviour = 'ready', fileOverrides = {}) {
  const plugin = await buildPlugin(pluginOptions)
  const fetchImpl = fakeFetch({ ...plugin.files, ...fileOverrides })
  const context = fakeContext()
  const Node = fakeNodeClass(behaviour)
  const createObjectURL = vi.fn(() => 'blob:processor')
  const options = { fetchImpl, AudioWorkletNodeImpl: Node, offered, createObjectURL, readyTimeout: 40 }
  return { plugin, fetchImpl, context, Node, createObjectURL, options }
}

describe('loadPlugin', () => {
  it('loads a verified plugin: registers from the checked bytes, inits with the module, connects after ready', async () => {
    const { plugin, context, Node, createObjectURL, options } = await setup()
    const loaded = await loadPlugin(plugin.base, context, options)

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(Array.from(createObjectURL.mock.calls[0][0])).toEqual(Array.from(plugin.processorBytes))
    expect(context.audioWorklet.addModule).toHaveBeenCalledWith('blob:processor')

    const node = Node.instances[0]
    expect(node.name).toBe('tester')
    expect(node.options).toMatchObject({ numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] })
    expect(node.options.processorOptions).toMatchObject({ sampleRate: 48000, quantum: 128 })

    const init = node.posted[0]
    expect(init.message.type).toBe('init')
    expect(init.message.module).toBeInstanceOf(ArrayBuffer)
    expect(init.message.module).not.toBeInstanceOf(WebAssembly.Module)
    expect(Array.from(new Uint8Array(init.message.module))).toEqual(Array.from(plugin.wasm))
    expect(init.transfer).toContain(init.message.module)
    expect(init.message.sampleRate).toBe(48000)

    expect(node.connected).toEqual([context.destination])
    expect(loaded.profile.label).toBe('Tester')
    expect(loaded.profile.ports.map(p => p.symbol)).toEqual(['gain'])
  })

  it('refuses a tampered module and runs nothing', async () => {
    const { plugin, context, Node, options } = await setup()
    // The profile claims the digest of the real file; the server serves other bytes.
    options.fetchImpl = fakeFetch({ ...plugin.files, [plugin.base + 'tester.wasm']: Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 9) })
    const failure = await loadPlugin(plugin.base, context, options).catch(e => e)
    expect(failure).toBeInstanceOf(PluginLoadError)
    expect(failure.step).toBe('integrity')
    expect(failure.message).toMatch(/module at .*tester\.wasm.*does not match its digest/)
    expect(context.audioWorklet.addModule).not.toHaveBeenCalled()
    expect(options.createObjectURL).not.toHaveBeenCalled()
    expect(Node.instances).toHaveLength(0)
  })

  it('refuses a tampered processor and runs nothing', async () => {
    const { plugin, context, Node, options } = await setup()
    options.fetchImpl = fakeFetch({ ...plugin.files, [plugin.base + 'tester-processor.js']: 'evil()' })
    const failure = await loadPlugin(plugin.base, context, options).catch(e => e)
    expect(failure.step).toBe('integrity')
    expect(failure.message).toMatch(/processor/)
    expect(options.createObjectURL).not.toHaveBeenCalled()
    expect(context.audioWorklet.addModule).not.toHaveBeenCalled()
    expect(Node.instances).toHaveLength(0)
  })

  it('refuses a profile with no digest instead of skipping the check', async () => {
    const { plugin, context, Node, options } = await setup({ omitModuleDigest: true })
    const failure = await loadPlugin(plugin.base, context, options).catch(e => e)
    expect(failure.step).toBe('profile')
    expect(failure.message).toMatch(/no usable jig:integrity/)
    expect(context.audioWorklet.addModule).not.toHaveBeenCalled()
    expect(Node.instances).toHaveLength(0)
  })

  it('refuses unmet requirements before fetching any code', async () => {
    const { plugin, context, fetchImpl, options } = await setup({ requires: ['jig:MidiEvents', 'trn:HostTransport'] })
    const failure = await loadPlugin(plugin.base, context, options).catch(e => e)
    expect(failure.step).toBe('requirements')
    expect(failure.message).toMatch(/Tester requires HostTransport, which Melogen does not provide/)
    expect(fetchImpl.calls.map(c => c.url)).toEqual([plugin.base + 'profile.ttl'])
  })

  it('fetches and verifies assets and passes them to init', async () => {
    const { plugin, context, Node, options } = await setup({ assets: { words: 'hello world' } })
    await loadPlugin(plugin.base, context, options)
    const { assets } = Node.instances[0].posted[0].message
    expect(Object.keys(assets)).toEqual(['words'])
    expect(new TextDecoder().decode(assets.words)).toBe('hello world')

    const tampered = await setup({ assets: { words: 'hello world' } })
    tampered.options.fetchImpl = fakeFetch({ ...tampered.plugin.files, [tampered.plugin.base + 'words.txt']: 'other' })
    const failure = await loadPlugin(tampered.plugin.base, tampered.context, tampered.options).catch(e => e)
    expect(failure.message).toMatch(/asset "words"/)
  })

  it('reports a missing file with its step', async () => {
    const { plugin, context, options } = await setup()
    const files = { ...plugin.files }
    delete files[plugin.base + 'tester.wasm']
    options.fetchImpl = fakeFetch(files)
    const failure = await loadPlugin(plugin.base, context, options).catch(e => e)
    expect(failure.step).toBe('fetch')
    expect(failure.message).toMatch(/404/)
  })

  it('times out when the processor never says ready', async () => {
    const { plugin, context, options } = await setup({}, 'silent')
    const failure = await loadPlugin(plugin.base, context, options).catch(e => e)
    expect(failure.step).toBe('ready')
    expect(failure.message).toMatch(/did not report ready/)
  })

  it('surfaces a fatal error from the processor and does not connect', async () => {
    const { plugin, context, Node, options } = await setup({}, 'error')
    const failure = await loadPlugin(plugin.base, context, options).catch(e => e)
    expect(failure.step).toBe('ready')
    expect(failure.message).toMatch(/instantiate: boom/)
    expect(Node.instances[0].connected).toEqual([])
  })

  it('does not register a processor twice in one context, and refuses a different one under the same name', async () => {
    const { plugin, context, Node, options } = await setup()
    const first = await loadPlugin(plugin.base, context, options)
    first.dispose()
    await loadPlugin(plugin.base, context, options)
    expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1)
    expect(Node.instances).toHaveLength(2)

    const other = await buildPlugin({ processor: 'class Q {}' })
    const failure = await loadPlugin(other.base, context, { ...options, fetchImpl: fakeFetch(other.files) }).catch(e => e)
    expect(failure.step).toBe('register')
    expect(failure.message).toMatch(/already registered/)
  })

  it('dispose tells the processor, detaches, and is idempotent', async () => {
    const { plugin, context, Node, options } = await setup()
    const loaded = await loadPlugin(plugin.base, context, options)
    loaded.dispose()
    loaded.dispose()
    const node = Node.instances[0]
    expect(node.posted.filter(p => p.message.type === 'dispose')).toHaveLength(1)
    expect(node.disconnected).toBe(1)
  })

  it('forwards later processor messages', async () => {
    const { plugin, context, Node, options } = await setup()
    const seen = []
    await loadPlugin(plugin.base, context, { ...options, onMessage: m => seen.push(m) })
    Node.instances[0].port.onmessage({ data: { type: 'dropped', count: 2 } })
    expect(seen).toEqual([{ type: 'dropped', count: 2 }])
  })

  it('falls back to content negotiation when there is no profile.ttl file', async () => {
    const { plugin, context, options } = await setup()
    const files = { ...plugin.files }
    files[plugin.base] = files[plugin.base + 'profile.ttl']
    delete files[plugin.base + 'profile.ttl']
    options.fetchImpl = fakeFetch(files)
    await loadPlugin(plugin.base, context, options)
    const profileCalls = options.fetchImpl.calls.filter(c => !/\.(wasm|js)$/.test(c.url))
    expect(profileCalls.map(c => c.url)).toEqual([plugin.base + 'profile.ttl', plugin.base])
    expect(profileCalls[1].init.headers.Accept).toBe('text/turtle')
  })

  it('reports an unreachable plugin', async () => {
    const { context, options } = await setup()
    const failure = await loadPlugin('https://nowhere.test/p/', context, options).catch(e => e)
    expect(failure.step).toBe('profile')
    expect(failure.message).toMatch(/could not fetch a profile/)
  })

  it('refuses an instrument that produces no audio', async () => {
    const plugin = await buildPlugin()
    const files = { ...plugin.files, [plugin.base + 'profile.ttl']: plugin.ttl.replace('jig:audioOutputs 1', 'jig:audioOutputs 0') }
    const failure = await loadPlugin(plugin.base, fakeContext(), {
      fetchImpl: fakeFetch(files), AudioWorkletNodeImpl: fakeNodeClass(), offered
    }).catch(e => e)
    expect(failure.step).toBe('requirements')
    expect(failure.message).toMatch(/no audio/)
  })
})

describe('profileBase', () => {
  it('adds a trailing slash to a directory IRI and leaves .ttl files alone', () => {
    expect(profileBase('https://a.test/p')).toBe('https://a.test/p/')
    expect(profileBase('https://a.test/p/')).toBe('https://a.test/p/')
    expect(profileBase('https://a.test/p/profile.ttl')).toBe('https://a.test/p/profile.ttl')
    expect(profileBase('https://a.test/p/#frag')).toBe('https://a.test/p/')
  })
})

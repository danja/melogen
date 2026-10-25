// Fetch, verify and start a Jig plugin in an AudioContext.
//
// Follows jigdaw's contract (section 3.1), small: read the profile, refuse
// what cannot run, fetch the processor and module, check every file against
// the digest the profile gives BEFORE running anything, register the
// processor from the verified bytes, construct the node, init it with the
// module's bytes, and wait for ready.

import { readProfile, ProfileError } from './profile.js'
import { verifyIntegrity, IntegrityError } from './integrity.js'
import { offeredCapabilities, missingCapabilities, shortName } from './capabilities.js'
import { TurtleError } from './ttl.js'

export const READY_TIMEOUT_MS = 30000

export class PluginLoadError extends Error {
  constructor (step, message, options) {
    super(message, options)
    this.name = 'PluginLoadError'
    this.step = step
  }
}

// processor name -> integrity, per AudioContext. A processor name can only be
// registered once per context, so switching back to a plugin must not add it again.
const registered = new WeakMap()

/** A directory IRI gets a trailing slash; a .ttl file is used as it is. */
export function profileBase (iri) {
  const url = new URL(iri)
  url.hash = ''
  if (url.pathname.endsWith('.ttl') || url.pathname.endsWith('/')) return url.href
  url.pathname += '/'
  return url.href
}

async function fetchProfile (iri, fetchImpl) {
  const base = profileBase(iri)
  const candidates = base.endsWith('.ttl')
    ? [{ url: base }]
    : [{ url: base + 'profile.ttl' }, { url: base, headers: { Accept: 'text/turtle' } }]
  const failures = []
  for (const { url, headers } of candidates) {
    try {
      const response = await fetchImpl(url, headers ? { headers } : undefined)
      if (response.ok) return { text: await response.text(), base }
      failures.push(`${url}: ${response.status}`)
    } catch (cause) {
      failures.push(`${url}: ${cause.message}`)
    }
  }
  throw new PluginLoadError('profile', `could not fetch a profile for ${iri} (${failures.join('; ')})`)
}

async function fetchVerified (resource, kind, fetchImpl) {
  let response
  try {
    response = await fetchImpl(resource.location)
  } catch (cause) {
    throw new PluginLoadError('fetch', `could not fetch the ${kind} at ${resource.location}: ${cause.message}`, { cause })
  }
  if (!response.ok) throw new PluginLoadError('fetch', `the ${kind} at ${resource.location} answered ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  try {
    await verifyIntegrity(bytes, resource.integrity, `the ${kind} at ${resource.location}`)
  } catch (cause) {
    if (cause instanceof IntegrityError) throw new PluginLoadError('integrity', cause.message, { cause })
    throw cause
  }
  return bytes
}

const ownBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

function waitForReady (node, message, transfer, timeoutMs, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      node.port.onmessage = null
      reject(new PluginLoadError('ready', `"${name}" did not report ready in ${timeoutMs / 1000} seconds`))
    }, timeoutMs)
    node.port.onmessage = event => {
      const reply = event.data
      if (reply?.type === 'ready') {
        clearTimeout(timer)
        node.port.onmessage = null
        resolve({ latencyFrames: reply.latencyFrames ?? 0, tailFrames: reply.tailFrames ?? null })
      } else if (reply?.type === 'error' && reply.fatal !== false) {
        clearTimeout(timer)
        node.port.onmessage = null
        reject(new PluginLoadError('ready', `${reply.phase ?? 'instantiate'}: ${reply.message}`))
      }
    }
    node.port.postMessage(message, transfer)
  })
}

/**
 * @param iri the plugin's IRI
 * @param context an AudioContext
 * @param options { fetchImpl, AudioWorkletNodeImpl, offered, readyTimeout, onMessage, createObjectURL }
 * @returns { node, profile, dispose }
 */
export async function loadPlugin (iri, context, options = {}) {
  const {
    fetchImpl = globalThis.fetch.bind(globalThis),
    AudioWorkletNodeImpl = globalThis.AudioWorkletNode,
    offered = offeredCapabilities(),
    readyTimeout = READY_TIMEOUT_MS,
    onMessage = () => {},
    createObjectURL = bytes => URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }))
  } = options

  const { text, base } = await fetchProfile(iri, fetchImpl)

  let profile
  try {
    profile = readProfile(text, base)
  } catch (cause) {
    if (cause instanceof ProfileError || cause instanceof TurtleError) {
      throw new PluginLoadError('profile', `the profile at ${iri} cannot be used: ${cause.message}`, { cause })
    }
    throw cause
  }

  // Requirements are settled before any code is fetched.
  const missing = missingCapabilities(profile, offered)
  if (missing.length > 0) {
    throw new PluginLoadError('requirements',
      `${profile.label} requires ${missing.map(shortName).join(', ')}, which Melogen does not provide`)
  }
  if (profile.audioOutputs < 1) {
    throw new PluginLoadError('requirements', `${profile.label} produces no audio, so it cannot be played as an instrument`)
  }

  const [processorBytes, moduleBytes, ...assetBytes] = await Promise.all([
    fetchVerified(profile.processor, 'processor', fetchImpl),
    profile.module ? fetchVerified(profile.module, 'module', fetchImpl) : null,
    ...profile.assets.map(asset => fetchVerified(asset, `asset "${asset.name}"`, fetchImpl))
  ])

  const name = profile.processor.registeredName
  let known = registered.get(context)
  if (!known) registered.set(context, known = new Map())
  if (known.has(name) && known.get(name) !== profile.processor.integrity) {
    throw new PluginLoadError('register',
      `a different processor named "${name}" is already registered in this audio context; reload the page to use ${profile.label}`)
  }
  if (!known.has(name)) {
    const url = createObjectURL(processorBytes)
    try {
      await context.audioWorklet.addModule(url)
    } catch (cause) {
      throw new PluginLoadError('register', `the processor "${name}" failed to register: ${cause.message}`, { cause })
    }
    known.set(name, profile.processor.integrity)
  }

  let node
  try {
    node = new AudioWorkletNodeImpl(context, name, {
      numberOfInputs: profile.audioInputs,
      numberOfOutputs: profile.audioOutputs,
      outputChannelCount: Array(profile.audioOutputs).fill(profile.outputChannels),
      processorOptions: { capabilities: profile.requires, sampleRate: context.sampleRate, quantum: profile.renderQuantum }
    })
  } catch (cause) {
    throw new PluginLoadError('construct', `could not construct "${name}": ${cause.message}`, { cause })
  }

  // Bytes, never a compiled WebAssembly.Module: a Module posted to a worklet is silently never delivered.
  const module = moduleBytes ? ownBuffer(moduleBytes) : null
  const assets = {}
  profile.assets.forEach((asset, i) => { assets[asset.name] = ownBuffer(assetBytes[i]) })
  const message = {
    type: 'init', module, assets, capabilities: profile.requires, sampleRate: context.sampleRate, quantum: profile.renderQuantum
  }
  const transfer = [...(module ? [module] : []), ...Object.values(assets)]

  try {
    await waitForReady(node, message, transfer, readyTimeout, name)
  } catch (error) {
    node.disconnect?.()
    throw error
  }

  node.port.onmessage = event => onMessage(event.data)
  node.connect(context.destination)

  let disposed = false
  return {
    node,
    profile,
    dispose () {
      if (disposed) return
      disposed = true
      node.port.postMessage({ type: 'dispose' })
      node.port.onmessage = null
      node.disconnect()
    }
  }
}

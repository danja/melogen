// What Melogen offers a plugin, and whether a profile can run here.
// jigdaw contract section 2: requirements are checked BEFORE any code is
// fetched, so an unusable plugin fails with a reason instead of a crash.

const JIG = 'http://purl.org/stuff/jigdaw/'

// Melogen is a host for MIDI-driven instruments. It sends MIDI events and
// nothing else: no transport, no audio input, no MIDI routing.
const ALWAYS = [JIG + 'MidiEvents']

// The smallest module using each WebAssembly feature, valid only where the
// engine supports it (the probes jigdaw's Capabilities.js uses).
const WASM_FEATURE_PROBES = Object.freeze({
  [JIG + 'Simd128']: Uint8Array.of(
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0,
    65, 0, 253, 15, 253, 98, 11),
  [JIG + 'BulkMemory']: Uint8Array.of(
    0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 3, 1, 0, 1, 10, 14, 1, 12,
    0, 65, 0, 65, 0, 65, 0, 252, 10, 0, 0, 11),
  [JIG + 'ExceptionHandling']: Uint8Array.of(
    0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 8, 1, 6, 0, 6, 64, 25, 11, 11)
})

/** Set of capability IRIs this host provides. */
export function offeredCapabilities (env = globalThis) {
  const offered = new Set(ALWAYS)
  if (typeof env.WebAssembly?.validate === 'function') {
    for (const [feature, probe] of Object.entries(WASM_FEATURE_PROBES)) {
      if (env.WebAssembly.validate(probe)) offered.add(feature)
    }
  }
  return offered
}

/** Last path or fragment segment: "MidiEvents" for either form of the IRI. */
export function shortName (value) {
  return String(value).split(/[/#]/).filter(Boolean).pop() ?? String(value)
}

/** Capability IRIs the profile needs that this host does not offer. */
export function missingCapabilities (profile, offered) {
  const needed = [...profile.requires, ...(profile.module?.wasmFeatures ?? [])]
  return [...new Set(needed)].filter(capability => !offered.has(capability))
}

/** The same test on the catalogue's compact names ("MidiEvents", or a full IRI). */
export function catalogueEntryRunnable (entry, offered) {
  const have = new Set([...offered].map(shortName))
  return (entry.requires ?? []).every(name => have.has(shortName(name)))
}

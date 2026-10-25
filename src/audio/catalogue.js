// The list of instruments Melogen can offer, from a jigdaw plugin index.

import { catalogueEntryRunnable } from './capabilities.js'

const has = (list, name) => (list ?? []).some(item => String(item).split(/[/#]/).pop() === name)

/** A web instrument that takes MIDI and needs nothing Melogen cannot provide. */
export function isUsableInstrument (entry, offered) {
  return entry.web !== false &&
    has(entry.roles, 'Instrument') &&
    has(entry.accepts, 'Midi') &&
    catalogueEntryRunnable(entry, offered)
}

/** @returns [{ iri, label, comment, cautions }] sorted by label */
export async function fetchCatalogue (url, offered, fetchImpl = globalThis.fetch.bind(globalThis)) {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`the catalogue at ${url} answered ${response.status}`)
  const body = await response.json()
  if (!Array.isArray(body?.plugins)) throw new Error(`the catalogue at ${url} has no plugins list`)
  return body.plugins
    .filter(entry => entry.iri && isUsableInstrument(entry, offered))
    .map(({ iri, label, comment, cautions }) => ({ iri, label: label ?? iri, comment: comment ?? '', cautions: cautions ?? [] }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

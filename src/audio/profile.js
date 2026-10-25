// A plugin profile (Turtle) -> what the loader needs: the code to fetch and
// its digests, the audio shape, the requirements, and the control ports.
// Digests are read from the profile itself (jig:integrity).

import { parseTurtle, indexTriples } from './ttl.js'
import { isIntegrity } from './integrity.js'

const JIG = 'http://purl.org/stuff/jigdaw/'
const TRN = 'http://purl.org/stuff/transmissions/'
const LV2 = 'http://lv2plug.in/ns/lv2core#'
const UNITS = 'http://lv2plug.in/ns/extensions/units#'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'

export class ProfileError extends Error {
  constructor (message) {
    super(message)
    this.name = 'ProfileError'
  }
}

const localName = value => value.split(/[#/]/).pop()
const number = term => (term === undefined ? undefined : Number(term.value))
const text = term => (term === undefined ? undefined : term.value)

function readResource (graph, node, kind) {
  const location = graph.first(node, JIG + 'location')
  if (!location || location.type !== 'iri') throw new ProfileError(`the ${kind} ${node} has no jig:location`)
  const integrity = text(graph.first(node, JIG + 'integrity'))
  if (!isIntegrity(integrity)) {
    throw new ProfileError(`the ${kind} at ${location.value} has no usable jig:integrity, and nothing unverified is run`)
  }
  return { iri: node, location: location.value, integrity, mediaType: text(graph.first(node, JIG + 'mediaType')) }
}

function readPort (graph, node) {
  const types = graph.objects(node, RDF + 'type').map(t => t.value)
  if (!types.includes(LV2 + 'InputPort') || !types.includes(LV2 + 'ControlPort')) return null
  const symbol = text(graph.first(node, LV2 + 'symbol'))
  const minimum = number(graph.first(node, LV2 + 'minimum'))
  const maximum = number(graph.first(node, LV2 + 'maximum'))
  const def = number(graph.first(node, LV2 + 'default'))
  if (!symbol || [minimum, maximum, def].some(v => v === undefined || Number.isNaN(v))) return null
  const scalePoints = graph.objects(node, LV2 + 'scalePoint').map(point => ({
    label: text(graph.first(point.value, RDFS + 'label')) ?? String(number(graph.first(point.value, RDF + 'value'))),
    value: number(graph.first(point.value, RDF + 'value'))
  })).sort((a, b) => a.value - b.value)
  const unit = graph.first(node, UNITS + 'unit')
  return {
    symbol,
    name: text(graph.first(node, LV2 + 'name')) ?? symbol,
    default: def,
    minimum,
    maximum,
    group: text(graph.first(node, JIG + 'controlGroup')) ?? '',
    unit: unit ? localName(unit.value) : null,
    properties: graph.objects(node, LV2 + 'portProperty').map(p => localName(p.value)),
    scalePoints,
    paramIndex: number(graph.first(node, JIG + 'paramIndex'))
  }
}

/**
 * The profile's subject: the IRI it was fetched from (`<>`), or, for a
 * mirrored profile that names itself by another absolute IRI, the one
 * subject that has a processor.
 */
function findSubject (graph, iri) {
  if (graph.first(iri, JIG + 'processor')) return iri
  const candidates = graph.subjectsWith(JIG + 'processor')
  if (graph.has(iri)) throw new ProfileError('the profile names no jig:processor')
  if (candidates.length === 1) return candidates[0]
  throw new ProfileError(`${iri} describes no plugin: no statements about <>, and no single subject with a jig:processor`)
}

/**
 * @param turtle profile text
 * @param iri the plugin's IRI: relative references resolve against it, and it
 *   is the profile's subject (`<>`)
 */
export function readProfile (turtle, iri) {
  const { triples } = parseTurtle(turtle, { base: iri })
  const graph = indexTriples(triples)
  const subject = findSubject(graph, iri)
  const processorNode = graph.first(subject, JIG + 'processor')
  const processor = {
    ...readResource(graph, processorNode.value, 'processor'),
    registeredName: text(graph.first(processorNode.value, JIG + 'registeredName'))
  }
  if (!processor.registeredName) throw new ProfileError('the profile gives no jig:registeredName for its processor')

  const moduleNode = graph.first(subject, JIG + 'module')
  const module = moduleNode
    ? {
        ...readResource(graph, moduleNode.value, 'module'),
        wasmFeatures: graph.objects(moduleNode.value, JIG + 'wasmFeature').map(t => t.value)
      }
    : null

  const assets = graph.objects(subject, JIG + 'asset').map(node => ({
    name: localName(node.value),
    ...readResource(graph, node.value, 'asset')
  }))

  const ports = graph.objects(subject, LV2 + 'port').map(node => readPort(graph, node.value)).filter(Boolean)

  const audioOutputs = number(graph.first(subject, JIG + 'audioOutputs')) ?? 0
  const outputChannels = number(graph.first(subject, JIG + 'outputChannels')) ?? 2

  return {
    iri,
    label: text(graph.first(subject, RDFS + 'label')) ?? iri,
    comment: text(graph.first(subject, RDFS + 'comment')) ?? '',
    cautions: graph.objects(subject, TRN + 'caution').map(t => t.value),
    requires: graph.objects(subject, TRN + 'requires').map(t => t.value),
    prefers: graph.objects(subject, JIG + 'prefers').map(t => t.value),
    audioInputs: number(graph.first(subject, JIG + 'audioInputs')) ?? 0,
    audioOutputs,
    outputChannels,
    renderQuantum: number(graph.first(subject, JIG + 'renderQuantum')) ?? 128,
    processor,
    module,
    assets,
    ports
  }
}

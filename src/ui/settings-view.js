// The Settings tab: a form built from a field list. Controls are written back
// from the controller's (clamped) settings after every change, so what is
// shown is what is in force.

import { h } from './dom.js'
import { SCALES, ROOT_NAMES, MODES } from '../music/scales.js'
import { TIME_SIGNATURES } from '../music/timing.js'
import { LIMITS } from '../state/settings.js'

const percent = v => `${Math.round(v * 100)}%`

export const FIELDS = [
  { key: 'mode', label: 'Line', type: 'segment', options: Object.entries(MODES).map(([k, m]) => [k, m.name]),
    help: 'Melody or bassline. Sets the usual octave and the shape of new random lines.' },
  { key: 'root', label: 'Key', type: 'select', number: true, options: ROOT_NAMES.map((name, i) => [i, name]) },
  { key: 'scale', label: 'Scale', type: 'select', options: Object.entries(SCALES).map(([k, s]) => [k, s.name]),
    help: 'Genes are positions in the scale, so every mutation stays in key.' },
  { key: 'octave', label: 'Octave', type: 'number', ...range(LIMITS.octave), help: 'Where the lowest note sits (C4 is middle C).' },
  { key: 'bars', label: 'Bars', type: 'number', ...range(LIMITS.bars) },
  { key: 'timeSignature', label: 'Time signature', type: 'select', options: TIME_SIGNATURES.map(t => [t, t]), confirm: true },
  { key: 'tempo', label: 'Tempo (bpm)', type: 'number', ...range(LIMITS.tempo) },
  { key: 'crossoverRate', label: 'Crossover rate', type: 'range', ...range(LIMITS.crossoverRate, 0.01), format: percent,
    help: 'How often two parents are combined rather than one being copied.' },
  { key: 'mutationRate', label: 'Mutation rate', type: 'range', ...range(LIMITS.mutationRate, 0.01), format: percent,
    help: 'How much each child is changed.' },
  { key: 'populationSize', label: 'Population', type: 'number', ...range(LIMITS.populationSize),
    help: 'Melodies per generation. You hear five at a time; the rest are estimated from your votes. Applies at the next Evolve.' },
  { key: 'loop', label: 'Loop playback', type: 'toggle' }
]

function range ([min, max], step = 1) { return { min, max, step } }

/**
 * @param handlers { onChange(patch, { confirmed }) => { ok } | { needsConfirm }, onReset() }
 */
export function createSettingsView (handlers) {
  const inputs = new Map()
  const readouts = new Map()
  const pending = h('div', { class: 'confirm', role: 'alert', hidden: true })

  const rows = FIELDS.map(field => {
    const id = `setting-${field.key}`
    const input = build(field, id, value => change(field, value))
    inputs.set(field.key, input)
    let readout = null
    if (field.format) { readout = h('output', { for: id, class: 'readout' }); readouts.set(field.key, readout) }
    const control = field.type === 'segment' ? input.el : input
    return h('div', { class: `field field-${field.type}` },
      h('label', { for: field.type === 'segment' ? null : id, id: `${id}-label` }, field.label),
      h('div', { class: 'control' }, control, readout),
      field.help ? h('p', { class: 'help' }, field.help) : null)
  })

  const reset = h('button', { class: 'action quiet', type: 'button' }, 'Reset everything')
  let armed = null
  reset.addEventListener('click', () => {
    if (armed) { clearTimeout(armed); armed = null; reset.textContent = 'Reset everything'; handlers.onReset(); return }
    reset.textContent = 'Reset settings and start over?'
    armed = setTimeout(() => { armed = null; reset.textContent = 'Reset everything' }, 3000)
  })

  const el = h('section', { class: 'settings' }, pending, rows, h('div', { class: 'actions' }, reset))
  let lastSettings = null

  function change (field, value) {
    const result = handlers.onChange({ [field.key]: value })
    if (result?.needsConfirm) {
      // Revert the control until the person confirms.
      if (lastSettings) write(field, lastSettings[field.key])
      pending.hidden = false
      pending.replaceChildren(
        h('p', {}, `Changing the time signature to ${value} starts a new population, because the melodies cannot be mapped across.`),
        h('div', { class: 'actions' },
          h('button', { class: 'action primary', type: 'button', onClick: () => { pending.hidden = true; handlers.onChange({ [field.key]: value }, { confirmed: true }) } }, 'Start new population'),
          h('button', { class: 'action', type: 'button', onClick: () => { pending.hidden = true } }, 'Cancel')))
    }
  }

  function write (field, value) {
    const input = inputs.get(field.key)
    if (field.type === 'segment') {
      for (const button of input.el.children) button.setAttribute('aria-pressed', String(button.dataset.value === String(value)))
    } else if (field.type === 'toggle') {
      input.checked = Boolean(value)
    } else {
      input.value = String(value)
    }
    const readout = readouts.get(field.key)
    if (readout) readout.textContent = field.format(value)
  }

  function render (settings) {
    lastSettings = settings
    for (const field of FIELDS) write(field, settings[field.key])
  }

  return { el, render }
}

function build (field, id, onValue) {
  switch (field.type) {
    case 'segment': {
      const el = h('div', { class: 'segment', role: 'group', 'aria-labelledby': `${id}-label` },
        field.options.map(([value, label]) => h('button', {
          type: 'button', 'aria-pressed': 'false', dataset: { value: String(value) }, onClick: () => onValue(value)
        }, label)))
      return { el }
    }
    case 'select':
      return h('select', { id, onChange: event => onValue(field.number ? Number(event.target.value) : event.target.value) },
        field.options.map(([value, label]) => h('option', { value: String(value) }, label)))
    case 'toggle':
      return h('input', { id, type: 'checkbox', class: 'switch', role: 'switch', onChange: event => onValue(event.target.checked) })
    case 'range':
      return h('input', {
        id, type: 'range', min: field.min, max: field.max, step: field.step,
        onInput: event => onValue(Number(event.target.value))
      })
    default:
      return h('input', {
        id, type: 'number', inputmode: 'numeric', min: field.min, max: field.max, step: field.step,
        onChange: event => onValue(Number(event.target.value))
      })
  }
}

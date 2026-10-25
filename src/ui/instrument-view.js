// The Instrument tab: choose which Jig plugin makes the sound, and play with
// its controls. The controls are generated from the plugin's own ports.

import { h } from './dom.js'
import { icon } from './icons.js'
import { controlKind, sliderMap, formatValue } from '../audio/instrument.js'

const CUSTOM = '__custom__'

/**
 * @param handlers { onChoose(iri), onParam(symbol, value), onReset(), onAudition(), onEnable() }
 */
export function createInstrumentView (handlers) {
  const status = h('p', { class: 'notice', role: 'status' })
  const error = h('p', { class: 'notice error', role: 'alert', hidden: true })

  const select = h('select', { id: 'plugin-select', onChange: event => {
    if (event.target.value !== CUSTOM) handlers.onChoose(event.target.value)
  } })
  const custom = h('input', { id: 'plugin-iri', type: 'url', placeholder: 'https://strandz.it/jigdaw/plugins/pulse/', autocomplete: 'off', spellcheck: 'false' })
  const loadCustom = h('button', { class: 'action', type: 'button', onClick: () => { if (custom.value.trim()) handlers.onChoose(custom.value.trim()) } }, 'Load')
  custom.addEventListener('keydown', event => { if (event.key === 'Enter') loadCustom.click() })

  const about = h('div', { class: 'about' })
  const controls = h('div', { class: 'controls' })
  const audition = h('button', { class: 'action', type: 'button', onClick: () => handlers.onAudition() }, icon('play'), ' Hear a note')
  const reset = h('button', { class: 'action quiet', type: 'button', onClick: () => handlers.onReset() }, icon('reset'), ' Reset controls')
  const enable = h('button', { class: 'action primary', type: 'button', onClick: () => handlers.onEnable() }, 'Enable audio')

  const el = h('section', { class: 'instrument' },
    h('div', { class: 'field' },
      h('label', { for: 'plugin-select' }, 'Instrument'),
      h('div', { class: 'control' }, select)),
    h('div', { class: 'field' },
      h('label', { for: 'plugin-iri' }, 'Or any Jig plugin address'),
      h('div', { class: 'control' }, custom, loadCustom)),
    status, error, enable, about,
    h('div', { class: 'actions' }, audition, reset),
    controls)

  let shownProfile = null
  const widgets = new Map() // symbol -> { port, update(value) }

  let optionsKey = ''

  function renderPicker (session) {
    const entries = session.catalogue.map(p => [p.iri, p.label])
    const known = entries.some(([iri]) => iri === session.iri)
    const options = known ? entries : [[CUSTOM, session.profile ? `${session.profile.label} (custom)` : 'Custom'], ...entries]
    // Rebuilt only when the list changes, so an open dropdown is not closed under the person.
    const key = JSON.stringify(options)
    if (key !== optionsKey) {
      optionsKey = key
      select.replaceChildren(...options.map(([value, label]) => h('option', { value }, label)))
    }
    select.value = known ? session.iri : CUSTOM
    select.title = session.catalogueError ? `The instrument list could not be loaded: ${session.catalogueError}` : ''
  }

  function renderAbout (profile) {
    about.replaceChildren(
      h('h3', {}, profile.label),
      profile.comment ? h('p', {}, profile.comment) : null,
      profile.cautions.length
        ? h('details', {}, h('summary', {}, `${profile.cautions.length} note${profile.cautions.length === 1 ? '' : 's'} from the author`),
          h('ul', {}, profile.cautions.map(c => h('li', {}, c))))
        : null)
  }

  function buildControls (profile) {
    widgets.clear()
    const groups = new Map()
    for (const port of profile.ports) {
      if (!groups.has(port.group)) groups.set(port.group, [])
      groups.get(port.group).push(port)
    }
    controls.replaceChildren(...[...groups].map(([group, ports]) =>
      h('fieldset', { class: 'group' }, group ? h('legend', {}, group) : null, ports.map(buildControl))))
    if (profile.ports.length === 0) controls.replaceChildren(h('p', { class: 'help' }, 'This instrument has no controls.'))
  }

  function buildControl (port) {
    const id = `param-${port.symbol}`
    const kind = controlKind(port)
    const readout = h('output', { for: id, class: 'readout' })
    let input
    let update

    if (kind === 'select') {
      input = h('select', { id, onChange: event => handlers.onParam(port.symbol, Number(event.target.value)) },
        port.scalePoints.map(p => h('option', { value: String(p.value) }, p.label)))
      update = value => { input.value = String(value) }
    } else if (kind === 'toggle') {
      input = h('input', { id, type: 'checkbox', class: 'switch', role: 'switch', onChange: event => handlers.onParam(port.symbol, event.target.checked ? 1 : 0) })
      update = value => { input.checked = value >= 0.5 }
    } else {
      const map = sliderMap(port)
      input = h('input', {
        id, type: 'range', min: 0, max: 1, step: 'any',
        onInput: event => handlers.onParam(port.symbol, map.fromPosition(Number(event.target.value)))
      })
      update = value => { input.value = String(map.toPosition(value)); readout.textContent = formatValue(port, value) }
    }
    const resetOne = h('button', {
      class: 'mini', type: 'button', title: `Reset ${port.name}`, 'aria-label': `Reset ${port.name}`,
      onClick: () => handlers.onParam(port.symbol, port.default)
    }, icon('reset'))
    widgets.set(port.symbol, { port, update })
    return h('div', { class: `field field-${kind}` },
      h('label', { for: id }, port.name),
      h('div', { class: 'control' }, input, kind === 'slider' ? readout : null, resetOne))
  }

  /** @param session InstrumentSession; @param audioStarted whether the audio context exists yet */
  function render (session, audioStarted) {
    renderPicker(session)
    const { state, message } = session.status
    status.textContent = state === 'loading' ? message : state === 'ready' ? `Ready: ${message}` : state === 'error' ? '' : 'Not loaded yet. It loads when you first play.'
    error.textContent = session.error ?? (state === 'error' ? message : '')
    error.hidden = error.textContent === ''
    enable.hidden = audioStarted && state !== 'idle' && state !== 'error'
    audition.disabled = state !== 'ready'
    reset.disabled = !session.profile

    if (session.profile && session.profile !== shownProfile) {
      shownProfile = session.profile
      renderAbout(session.profile)
      buildControls(session.profile)
    }
    for (const [symbol, widget] of widgets) widget.update(session.values[symbol] ?? widget.port.default)
  }

  return { el, render }
}

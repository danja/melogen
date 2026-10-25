// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInstrumentView } from '../../src/ui/instrument-view.js'
import { readProfile } from '../../src/audio/profile.js'
import { mergeValues, sliderMap, formatValue } from '../../src/audio/instrument.js'

const ttl = name => readFileSync(join(import.meta.dirname, '..', 'fixtures', `${name}.ttl`), 'utf8')
const monochord = readProfile(ttl('monochord'), 'https://strandz.it/jigdaw/plugins/monochord/')
const pulse = readProfile(ttl('pulse'), 'https://strandz.it/jigdaw/plugins/pulse/')

const CATALOGUE = [
  { iri: monochord.iri, label: 'Monochord' }, { iri: pulse.iri, label: 'Pulse' }
]

function session (overrides = {}) {
  return {
    iri: monochord.iri, catalogue: CATALOGUE, catalogueError: null, profile: monochord,
    values: mergeValues(monochord.ports, {}), status: { state: 'ready', message: 'Monochord' }, error: null, ...overrides
  }
}

function setup () {
  const handlers = { onChoose: vi.fn(), onParam: vi.fn(), onReset: vi.fn(), onAudition: vi.fn(), onEnable: vi.fn() }
  const view = createInstrumentView(handlers)
  document.body.replaceChildren(view.el)
  return { view, handlers }
}

describe('instrument view', () => {
  it('offers the catalogue with the current plugin selected', () => {
    const { view } = setup()
    view.render(session(), true)
    const select = view.el.querySelector('#plugin-select')
    expect([...select.options].map(o => o.textContent)).toEqual(['Monochord', 'Pulse'])
    expect(select.value).toBe(monochord.iri)
  })

  it('choosing from the list reports the IRI', () => {
    const { view, handlers } = setup()
    view.render(session(), true)
    const select = view.el.querySelector('#plugin-select')
    select.value = pulse.iri
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(handlers.onChoose).toHaveBeenCalledWith(pulse.iri)
  })

  it('a custom address is loaded from the field, with Enter or the button', () => {
    const { view, handlers } = setup()
    view.render(session(), true)
    const field = view.el.querySelector('#plugin-iri')
    field.value = '  http://localhost:47219/plugins/mop/ '
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(handlers.onChoose).toHaveBeenCalledWith('http://localhost:47219/plugins/mop/')
    field.value = ''
    view.el.querySelectorAll('.control .action')[0].click()
    expect(handlers.onChoose).toHaveBeenCalledTimes(1)
  })

  it('shows a plugin that is not in the catalogue as custom, and still selects it', () => {
    const { view } = setup()
    view.render(session({ iri: 'http://localhost:9/x/', profile: { ...monochord, label: 'Local' } }), true)
    const select = view.el.querySelector('#plugin-select')
    expect(select.selectedOptions[0].textContent).toBe('Local (custom)')
  })

  it('does not rebuild the dropdown or the controls when nothing changed', () => {
    const { view } = setup()
    view.render(session(), true)
    const select = view.el.querySelector('#plugin-select')
    const option = select.options[0]
    const slider = view.el.querySelector('#param-position')
    view.render(session(), true)
    view.render(session({ values: { ...session().values, position: 0.3 } }), true)
    expect(select.options[0]).toBe(option)
    expect(view.el.querySelector('#param-position')).toBe(slider)
  })

  it('builds a control for every port, grouped, from the profile', () => {
    const { view } = setup()
    view.render(session(), true)
    expect(view.el.querySelectorAll('.field[class*="field-"] input[id^="param-"], .field select[id^="param-"]')).toHaveLength(14)
    expect([...view.el.querySelectorAll('legend')].map(l => l.textContent)).toEqual(['Exciter', 'String', 'Body', 'Output'])
    const exciter = view.el.querySelector('#param-exciter')
    expect(exciter.tagName).toBe('SELECT')
    expect([...exciter.options].map(o => o.textContent)).toEqual(['Pluck', 'Bow', 'Hammer'])
  })

  it('sliders report the real value, on a log scale where the range is wide', () => {
    const { view, handlers } = setup()
    view.render(session(), true)
    const decay = view.el.querySelector('#param-decay') // 0.1 to 20 s
    decay.value = '0.5'
    decay.dispatchEvent(new Event('input', { bubbles: true }))
    const [symbol, value] = handlers.onParam.mock.calls.at(-1)
    expect(symbol).toBe('decay')
    expect(value).toBeCloseTo(Math.sqrt(0.1 * 20), 6) // halfway on a log scale is the geometric mean
    const hardness = view.el.querySelector('#param-hardness') // 0 to 1: linear
    hardness.value = '0.25'
    hardness.dispatchEvent(new Event('input', { bubbles: true }))
    expect(handlers.onParam.mock.calls.at(-1)).toEqual(['hardness', 0.25])
  })

  it('shows the stored values with units', () => {
    const { view } = setup()
    view.render(session({ values: { ...session().values, decay: 5, release: 250 } }), true)
    const readout = id => view.el.querySelector(`output[for="param-${id}"]`).textContent
    expect(readout('decay')).toBe('5 s')
    expect(readout('release')).toBe('250 ms')
    expect(readout('hardness')).toBe('0.6')
  })

  it('the reset button next to a control restores its default', () => {
    const { view, handlers } = setup()
    view.render(session(), true)
    view.el.querySelector('button[aria-label="Reset Decay"]').click()
    expect(handlers.onParam).toHaveBeenCalledWith('decay', 3)
  })

  it('rebuilds the controls when the plugin changes', () => {
    const { view } = setup()
    view.render(session(), true)
    view.render(session({ iri: pulse.iri, profile: pulse, values: mergeValues(pulse.ports, {}) }), true)
    expect(view.el.querySelector('#param-decay')).toBeNull()
    expect(view.el.querySelector('#param-cutoff')).not.toBeNull()
    expect(view.el.querySelector('.about h3').textContent).toBe('Pulse')
  })

  it('shows the plugin description and the author notes', () => {
    const { view } = setup()
    view.render(session(), true)
    expect(view.el.querySelector('.about').textContent).toMatch(/waveguide/)
    expect(view.el.querySelector('details summary').textContent).toBe('4 notes from the author')
    expect(view.el.querySelectorAll('details li')).toHaveLength(4)
  })

  it('reports loading, errors, and a failure that left the previous plugin working', () => {
    const { view } = setup()
    const status = () => view.el.querySelector('.notice:not(.error)').textContent
    const error = () => view.el.querySelector('.notice.error')
    view.render(session({ status: { state: 'loading', message: 'Loading x' } }), false)
    expect(status()).toBe('Loading x')
    view.render(session({ error: 'digest mismatch. Still using Monochord.' }), true)
    expect(error().hidden).toBe(false)
    expect(error().textContent).toMatch(/Still using Monochord/)
    view.render(session(), true)
    expect(error().hidden).toBe(true)
    view.render(session({ profile: null, status: { state: 'error', message: 'no luck' } }), false)
    expect(error().textContent).toBe('no luck')
  })

  it('shows Enable audio until the instrument is ready, and Hear a note only when it is', () => {
    const { view, handlers } = setup()
    const enable = [...view.el.querySelectorAll('.action')].find(b => b.textContent === 'Enable audio')
    const hear = [...view.el.querySelectorAll('.action')].find(b => b.textContent.includes('Hear a note'))
    view.render(session({ status: { state: 'idle', message: '' } }), false)
    expect(enable.hidden).toBe(false)
    expect(hear.disabled).toBe(true)
    enable.click()
    expect(handlers.onEnable).toHaveBeenCalled()
    view.render(session(), true)
    expect(enable.hidden).toBe(true)
    expect(hear.disabled).toBe(false)
    hear.click()
    expect(handlers.onAudition).toHaveBeenCalled()
  })

  it('a plugin with no controls says so', () => {
    const { view } = setup()
    view.render(session({ profile: { ...monochord, ports: [] }, values: {} }), true)
    expect(view.el.querySelector('.controls').textContent).toMatch(/no controls/)
  })
})

describe('slider mapping', () => {
  const port = (minimum, maximum, properties = []) => ({ minimum, maximum, properties, scalePoints: [] })

  it('is linear for a narrow range and log for a wide one', () => {
    expect(sliderMap(port(0, 1)).log).toBe(false)
    expect(sliderMap(port(0.1, 20)).log).toBe(true)
    expect(sliderMap(port(100, 18000)).log).toBe(true)
    expect(sliderMap(port(1, 10)).log).toBe(false)
  })

  it('round-trips and hits the ends', () => {
    for (const p of [port(0.1, 20), port(0, 1), port(-12, 12)]) {
      const map = sliderMap(p)
      expect(map.fromPosition(0)).toBeCloseTo(p.minimum, 9)
      expect(map.fromPosition(1)).toBeCloseTo(p.maximum, 9)
      for (const t of [0.1, 0.5, 0.9]) expect(map.toPosition(map.fromPosition(t))).toBeCloseTo(t, 9)
    }
  })

  it('formats values with three significant digits and a unit', () => {
    const p = { properties: [], unit: 's' }
    expect(formatValue(p, 0.123456)).toBe('0.123 s')
    expect(formatValue(p, 3)).toBe('3 s')
    expect(formatValue({ properties: [], unit: null }, 1234.5)).toBe('1235')
    expect(formatValue({ properties: ['integer'], unit: null }, 3.4)).toBe('3')
    expect(formatValue({ properties: [], unit: 'semitone12TET' }, 2)).toBe('2 st')
  })
})

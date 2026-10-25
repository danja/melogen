// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { createSettingsView, FIELDS } from '../../src/ui/settings-view.js'
import { DEFAULT_SETTINGS } from '../../src/state/settings.js'

function setup (onChange = vi.fn(() => ({ ok: true }))) {
  const onReset = vi.fn()
  const view = createSettingsView({ onChange, onReset })
  document.body.replaceChildren(view.el)
  view.render({ ...DEFAULT_SETTINGS })
  const input = key => view.el.querySelector(`#setting-${key}`)
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }))
  return { view, onChange, onReset, input, fire }
}

describe('settings view', () => {
  it('has every setting from the idea: octave, bars, time signature, tempo, crossover, mutation', () => {
    const keys = FIELDS.map(f => f.key)
    for (const key of ['octave', 'bars', 'timeSignature', 'tempo', 'crossoverRate', 'mutationRate', 'populationSize', 'scale', 'root', 'mode', 'loop']) {
      expect(keys).toContain(key)
    }
  })

  it('shows the defaults: 4 bars, 4/4, 120 bpm', () => {
    const { input } = setup()
    expect(input('bars').value).toBe('4')
    expect(input('timeSignature').value).toBe('4/4')
    expect(input('tempo').value).toBe('120')
    expect(input('crossoverRate').value).toBe('0.7')
    expect(input('mutationRate').value).toBe('0.1')
    expect(input('loop').checked).toBe(false)
    expect(input('populationSize').value).toBe('20')
  })

  it('shows rates as percentages', () => {
    const { view } = setup()
    const outputs = [...view.el.querySelectorAll('output')].map(o => o.textContent)
    expect(outputs).toEqual(['70%', '10%'])
  })

  it('sends numeric changes as numbers', () => {
    const { input, fire, onChange } = setup()
    input('tempo').value = '96'
    fire(input('tempo'), 'change')
    input('bars').value = '4'
    fire(input('bars'), 'change')
    expect(onChange.mock.calls).toEqual([[{ tempo: 96 }], [{ bars: 4 }]])
  })

  it('sends rate sliders live, and key as a number', () => {
    const { input, fire, onChange } = setup()
    input('mutationRate').value = '0.35'
    fire(input('mutationRate'), 'input')
    input('root').value = '7'
    fire(input('root'), 'change')
    input('scale').value = 'dorian'
    fire(input('scale'), 'change')
    expect(onChange.mock.calls).toEqual([[{ mutationRate: 0.35 }], [{ root: 7 }], [{ scale: 'dorian' }]])
  })

  it('switches melody and bass, and toggles looping', () => {
    const { view, input, fire, onChange } = setup()
    const buttons = [...view.el.querySelectorAll('.segment button')]
    expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    buttons[1].click()
    input('loop').checked = true
    fire(input('loop'), 'change')
    expect(onChange.mock.calls).toEqual([[{ mode: 'bass' }], [{ loop: true }]])
  })

  it('writes back what the controller actually applied (clamped values)', () => {
    const { view, input } = setup()
    view.render({ ...DEFAULT_SETTINGS, tempo: 240, mode: 'bass', octave: 2 })
    expect(input('tempo').value).toBe('240')
    expect(input('octave').value).toBe('2')
    expect([...view.el.querySelectorAll('.segment button')].map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
  })

  it('a time signature change waits for confirmation and leaves the control as it was', () => {
    const onChange = vi.fn(patch => ('timeSignature' in patch && !onChange.confirmed ? { needsConfirm: 'timeSignature' } : { ok: true }))
    const { view, input, fire } = setup(onChange)
    input('timeSignature').value = '3/4'
    fire(input('timeSignature'), 'change')
    expect(input('timeSignature').value).toBe('4/4')
    const bar = view.el.querySelector('.confirm')
    expect(bar.hidden).toBe(false)
    expect(bar.textContent).toMatch(/starts a new population/)

    const [apply, cancel] = bar.querySelectorAll('button')
    onChange.confirmed = true
    apply.click()
    expect(onChange).toHaveBeenLastCalledWith({ timeSignature: '3/4' }, { confirmed: true })
    expect(bar.hidden).toBe(true)

    input('timeSignature').value = '6/8'
    onChange.confirmed = false
    fire(input('timeSignature'), 'change')
    view.el.querySelector('.confirm button:last-child').click()
    expect(view.el.querySelector('.confirm').hidden).toBe(true)
    expect(cancel).toBeDefined()
  })

  it('asks twice before resetting everything', () => {
    vi.useFakeTimers()
    const { view, onReset } = setup()
    const button = [...view.el.querySelectorAll('.action')].find(b => b.textContent === 'Reset everything')
    button.click()
    expect(onReset).not.toHaveBeenCalled()
    button.click()
    expect(onReset).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('labels every control', () => {
    const { view } = setup()
    for (const el of view.el.querySelectorAll('input, select')) {
      expect(view.el.querySelector(`label[for="${el.id}"]`), el.id).not.toBeNull()
    }
  })
})

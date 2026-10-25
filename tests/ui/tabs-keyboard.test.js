// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { createTabs, TAB_KEY } from '../../src/ui/tabs.js'
import { attachKeyboard } from '../../src/keyboard.js'
import { h } from '../../src/ui/dom.js'
import { fakeStorage, throwingStorage } from '../audio/fakes.js'

function makeTabs (storage = null) {
  const panels = { a: h('div', {}, 'A'), b: h('div', {}, 'B'), c: h('div', {}, 'C') }
  const tabs = createTabs({
    storage, tabs: [{ id: 'a', label: 'Alpha', panel: panels.a }, { id: 'b', label: 'Beta', panel: panels.b }, { id: 'c', label: 'Gamma', panel: panels.c }]
  })
  document.body.replaceChildren(tabs.el)
  return { tabs, panels, buttons: [...tabs.el.querySelectorAll('[role=tab]')] }
}

describe('tabs', () => {
  it('shows one panel at a time, with ARIA wiring', () => {
    const { panels, buttons } = makeTabs()
    expect(buttons.map(b => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(Object.values(panels).map(p => p.hidden)).toEqual([false, true, true])
    buttons[1].click()
    expect(buttons.map(b => b.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(Object.values(panels).map(p => p.hidden)).toEqual([true, false, true])
    expect(panels.b.getAttribute('aria-labelledby')).toBe('tab-b')
    expect(buttons[1].getAttribute('aria-controls')).toBe('panel-b')
    expect(buttons.map(b => b.tabIndex)).toEqual([-1, 0, -1])
  })

  it('moves with the arrow keys, wrapping, and Home and End', () => {
    const { tabs, buttons } = makeTabs()
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(tabs.current).toBe('c')
    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(tabs.current).toBe('a')
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(tabs.current).toBe('c')
    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(tabs.current).toBe('a')
  })

  it('remembers the tab, and ignores a stored one that no longer exists', () => {
    const storage = fakeStorage()
    makeTabs(storage).buttons[2].click()
    expect(storage.map.get(TAB_KEY)).toBe('c')
    expect(makeTabs(storage).tabs.current).toBe('c')
    storage.setItem(TAB_KEY, 'gone')
    expect(makeTabs(storage).tabs.current).toBe('a')
  })

  it('works when storage throws', () => {
    const { tabs, buttons } = makeTabs(throwingStorage())
    expect(tabs.current).toBe('a')
    expect(() => buttons[1].click()).not.toThrow()
    expect(tabs.current).toBe('b')
  })
})

describe('keyboard shortcuts', () => {
  function setup (current = 'interact', playing = null) {
    const controller = { togglePlay: vi.fn(), vote: vi.fn(), stop: vi.fn(), playing }
    const tabs = { current }
    // each test gets a fresh document listener target
    const root = document.implementation.createHTMLDocument('t')
    Object.defineProperty(root, 'defaultView', { value: window })
    attachKeyboard(root, { controller, tabs })
    const press = (key, target = root.body, extra = {}) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
      Object.defineProperty(event, 'target', { value: target })
      root.dispatchEvent(event)
      return event
    }
    return { controller, press, root }
  }

  it('1-5 play or stop that row', () => {
    const { controller, press } = setup()
    for (const key of ['1', '3', '5']) press(key)
    expect(controller.togglePlay.mock.calls).toEqual([[0], [2], [4]])
  })

  it('does not respond to 6, 0 without a playing row, or other tabs', () => {
    const idle = setup()
    idle.press('6'); idle.press('0'); idle.press('+')
    expect(idle.controller.togglePlay).not.toHaveBeenCalled()
    expect(idle.controller.vote).not.toHaveBeenCalled()
    const other = setup('settings')
    other.press('1')
    expect(other.controller.togglePlay).not.toHaveBeenCalled()
  })

  it('- 0 + vote on the playing row', () => {
    const { controller, press } = setup('interact', 2)
    press('-'); press('0'); press('+'); press('=')
    expect(controller.vote.mock.calls).toEqual([[2, -1], [2, 0], [2, 1], [2, 1]])
  })

  it('Space stops, but leaves a focused button alone', () => {
    const { controller, press, root } = setup('interact', 1)
    press(' ')
    expect(controller.stop).toHaveBeenCalledTimes(1)
    press(' ', root.createElement('button'))
    expect(controller.stop).toHaveBeenCalledTimes(1)
  })

  it('leaves typing in form fields and modified keys alone', () => {
    const { controller, press, root } = setup('interact', 1)
    press('1', root.createElement('input'))
    press('2', root.createElement('select'))
    press('3', root.body, { ctrlKey: true })
    press('4', root.body, { metaKey: true })
    expect(controller.togglePlay).not.toHaveBeenCalled()
  })
})

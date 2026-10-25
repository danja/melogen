// A three-tab shell. The panels are all in the page (hidden when inactive) so
// each view keeps its state; the chosen tab is remembered.

import { h, guarded } from './dom.js'

export const TAB_KEY = 'melogen.tab'

/**
 * @param tabs [{ id, label, panel: HTMLElement }]
 * @returns { el, show(id), current }
 */
export function createTabs ({ tabs, storage = null, onChange = () => {} }) {
  const list = h('div', { class: 'tablist', role: 'tablist', 'aria-label': 'Melogen sections' })
  const buttons = new Map()
  const panels = new Map()

  for (const tab of tabs) {
    const button = h('button', {
      class: 'tab', role: 'tab', type: 'button', id: `tab-${tab.id}`, 'aria-controls': `panel-${tab.id}`,
      onClick: () => show(tab.id), onKeydown: event => move(event, tab.id)
    }, tab.label)
    tab.panel.id = `panel-${tab.id}`
    tab.panel.setAttribute('role', 'tabpanel')
    tab.panel.setAttribute('aria-labelledby', `tab-${tab.id}`)
    tab.panel.classList.add('panel')
    buttons.set(tab.id, button)
    panels.set(tab.id, tab.panel)
    list.append(button)
  }

  let current = null

  function show (id, { focus = false } = {}) {
    if (!panels.has(id)) id = tabs[0].id
    current = id
    for (const [key, button] of buttons) {
      const active = key === id
      button.setAttribute('aria-selected', String(active))
      button.tabIndex = active ? 0 : -1
      panels.get(key).hidden = !active
    }
    if (focus) buttons.get(id).focus()
    if (storage) guarded(() => storage.setItem(TAB_KEY, id))
    onChange(id)
  }

  function move (event, from) {
    const ids = tabs.map(t => t.id)
    const at = ids.indexOf(from)
    const target = { ArrowRight: ids[(at + 1) % ids.length], ArrowLeft: ids[(at + ids.length - 1) % ids.length], Home: ids[0], End: ids.at(-1) }[event.key]
    if (target) { event.preventDefault(); show(target, { focus: true }) }
  }

  const el = h('div', { class: 'tabs' }, list, ...tabs.map(t => t.panel))
  const stored = storage ? guarded(() => storage.getItem(TAB_KEY)) : null
  show(stored ?? tabs[0].id)

  return { el, show, get current () { return current } }
}

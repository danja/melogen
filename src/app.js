// Wires the controller, the instrument session and the views to a page.

import { DEFAULT_PLUGIN, CATALOGUE_URL, REPO_URL } from '../config.js'
import { AudioEngine } from './audio/engine.js'
import { InstrumentSession } from './audio/session.js'
import { Player } from './audio/player.js'
import { Controller } from './controller.js'
import { h, guarded } from './ui/dom.js'
import { createTabs } from './ui/tabs.js'
import { createInteractView } from './ui/interact-view.js'
import { createSettingsView } from './ui/settings-view.js'
import { createInstrumentView } from './ui/instrument-view.js'
import { downloadBytes } from './ui/download.js'
import { attachKeyboard } from './keyboard.js'
import { installUnlock } from './audio/unlock.js'
import { diagnosticsText, describeBeep } from './diagnostics.js'

/**
 * @param options { root, storage, search, win, fetchImpl, AudioContextImpl }
 */
export function createApp ({
  root = document.getElementById('app'),
  storage = guarded(() => window.localStorage),
  search = window.location.search,
  win = window,
  fetchImpl,
  AudioContextImpl
} = {}) {
  const engine = new AudioEngine({ AudioContextImpl })
  const session = new InstrumentSession({
    engine, storage: storage ?? memoryStorage(), defaultIri: DEFAULT_PLUGIN, catalogueUrl: CATALOGUE_URL, search, fetchImpl
  })
  const player = new Player({ getEngine: () => engine.current })
  const controller = new Controller({ storage: storage ?? memoryStorage(), session, player })

  const interact = createInteractView({
    onPlay: position => controller.togglePlay(position),
    onVote: (position, rating) => controller.vote(position, rating),
    onDownload: position => {
      const file = controller.midiAt(position)
      if (file) downloadBytes(file.bytes, file.filename)
    },
    onMore: () => controller.more(),
    onEvolve: () => controller.evolve(),
    onNew: () => controller.newPopulation()
  })
  const settings = createSettingsView({
    onChange: (patch, options) => controller.setSettings(patch, options),
    onReset: () => controller.resetAll()
  })
  const instrument = createInstrumentView({
    onChoose: iri => session.load(iri),
    onParam: (symbol, value) => session.setValue(symbol, value),
    onReset: () => session.resetValues(),
    onAudition: async () => { if (await session.ensure()) player.audition() },
    onEnable: () => { session.unlock(); session.ensure() },
    onRefreshDiagnostics: () => refreshText(),
    onTestTone: async () => {
      const before = engine.context?.currentTime ?? 0
      const started = await engine.testTone()
      await new Promise(resolve => setTimeout(resolve, 500))
      refreshText()
      return describeBeep({ started, state: engine.context?.state, advanced: (engine.context?.currentTime ?? 0) > before + 0.2 })
    }
  })

  const tabs = createTabs({
    storage,
    tabs: [
      { id: 'interact', label: 'Interact', panel: interact.el },
      { id: 'settings', label: 'Settings', panel: settings.el },
      { id: 'instrument', label: 'Instrument', panel: instrument.el }
    ]
  })

  root.replaceChildren(
    h('header', { class: 'masthead' },
      h('h1', {}, 'Melogen'),
      h('div', { class: 'subtitle' },
        h('p', {}, 'Breed melodies by ear'),
        h('a', { href: REPO_URL, target: '_blank', rel: 'noopener', 'aria-label': 'Melogen on GitHub (opens in a new tab)' }, 'GitHub'))),
    tabs.el)

  function render () {
    const { state, message } = session.status
    interact.render(controller.viewModel(), { state, message, error: session.error })
    settings.render(controller.settings)
    instrument.render(session, engine.context !== null)
  }
  controller.subscribe(render)
  session.subscribe(render)
  render()

  // The audio context may only start from a gesture, and which events count differs by
  // browser, so every gesture tries until it runs. The first also starts loading the
  // instrument, so Play finds it ready.
  const removeUnlock = installUnlock(win, session)

  // The diagnostics refresh only while they are open.
  let diagnosticsTimer = null
  // The text is written on demand (open, Refresh, after a beep), never on a timer:
  // rewriting it under the cursor would wipe any selection made to copy it.
  const refreshText = () => instrument.renderDiagnostics(diagnosticsText({ engine, session, player, win }))
  instrument.onDiagnosticsToggle(open => {
    clearInterval(diagnosticsTimer)
    diagnosticsTimer = open ? setInterval(() => instrument.renderLevel(engine.level()), 250) : null
    if (open) refreshText()
  })

  session.loadCatalogue()
  const detachKeyboard = attachKeyboard(win.document, { controller, tabs })

  /** Stop playback and remove every listener this app added to the page. */
  function dispose () {
    player.stop()
    removeUnlock()
    clearInterval(diagnosticsTimer)
    detachKeyboard()
  }

  return { controller, session, engine, player, tabs, render, dispose }
}

/** Stand-in when localStorage is unavailable, so the app still runs (without remembering). */
function memoryStorage () {
  const map = new Map()
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: key => { map.delete(key) }
  }
}

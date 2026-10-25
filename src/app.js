// Wires the controller, the instrument session and the views to a page.

import { DEFAULT_PLUGIN, CATALOGUE_URL } from '../config.js'
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
import { diagnosticsText } from './diagnostics.js'

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
    onEnable: () => { session.unlock(); session.ensure() }
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
    h('header', { class: 'masthead' }, h('h1', {}, 'Melogen'), h('p', {}, 'Breed melodies by ear')),
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
  function refreshDiagnostics () {
    instrument.renderDiagnostics(diagnosticsText({ engine, session, player, win }), engine.level())
  }
  instrument.onDiagnosticsToggle(open => {
    clearInterval(diagnosticsTimer)
    diagnosticsTimer = open ? setInterval(refreshDiagnostics, 250) : null
    if (open) refreshDiagnostics()
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

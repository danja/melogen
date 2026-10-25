// The Interact tab: five rows of Play, - 0 + and Download, and the buttons
// that move the run on. Rows are built once and updated in place, so a
// focused button stays focused across a vote.

import { h } from './dom.js'
import { icon } from './icons.js'

export const ROWS = 5

const ORIGIN_LABEL = {
  random: 'new', immigrant: 'fresh', crossover: 'bred', mutation: 'mutated', elite: 'kept'
}

const VOTES = [[-1, '−', 'Dislike', 'down'], [0, '0', 'Neutral', 'zero'], [1, '+', 'Like', 'up']]

/**
 * @param handlers { onPlay(position), onVote(position, rating), onDownload(position), onMore, onEvolve, onNew }
 */
export function createInteractView (handlers) {
  const intro = h('p', { class: 'intro' },
    'Play each melody and vote \u2212 0 +. More brings the next five; Evolve breeds a new generation from your votes.')
  const title = h('h2', { class: 'run-title' })
  const progress = h('p', { class: 'run-progress' })
  // Never `hidden`: the line keeps its space, so the status appearing while the
  // instrument loads does not move the rows out from under a finger mid-tap.
  const notice = h('p', { class: 'notice idle', role: 'status' })
  const rowEls = []

  const list = h('ol', { class: 'rows' })
  for (let position = 0; position < ROWS; position++) {
    const playButton = h('button', { class: 'play', type: 'button', onClick: () => handlers.onPlay(position) }, icon('play'))
    const number = h('span', { class: 'number' }, String(position + 1))
    const origin = h('span', { class: 'origin' })
    const votes = h('div', { class: 'votes', role: 'group' },
      VOTES.map(([rating, label, name, kind]) => h('button', {
        class: `vote vote-${kind}`, type: 'button', 'aria-pressed': 'false', 'aria-label': `${name} melody ${position + 1}`,
        dataset: { rating: String(rating) }, onClick: () => handlers.onVote(position, rating)
      }, label)))
    const download = h('button', {
      class: 'download', type: 'button', 'aria-label': `Download melody ${position + 1} as a MIDI file`,
      title: 'Download .mid', onClick: () => handlers.onDownload(position)
    }, icon('download'))
    const row = h('li', { class: 'row', dataset: { position: String(position) } },
      playButton, h('div', { class: 'info' }, number, origin), votes, download, h('span', { class: 'sweep', 'aria-hidden': 'true' }))
    rowEls.push({ row, playButton, origin, votes, shownPlaying: false })
    list.append(row)
  }

  const more = h('button', { class: 'action', type: 'button', onClick: () => handlers.onMore() }, 'More')
  const evolve = h('button', { class: 'action primary', type: 'button', onClick: () => handlers.onEvolve() }, 'Evolve')
  const fresh = h('button', { class: 'action quiet', type: 'button' }, 'New population')
  let armed = null
  fresh.addEventListener('click', () => {
    if (armed) { clearTimeout(armed); armed = null; fresh.textContent = 'New population'; handlers.onNew(); return }
    fresh.textContent = 'Discard this run?'
    armed = setTimeout(() => { armed = null; fresh.textContent = 'New population' }, 3000)
  })

  const el = h('section', { class: 'interact' }, intro, title, progress, notice, list,
    h('div', { class: 'actions' }, more, evolve), h('div', { class: 'actions' }, fresh))

  /**
   * @param vm Controller.viewModel()
   * @param audio { state: 'idle'|'loading'|'ready'|'error', message, error }
   */
  function render (vm, audio = { state: 'idle', message: '', error: null }) {
    title.textContent = `Generation ${vm.generation + 1}`
    progress.textContent = `Round ${Math.max(vm.round, 1)} of ${vm.totalRounds} · ${vm.ratedCount} of ${vm.populationSize} rated`

    rowEls.forEach((parts, position) => {
      const data = vm.rows[position]
      parts.row.hidden = !data
      if (!data) return
      parts.row.classList.toggle('playing', data.playing)
      parts.row.classList.toggle('carried', data.carried)
      parts.row.classList.toggle('looping', data.playing && vm.settings.loop)
      parts.row.style.setProperty('--duration', `${vm.duration}s`)
      // Swapped only when it changes: replacing the icon under a pressed
      // pointer makes the browser drop the click (the first tap on Play
      // re-renders while the instrument starts loading).
      if (parts.shownPlaying !== data.playing) {
        parts.playButton.replaceChildren(icon(data.playing ? 'stop' : 'play'))
        parts.shownPlaying = data.playing
      }
      parts.playButton.setAttribute('aria-label', `${data.playing ? 'Stop' : 'Play'} melody ${position + 1}`)
      parts.playButton.setAttribute('aria-pressed', String(data.playing))
      parts.origin.textContent = data.carried ? 'carried over' : ORIGIN_LABEL[data.origin] ?? ''
      parts.origin.title = data.carried ? 'Your best from the last generation, carried over unchanged. Its + stands unless you change it.' : data.parents.length ? `from ${data.parents.join(' × ')}` : data.id
      for (const button of parts.votes.children) {
        button.setAttribute('aria-pressed', String(data.rating !== null && Number(button.dataset.rating) === data.rating))
      }
    })

    more.disabled = !vm.canMore
    evolve.disabled = !vm.canEvolve

    const text = audio.error ?? (audio.state === 'loading' ? 'Loading the instrument…' : audio.state === 'error' ? audio.message : '')
    notice.textContent = text
    notice.classList.toggle('idle', text === '')
    notice.classList.toggle('error', Boolean(audio.error) || audio.state === 'error')
  }

  return { el, render }
}

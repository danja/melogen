// Keyboard shortcuts on the Interact tab: 1-5 play or stop a row, then
// - 0 + vote on the row that is playing.

const VOTE_KEYS = { '-': -1, _: -1, 0: 0, '+': 1, '=': 1 }

/** @returns a function that removes the listener */
export function attachKeyboard (doc, { controller, tabs }) {
  const onKeydown = event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target
    if (target instanceof doc.defaultView.HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
    if (tabs.current !== 'interact') return

    if (/^[1-5]$/.test(event.key)) {
      event.preventDefault()
      controller.togglePlay(Number(event.key) - 1)
    } else if (event.key in VOTE_KEYS && controller.playing !== null) {
      event.preventDefault()
      controller.vote(controller.playing, VOTE_KEYS[event.key])
    } else if (event.key === ' ' && controller.playing !== null && !(target instanceof doc.defaultView.HTMLButtonElement)) {
      event.preventDefault()
      controller.stop()
    }
  }
  doc.addEventListener('keydown', onKeydown)
  return () => doc.removeEventListener('keydown', onKeydown)
}

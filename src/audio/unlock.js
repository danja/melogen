// Keep trying to start audio on every gesture until it is running. Which event
// counts as a gesture differs by browser (iOS wants touchend or click, not
// pointerdown), so every kind is tried, and each also starts loading the
// instrument so that Play finds it ready.

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']

/** @returns a function that removes the listeners */
export function installUnlock (win, session) {
  const remove = () => { for (const type of GESTURES) win.removeEventListener(type, handler, { capture: true }) }
  function handler () {
    session.unlock()
    session.ensure()
    if (session.engine.running) remove()
  }
  for (const type of GESTURES) win.addEventListener(type, handler, { capture: true })
  return remove
}

// Saving the session to localStorage: settings, the population with its
// ratings and archive, and the random generator's state, under one versioned
// key. Every access is guarded: storage throws in some private windows, can be
// full, and can hold anything. A bad or old save is ignored, never fatal.

import { validateSettings } from './settings.js'

export const STATE_KEY = 'melogen.state'
export const STATE_VERSION = 1

/** @returns { settings, population, rngState } or null */
export function loadState (storage) {
  try {
    const raw = storage.getItem(STATE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved || saved.version !== STATE_VERSION) return null
    return {
      settings: validateSettings(saved.settings ?? {}),
      population: saved.population && typeof saved.population === 'object' ? saved.population : null,
      rngState: Number.isInteger(saved.rngState) ? saved.rngState : null
    }
  } catch {
    return null
  }
}

/** @returns true if written */
export function saveState (storage, { settings, population, rngState }) {
  try {
    storage.setItem(STATE_KEY, JSON.stringify({ version: STATE_VERSION, settings, population, rngState }))
    return true
  } catch {
    return false
  }
}

export function clearState (storage) {
  try { storage.removeItem(STATE_KEY); return true } catch { return false }
}

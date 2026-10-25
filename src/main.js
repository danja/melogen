import { createApp } from './app.js'

const app = createApp()

// `?debug` exposes the app for poking at in the console.
if (new URLSearchParams(location.search).has('debug')) window.melogen = app

// Offline support. Only where service workers are allowed (https or localhost).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(error => console.warn('service worker not registered:', error.message))
}

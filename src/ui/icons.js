import { svgIcon } from './dom.js'

const PATHS = Object.freeze({
  play: 'M8 5v14l11-7z',
  stop: 'M6 6h12v12H6z',
  download: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
  reset: 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z'
})

export function icon (name) {
  const path = PATHS[name]
  if (!path) throw new Error(`unknown icon "${name}"`)
  return svgIcon(path)
}

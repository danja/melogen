// A very small element builder, so views read as structure rather than as
// createElement calls. Event handlers go in as onClick, onInput, onChange...

export function h (tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue
    if (name === 'class') el.className = value
    else if (/^on[A-Z]/.test(name) && typeof value === 'function') el.addEventListener(name.slice(2).toLowerCase(), value)
    else if (name === 'dataset') Object.assign(el.dataset, value)
    else if (name === 'value' || name === 'checked' || name === 'disabled' || name === 'hidden') el[name] = value
    else el.setAttribute(name, value === true ? '' : String(value))
  }
  append(el, children)
  return el
}

function append (el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
}

export function clear (el) {
  while (el.firstChild) el.removeChild(el.firstChild)
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** A 24x24 icon from one path. */
export function svgIcon (path, label = null) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '24')
  svg.setAttribute('height', '24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const p = document.createElementNS(SVG_NS, 'path')
  p.setAttribute('d', path)
  p.setAttribute('fill', 'currentColor')
  svg.append(p)
  if (label) svg.setAttribute('aria-label', label)
  return svg
}

/** Run `fn` and return its result, or `fallback` if it throws (storage in private windows). */
export function guarded (fn, fallback = null) {
  try { return fn() } catch { return fallback }
}

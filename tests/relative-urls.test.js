// The app is served at https://strandz.it/melogen/ behind a proxy that strips
// the prefix, so a root-absolute URL ("/src/app.js") would point at
// strandz.it/src/app.js and miss. Everything must be relative.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

function walk (dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const files = [
  join(ROOT, 'index.html'), join(ROOT, 'manifest.webmanifest'), join(ROOT, 'sw.js'), join(ROOT, 'config.js'),
  join(ROOT, 'styles', 'main.css'),
  ...walk(join(ROOT, 'src')).filter(f => f.endsWith('.js'))
]

// A quote or url( followed by a single slash and a path character. "//host" and
// "/" alone (a comment, a division, a regex) are not matched.
const ABSOLUTE = /(?:["'`]|url\()\/(?![/\s"'`)*])[A-Za-z0-9_.-]/g

describe('relative URLs', () => {
  for (const file of files) {
    it(`${file.slice(ROOT.length + 1)} has no root-absolute paths`, () => {
      const text = readFileSync(file, 'utf8')
      const hits = [...text.matchAll(ABSOLUTE)].map(m => text.slice(m.index, m.index + 30).split('\n')[0])
      expect(hits).toEqual([])
    })
  }

  it('the manifest is scoped to where it is served from', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'))
    expect(manifest.start_url).toBe('./')
    expect(manifest.scope).toBe('./')
    for (const icon of manifest.icons) expect(icon.src.startsWith('/')).toBe(false)
  })

  it('the service worker is registered relatively, so its scope is /melogen/', () => {
    expect(readFileSync(join(ROOT, 'src', 'main.js'), 'utf8')).toContain("register('./sw.js')")
  })

  it('the regex really catches an absolute path', () => {
    for (const bad of ['import x from "/src/app.js"', "href='/styles/main.css'", 'url(/icons/a.png)', 'fetch(`/api/x`)']) {
      expect(bad.match(ABSOLUTE), bad).not.toBeNull()
    }
    for (const fine of ['import x from "./a.js"', 'a / b', "'//cdn.test/x'", 'path.split("/")', '"/"']) {
      expect(fine.match(ABSOLUTE), fine).toBeNull()
    }
  })
})

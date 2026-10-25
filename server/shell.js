// The app shell: the exact set of files the server will serve, and a version
// that changes whenever any of them does. The service worker precaches this
// list, so a deploy needs no manual cache bump.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, posix } from 'node:path'

const ROOT_FILES = ['index.html', 'manifest.webmanifest', 'config.js']
const DIRECTORIES = ['src', 'styles', 'icons']

function walk (root, directory, out) {
  for (const name of readdirSync(join(root, directory)).sort()) {
    if (name.startsWith('.')) continue
    const relative = posix.join(directory, name)
    if (statSync(join(root, relative)).isDirectory()) walk(root, relative, out)
    else out.push(relative)
  }
}

export function listShell (root) {
  const files = ROOT_FILES.filter(name => existsSync(join(root, name)))
  for (const directory of DIRECTORIES) {
    if (existsSync(join(root, directory))) walk(root, directory, files)
  }
  return files
}

export function shellVersion (root, files) {
  const hash = createHash('sha256')
  for (const file of files) hash.update(file).update('\0').update(readFileSync(join(root, file))).update('\0')
  return hash.digest('hex').slice(0, 12)
}

/**
 * @param live recompute on every call (development: files change under you)
 */
export function createShell (root, { live = false } = {}) {
  const compute = () => {
    const files = listShell(root)
    return { files, set: new Set(files), version: shellVersion(root, files) }
  }
  // Production hashes once, here, so the version is the one the server started
  // with and a broken checkout fails at startup rather than for a visitor.
  const fixed = live ? null : compute()
  return { get: () => fixed ?? compute() }
}

/** The service worker with its version filled in. */
export function renderServiceWorker (root, version) {
  return readFileSync(join(root, 'sw.js'), 'utf8').replaceAll('__VERSION__', version)
}

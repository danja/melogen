// Fails if any source file is over the line limit.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LIMIT = 500
const ROOTS = ['src', 'server', 'bin']

export function walk (dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (name.endsWith('.js')) out.push(path)
  }
  return out
}

export function oversize (root, limit = LIMIT) {
  const found = []
  for (const sub of ROOTS) {
    let files
    try { files = walk(join(root, sub)) } catch { continue }
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n').length
      if (lines > limit) found.push({ file, lines })
    }
  }
  return found
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const bad = oversize(process.cwd())
  for (const { file, lines } of bad) console.error(`${file}: ${lines} lines (limit ${LIMIT})`)
  process.exit(bad.length ? 1 : 0)
}

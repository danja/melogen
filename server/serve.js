// A small static server for Melogen. Behind nginx at /melogen/ in production
// (nginx strips the prefix, so this serves at its own root); also the dev server.
//
//   PORT   default 47219
//   HOST   default 127.0.0.1 (loopback: only nginx is published)
//   MELOGEN_DEV=1          recompute the file list on every request
//   JIGDAW_PLUGINS=<dir>   also serve a local jigdaw plugins folder at /plugins/ (development only)

import { createServer } from 'node:http'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createShell } from './shell.js'
import { createHandler } from './static.js'

// Paths come from import.meta.url: the newer shortcut properties need Node 20.11, and the server may run on 18.
const HERE = dirname(fileURLToPath(import.meta.url))

export const DEFAULT_PORT = 47219
export const DEFAULT_HOST = '127.0.0.1'

export function startServer ({
  root = resolve(HERE, '..'),
  port = DEFAULT_PORT,
  host = DEFAULT_HOST,
  live = false,
  pluginsDir = null,
  log = () => {}
} = {}) {
  const shell = createShell(root, { live })
  const server = createServer(createHandler({ root, shell, pluginsDir, log }))
  return new Promise((resolveListening, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolveListening(server))
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT)
  const host = process.env.HOST ?? DEFAULT_HOST
  const log = line => console.log(`${new Date().toISOString()} ${line}`)
  const server = await startServer({
    port,
    host,
    live: process.env.MELOGEN_DEV === '1',
    pluginsDir: process.env.JIGDAW_PLUGINS ? resolve(process.env.JIGDAW_PLUGINS) : null,
    log
  })
  log(`melogen listening on http://${host}:${port}/`)

  const stop = signal => {
    log(`${signal}: closing`)
    server.close(() => process.exit(0))
    server.closeAllConnections?.()
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
}

// The server runs under whatever Node the host has (18 and up). import.meta.dirname
// and import.meta.filename arrived in 20.11 and are undefined before it, which
// crashed the service at startup on a host with an older Node.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')

describe('server code runs on Node 18', () => {
  for (const file of ['server/serve.js', 'server/static.js', 'server/shell.js', 'server/headers.js', 'bin/check-size.js']) {
    it(`${file} avoids import.meta.dirname and import.meta.filename`, () => {
      expect(readFileSync(join(ROOT, file), 'utf8')).not.toMatch(/import\.meta\.(dirname|filename)/)
    })
  }

  it('starts as a script, as systemd runs it, and says it is listening', async () => {
    const child = spawn(process.execPath, ['server/serve.js'], { cwd: ROOT, env: { ...process.env, PORT: '0', HOST: '127.0.0.1' } })
    const out = await new Promise((resolve, reject) => {
      let text = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error('no startup line: ' + text)) }, 5000)
      child.stdout.on('data', d => { text += d; if (/listening on/.test(text)) { clearTimeout(timer); child.kill('SIGTERM'); resolve(text) } })
      child.stderr.on('data', d => { text += d })
      child.on('exit', code => { clearTimeout(timer); if (!/listening/.test(text)) reject(new Error(`exited ${code}: ${text}`)) })
    })
    expect(out).toMatch(/melogen listening on http:\/\/127\.0\.0\.1:/)
  })
})

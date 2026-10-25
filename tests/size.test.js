import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { oversize, LIMIT } from '../bin/check-size.js'

describe('source size limit', () => {
  it('the project has no file over the limit', () => {
    expect(oversize(join(import.meta.dirname, '..'))).toEqual([])
  })

  it('detects an oversize file', () => {
    const root = mkdtempSync(join(tmpdir(), 'size-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'big.js'), 'x\n'.repeat(LIMIT + 5))
    writeFileSync(join(root, 'src', 'ok.js'), 'x\n'.repeat(10))
    const bad = oversize(root)
    expect(bad).toHaveLength(1)
    expect(bad[0].file).toMatch(/big\.js$/)
  })
})

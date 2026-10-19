import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../src/cli/index.js'
import { fixture } from './helpers.js'

const originalWrite = process.stdout.write.bind(process.stdout)
const originalError = process.stderr.write.bind(process.stderr)
let dir = ''
let out: string[] = []

function capture(): void {
  out = []
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((_chunk: string | Uint8Array) => {
    return true
  }) as typeof process.stderr.write
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-guard-verify-'))
  process.env['DSH_GUARD_INDEX'] = join(dir, 'index.json')
})

afterEach(async () => {
  process.stdout.write = originalWrite
  process.stderr.write = originalError
  delete process.env['DSH_GUARD_INDEX']
  process.exitCode = 0
  await rm(dir, { recursive: true, force: true })
})

describe('index verify', () => {
  it('exits 3 for a package that was never recorded', async () => {
    capture()
    const code = await main(['index', 'verify', fixture('clean-plugin')])
    expect(code).toBe(3)
    expect(out.join('')).toMatch(/not recorded/i)
  })

  it('exits 0 when the scanned artefact still matches the recording', async () => {
    capture()
    await main(['index', 'add', fixture('clean-plugin')])
    capture()
    const code = await main(['index', 'verify', fixture('clean-plugin')])
    expect(code).toBe(0)
    expect(out.join('')).toMatch(/matches the recorded artefact/i)
  })

  it('drops structurally broken entries instead of trusting them', async () => {
    await writeFile(
      join(dir, 'index.json'),
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: { 'bad@1.0.0': { name: 'bad' } } }),
      'utf8',
    )
    capture()
    const code = await main(['index', 'verify', '--json'])
    expect(code).toBe(0)
    const result = JSON.parse(out.join(''))
    expect(result.removed).toEqual(['bad@1.0.0'])
    expect(result.entries).toBe(0)
  })
})

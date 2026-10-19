import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadIndex, lookupEntry, recordEntry, removeEntry, listEntries, indexFilePath } from '../src/index-store/index.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-guard-index-'))
  process.env['DSH_GUARD_INDEX'] = join(dir, 'index.json')
})

afterEach(async () => {
  delete process.env['DSH_GUARD_INDEX']
  await rm(dir, { recursive: true, force: true })
})

const entry = {
  name: 'dsh-plugin-demo',
  version: '1.0.0',
  packageJsonSha256: 'a'.repeat(64),
  treeSha256: 'b'.repeat(64),
  verdict: 'pass' as const,
  score: 100,
  scannedAt: new Date().toISOString(),
  publisher: 'demo',
  dshVersion: '>=0.1.0',
}

describe('trust index store', () => {
  it('uses DSH_GUARD_INDEX when set', () => {
    expect(indexFilePath()).toBe(process.env['DSH_GUARD_INDEX'])
  })

  it('starts empty and tolerates a missing file', async () => {
    const index = await loadIndex()
    expect(index.entries).toEqual({})
  })

  it('records and reads back an entry', async () => {
    await recordEntry(entry)
    const found = await lookupEntry('dsh-plugin-demo', '1.0.0')
    expect(found?.treeSha256).toBe('b'.repeat(64))
    expect(await listEntries()).toHaveLength(1)
  })

  it('removes an entry', async () => {
    await recordEntry(entry)
    expect(await removeEntry('dsh-plugin-demo', '1.0.0')).toBe(true)
    expect(await lookupEntry('dsh-plugin-demo', '1.0.0')).toBeNull()
  })

  it('returns null for an unknown package', async () => {
    expect(await lookupEntry('nope', '0.0.0')).toBeNull()
  })
})

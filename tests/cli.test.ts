import { afterEach, describe, expect, it } from 'vitest'
import { main } from '../src/cli/index.js'
import { fixture } from './helpers.js'

const originalWrite = process.stdout.write.bind(process.stdout)
const originalError = process.stderr.write.bind(process.stderr)

function capture(): { out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(String(chunk))
    return true
  }) as typeof process.stderr.write
  return { out, err }
}

afterEach(() => {
  process.stdout.write = originalWrite
  process.stderr.write = originalError
  process.exitCode = 0
})

describe('cli', () => {
  it('prints JSON for --json and exits 0 on a clean plugin', async () => {
    const { out } = capture()
    const code = await main(['scan', fixture('clean-plugin'), '--json'])
    const report = JSON.parse(out.join(''))
    expect(code).toBe(0)
    expect(report.summary.verdict).toBe('pass')
    expect(report.tool.name).toBe('dsh-plugin-guard')
  })

  it('exits 1 when a high finding exists', async () => {
    const { out } = capture()
    const code = await main(['scan', fixture('postinstall'), '--json'])
    const report = JSON.parse(out.join(''))
    expect(report.summary.verdict).toBe('fail')
    expect(code).toBe(1)
  })

  it('exits 1 on medium findings only with --fail-on-medium', async () => {
    const first = capture()
    const withoutFlag = await main(['scan', fixture('wildcard-deps'), '--json', '--only', 'deps/wildcard'])
    expect(JSON.parse(first.out.join('')).summary.medium).toBe(2)
    expect(withoutFlag).toBe(0)

    const second = capture()
    const withFlag = await main([
      'scan',
      fixture('wildcard-deps'),
      '--json',
      '--only',
      'deps/wildcard',
      '--fail-on-medium',
    ])
    expect(JSON.parse(second.out.join('')).summary.medium).toBe(2)
    expect(withFlag).toBe(1)
  })

  it('prints a readable report by default', async () => {
    const { out } = capture()
    const code = await main(['scan', fixture('dangerous-api')])
    const text = out.join('')
    expect(code).toBe(1)
    expect(text).toContain('FAIL')
    expect(text).toContain('HIGH')
    expect(text).toContain('next')
    expect(text).not.toContain('{')
  })

  it('reports unknown rules instead of ignoring them', async () => {
    const { err } = capture()
    const code = await main(['scan', fixture('clean-plugin'), '--only', 'nope/nope'])
    expect(code).toBe(3)
    expect(err.join('')).toContain('nope/nope')
  })

  it('prints the rule list as JSON', async () => {
    const { out } = capture()
    const code = await main(['rules', '--json'])
    const payload = JSON.parse(out.join(''))
    expect(code).toBe(0)
    expect(payload.count).toBeGreaterThan(10)
  })
})

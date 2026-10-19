import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fixture, rulesOf, scanFixture } from './helpers.js'

describe('fixture scans', () => {
  it('passes a plugin that declares its permissions and uses nothing dangerous', async () => {
    const report = await scanFixture('clean-plugin')
    expect(report.findings).toEqual([])
    expect(report.summary.verdict).toBe('pass')
    expect(report.summary.score).toBe(100)
    expect(report.dsh.hasBlock).toBe(true)
    expect(report.dsh.bundlePatch).toEqual(['./cordis.patch.yml'])
    expect(report.permissions.valid).toBe(true)
    expect(report.permissions.capabilities).toContain('filesystem.read')
  })

  it('flags a bundle patch that is declared but not shipped', async () => {
    const report = await scanFixture('missing-bundle')
    expect(rulesOf(report)).toContain('manifest/dsh-block')
    expect(report.summary.verdict).toBe('warn')
  })

  it('fails a plugin that shells out and evaluates code', async () => {
    const report = await scanFixture('dangerous-api')
    expect(report.summary.verdict).toBe('fail')
    expect(report.summary.high).toBeGreaterThan(0)
    expect(rulesOf(report)).toContain('security/dangerous-api')
    expect(rulesOf(report)).toContain('permissions/code-mismatch')
    expect(report.findings.some((f) => f.locations?.some((l) => l.file === 'index.js'))).toBe(true)
  })

  it('flags code that is not covered by the declared permissions', async () => {
    const report = await scanFixture('undeclared-permissions')
    const mismatch = report.findings.find((finding) => finding.ruleId === 'permissions/code-mismatch')
    expect(mismatch).toBeDefined()
    expect(mismatch?.severity).toBe('medium')
    expect(mismatch?.message).toContain('filesystem.write')
  })

  it('flags a plugin with no permission declaration at all', async () => {
    const report = await scanFixture('missing-permissions')
    const finding = report.findings.find((f) => f.ruleId === 'permissions/declared')
    expect(finding).toBeDefined()
    expect(finding?.severity).toBe('medium')
  })

  it('fails a plugin with a postinstall script', async () => {
    const report = await scanFixture('postinstall')
    const finding = report.findings.find((f) => f.ruleId === 'security/install-scripts')
    expect(finding).toBeDefined()
    expect(finding?.severity).toBe('high')
    expect(report.summary.verdict).toBe('fail')
  })

  it('flags unpinned dependencies and a missing lockfile', async () => {
    const report = await scanFixture('wildcard-deps')
    const ids = rulesOf(report)
    expect(ids).toContain('deps/wildcard')
    expect(ids).toContain('deps/lockfile')
    expect(report.findings.filter((f) => f.ruleId === 'deps/wildcard')).toHaveLength(2)
  })

  it('never executes the code it scans', async () => {
    const report = await scanFixture('no-execute')
    expect(report.findings.length).toBeGreaterThan(0)
    expect(existsSync(join(fixture('no-execute'), 'IMPORTED_MARKER'))).toBe(false)
    expect(existsSync(join(fixture('no-execute'), 'INSTALLED_MARKER'))).toBe(false)
  })

  it('records the source hashes it used', async () => {
    const report = await scanFixture('clean-plugin')
    expect(report.source.packageJsonSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(report.source.treeSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(report.files.scanned).toBeGreaterThan(0)
  })

  it('is deterministic: two scans of the same folder produce the same tree hash', async () => {
    const first = await scanFixture('clean-plugin')
    const second = await scanFixture('clean-plugin')
    expect(second.source.treeSha256).toBe(first.source.treeSha256)
  })
})

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { analyze } from '../src/scanner/analyze.js'
import type { ScanOptions, ScanReport } from '../src/scanner/types.js'
import { VERSION } from '../src/version.js'

const here = dirname(fileURLToPath(import.meta.url))

export function fixture(name: string): string {
  return join(here, 'fixtures', name)
}

/** Analyze a fixture directory exactly like the CLI does, without touching the network. */
export async function scanFixture(name: string, options: Partial<ScanOptions> = {}): Promise<ScanReport> {
  const root = fixture(name)
  const { readTextFile } = await import('../src/util/fsx.js')
  const raw = await readTextFile(join(root, 'package.json'))
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  } catch {
    parsed = null
  }
  const name_ = typeof parsed?.['name'] === 'string' ? (parsed['name'] as string) : null
  const version = typeof parsed?.['version'] === 'string' ? (parsed['version'] as string) : null
  return analyze({
    root,
    target: { kind: 'directory', input: root, name: name_, version, root, fromRegistry: false },
    npmMeta: null,
    indexEntry: null,
    options: { offline: true, checkPublish: false, toolVersion: VERSION, ...options },
  })
}

export function rulesOf(report: ScanReport): string[] {
  return report.findings.map((finding) => finding.ruleId)
}

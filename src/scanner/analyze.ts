import { readFile } from 'node:fs/promises'
import type {
  Finding,
  IndexEntry,
  NpmMeta,
  RuleContext,
  ScanOptions,
  ScanReport,
  Severity,
  Verdict,
} from './types.js'
import { SEVERITIES, SEVERITY_WEIGHT } from './types.js'
import { isSensitivePath, readTextFile, sha256Hex, walkFiles, joinInside } from '../util/fsx.js'
import { grantedCapabilities, validatePermissions } from '../permissions/schema.js'
import type { PermissionIssue } from '../permissions/schema.js'
import { selectRules } from '../rules/index.js'
import { satisfies } from '../util/semver.js'

const PACKAGE_JSON_LIMIT = 1024 * 1024
const FINGERPRINT_FILE_LIMIT = 1024 * 1024
const FINGERPRINT_TOTAL_LIMIT = 32 * 1024 * 1024

interface AnalyzeInput {
  root: string
  target: ScanReport['target']
  npmMeta: NpmMeta | null
  indexEntry: IndexEntry | null
  options: ScanOptions
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function patchList(dsh: Record<string, unknown> | null): string[] | null {
  const bundle = asRecord(dsh?.['bundle'])
  const patch = bundle?.['patch']
  if (typeof patch === 'string') return [patch]
  if (Array.isArray(patch) && patch.every((item) => typeof item === 'string')) return patch as string[]
  return null
}

function countSeverities(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 }
  for (const finding of findings) counts[finding.severity] += 1
  return counts
}

function scoreOf(findings: Finding[]): number {
  const penalty = findings.reduce((total, finding) => total + finding.weight, 0)
  return Math.max(0, Math.min(100, 100 - penalty))
}

export async function analyze(input: AnalyzeInput): Promise<ScanReport> {
  const startedAt = Date.now()
  const { root, options } = input
  const notes: string[] = []

  const packageJsonRaw = await readTextFile(joinInside(root, 'package.json'), PACKAGE_JSON_LIMIT)
  let packageJson: Record<string, unknown> | null = null
  let packageJsonError: string | null = null
  if (packageJsonRaw === null) {
    packageJsonError = 'file is missing or unreadable'
  } else {
    try {
      const parsed: unknown = JSON.parse(packageJsonRaw)
      packageJson = asRecord(parsed)
      if (packageJson === null) packageJsonError = 'top-level value is not an object'
    } catch (error) {
      packageJsonError = (error as Error).message
    }
  }

  const dshBlock = asRecord(packageJson?.['dsh'])
  const permissionsRaw = dshBlock?.['permissions']
  const validation = permissionsRaw === undefined ? null : validatePermissions(permissionsRaw)
  const permissions = validation?.ok ? validation.permissions : null
  const permissionIssues: PermissionIssue[] = validation && !validation.ok ? validation.issues : []

  const files: string[] = []
  let totalBytes = 0
  let truncatedWalk = false
  for await (const file of walkFiles(root, { maxFiles: options.maxFiles ?? 5000 })) {
    files.push(file.rel)
    totalBytes += file.size
  }
  if (files.length >= (options.maxFiles ?? 5000)) truncatedWalk = true
  files.sort()
  if (truncatedWalk) notes.push(`Only the first ${files.length} files were inspected.`)

  // Fingerprint the tree for the trust index (paths + per-file hashes, sorted).
  let treeFingerprint: string | null = null
  if (totalBytes <= FINGERPRINT_TOTAL_LIMIT) {
    const parts: string[] = []
    let fingerprintedBytes = 0
    for (const rel of files) {
      try {
        const buffer = await readFile(joinInside(root, rel))
        if (buffer.length > FINGERPRINT_FILE_LIMIT) {
          fingerprintedBytes += buffer.length
          parts.push(`${rel}\u0000large:${buffer.length}`)
          continue
        }
        fingerprintedBytes += buffer.length
        parts.push(`${rel}\u0000${sha256Hex(buffer)}`)
      } catch {
        parts.push(`${rel}\u0000unreadable`)
      }
      if (fingerprintedBytes > FINGERPRINT_TOTAL_LIMIT) break
    }
    treeFingerprint = parts.length > 0 ? sha256Hex(parts.join('\n')) : null
  } else {
    notes.push('Tree too large to fingerprint; source integrity is reported as unknown.')
  }

  const fileSet = new Set(files)
  const ctx: RuleContext = {
    root,
    packageJsonRaw,
    packageJson,
    packageJsonError,
    permissions,
    permissionIssues,
    dshBlock,
    files,
    totalFiles: files.length,
    truncatedWalk,
    dshVersion: options.dshVersion ?? null,
    fromRegistry: input.target.fromRegistry,
    npmMeta: input.npmMeta,
    treeFingerprint,
    indexEntry: input.indexEntry,
    sensitivePaths: [],
    readText: async (rel, maxBytes) => {
      if (isSensitivePath(rel)) return null
      return readTextFile(joinInside(root, rel), maxBytes)
    },
    walk: async (rel) => files.filter((file) => file === rel || file.startsWith(rel.endsWith('/') ? rel : rel + '/')),
  }

  const rules = selectRules({ only: options.only, ignore: options.ignore })
  const findings: Finding[] = []
  for (const rule of rules) {
    const results = await rule.run(ctx)
    for (const result of results) {
      findings.push({ ...result, weight: SEVERITY_WEIGHT[result.severity] })
    }
  }
  findings.sort((a, b) => {
    const order = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)
    return order !== 0 ? order : a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0
  })

  const counts = countSeverities(findings)
  const verdict: Verdict = counts.high > 0 ? 'fail' : counts.medium > 0 ? 'warn' : 'pass'
  const engines = asRecord(packageJson?.['engines'])
  const engineRange = typeof engines?.['dsh'] === 'string' ? (engines['dsh'] as string) : null
  const client = asRecord(dshBlock?.['client'])
  const manifestVersion = typeof dshBlock?.['manifestVersion'] === 'number' ? (dshBlock['manifestVersion'] as number) : null
  const dshVersion = options.dshVersion ?? null
  const compatible = engineRange && dshVersion ? satisfies(dshVersion, engineRange) : null

  if (!input.target.fromRegistry) {
    notes.push('npm publish state was not checked for a local directory (pass --check-publish to look it up).')
  }
  notes.push('The scanner only read files; it did not import, require, evaluate or execute any package code.')

  const report: ScanReport = {
    schemaVersion: 1,
    tool: { name: 'dsh-plugin-guard', version: options.toolVersion ?? '0.0.0' },
    target: input.target,
    dsh: {
      hasBlock: dshBlock !== null,
      manifestVersion,
      bundlePatch: patchList(dshBlock),
      engineRange,
      clientPlatform: typeof client?.['platform'] === 'string' ? (client['platform'] as string) : null,
      dshVersion,
      compatible,
    },
    permissions: {
      declared: permissionsRaw !== undefined,
      valid: permissions !== null,
      capabilities: permissions ? grantedCapabilities(permissions) : [],
      issues: permissionIssues,
      declaration: permissions,
    },
    npm: {
      published: input.target.fromRegistry ? true : input.npmMeta !== null ? true : null,
      latestVersion: input.npmMeta?.version ?? null,
      publisher: input.npmMeta?.publisher ?? null,
      deprecated: input.npmMeta?.deprecated ?? null,
      checked: input.npmMeta !== null,
    },
    source: {
      packageJsonSha256: packageJsonRaw ? sha256Hex(packageJsonRaw) : null,
      treeSha256: treeFingerprint,
      verified: input.indexEntry !== null && treeFingerprint !== null && input.indexEntry.treeSha256 === treeFingerprint,
      indexEntry: input.indexEntry,
    },
    files: { scanned: fileSet.size, truncated: truncatedWalk },
    findings,
    summary: {
      verdict,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      info: counts.info,
      score: scoreOf(findings),
      rulesRun: rules.length,
    },
    notes,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  }

  return report
}

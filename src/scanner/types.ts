import type { Permissions, PermissionIssue } from '../permissions/schema.js'

export const SEVERITIES = ['high', 'medium', 'low', 'info'] as const
export type Severity = (typeof SEVERITIES)[number]

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  high: 100,
  medium: 40,
  low: 10,
  info: 0,
}

export interface EvidenceLocation {
  /** Path relative to the scanned root (or the npm package name for remote findings). */
  file: string
  line?: number
  snippet?: string
}

export interface RuleResult {
  ruleId: string
  severity: Severity
  title: string
  message: string
  /** What the reader should do next; shown verbatim in the human report. */
  fix?: string
  /** Guidance for tools and for the JSON consumer. */
  docs?: string
  locations?: EvidenceLocation[]
}

export interface RuleContext {
  root: string
  /** Raw package.json source (null when the file is missing or unparsable). */
  packageJsonRaw: string | null
  packageJson: Record<string, unknown> | null
  packageJsonError: string | null
  /** Parsed dsh.permissions declaration, or null when absent/invalid. */
  permissions: Permissions | null
  permissionIssues: PermissionIssue[]
  dshBlock: Record<string, unknown> | null
  files: string[]
  totalFiles: number
  truncatedWalk: boolean
  /** Text of source files, loaded lazily by the rules that need them. */
  readText: (rel: string, maxBytes?: number) => Promise<string | null>
  walk: (rel: string) => Promise<string[]>
  /** True when the target came from the npm registry (so publishing checks are meaningful). */
  fromRegistry: boolean
  /** Filled in by the resolver when available. */
  npmMeta: NpmMeta | null
  dshVersion: string | null
  /** Absolute paths that the rule engine must never read. */
  sensitivePaths: string[]
  /** Hash of all scanned file contents (path + bytes), used by the trust index. */
  treeFingerprint: string | null
  /** Trust-index record for this exact name@version, when one exists. */
  indexEntry: IndexEntry | null
}

export interface NpmMeta {
  name: string
  version: string
  description?: string
  license?: string
  publisher?: string
  publishedAt?: string
  repository?: string
  deprecated?: string
  hasReadme?: boolean
  tarballSize?: number
  bin?: Record<string, string>
  dependencies?: Record<string, string>
}

export interface Rule {
  id: string
  severity: Severity
  title: string
  summary: string
  /** Documentation anchor, e.g. "docs/rules.md#dangerous-api". */
  docs?: string
  run(ctx: RuleContext): Promise<RuleResult[]> | RuleResult[]
}

export type Verdict = 'pass' | 'warn' | 'fail'

export interface Finding extends RuleResult {
  weight: number
}

export interface ReportSummary {
  verdict: Verdict
  high: number
  medium: number
  low: number
  info: number
  score: number
  rulesRun: number
}

export interface ScanReport {
  schemaVersion: 1
  tool: { name: string; version: string }
  target: {
    kind: 'directory' | 'npm'
    input: string
    name: string | null
    version: string | null
    root: string | null
    fromRegistry: boolean
  }
  dsh: {
    hasBlock: boolean
    manifestVersion: number | null
    bundlePatch: string[] | null
    engineRange: string | null
    clientPlatform: string | null
    dshVersion: string | null
    compatible: boolean | null
  }
  permissions: {
    declared: boolean
    valid: boolean
    capabilities: string[]
    issues: PermissionIssue[]
    declaration: Permissions | null
  }
  npm: {
    published: boolean | null
    latestVersion: string | null
    publisher: string | null
    deprecated: string | null
    checked: boolean
  }
  source: {
    packageJsonSha256: string | null
    treeSha256: string | null
    verified: boolean
    indexEntry: IndexEntry | null
  }
  files: { scanned: number; truncated: boolean }
  findings: Finding[]
  summary: ReportSummary
  notes: string[]
  generatedAt: string
  durationMs: number
}

export interface IndexEntry {
  name: string
  version: string
  packageJsonSha256: string
  treeSha256: string
  verdict: Verdict
  score: number
  scannedAt: string
  publisher: string | null
  dshVersion: string | null
}

export type ScanOptions = {
  /** Skip all network access (default true unless --check-publish was requested). */
  offline?: boolean
  /** Registry metadata lookup for npm inputs. */
  checkPublish?: boolean
  /** Override the directory scanned for an npm input (test seams). */
  cwd?: string
  /** Limit which rules run. */
  only?: string[]
  /** Skip rules by id. */
  ignore?: string[]
  dshVersion?: string | null
  index?: boolean
  failOnMedium?: boolean
  maxFiles?: number
  toolVersion?: string
}

export interface ScanOutcome {
  report: ScanReport
  exitCode: number
}

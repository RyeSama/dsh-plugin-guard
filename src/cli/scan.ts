import { analyze } from '../scanner/analyze.js'
import { resolveTarget } from '../scanner/resolve.js'
import type { ScanOptions, ScanReport } from '../scanner/types.js'
import { entryFromReport, lookupEntry, recordEntry } from '../index-store/index.js'
import { joinInside, readTextFile } from '../util/fsx.js'
import { VERSION, TOOL_NAME } from '../version.js'
import { color } from './colors.js'
import { renderJson, renderReport } from './render.js'

export interface ScanFlags {
  json?: boolean
  offline?: boolean
  checkPublish?: boolean
  only?: string
  ignore?: string
  failOnMedium?: boolean
  dshVersion?: string
  record?: boolean
  maxFiles?: string
  verbose?: boolean
}

function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}

async function readIdentity(root: string): Promise<{ name: string | null; version: string | null }> {
  const raw = await readTextFile(joinInside(root, 'package.json'))
  if (!raw) return { name: null, version: null }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      name: typeof parsed['name'] === 'string' ? (parsed['name'] as string) : null,
      version: typeof parsed['version'] === 'string' ? (parsed['version'] as string) : null,
    }
  } catch {
    return { name: null, version: null }
  }
}

export async function runScan(target: string | undefined, flags: ScanFlags): Promise<number> {
  const options: ScanOptions = {
    offline: flags.offline ?? true,
    checkPublish: flags.checkPublish ?? false,
    only: splitList(flags.only),
    ignore: splitList(flags.ignore),
    failOnMedium: flags.failOnMedium ?? false,
    dshVersion: flags.dshVersion ?? null,
    toolVersion: VERSION,
    maxFiles: flags.maxFiles ? Number(flags.maxFiles) : undefined,
  }
  if (options.maxFiles !== undefined && (!Number.isFinite(options.maxFiles) || options.maxFiles <= 0)) {
    process.stderr.write(`${color.red('error')} --max-files must be a positive number\n`)
    return 2
  }

  const resolved = await resolveTarget(target ?? '.', options)
  try {
    const identity = resolved.npmMeta
      ? { name: resolved.npmMeta.name, version: resolved.npmMeta.version }
      : await readIdentity(resolved.root)

    let npmMeta = resolved.npmMeta
    if (!npmMeta && options.checkPublish && identity.name) {
      const { resolveNpmPackage } = await import('../scanner/npm.js')
      try {
        const lookup = await resolveNpmPackage(identity.name, identity.version)
        npmMeta = {
          name: lookup.meta.name,
          version: lookup.meta.version,
          publisher: lookup.meta.publisher ?? undefined,
          publishedAt: lookup.meta.publishedAt ?? undefined,
          deprecated: lookup.meta.deprecated ?? undefined,
          repository: lookup.meta.repository ?? undefined,
        }
      } catch (error) {
        // A 404 is a finding, not a crash: keep npmMeta null and let the rule speak.
        if ((error as { code?: string }).code !== 'not-found') throw error
      }
    }

    const indexEntry = identity.name && identity.version ? await lookupEntry(identity.name, identity.version) : null

    const report = await analyze({
      root: resolved.root,
      target: {
        kind: resolved.kind,
        input: resolved.input,
        name: identity.name,
        version: identity.version,
        root: resolved.kind === 'directory' ? resolved.root : null,
        fromRegistry: resolved.kind === 'npm',
      },
      npmMeta,
      indexEntry,
      options,
    })

    if (flags.record) {
      const entry = entryFromReport(report)
      if (entry) {
        const path = await recordEntry(entry)
        report.notes.push(`Recorded in the trust index: ${path}`)
      } else {
        report.notes.push('Could not record: package name, version or source hash is missing.')
      }
    }

    emit(report, flags)
    return exitCodeOf(report, options)
  } finally {
    if (resolved.cleanup) await resolved.cleanup()
  }
}

function emit(report: ScanReport, flags: ScanFlags): void {
  if (flags.json) {
    process.stdout.write(renderJson(report) + '\n')
    return
  }
  process.stdout.write(renderReport(report, { verbose: flags.verbose }) + '\n')
}

function exitCodeOf(report: ScanReport, options: ScanOptions): number {
  if (report.summary.high > 0) return 1
  if (options.failOnMedium && report.summary.medium > 0) return 1
  return 0
}

export { TOOL_NAME }

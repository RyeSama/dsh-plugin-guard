import { analyze } from '../scanner/analyze.js'
import { resolveTarget } from '../scanner/resolve.js'
import { entryFromReport, listEntries, loadIndex, recordEntry, removeEntry, saveIndex, indexFilePath } from '../index-store/index.js'
import { readTextFile, joinInside } from '../util/fsx.js'
import { color } from './colors.js'
import type { ScanOptions } from '../scanner/types.js'
import { VERSION } from '../version.js'

function offlineOptions(): ScanOptions {
  return { offline: true, checkPublish: false, toolVersion: VERSION, dshVersion: null }
}

async function identityOf(root: string): Promise<{ name: string | null; version: string | null }> {
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

export async function runIndexAdd(target: string, flags: { json?: boolean }): Promise<number> {
  const resolved = await resolveTarget(target, offlineOptions())
  try {
    const identity = resolved.npmMeta
      ? { name: resolved.npmMeta.name, version: resolved.npmMeta.version }
      : await identityOf(resolved.root)
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
      npmMeta: resolved.npmMeta
        ? {
            name: resolved.npmMeta.name,
            version: resolved.npmMeta.version,
            publisher: resolved.npmMeta.publisher ?? undefined,
            publishedAt: resolved.npmMeta.publishedAt ?? undefined,
            deprecated: resolved.npmMeta.deprecated ?? undefined,
            repository: resolved.npmMeta.repository ?? undefined,
          }
        : null,
      indexEntry: null,
      options: offlineOptions(),
    })
    const entry = entryFromReport(report)
    if (!entry) {
      process.stderr.write(`${color.red('error')} cannot record an entry without package name, version and source hash\n`)
      return 3
    }
    const path = await recordEntry(entry)
    if (flags.json) {
      process.stdout.write(JSON.stringify({ entry, path }, null, 2) + '\n')
    } else {
      process.stdout.write(`${color.green('recorded')} ${entry.name}@${entry.version}\n`)
      process.stdout.write(`  verdict  ${entry.verdict}\n`)
      process.stdout.write(`  tree     ${entry.treeSha256}\n`)
      process.stdout.write(`  index    ${path}\n`)
    }
    return 0
  } finally {
    if (resolved.cleanup) await resolved.cleanup()
  }
}

export async function runIndexList(flags: { json?: boolean }): Promise<number> {
  const entries = await listEntries()
  if (flags.json) {
    process.stdout.write(JSON.stringify({ path: indexFilePath(), entries }, null, 2) + '\n')
    return 0
  }
  if (entries.length === 0) {
    process.stdout.write(`The trust index is empty (${indexFilePath()}).\n`)
    process.stdout.write(`Add a package you trust: ${color.cyan('dsh-plugin-guard index add ./my-plugin')}\n`)
    return 0
  }
  process.stdout.write(`${color.bold('trust index')} — ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}\n\n`)
  for (const entry of entries) {
    process.stdout.write(
      `  ${entry.name}@${entry.version}  ${entry.verdict.padEnd(5)}  ${entry.treeSha256.slice(0, 12)}  ${entry.scannedAt}\n`,
    )
  }
  process.stdout.write(`\n${color.dim(indexFilePath())}\n`)
  return 0
}

export async function runIndexRemove(spec: string, flags: { json?: boolean }): Promise<number> {
  const separator = spec.lastIndexOf('@')
  if (separator <= 0 || separator === spec.length - 1) {
    process.stderr.write(`${color.red('error')} expected name@version, got "${spec}"\n`)
    process.stderr.write(`${color.dim('hint')}  Run "dsh-plugin-guard index list" to see what is recorded.\n`)
    return 2
  }
  const removed = await removeEntry(spec.slice(0, separator), spec.slice(separator + 1))
  if (flags.json) {
    process.stdout.write(JSON.stringify({ spec, removed }, null, 2) + '\n')
  } else if (removed) {
    process.stdout.write(`${color.green('removed')} ${spec}\n`)
  } else {
    process.stdout.write(`No entry for ${spec}.\n`)
  }
  return removed ? 0 : 0
}

export async function runIndexPath(flags: { json?: boolean }): Promise<number> {
  const path = indexFilePath()
  if (flags.json) {
    process.stdout.write(JSON.stringify({ path }, null, 2) + '\n')
  } else {
    process.stdout.write(path + '\n')
  }
  return 0
}

export async function runIndexVerify(flags: { json?: boolean }): Promise<number> {
  const index = await loadIndex()
  const specs = Object.keys(index.entries)
  const missing: string[] = []
  for (const spec of specs) {
    const entry = index.entries[spec]
    if (!entry) missing.push(spec)
  }
  if (missing.length > 0) {
    delete process.env['DSH_GUARD_INDEX']
    for (const spec of missing) delete index.entries[spec]
    await saveIndex(index)
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, entries: Object.keys(index.entries).length, removed: missing }, null, 2) + '\n')
  } else {
    process.stdout.write(`Trust index is valid: ${Object.keys(index.entries).length} entries.\n`)
    if (missing.length > 0) process.stdout.write(`Removed ${missing.length} corrupt entries.\n`)
  }
  return 0
}

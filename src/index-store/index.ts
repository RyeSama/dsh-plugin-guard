import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJsonFile, writeFileAtomic } from '../util/fsx.js'
import type { IndexEntry } from '../scanner/types.js'

export interface IndexFile {
  version: 1
  updatedAt: string
  /** Keyed by `name@version`. */
  entries: Record<string, IndexEntry>
}

export function indexFilePath(): string {
  const override = process.env['DSH_GUARD_INDEX']
  if (override && override.trim() !== '') return override
  return join(homedir(), '.dsh-plugin-guard', 'index.json')
}

function key(name: string, version: string): string {
  return `${name}@${version}`
}

export async function loadIndex(): Promise<IndexFile> {
  const path = indexFilePath()
  const parsed = await readJsonFile<Partial<IndexFile>>(path)
  if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || typeof parsed.entries !== 'object' || parsed.entries === null) {
    return { version: 1, updatedAt: new Date(0).toISOString(), entries: {} }
  }
  return { version: 1, updatedAt: parsed.updatedAt ?? new Date(0).toISOString(), entries: parsed.entries }
}

export async function saveIndex(index: IndexFile): Promise<string> {
  const path = indexFilePath()
  await writeFileAtomic(path, JSON.stringify({ ...index, updatedAt: new Date().toISOString() }, null, 2) + '\n', 0o600)
  return path
}

export async function lookupEntry(name: string, version: string): Promise<IndexEntry | null> {
  const index = await loadIndex()
  return index.entries[key(name, version)] ?? null
}

export async function recordEntry(entry: IndexEntry): Promise<string> {
  const index = await loadIndex()
  index.entries[key(entry.name, entry.version)] = entry
  return saveIndex(index)
}

export async function removeEntry(name: string, version: string): Promise<boolean> {
  const index = await loadIndex()
  const target = key(name, version)
  if (!(target in index.entries)) return false
  delete index.entries[target]
  await saveIndex(index)
  return true
}

export async function listEntries(): Promise<IndexEntry[]> {
  const index = await loadIndex()
  return Object.values(index.entries).sort((a, b) =>
    a.name === b.name ? (a.version < b.version ? -1 : 1) : a.name < b.name ? -1 : 1,
  )
}

export function entryFromReport(report: {
  target: { name: string | null; version: string | null }
  source: { packageJsonSha256: string | null; treeSha256: string | null }
  summary: { verdict: IndexEntry['verdict']; score: number }
  npm: { publisher: string | null }
  dsh: { dshVersion: string | null }
}): IndexEntry | null {
  const { name, version } = report.target
  const { packageJsonSha256, treeSha256 } = report.source
  if (!name || !version || !packageJsonSha256 || !treeSha256) return null
  return {
    name,
    version,
    packageJsonSha256,
    treeSha256,
    verdict: report.summary.verdict,
    score: report.summary.score,
    scannedAt: new Date().toISOString(),
    publisher: report.npm.publisher,
    dshVersion: report.dsh.dshVersion,
  }
}

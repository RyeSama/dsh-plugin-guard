import { gunzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'

export interface ExtractedEntry {
  path: string
  bytes: number
}

export class TarError extends Error {}

const BLOCK = 512
const MAX_TOTAL_BYTES = 64 * 1024 * 1024
const MAX_ENTRIES = 5000

function octal(buffer: Buffer, start: number, length: number): number {
  const text = buffer.toString('utf8', start, start + length).replace(/\0.*$/, '').trim()
  if (text === '') return 0
  if (!/^[0-7]+$/.test(text)) throw new TarError(`invalid tar header field: ${JSON.stringify(text)}`)
  return parseInt(text, 8)
}

function safeRelativePath(entry: string): string {
  const cleaned = entry.replace(/^\.\//, '').replace(/^\/+/, '')
  if (cleaned === '' ) throw new TarError('empty tar entry path')
  if (/^[a-zA-Z]:/.test(cleaned)) throw new TarError(`absolute tar entry path: ${entry}`)
  const parts = cleaned.split('/')
  if (parts.some((part) => part === '..')) throw new TarError(`tar entry escapes the package root: ${entry}`)
  return parts.filter((part) => part !== '' && part !== '.').join(sep)
}

/**
 * Extract a gzipped npm tarball with no external dependency.
 * Symlinks and hard links are skipped, and every path is confined to destDir.
 */
export async function extractTarball(tarball: Uint8Array, destDir: string): Promise<ExtractedEntry[]> {
  let tar: Buffer
  try {
    tar = gunzipSync(tarball)
  } catch (error) {
    throw new TarError(`tarball is not valid gzip: ${(error as Error).message}`)
  }
  const entries: ExtractedEntry[] = []
  let offset = 0
  let totalBytes = 0
  let pendingPath: string | null = null

  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK)
    if (header.every((byte) => byte === 0)) break

    let name = header.toString('utf8', 0, 100).replace(/\0.*$/, '')
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/, '')
    if (prefix) name = `${prefix}/${name}`
    const type = String.fromCharCode(header[156] ?? 48)
    const size = octal(header, 124, 12)
    const body = tar.subarray(offset + BLOCK, offset + BLOCK + size)

    if (type === 'L') {
      pendingPath = body.toString('utf8').replace(/\0.*$/, '').trim()
    } else if (type === 'x' || type === 'g') {
      const text = body.toString('utf8')
      const match = /\d+ path=([^\n]+)\n/.exec(text)
      if (match?.[1]) pendingPath = match[1].trim()
    } else if (type === '5') {
      const dir = pendingPath ?? name
      pendingPath = null
      await mkdir(join(destDir, safeRelativePath(dir)), { recursive: true })
    } else if (type === '0' || type === '\0' || type === '7') {
      const raw = (pendingPath ?? name).replace(/^package\//, '')
      pendingPath = null
      const relative = safeRelativePath(raw)
      if (relative === '') {
        offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK
        continue
      }
      totalBytes += size
      if (totalBytes > MAX_TOTAL_BYTES) throw new TarError('tarball expands beyond 64 MB; refusing to extract')
      if (entries.length >= MAX_ENTRIES) throw new TarError(`tarball has more than ${MAX_ENTRIES} files; refusing to extract`)
      const target = join(destDir, relative)
      const resolved = normalize(target)
      if (!resolved.startsWith(normalize(destDir) + sep) && resolved !== normalize(destDir)) {
        throw new TarError(`tar entry escapes the package root: ${raw}`)
      }
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, body, { mode: 0o644 })
      entries.push({ path: relative.split(sep).join('/'), bytes: size })
    }
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK
  }
  if (entries.length === 0) throw new TarError('tarball contains no files')
  return entries
}

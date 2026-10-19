import { constants } from 'node:fs'
import { access, lstat, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { toPosixPath } from './text.js'

/**
 * Paths the scanner must never read, even if they sit inside the target directory.
 * The scanner is a supply-chain tool: it has no business seeing credentials.
 */
export const SENSITIVE_FILE = /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials|credentials(?:\.json)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$/i
export const SENSITIVE_EXTENSION = /\.(?:pem|key|p12|pfx|jks|keystore|ppk)$/i
export const SENSITIVE_DIRECTORY = new Set(['.ssh', '.aws', '.gnupg', '.docker', '.kube', '.config'])

export function isSensitivePath(path: string): boolean {
  const parts = toPosixPath(path).split('/')
  const base = parts[parts.length - 1] ?? ''
  if (SENSITIVE_FILE.test(base)) return true
  if (SENSITIVE_EXTENSION.test(base)) return true
  return parts.slice(0, -1).some((part) => SENSITIVE_DIRECTORY.has(part))
}

export function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function readTextFile(path: string, maxBytes = 512 * 1024): Promise<string | null> {
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size > maxBytes) return null
    const buffer = await readFile(path)
    if (looksBinary(buffer)) return null
    return buffer.toString('utf8')
  } catch {
    return null
  }
}

export function looksBinary(buffer: Uint8Array): boolean {
  const limit = Math.min(buffer.length, 8192)
  for (let i = 0; i < limit; i += 1) {
    if (buffer[i] === 0) return true
  }
  return false
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  const text = await readTextFile(path, 4 * 1024 * 1024)
  if (text === null) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

export async function writeFileAtomic(path: string, data: string, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = join(dirname(path), `.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  const handle = await open(temp, 'w', mode ?? 0o600)
  try {
    await handle.writeFile(data, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

export interface WalkedFile {
  /** Path relative to the walk root, always POSIX separators. */
  rel: string
  abs: string
  size: number
}

export interface WalkOptions {
  maxFiles?: number
  maxDepth?: number
  skipDirectories?: Set<string>
}

const DEFAULT_SKIP = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.turbo',
  '.next',
  '.nuxt',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.dsh-plugin-guard',
])

/**
 * Depth-first, deterministic directory walk. Symlinks are never followed: a
 * plugin must not be able to redirect the scanner at files outside its own tree.
 */
export async function* walkFiles(root: string, options: WalkOptions = {}): AsyncGenerator<WalkedFile> {
  const maxFiles = options.maxFiles ?? 5000
  const maxDepth = options.maxDepth ?? 12
  const skip = options.skipDirectories ?? DEFAULT_SKIP
  let emitted = 0

  async function* visit(directory: string, depth: number): AsyncGenerator<WalkedFile> {
    if (depth > maxDepth) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      if (emitted >= maxFiles) return
      const abs = join(directory, entry.name)
      const rel = toPosixPath(relative(root, abs))
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue
        if (isSensitivePath(rel)) continue
        yield* visit(abs, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (isSensitivePath(rel)) continue
      let size = 0
      try {
        const info = await lstat(abs)
        if (!info.isFile()) continue
        size = info.size
      } catch {
        continue
      }
      emitted += 1
      yield { rel, abs, size }
    }
  }

  yield* visit(root, 0)
}

/** Guard against scanning a home directory or a filesystem root by accident. */
export function isDangerousScanRoot(root: string): string | null {
  const normalized = normalize(resolve(root))
  const home = normalize(homedir())
  if (normalized === normalize(dirname(normalized))) {
    return 'the filesystem root'
  }
  if (normalized === home) {
    return 'your home directory'
  }
  return null
}

export function assertInside(root: string, target: string): string {
  const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`refusing to read "${target}" outside of "${root}"`)
  }
  return target
}

/** Convert a POSIX relative path to a platform path while staying inside root. */
export function joinInside(root: string, rel: string): string {
  const normalized = normalize(rel.split('/').join(sep))
  return assertInside(root, resolve(root, normalized))
}

export function toDisplayPath(root: string, rel: string): string {
  return root === '' ? rel : rel
}

import { createHash } from 'node:crypto'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GuardError } from '../util/errors.js'

const REGISTRY = 'https://registry.npmjs.org'
const TIMEOUT_MS = 10_000
const MAX_TARBALL_BYTES = 64 * 1024 * 1024

export interface Packument {
  name: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, PackageVersion>
  time?: Record<string, string>
  maintainers?: { name?: string; email?: string }[]
  deprecated?: string
}

export interface PackageVersion {
  name: string
  version: string
  description?: string
  license?: string | { type?: string }
  deprecated?: string
  bin?: Record<string, string> | string
  dependencies?: Record<string, string>
  repository?: { url?: string } | string
  dist?: { tarball?: string; integrity?: string; shasum?: string; unpackedSize?: number }
  _npmUser?: { name?: string; email?: string }
}

export interface NpmPackageMeta {
  name: string
  version: string
  description?: string
  license?: string
  publisher: string | null
  publishedAt: string | null
  repository: string | null
  deprecated: string | null
  tarball: string | null
  integrity: string | null
  size: number | null
  bin: Record<string, string> | null
  dependencies: Record<string, string>
}

async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-guard' },
    })
    if (response.status === 404) return null
    if (!response.ok) {
      throw new GuardError('network', `npm registry returned HTTP ${response.status} for ${url}`, {
        hint: 'Check your connection or proxy, then retry. Scanning a local directory works offline.',
      })
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof GuardError) throw error
    throw new GuardError('network', `Could not reach the npm registry: ${(error as Error).message}`, {
      hint: 'Check your connection or proxy, or scan a local directory (which needs no network).',
      cause: error,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchPackument(name: string): Promise<Packument | null> {
  return getJson<Packument>(`${REGISTRY}/${encodeURIComponent(name).replace('%40', '@')}`)
}

export function latestVersion(packument: Packument): string | null {
  return packument['dist-tags']?.['latest'] ?? null
}

export async function resolveNpmPackage(name: string, version?: string | null): Promise<{ packument: Packument; meta: NpmPackageMeta }> {
  const packument = await fetchPackument(name)
  if (!packument) {
    throw new GuardError('not-found', `Package "${name}" was not found on npm.`, {
      hint: `Check the spelling, or scan a local directory instead: dsh-plugin-guard scan ./path/to/plugin. To publish it: npm publish --access public.`,
    })
  }
  const resolvedVersion = version ?? latestVersion(packument)
  if (!resolvedVersion) {
    throw new GuardError('not-found', `Package "${name}" has no published versions.`, {
      hint: 'Publish a version first: npm publish --access public.',
    })
  }
  const data = packument.versions?.[resolvedVersion]
  if (!data) {
    throw new GuardError('not-found', `Version ${resolvedVersion} of "${name}" does not exist.`, {
      hint: `Published versions include: ${Object.keys(packument.versions ?? {}).slice(-5).join(', ') || '(none)'}.`,
    })
  }
  const publisher = data._npmUser?.name ?? packument.maintainers?.[0]?.name ?? null
  return {
    packument,
    meta: {
      name,
      version: resolvedVersion,
      description: data.description,
      license: typeof data.license === 'string' ? data.license : data.license?.type,
      publisher,
      publishedAt: packument.time?.[resolvedVersion] ?? null,
      repository: typeof data.repository === 'string' ? data.repository : (data.repository?.url ?? null),
      deprecated: data.deprecated ?? packument.deprecated ?? null,
      tarball: data.dist?.tarball ?? null,
      integrity: data.dist?.integrity ?? null,
      size: data.dist?.unpackedSize ?? null,
      bin: typeof data.bin === 'string' ? { [name]: data.bin } : (data.bin ?? null),
      dependencies: data.dependencies ?? {},
    },
  }
}

/** Download and verify a package tarball, returning a fresh directory holding its files. */
export async function downloadPackage(meta: NpmPackageMeta): Promise<string> {
  if (!meta.tarball) {
    throw new GuardError('not-found', `"${meta.name}@${meta.version}" has no tarball URL.`, {
      hint: 'Try a different version.',
    })
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  let bytes: Buffer
  try {
    const response = await fetch(meta.tarball, {
      signal: controller.signal,
      headers: { 'user-agent': 'dsh-plugin-guard' },
    })
    if (!response.ok) {
      throw new GuardError('network', `Downloading ${meta.tarball} failed with HTTP ${response.status}.`, {
        hint: 'Retry, or scan a local checkout of the package.',
      })
    }
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > MAX_TARBALL_BYTES) {
      throw new GuardError('too-large', `Package tarball is larger than ${MAX_TARBALL_BYTES / 1024 / 1024} MB.`, {
        hint: 'Scan a local checkout instead.',
      })
    }
    bytes = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    if (error instanceof GuardError) throw error
    throw new GuardError('network', `Could not download the package: ${(error as Error).message}`, {
      hint: 'Check your connection, or scan a local directory.',
      cause: error,
    })
  } finally {
    clearTimeout(timer)
  }

  if (meta.integrity) {
    const [algorithm, expected] = meta.integrity.split('-', 2) as [string, string]
    const actual = createHash(algorithm === 'sha1' ? 'sha1' : 'sha512').update(bytes).digest('base64')
    if (expected && actual !== expected) {
      throw new GuardError('integrity', `Tarball integrity check failed for ${meta.name}@${meta.version}.`, {
        hint: 'The download was corrupted or tampered with. Retry on a different network; do not install this package.',
      })
    }
  }

  const directory = await mkdtemp(join(tmpdir(), 'dsh-guard-npm-'))
  await mkdir(directory, { recursive: true })
  const { extractTarball } = await import('./tar.js')
  await extractTarball(bytes, directory)
  return directory
}

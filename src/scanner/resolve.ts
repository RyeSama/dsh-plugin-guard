import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { GuardError } from '../util/errors.js'
import { expandHome, isDangerousScanRoot, pathExists } from '../util/fsx.js'
import type { NpmMeta, ScanOptions } from './types.js'
import { downloadPackage, resolveNpmPackage } from './npm.js'
import type { Packument } from './npm.js'
import { rm } from 'node:fs/promises'

export interface ResolvedTarget {
  kind: 'directory' | 'npm'
  input: string
  root: string
  npmMeta: NpmMeta | null
  packument: Packument | null
  cleanup: (() => Promise<void>) | null
}

function looksLikePath(input: string): boolean {
  return (
    input.startsWith('.') ||
    input.startsWith('/') ||
    input.startsWith('~') ||
    input.includes('/') ||
    input.includes('\\') ||
    /^[a-zA-Z]:/.test(input)
  )
}

function parseSpec(input: string): { name: string; version: string | null } {
  if (input.startsWith('@')) {
    const slash = input.indexOf('/')
    if (slash === -1) return { name: input, version: null }
    const at = input.indexOf('@', slash)
    if (at === -1) return { name: input, version: null }
    return { name: input.slice(0, at), version: input.slice(at + 1) }
  }
  const at = input.indexOf('@')
  if (at <= 0) return { name: input, version: null }
  return { name: input.slice(0, at), version: input.slice(at + 1) }
}

export async function resolveTarget(input: string, _options: ScanOptions = {}): Promise<ResolvedTarget> {
  const trimmed = input.trim()
  if (trimmed === '') {
    throw new GuardError('usage', 'No target given.', {
      hint: 'Run: dsh-plugin-guard scan ./my-plugin   (or: dsh-plugin-guard scan some-npm-package)',
    })
  }

  const asPath = expandHome(trimmed)
  if (await pathExists(asPath)) {
    const info = await stat(asPath)
    if (!info.isDirectory()) {
      throw new GuardError('usage', `"${trimmed}" is a file, not a package directory.`, {
        hint: 'Point at the folder that contains package.json.',
      })
    }
    const dangerous = isDangerousScanRoot(asPath)
    if (dangerous) {
      throw new GuardError('refusing', `Refusing to scan ${dangerous}.`, {
        hint: 'Pass the plugin folder itself, e.g. ./my-plugin.',
      })
    }
    return {
      kind: 'directory',
      input: trimmed,
      root: resolve(asPath),
      npmMeta: null,
      packument: null,
      cleanup: null,
    }
  }

  if (looksLikePath(trimmed)) {
    throw new GuardError('not-found', `No directory at "${trimmed}".`, {
      hint: 'Check the path, or run "dsh-plugin-guard doctor" to see what this machine can reach.',
    })
  }

  const spec = parseSpec(trimmed)
  if (!/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(spec.name)) {
    throw new GuardError('usage', `"${trimmed}" is not a valid package name or path.`, {
      hint: 'Use a path (./plugin) or an npm package name (name or @scope/name).',
    })
  }

  const { packument, meta } = await resolveNpmPackage(spec.name, spec.version)
  if (!meta.tarball) {
    throw new GuardError('not-found', `${meta.name}@${meta.version} has no downloadable tarball.`, {
      hint: 'Try another version.',
    })
  }
  const directory = await downloadPackage(meta)
  const npmMeta: NpmMeta = {
    name: meta.name,
    version: meta.version,
    description: meta.description,
    license: meta.license,
    publisher: meta.publisher ?? undefined,
    publishedAt: meta.publishedAt ?? undefined,
    repository: meta.repository ?? undefined,
    deprecated: meta.deprecated ?? undefined,
    bin: meta.bin ?? undefined,
    dependencies: meta.dependencies,
  }
  return {
    kind: 'npm',
    input: trimmed,
    root: directory,
    npmMeta,
    packument,
    cleanup: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
}


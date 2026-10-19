import type { RuleContext } from '../scanner/types.js'
import { SOURCE_EXTENSIONS, stripComments } from '../scanner/patterns.js'

export const SOURCE_FILE_LIMIT = 400
export const SOURCE_BYTES = 256 * 1024

export interface SourceFile {
  rel: string
  text: string
}

/** Source files of the package, already stripped of comments, capped in size/count. */
export async function readSources(ctx: RuleContext): Promise<SourceFile[]> {
  const candidates = ctx.files.filter((rel) => SOURCE_EXTENSIONS.test(rel) && !rel.includes('/dist/')).slice(0, SOURCE_FILE_LIMIT)
  const sources: SourceFile[] = []
  for (const rel of candidates) {
    const text = await ctx.readText(rel, SOURCE_BYTES)
    if (text === null) continue
    sources.push({ rel, text: stripComments(text) })
  }
  return sources
}

export function packageName(ctx: RuleContext): string | null {
  const name = ctx.packageJson?.['name']
  return typeof name === 'string' ? name : null
}

export function packageVersion(ctx: RuleContext): string | null {
  const version = ctx.packageJson?.['version']
  return typeof version === 'string' ? version : null
}

export function stringField(source: Record<string, unknown> | null, key: string): string | null {
  if (!source) return null
  const value = source[key]
  return typeof value === 'string' ? value : null
}

export function listField(source: Record<string, unknown> | null, key: string): string[] {
  if (!source) return []
  const value = source[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

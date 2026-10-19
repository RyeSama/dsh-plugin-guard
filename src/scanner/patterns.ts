/**
 * Static signatures. These are *textual* checks only: the scanner never
 * imports, requires, evaluates or spawns anything from the scanned package.
 */

export interface SignaturePattern {
  id: string
  label: string
  pattern: RegExp
  severity: 'high' | 'medium' | 'low'
  note: string
}

export const CHILD_PROCESS_IMPORT = /(?:require\s*\(\s*['"`](?:node:)?child_process['"`]\s*\)|from\s+['"`](?:node:)?child_process['"`])/

export const SHELL_CALL = /\b(?:execSync|execFileSync|spawnSync|execFile|exec|spawn|fork)\s*\(/g

export const FS_WRITE_CALL = /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|rmSync|rm|unlinkSync|unlink|renameSync|rename|mkdirSync|mkdir)\s*\(/g

export const ENV_BULK = [
  /\.\.\.\s*process\.env/,
  /Object\.(?:keys|values|entries)\s*\(\s*process\.env\s*\)/,
  /JSON\.stringify\s*\(\s*process\.env\s*\)/,
  /\{\s*\.\.\.process\.env\s*\}/,
]

export const EVAL_CALL = /\b(?:eval|Function)\s*\(/g
export const NEW_FUNCTION = /\bnew\s+Function\s*\(/g
export const VM_RUN = /\bvm(?:\.\w+)?\.run(?:InNewContext|InThisContext|InContext)?\s*\(/g
export const DYNAMIC_REQUIRE = /\brequire\s*\(\s*(?!['"`])/g
export const DYNAMIC_IMPORT = /\bimport\s*\(\s*(?!['"`])/g
export const PROCESS_BINDING = /\bprocess\.(?:binding|_linkedBinding)\s*\(/g

export const OBFUSCATED_BLOB = /['"`][A-Za-z0-9+/=]{600,}['"`]/
export const OBFUSCATED_ESCAPES = /(?:\\x[0-9a-fA-F]{2}){40,}|(?:\\u[0-9a-fA-F]{4}){40,}/

export const URL_PATTERN = /\bhttps?:\/\/([a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9])(?::\d+)?/g

export const SOURCE_EXTENSIONS = /\.(?:mjs|cjs|js|jsx|ts|tsx|mts|cts)$/i
export const DSH_PATCH_EXTENSIONS = /\.(?:yml|yaml|patch|diff)$/i

export function lineOf(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1
  }
  return line
}

/** Blank out comments and string-preserving line numbers are kept intact. */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix: string) => prefix + match.slice(prefix.length).replace(/[^\n]/g, ' '))
}

export interface TextMatch {
  line: number
  snippet: string
}

export function collectMatches(text: string, pattern: RegExp, limit = 5): TextMatch[] {
  const matches: TextMatch[] = []
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
  let match: RegExpExecArray | null
  while ((match = global.exec(text)) !== null) {
    const line = lineOf(text, match.index)
    const rawLine = text.split('\n')[line - 1] ?? ''
    matches.push({ line, snippet: rawLine.trim().slice(0, 160) })
    if (matches.length >= limit) break
    if (match.index === global.lastIndex) global.lastIndex += 1
  }
  return matches
}

/**
 * A deliberately small SemVer implementation (no dependency, no surprises).
 * It covers the range syntax that plugin manifests actually use: exact versions,
 * comparison operators, caret, tilde, x-ranges, hyphen ranges and `||`.
 */

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export interface Comparator {
  op: '>=' | '<=' | '>' | '<' | '='
  version: ParsedVersion
}

export type ComparatorSet = Comparator[]

const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export function parseVersion(input: string): ParsedVersion | null {
  const match = VERSION_RE.exec(input.trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: match[2] === undefined ? 0 : Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (left === undefined) return -1
    if (right === undefined) return 1
    const leftNumeric = /^\d+$/.test(left)
    const rightNumeric = /^\d+$/.test(right)
    if (leftNumeric && rightNumeric) {
      const diff = Number(left) - Number(right)
      if (diff !== 0) return diff < 0 ? -1 : 1
    } else if (leftNumeric) {
      return -1
    } else if (rightNumeric) {
      return 1
    } else if (left !== right) {
      return left < right ? -1 : 1
    }
  }
  return 0
}

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return comparePrerelease(a.prerelease, b.prerelease)
}

function version(major: number, minor: number, patch: number): ParsedVersion {
  return { major, minor, patch, prerelease: [] }
}

interface PartialVersion {
  version: ParsedVersion
  /** How many numeric components the author actually wrote (1..3). */
  precision: 1 | 2 | 3
}

function parsePartial(input: string): PartialVersion | null {
  const match = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/.exec(input.trim())
  if (!match) return null
  const parts = [match[1], match[2], match[3]]
  let precision: 1 | 2 | 3 = 1
  const numbers: number[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    if (part === undefined) break
    if (part === 'x' || part === 'X' || part === '*') break
    numbers[i] = Number(part)
    precision = (i + 1) as 1 | 2 | 3
  }
  if (numbers.length === 0) return null
  return {
    version: {
      major: numbers[0] ?? 0,
      minor: numbers[1] ?? 0,
      patch: numbers[2] ?? 0,
      prerelease: match[4] ? match[4].split('.') : [],
    },
    precision,
  }
}

function upperBound(partial: PartialVersion, mode: 'caret' | 'tilde'): ParsedVersion {
  const { major, minor, patch } = partial.version
  if (mode === 'caret') {
    if (major > 0) return version(major + 1, 0, 0)
    if (minor > 0) return version(0, minor + 1, 0)
    return version(0, 0, patch + 1)
  }
  if (partial.precision === 1) return version(major + 1, 0, 0)
  return version(major, minor + 1, 0)
}

function expandToken(token: string): ComparatorSet | null {
  const trimmed = token.trim()
  if (trimmed === '' || trimmed === '*' || trimmed === 'x' || trimmed === 'X') return []
  const operator = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(trimmed)
  if (!operator) return null
  const op = operator[1] ?? '='
  const partial = parsePartial(operator[2] ?? '')
  if (!partial) return null

  if (op === '^' || op === '~') {
    return [
      { op: '>=', version: partial.version },
      { op: '<', version: upperBound(partial, op === '^' ? 'caret' : 'tilde') },
    ]
  }
  if (op === '=' && partial.precision < 3) {
    // A partial exact version means an x-range: 1.2 => >=1.2.0 <1.3.0
    return [
      { op: '>=', version: partial.version },
      { op: '<', version: upperBound(partial, 'tilde') },
    ]
  }
  return [{ op: op as Comparator['op'], version: partial.version }]
}

export function parseRange(range: string): ComparatorSet[] | null {
  const text = range.trim()
  if (text === '') return [[]]
  const sets: ComparatorSet[] = []
  for (const rawSet of text.split('||')) {
    const set = rawSet.trim()
    if (set === '' || set === '*' || set === 'x' || set === 'X') {
      sets.push([])
      continue
    }
    const hyphen = /^\s*(\S+)\s+-\s+(\S+)\s*$/.exec(set)
    if (hyphen) {
      const from = parsePartial(hyphen[1] ?? '')
      const to = parsePartial(hyphen[2] ?? '')
      if (!from || !to) return null
      sets.push([
        { op: '>=', version: from.version },
        { op: '<=', version: to.version },
      ])
      continue
    }
    const normalized = set.replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1')
    const tokens = normalized.split(/\s+/).filter(Boolean)
    const comparators: ComparatorSet = []
    for (const token of tokens) {
      const expanded = expandToken(token)
      if (expanded === null) return null
      comparators.push(...expanded)
    }
    sets.push(comparators)
  }
  return sets
}

export function isValidRange(range: string): boolean {
  return parseRange(range) !== null
}

function testComparator(candidate: ParsedVersion, comparator: Comparator): boolean {
  const diff = compareVersions(candidate, comparator.version)
  switch (comparator.op) {
    case '>=':
      return diff >= 0
    case '<=':
      return diff <= 0
    case '>':
      return diff > 0
    case '<':
      return diff < 0
    case '=':
      return diff === 0
  }
}

export function satisfies(inputVersion: string, range: string): boolean {
  const candidate = parseVersion(inputVersion)
  const sets = parseRange(range)
  if (!candidate || !sets) return false
  return sets.some((set) => {
    if (!set.every((comparator) => testComparator(candidate, comparator))) return false
    if (candidate.prerelease.length === 0) return true
    // npm semantics: a prerelease only matches when the range mentions a
    // prerelease of the same major.minor.patch tuple.
    return set.some(
      (comparator) =>
        comparator.version.prerelease.length > 0 &&
        comparator.version.major === candidate.major &&
        comparator.version.minor === candidate.minor &&
        comparator.version.patch === candidate.patch,
    )
  })
}

export function isValidVersion(input: string): boolean {
  return parseVersion(input) !== null
}

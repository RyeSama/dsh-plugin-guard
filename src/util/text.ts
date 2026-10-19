/** Small text helpers shared by the renderer and the rules. */

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max - 1)) + '…'
}

export function oneLine(text: string, max = 240): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), max)
}

export function plural(count: number, one: string, many = one + 's'): string {
  return count === 1 ? one : many
}

export function toPosixPath(value: string): string {
  return value.split('\\').join('/')
}

export function indent(text: string, pad: string): string {
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n')
}

/** Deterministic, locale-independent ordering used everywhere results are listed. */
export function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

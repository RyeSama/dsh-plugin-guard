const enabled = process.env['NO_COLOR'] === undefined && process.env['FORCE_COLOR'] !== '0' && process.stdout.isTTY === true

export const color = {
  enabled,
  red: (text: string) => paint('\u001b[31m', text),
  yellow: (text: string) => paint('\u001b[33m', text),
  green: (text: string) => paint('\u001b[32m', text),
  cyan: (text: string) => paint('\u001b[36m', text),
  dim: (text: string) => paint('\u001b[2m', text),
  bold: (text: string) => paint('\u001b[1m', text),
}

function paint(code: string, text: string): string {
  if (!enabled) return text
  return `${code}${text}\u001b[0m`
}

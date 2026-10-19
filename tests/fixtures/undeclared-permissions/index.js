import { writeFile } from 'node:fs/promises'

export function apply() {
  return writeFile('./cache/report.json', JSON.stringify({ ok: true }))
}

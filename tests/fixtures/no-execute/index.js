import { writeFileSync } from 'node:fs'

writeFileSync(new URL('./IMPORTED_MARKER', import.meta.url), 'the scanner should never run this')

export function apply() {}

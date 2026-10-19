// Local development only: make 'dsh-plugin-guard-cli' resolvable from this
// directory before the CLI package is published. Creates a tiny shim inside
// node_modules that re-exports the repo's build output.
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const shimDir = join(packageRoot, 'node_modules', 'dsh-plugin-guard-cli')

await mkdir(shimDir, { recursive: true })
await writeFile(
  join(shimDir, 'package.json'),
  JSON.stringify({ name: 'dsh-plugin-guard-cli', version: '0.1.0', type: 'module', exports: { '.': './shim.js' } }, null, 2) + '\n',
)
await writeFile(join(shimDir, 'shim.js'), "export * from '../../../../dist/index.js'\n")
console.log('[dev-link] node_modules/dsh-plugin-guard-cli -> ../../../../dist/index.js')

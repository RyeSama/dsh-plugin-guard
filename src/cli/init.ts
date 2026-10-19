import { mkdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathExists, writeFileAtomic } from '../util/fsx.js'
import { color } from './colors.js'

export interface InitFlags {
  force?: boolean
  dryRun?: boolean
  json?: boolean
}

interface PlannedFile {
  path: string
  content: string
  exists: boolean
}

function packageJsonTemplate(name: string): string {
  const pkg = {
    name,
    version: '0.1.0',
    description: 'A DSH plugin',
    type: 'module',
    main: 'index.js',
    files: ['index.js', 'cordis.patch.yml', 'README.md'],
    keywords: ['dsh-plugin'],
    license: 'MIT',
    engines: { node: '>=20' },
    dsh: {
      manifestVersion: 1,
      engines: { dsh: '>=0.1.0' },
      bundle: { patch: './cordis.patch.yml' },
      permissions: {
        version: 1,
        filesystem: { read: [], write: [] },
        shell: { execute: false, allow: [] },
        env: { read: [], bulk: false },
        network: { outbound: [], inbound: false },
        credentials: { read: false, write: false },
        process: { spawn: false },
      },
    },
  }
  return JSON.stringify(pkg, null, 2) + '\n'
}

function patchTemplate(name: string): string {
  return [
    '# DSH bundle patch: mounts this plugin into the profile config tree.',
    '# Install: dsh plugin --profile desktop add ' + name,
    '- insert:',
    '    - id: ' + name,
    '      name: ' + name,
    '',
  ].join('\n')
}

const INDEX_TEMPLATE = `export const name = 'CHANGE_ME'

// DSH loads this module inside the host process. Keep it small and side-effect free.
export function apply(ctx) {
  ctx.logger?.info?.('plugin loaded')
}
`

function readmeTemplate(name: string): string {
  return [
    '# ' + name,
    '',
    'A DSH plugin.',
    '',
    '## Install',
    '',
    '```bash',
    'dsh plugin --profile desktop add ' + name,
    '```',
    '',
    '## Check it before you publish',
    '',
    '```bash',
    'npx dsh-plugin-guard-cli scan .',
    '```',
    '',
    'The scan checks that `dsh.bundle.patch` points at a file you actually ship, that',
    'the declared permissions match the code, and that nothing dangerous runs at install time.',
    '',
  ].join('\n')
}

const GITIGNORE_TEMPLATE = 'node_modules/\n.DS_Store\n*.log\n'

export async function runInit(target: string | undefined, flags: InitFlags): Promise<number> {
  const dir = resolve(target ?? '.')
  const name = basename(dir)
  if (!name || name === '.' || name === '/') {
    process.stderr.write(`${color.red('error')} could not derive a package name from "${dir}"\n`)
    return 2
  }
  if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) {
    process.stderr.write(
      `${color.red('error')} the folder name "${name}" is not a valid npm package name; pass --name <package-name>\n`,
    )
    return 2
  }

  await mkdir(dir, { recursive: true })
  const planned: PlannedFile[] = []
  const candidates: Array<[string, string, string]> = [
    [join(dir, 'package.json'), packageJsonTemplate(name), 'package.json'],
    [join(dir, 'cordis.patch.yml'), patchTemplate(name), 'cordis.patch.yml'],
    [join(dir, 'index.js'), INDEX_TEMPLATE, 'index.js'],
    [join(dir, 'README.md'), readmeTemplate(name), 'README.md'],
    [join(dir, '.gitignore'), GITIGNORE_TEMPLATE, '.gitignore'],
  ]

  for (const [path, content] of candidates) {
    planned.push({ path, content, exists: await pathExists(path) })
  }

  const conflicts = planned.filter((file) => file.exists)
  if (conflicts.length > 0 && !flags.force) {
    const listing = conflicts.map((file) => '  ' + file.path).join('\n')
    process.stderr.write(
      `${color.yellow('these files already exist, nothing was written:')}\n${listing}\n\n` +
        `Re-run with --force to overwrite them, or --dry-run to see the generated content.\n`,
    )
    return 3
  }

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        { dir, name, dryRun: flags.dryRun ?? false, files: planned.map((f) => ({ path: f.path, exists: f.exists })) },
        null,
        2,
      ) + '\n',
    )
    if (flags.dryRun) return 0
  } else if (flags.dryRun) {
    process.stdout.write(`${color.bold('would write')} in ${dir}\n\n`)
  } else {
    process.stdout.write(`${color.bold('created')} DSH plugin scaffold in ${dir}\n\n`)
  }

  const written: string[] = []
  for (const file of planned) {
    if (!flags.dryRun) await writeFileAtomic(file.path, file.content)
    written.push(file.path)
    if (!flags.json) process.stdout.write(`  ${color.green('+')} ${file.path}\n`)
  }

  if (!flags.json) {
    process.stdout.write(
      '\n' +
        `Next: ${color.cyan('npx dsh-plugin-guard-cli scan ' + (target ?? '.'))}\n` +
        `Then: ${color.cyan('dsh plugin --profile desktop add ' + (target ?? '.'))}\n`,
    )
  }
  return 0
}

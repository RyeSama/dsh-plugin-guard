#!/usr/bin/env node
// End-to-end smoke test for the *packed* artefact.
//
// It builds, packs, installs the tarball into a throwaway directory, and runs the
// packaged CLI exactly as a user would after `npx dsh-plugin-guard-cli`. It never
// touches the network: the tarball is installed from a local file path.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repo = resolve(import.meta.dirname, '..')
const started = Date.now()
let workdir = ''

function log(step, detail) {
  console.log(`[smoke] ${step}${detail ? `: ${detail}` : ''}`)
}

function fail(message, result) {
  console.error(`\n[smoke] FAILED: ${message}`)
  if (result) {
    if (result.stdout) console.error(`--- stdout ---\n${result.stdout.toString()}`)
    if (result.stderr) console.error(`--- stderr ---\n${result.stderr.toString()}`)
  }
  cleanup()
  process.exit(1)
}

function cleanup() {
  if (workdir) rmSync(workdir, { recursive: true, force: true })
}

// npm itself is a JS entry point; running it through `node` avoids every
// Windows .cmd / shell-quoting problem and works the same on POSIX.
const npmCli = process.env.npm_execpath
function run(args, options = {}) {
  const command = npmCli
    ? [process.execPath, [npmCli, ...args]]
    : [process.platform === 'win32' ? 'npm.cmd' : 'npm', args]
  const [file, fileArgs] = command
  const result = spawnSync(file, fileArgs, {
    cwd: options.cwd ?? repo,
    encoding: 'utf8',
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
    shell: false,
  })
  if (result.error) fail(`could not run ${file} ${fileArgs.join(' ')}`, result)
  return result
}

function runCli(cliPath, args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
}

try {
  // 1. build
  log('build')
  const build = run(['run', 'build'])
  if (build.status !== 0) fail('npm run build exited ' + build.status, build)

  const cliDist = join(repo, 'dist', 'cli.js')
  if (!existsSync(cliDist)) fail('dist/cli.js was not produced')

  const firstLine = readFileSync(cliDist, 'utf8').split('\n', 1)[0]
  if (firstLine !== '#!/usr/bin/env node') fail(`dist/cli.js starts with ${JSON.stringify(firstLine)}, expected a shebang`)

  // 2. pack
  workdir = mkdtempSync(join(tmpdir(), 'dsh-guard-smoke-'))
  log('pack', workdir)
  const pack = run(['pack', '--pack-destination', workdir])
  if (pack.status !== 0) fail('npm pack exited ' + pack.status, pack)

  const tarball = pack.stdout.trim().split('\n').filter((line) => line.endsWith('.tgz')).pop()
  if (!tarball) fail('could not find the tarball name in npm pack output', pack)
  const tarballPath = join(workdir, tarball)
  if (!existsSync(tarballPath)) fail(`tarball missing at ${tarballPath}`)

  const packedFiles = run(['pack', '--pack-destination', workdir, '--json'])
  try {
    const listed = JSON.parse(packedFiles.stdout)[0].files.map((file) => file.path)
    for (const required of ['dist/cli.js', 'dist/index.js', 'README.md', 'LICENSE', 'docs/rules.md']) {
      if (!listed.includes(required)) fail(`tarball is missing ${required}`)
    }
    const leaked = listed.filter((file) => /^(tests|src|scripts)\//.test(file) || file.startsWith('.github/'))
    if (leaked.length > 0) fail(`tarball includes development files: ${leaked.join(', ')}`)
    log('tarball contents', `${listed.length} files, no tests/src/scripts`)
  } catch (error) {
    fail('could not parse npm pack --json output: ' + error.message, packedFiles)
  }

  // 3. install the tarball somewhere disposable
  const consumer = join(workdir, 'consumer')
  writeFileSync(join(workdir, 'consumer-placeholder'), '')
  const install = run(['install', tarballPath, '--no-audit', '--no-fund', '--ignore-scripts', '--prefix', consumer])
  if (install.status !== 0) fail('installing the tarball failed with exit ' + install.status, install)

  const installedCli = join(consumer, 'node_modules', 'dsh-plugin-guard-cli', 'dist', 'cli.js')
  if (!existsSync(installedCli)) fail('installed package has no dist/cli.js')

  // 4. run it the way a user would
  const clean = join(repo, 'tests', 'fixtures', 'clean-plugin')
  log('scan clean fixture')
  const cleanRun = runCli(installedCli, ['scan', clean])
  if (cleanRun.status !== 0) fail(`scan of the clean fixture exited ${cleanRun.status}, expected 0`, cleanRun)
  if (!/PASS\s+100\/100/.test(cleanRun.stdout)) fail('clean fixture did not report PASS 100/100', cleanRun)
  log('clean fixture', 'exit 0, PASS 100/100')

  log('scan postinstall fixture')
  const risky = join(repo, 'tests', 'fixtures', 'postinstall')
  const riskyRun = runCli(installedCli, ['scan', risky])
  if (riskyRun.status !== 1) fail(`scan of the postinstall fixture exited ${riskyRun.status}, expected 1`, riskyRun)
  if (!/FAIL/.test(riskyRun.stdout)) fail('postinstall fixture did not report FAIL', riskyRun)
  log('postinstall fixture', 'exit 1, FAIL')

  log('scan clean fixture --json')
  const jsonRun = runCli(installedCli, ['scan', clean, '--json'])
  if (jsonRun.status !== 0) fail('--json run failed', jsonRun)
  const report = JSON.parse(jsonRun.stdout)
  if (report.summary.verdict !== 'pass') fail('--json verdict is not pass')
  if (report.target.kind !== 'directory') fail('--json target.kind is not directory')
  log('--json', 'parsed, verdict pass')

  const elapsed = Date.now() - started
  console.log(`\n[smoke] OK in ${(elapsed / 1000).toFixed(1)}s — ${tarball} installs and scans without network access`)
  cleanup()
} catch (error) {
  console.error('[smoke] unexpected error:', error)
  cleanup()
  process.exit(1)
}

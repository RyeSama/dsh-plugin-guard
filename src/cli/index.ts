#!/usr/bin/env node
import { Command } from 'commander'
import { runAuditStatus, runAuditTail } from './audit-cmd.js'
import { color } from './colors.js'
import { runDoctor } from './doctor.js'
import { runIndexAdd, runIndexList, runIndexPath, runIndexRemove, runIndexVerify } from './index-cmd.js'
import { runInit } from './init.js'
import { runRules } from './rules-cmd.js'
import { runScan } from './scan.js'
import { isGuardError } from '../util/errors.js'
import { VERSION } from '../version.js'

export interface RunResult {
  code: number
}

function buildProgram(): Command {
  const program = new Command()

  program
    .name('dsh-plugin-guard')
    .description('Admission checks for DSH plugins: scan a plugin before you install or publish it.')
    .version(VERSION, '-v, --version', 'print the version')
    .helpOption('-h, --help', 'show this help')
    .showSuggestionAfterError(true)
    .exitOverride()

  program
    .command('scan')
    .argument('[target]', 'a plugin directory, a tarball, or an npm package name', '.')
    .description('scan a plugin and print a report')
    .option('--json', 'print machine-readable JSON instead of a report')
    .option('--check-publish', 'also ask npm whether the package is published (network)')
    .option('--offline', 'never touch the network (default for directory scans)', false)
    .option('--only <rules>', 'run only these rule ids, comma separated')
    .option('--ignore <rules>', 'skip these rule ids, comma separated')
    .option('--fail-on-medium', 'exit non-zero when a medium finding exists')
    .option('--dsh-version <version>', 'the DSH version to check compatibility against')
    .option('--max-files <n>', 'stop walking after n files')
    .option('--record', 'store the scan result in the local trust index')
    .option('--verbose', 'show low-severity findings and extra context')
    .action(async (target: string, flags: Record<string, unknown>) => {
      const code = await runScan(target, {
        json: Boolean(flags['json']),
        offline: Boolean(flags['offline']),
        checkPublish: Boolean(flags['checkPublish']),
        only: flags['only'] as string | undefined,
        ignore: flags['ignore'] as string | undefined,
        failOnMedium: Boolean(flags['failOnMedium']),
        dshVersion: flags['dshVersion'] as string | undefined,
        maxFiles: flags['maxFiles'] as string | undefined,
        record: Boolean(flags['record']),
        verbose: Boolean(flags['verbose']),
      })
      process.exitCode = code
    })

  program
    .command('doctor')
    .description('check that this machine can scan plugins')
    .option('--json', 'print machine-readable JSON')
    .action(async (flags: Record<string, unknown>) => {
      process.exitCode = await runDoctor({ json: Boolean(flags['json']) })
    })

  program
    .command('init')
    .argument('[dir]', 'where to create the plugin scaffold', '.')
    .description('add the DSH plugin manifest to a folder')
    .option('--force', 'overwrite files that already exist')
    .option('--dry-run', 'print what would be written, write nothing')
    .option('--json', 'print machine-readable JSON')
    .action(async (dir: string, flags: Record<string, unknown>) => {
      process.exitCode = await runInit(dir, {
        force: Boolean(flags['force']),
        dryRun: Boolean(flags['dryRun']),
        json: Boolean(flags['json']),
      })
    })

  program
    .command('rules')
    .description('list the built-in checks')
    .option('--json', 'print machine-readable JSON')
    .option('--verbose', 'show the description of every rule')
    .action(async (flags: Record<string, unknown>) => {
      process.exitCode = await runRules({ json: Boolean(flags['json']), verbose: Boolean(flags['verbose']) })
    })

  const index = program.command('index').description('manage the local trust index')
  index
    .command('add')
    .argument('<target>', 'a plugin directory or npm package name')
    .description('scan a plugin and record its source hash')
    .option('--json', 'print machine-readable JSON')
    .action(async (target: string, flags: Record<string, unknown>) => {
      process.exitCode = await runIndexAdd(target, { json: Boolean(flags['json']) })
    })
  index
    .command('list')
    .description('list recorded packages')
    .option('--json', 'print machine-readable JSON')
    .action(async (flags: Record<string, unknown>) => {
      process.exitCode = await runIndexList({ json: Boolean(flags['json']) })
    })
  index
    .command('remove')
    .argument('<spec>', 'name@version or name')
    .description('forget a recorded package')
    .option('--json', 'print machine-readable JSON')
    .action(async (spec: string, flags: Record<string, unknown>) => {
      process.exitCode = await runIndexRemove(spec, { json: Boolean(flags['json']) })
    })
  index
    .command('path')
    .description('print the trust index file path')
    .option('--json', 'print machine-readable JSON')
    .action(async (flags: Record<string, unknown>) => {
      process.exitCode = await runIndexPath({ json: Boolean(flags['json']) })
    })
  index
    .command('verify')
    .description('check the trust index for corrupt entries')
    .option('--json', 'print machine-readable JSON')
    .action(async (flags: Record<string, unknown>) => {
      process.exitCode = await runIndexVerify({ json: Boolean(flags['json']) })
    })

  const audit = program.command('audit').description('inspect the runtime audit sidecar')
  audit
    .command('status')
    .description('show which audit source is available')
    .option('--json', 'print machine-readable JSON')
    .action(async (flags: Record<string, unknown>) => {
      process.exitCode = await runAuditStatus({ json: Boolean(flags['json']) })
    })
  audit
    .command('tail')
    .description('print the last recorded audit events')
    .option('--limit <n>', 'how many events to print', '50')
    .option('--json', 'print machine-readable JSON')
    .action(async (flags: Record<string, unknown>) => {
      process.exitCode = await runAuditTail({ json: Boolean(flags['json']), limit: flags['limit'] as string | undefined })
    })

  return program
}

export async function main(argv: string[]): Promise<number> {
  const program = buildProgram()
  program.configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
  })

  try {
    await program.parseAsync(argv, { from: 'user' })
    return typeof process.exitCode === 'number' ? process.exitCode : 0
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'commander.version' || code === 'commander.helpDisplayed') return 0
    if (typeof code === 'string' && code.startsWith('commander.')) {
      if (code === 'commander.unknownCommand' || code === 'commander.unknownOption' || code === 'commander.missingArgument') {
        return 2
      }
      return 2
    }
    if (isGuardError(error)) {
      process.stderr.write(`${color.red('error')} ${error.message}\n`)
      if (error.hint) process.stderr.write(`${color.dim('hint')}  ${error.hint}\n`)
      return error.exitCode
    }
    process.stderr.write(`${color.red('unexpected error')} ${(error as Error).message}\n`)
    if (process.env['DSH_GUARD_DEBUG']) {
      process.stderr.write(String((error as Error).stack ?? '') + '\n')
    } else {
      process.stderr.write(`${color.dim('set DSH_GUARD_DEBUG=1 for a stack trace')}\n`)
    }
    return 3
  }
}

const invokedDirectly = process.argv[1] !== undefined && /(?:^|[\\/])(?:cli|dsh-plugin-guard|dsh-guard)(?:\.js|\.mjs|\.cjs)?$/.test(process.argv[1])
if (invokedDirectly || process.env['DSH_GUARD_FORCE_MAIN'] === '1') {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}

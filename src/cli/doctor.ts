import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { loadIndex, indexFilePath } from '../index-store/index.js'
import { color } from './colors.js'

export interface CheckResult {
  name: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  fix?: string
}

function run(command: string, args: string[], timeoutMs = 5000): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child =
      process.platform === 'win32'
        ? spawn(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
            windowsHide: true,
          })
        : spawn(command, args, { windowsHide: true })
    let stdout = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ code: null, stdout: '' })
    }, timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: null, stdout: '' })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout })
    })
  })
}

async function checkNode(): Promise<CheckResult> {
  const major = Number(process.versions.node.split('.')[0])
  if (major >= 20) {
    return { name: 'node', status: 'ok', detail: `v${process.versions.node}` }
  }
  return {
    name: 'node',
    status: 'fail',
    detail: `v${process.versions.node} is older than Node 20`,
    fix: 'Install Node 20 or newer from https://nodejs.org, then re-run this command.',
  }
}

async function checkRegistry(): Promise<CheckResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch('https://registry.npmjs.org/-/ping', { signal: controller.signal })
    if (response.ok) return { name: 'npm registry', status: 'ok', detail: 'reachable' }
    return {
      name: 'npm registry',
      status: 'warn',
      detail: `responded HTTP ${response.status}`,
      fix: 'Scanning local directories still works offline; only "scan <npm-package>" and --check-publish need the registry.',
    }
  } catch {
    return {
      name: 'npm registry',
      status: 'warn',
      detail: 'unreachable (offline or behind a proxy)',
      fix: 'Local scans work offline. For registry lookups, check your proxy or run with --offline.',
    }
  } finally {
    clearTimeout(timer)
  }
}

async function checkIndex(): Promise<CheckResult> {
  const path = indexFilePath()
  try {
    await mkdir(dirname(path), { recursive: true })
    await access(dirname(path), constants.W_OK)
    const index = await loadIndex()
    const count = Object.keys(index.entries).length
    return {
      name: 'trust index',
      status: 'ok',
      detail: `${count} ${count === 1 ? 'entry' : 'entries'} at ${path}`,
    }
  } catch (error) {
    return {
      name: 'trust index',
      status: 'warn',
      detail: `not writable: ${(error as Error).message}`,
      fix: 'Set DSH_GUARD_INDEX to a writable path, or skip the index (scanning works without it).',
    }
  }
}

async function checkDsh(): Promise<CheckResult> {
  const result = await run('dsh', ['--version'])
  if (result.code === 0 && result.stdout.trim() !== '') {
    return { name: 'dsh CLI', status: 'ok', detail: result.stdout.trim().split('\n')[0] ?? 'found' }
  }
  return {
    name: 'dsh CLI',
    status: 'warn',
    detail: 'not found on PATH',
    fix: 'Install DeepSeek Harness, or ignore this if you only use the scanner in CI.',
  }
}

export async function runDoctor(flags: { json?: boolean }): Promise<number> {
  const results = await Promise.all([checkNode(), checkRegistry(), checkIndex(), checkDsh()])
  const failed = results.some((result) => result.status === 'fail')

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: !failed, checks: results }, null, 2) + '\n')
    return failed ? 1 : 0
  }

  process.stdout.write(`${color.bold('dsh-plugin-guard doctor')}\n\n`)
  for (const result of results) {
    const mark = result.status === 'ok' ? color.green('✓') : result.status === 'warn' ? color.yellow('!') : color.red('✖')
    process.stdout.write(`  ${mark} ${result.name.padEnd(14)} ${result.detail}\n`)
    if (result.fix) process.stdout.write(`    ${color.dim('fix')} ${result.fix}\n`)
  }
  process.stdout.write('\n')
  if (failed) {
    process.stdout.write(`${color.red('Something needs fixing before scanning works reliably.')}\n`)
  } else {
    process.stdout.write(`${color.green('Ready.')} Try: ${color.cyan('dsh-plugin-guard scan ./your-plugin')}\n`)
  }
  return failed ? 1 : 0
}

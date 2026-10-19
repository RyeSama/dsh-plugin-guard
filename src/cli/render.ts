import type { ScanReport, Severity } from '../scanner/types.js'
import { color } from './colors.js'
import { oneLine, plural } from '../util/text.js'

export interface RenderOptions {
  verbose?: boolean
}

const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFO',
}

function bar(report: ScanReport): string {
  const { verdict, score } = report.summary
  if (verdict === 'pass') return color.green(`PASS  ${score}/100`)
  if (verdict === 'warn') return color.yellow(`WARN  ${score}/100`)
  return color.red(`FAIL  ${score}/100`)
}

function counts(report: ScanReport): string {
  const { high, medium, low } = report.summary
  return [`${high} high`, `${medium} medium`, `${low} low`].join(' · ')
}

function targetLine(report: ScanReport): string {
  const kind = report.target.kind === 'npm' ? 'npm package' : 'local directory'
  return `${report.target.input} (${kind}, ${report.files.scanned} ${plural(report.files.scanned, 'file')})`
}

function packageLine(report: ScanReport): string {
  const name = report.target.name ?? '(no name)'
  const version = report.target.version ? `@${report.target.version}` : ''
  return `${name}${version}`
}

function dshLine(report: ScanReport): string {
  const parts: string[] = []
  parts.push(report.dsh.hasBlock ? `dsh block: yes` : 'dsh block: missing')
  if (report.dsh.bundlePatch) parts.push(`bundle: ${report.dsh.bundlePatch.join(', ')}`)
  if (report.dsh.engineRange) parts.push(`engines.dsh: ${report.dsh.engineRange}`)
  if (report.dsh.dshVersion) parts.push(`installed DSH: ${report.dsh.dshVersion}`)
  return parts.join(' · ')
}

function npmLine(report: ScanReport): string {
  if (!report.npm.checked) return 'not checked (local directory; pass --check-publish to look it up)'
  if (report.npm.published === false) return 'not published'
  return `published ${report.npm.latestVersion ?? ''}${report.npm.publisher ? ` by ${report.npm.publisher}` : ''}`
}

function nextCommands(report: ScanReport): string[] {
  const commands: string[] = []
  const add = (command: string) => {
    if (!commands.includes(command)) commands.push(command)
  }
  for (const finding of report.findings) {
    switch (finding.ruleId) {
      case 'manifest/package-json':
      case 'manifest/dsh-block':
      case 'manifest/identity':
        add('dsh-plugin-guard init --dry-run')
        break
      case 'permissions/declared':
      case 'permissions/code-mismatch':
        add('dsh-plugin-guard init --dry-run   # permission template')
        break
      case 'publish/registry':
        add('npm publish --access public')
        break
      case 'security/install-scripts':
        add('npm install --ignore-scripts')
        break
      case 'source/trust-index':
        add(`dsh-plugin-guard index add ${report.target.input}`)
        break
      case 'deps/lockfile':
        add('npm install --package-lock-only')
        break
      case 'security/dangerous-api':
        add(`dsh-plugin-guard scan ${report.target.input} --json`)
        break
      default:
        break
    }
  }
  return commands
}

function locationText(locations: { file: string; line?: number }[] | undefined): string | null {
  if (!locations || locations.length === 0) return null
  const shown = locations.slice(0, 3).map((item) => (item.line ? `${item.file}:${item.line}` : item.file))
  if (locations.length > 3) shown.push(`+${locations.length - 3} more`)
  return shown.join(', ')
}

export function renderReport(report: ScanReport, options: RenderOptions = {}): string {
  const lines: string[] = []
  const showLow = options.verbose === true
  lines.push(`${color.bold(`${report.tool.name} ${report.tool.version}`)}  ${color.dim('scan')}`)
  lines.push('')
  lines.push(`  ${color.dim('target ')} ${targetLine(report)}`)
  lines.push(`  ${color.dim('package')} ${packageLine(report)}`)
  lines.push(`  ${color.dim('dsh    ')} ${dshLine(report)}`)
  lines.push(`  ${color.dim('npm    ')} ${npmLine(report)}`)
  lines.push('')
  lines.push(`  ${bar(report)}   ${counts(report)}`)

  const high = report.findings.filter((finding) => finding.severity === 'high')
  const medium = report.findings.filter((finding) => finding.severity === 'medium')
  const low = report.findings.filter((finding) => finding.severity === 'low')

  if (report.findings.length === 0) {
    lines.push('')
    lines.push(`  ${color.green('✓')} no findings for the built-in rule set`)
  }

  const renderGroup = (label: Severity, findings: typeof report.findings) => {
    if (findings.length === 0) return
    lines.push('')
    lines.push(`  ${label === 'high' ? color.red(SEVERITY_LABEL.high) : label === 'medium' ? color.yellow(SEVERITY_LABEL.medium) : color.dim(SEVERITY_LABEL.low)}`)
    for (const finding of findings) {
      lines.push(`  ${label === 'high' ? color.red('✖') : label === 'medium' ? color.yellow('▲') : color.dim('·')} ${color.bold(finding.title)}  ${color.dim(finding.ruleId)}`)
      for (const chunk of wrap(finding.message, 96)) lines.push(`    ${chunk}`)
      if (finding.fix) lines.push(`    ${color.dim('fix')} ${oneLine(finding.fix, 180)}`)
      const where = locationText(finding.locations)
      if (where) lines.push(`    ${color.dim('at ')} ${where}`)
    }
  }

  renderGroup('high', high)
  renderGroup('medium', medium)
  if (showLow) renderGroup('low', low)
  else if (low.length > 0) {
    lines.push('')
    lines.push(`  ${color.dim(`${low.length} low-severity ${plural(low.length, 'finding')} hidden (--verbose to show)`)}`)
  }

  const next = nextCommands(report)
  if (next.length > 0) {
    lines.push('')
    lines.push(`  ${color.dim('next')}`)
    for (const command of next) lines.push(`    ${color.cyan(command)}`)
  } else if (report.summary.verdict === 'pass') {
    lines.push('')
    lines.push(`  Install it when ready: ${color.cyan(`dsh plugin --profile desktop add ${report.target.input}`)}`)
  }

  if (options.verbose) {
    lines.push('')
    lines.push(`  ${color.dim('notes')}`)
    for (const note of report.notes) lines.push(`    ${color.dim('- ' + note)}`)
    lines.push(`    ${color.dim(`- ${report.summary.rulesRun} rules in ${report.durationMs} ms`)}`)
  }

  return lines.join('\n')
}

function wrap(text: string, width: number): string[] {
  const words = oneLine(text, 2000).split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (current === '') {
      current = word
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current !== '') lines.push(current)
  return lines
}

export function renderJson(report: ScanReport): string {
  return JSON.stringify(report, null, 2)
}

// The tool definition, kept free of any DSH import so it can be unit tested
// in plain Node. index.js is the only file that touches the host API.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { analyze, resolveTarget, renderReport, VERSION } from 'dsh-plugin-guard-cli'

const MAX_FINDINGS = 8

async function readIdentity(root) {
  try {
    const raw = await readFile(join(root, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return {
      name: typeof parsed.name === 'string' ? parsed.name : null,
      version: typeof parsed.version === 'string' ? parsed.version : null,
    }
  } catch {
    return { name: null, version: null }
  }
}

function describeFinding(finding) {
  const where = finding.location ? ` (${finding.location.file}${finding.location.line ? ':' + finding.location.line : ''})` : ''
  return `${finding.severity.toUpperCase()}  ${finding.ruleId}  ${finding.title}${where}`
}

export function createToolSpec() {
  return {
    name: 'plugin_guard',
    description:
      'Scan a DSH plugin package for install risk before adding it to the profile. Reports a verdict plus the reasons: ' +
      'missing or broken dsh.bundle.patch, missing dsh.permissions, install scripts, dangerous APIs and obfuscation, ' +
      'dependency risk and source-integrity changes. Read-only: it never imports, installs, evaluates or runs the scanned code.',
    parameters: {
      target: {
        type: 'string',
        description: 'Plugin directory (e.g. ./my-plugin) or npm package name (e.g. dsh-plugin-gate).',
        required: true,
      },
      json: {
        type: 'boolean',
        description: 'Return the full machine-readable report instead of the short human summary.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          verdict: { type: 'string', enum: ['pass', 'warn', 'fail'], required: true, description: 'pass, warn (medium only) or fail (any high).' },
          score: { type: 'number', required: true, description: '100 minus the weighted findings, clamped at 0.' },
          high: { type: 'number', required: true, description: 'Number of high findings.' },
          medium: { type: 'number', required: true, description: 'Number of medium findings.' },
          low: { type: 'number', required: true, description: 'Number of low findings.' },
          package: { type: 'string', description: 'name@version of the scanned package, when known.' },
          findings: { type: 'array', items: { type: 'string' }, description: 'One line per finding, most severe first.' },
          report: { type: 'string', required: true, description: 'The rendered report, with the next command to run.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.report }],
    },
    async execute(args) {
      const target = typeof args?.target === 'string' ? args.target : ''
      let resolved
      try {
        resolved = await resolveTarget(target, { offline: true })
      } catch (error) {
        const hint = error && typeof error.hint === 'string' ? ' ' + error.hint : ''
        throw new Error(`${error instanceof Error ? error.message : String(error)}${hint}`)
      }
      try {
        const identity = resolved.npmMeta
          ? { name: resolved.npmMeta.name, version: resolved.npmMeta.version }
          : await readIdentity(resolved.root)
        const report = await analyze({
          root: resolved.root,
          target: {
            kind: resolved.kind,
            input: resolved.input,
            name: identity.name,
            version: identity.version,
            root: resolved.kind === 'directory' ? resolved.root : null,
            fromRegistry: resolved.kind === 'npm',
          },
          npmMeta: resolved.npmMeta,
          indexEntry: null,
          options: {
            offline: true,
            checkPublish: false,
            only: undefined,
            ignore: undefined,
            failOnMedium: false,
            dshVersion: null,
            toolVersion: VERSION,
          },
        })
        const summary = report.summary
        return {
          verdict: summary.verdict,
          score: summary.score,
          high: summary.high,
          medium: summary.medium,
          low: summary.low,
          package: identity.name ? `${identity.name}@${identity.version ?? '?'}` : undefined,
          findings: report.findings.slice(0, MAX_FINDINGS).map(describeFinding),
          report: args && args.json === true ? JSON.stringify(report, null, 2) : renderReport(report, { verbose: false }),
        }
      } finally {
        if (resolved.cleanup) await resolved.cleanup()
      }
    },
  }
}

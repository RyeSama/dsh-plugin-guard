import { DEFAULT_RULES } from '../rules/index.js'
import { SEVERITY_WEIGHT } from '../scanner/types.js'
import { color } from './colors.js'

export async function runRules(flags: { json?: boolean; verbose?: boolean }): Promise<number> {
  const rules = DEFAULT_RULES.map((rule) => ({
    id: rule.id,
    severity: rule.severity,
    weight: SEVERITY_WEIGHT[rule.severity],
    title: rule.title,
    summary: rule.summary,
    docs: rule.docs ?? null,
  }))

  if (flags.json) {
    process.stdout.write(JSON.stringify({ count: rules.length, rules }, null, 2) + '\n')
    return 0
  }

  process.stdout.write(`${color.bold('rules')} — ${rules.length} built-in checks, all enabled by default\n\n`)
  for (const rule of rules) {
    const tag =
      rule.severity === 'high' ? color.red(rule.severity) : rule.severity === 'medium' ? color.yellow(rule.severity) : color.dim(rule.severity)
    process.stdout.write(`  ${rule.id.padEnd(28)} ${tag.padEnd(16)} ${rule.title}\n`)
    if (flags.verbose) process.stdout.write(`    ${color.dim(rule.summary)}\n`)
  }
  process.stdout.write(`\n${color.dim('Disable one with --ignore <rule-id>, or run only some with --only <id,id>.')}\n`)
  return 0
}

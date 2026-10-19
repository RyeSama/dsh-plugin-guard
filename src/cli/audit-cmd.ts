import { defaultAuditAdapter } from '../audit/index.js'
import { DSH_AUDIT_SUPPORT } from '../adapters/dsh/index.js'
import { color } from './colors.js'

export async function runAuditStatus(flags: { json?: boolean }): Promise<number> {
  const adapter = defaultAuditAdapter()
  const availability = await adapter.available()
  const payload = {
    adapter: { name: adapter.name, kind: adapter.kind, description: adapter.description },
    availability,
    dsh: DSH_AUDIT_SUPPORT,
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
    return 0
  }
  process.stdout.write(`${color.bold('runtime audit')}\n\n`)
  process.stdout.write(`  adapter   ${adapter.name} (${adapter.kind})\n`)
  process.stdout.write(`  available ${availability.available ? color.green('yes') : color.yellow('no')}\n`)
  if (availability.reason) process.stdout.write(`  reason    ${availability.reason}\n`)
  process.stdout.write(`\n${color.bold('DSH integration')}\n\n`)
  process.stdout.write(`  official hook  ${DSH_AUDIT_SUPPORT.officialHook ? 'yes' : color.yellow('no')}\n`)
  process.stdout.write(`  ${DSH_AUDIT_SUPPORT.reason}\n`)
  for (const alternative of DSH_AUDIT_SUPPORT.alternatives) {
    process.stdout.write(`  - ${alternative}\n`)
  }
  process.stdout.write(`\n${color.dim('This adapter records what the guard observed. It does not intercept or block plugin code.')}\n`)
  return 0
}

export async function runAuditTail(flags: { json?: boolean; limit?: string }): Promise<number> {
  const adapter = defaultAuditAdapter()
  const limit = flags.limit ? Number(flags.limit) : 50
  if (!Number.isFinite(limit) || limit <= 0) {
    process.stderr.write(`${color.red('error')} --limit must be a positive number\n`)
    return 2
  }
  const availability = await adapter.available()
  if (!availability.available) {
    process.stderr.write(`${color.yellow('audit log unavailable')}: ${availability.reason ?? 'no sidecar log yet'}\n`)
    process.stderr.write(`The sidecar log is created the first time something records an event.\n`)
    return 0
  }
  const events = await adapter.read({ limit })
  if (flags.json) {
    process.stdout.write(JSON.stringify({ events }, null, 2) + '\n')
    return 0
  }
  if (events.length === 0) {
    process.stdout.write('No audit events recorded yet.\n')
    return 0
  }
  process.stdout.write(`${color.bold('audit events')} — last ${events.length}\n\n`)
  for (const event of events) {
    process.stdout.write(`  ${event.at}  ${event.type.padEnd(10)} ${event.plugin ?? '-'}\n`)
    process.stdout.write(`    ${event.message}\n`)
  }
  return 0
}

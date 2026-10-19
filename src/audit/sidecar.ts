import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AdapterAvailability, AuditEvent, RuntimeAuditAdapter } from './types.js'

export function sidecarPath(): string {
  const override = process.env['DSH_GUARD_AUDIT']
  if (override && override.trim() !== '') return override
  return join(homedir(), '.dsh-plugin-guard', 'audit.ndjson')
}

export class SidecarAuditAdapter implements RuntimeAuditAdapter {
  readonly name = 'sidecar'
  readonly kind = 'sidecar' as const
  readonly description = 'Append-only NDJSON log under ~/.dsh-plugin-guard/audit.ndjson. Written by explicit calls, not by DSH itself.'
  readonly path: string

  constructor(path: string = sidecarPath()) {
    this.path = path
  }

  async available(): Promise<AdapterAvailability> {
    try {
      await mkdir(dirname(this.path), { recursive: true })
      return { available: true }
    } catch (error) {
      return { available: false, reason: (error as Error).message }
    }
  }

  async record(event: Omit<AuditEvent, 'at'> & { at?: string }): Promise<void> {
    const entry: AuditEvent = { at: event.at ?? new Date().toISOString(), ...event }
    await mkdir(dirname(this.path), { recursive: true })
    await appendFile(this.path, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 })
  }

  async read(options: { limit?: number } = {}): Promise<AuditEvent[]> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch {
      return []
    }
    const events: AuditEvent[] = []
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      try {
        const parsed: unknown = JSON.parse(trimmed)
        if (parsed && typeof parsed === 'object' && typeof (parsed as AuditEvent).message === 'string') {
          events.push(parsed as AuditEvent)
        }
      } catch {
        // A torn line (interrupted write) is skipped rather than failing the read.
      }
    }
    const limit = options.limit ?? 50
    return events.slice(-limit)
  }
}

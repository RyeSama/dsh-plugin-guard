export interface AuditEvent {
  at: string
  type: string
  plugin?: string
  message: string
  data?: Record<string, unknown>
}

export interface AdapterAvailability {
  available: boolean
  reason?: string
}

/**
 * A runtime audit adapter observes what an installed plugin does.
 *
 * DSH has no public runtime hook today, so the shipped adapter is a sidecar
 * log: this interface exists so that a future official hook can be added
 * without changing callers, and so nobody mistakes the sidecar for kernel-level
 * isolation. A plugin runs in the same process as everything else.
 */
export interface RuntimeAuditAdapter {
  readonly name: string
  readonly description: string
  readonly kind: 'sidecar' | 'official-hook'
  available(): Promise<AdapterAvailability>
  record(event: Omit<AuditEvent, 'at'> & { at?: string }): Promise<void>
  read(options?: { limit?: number }): Promise<AuditEvent[]>
}

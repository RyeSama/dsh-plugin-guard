import { SidecarAuditAdapter } from './sidecar.js'
import type { RuntimeAuditAdapter } from './types.js'

export type { AuditEvent, AdapterAvailability, RuntimeAuditAdapter } from './types.js'
export { SidecarAuditAdapter, sidecarPath } from './sidecar.js'

export function defaultAuditAdapter(): RuntimeAuditAdapter {
  return new SidecarAuditAdapter()
}

/**
 * What DSH actually offers for runtime auditing (as of DSH 0.1.5-rc.x):
 * nothing public. Plugins are merged into the same Node process as the host,
 * so there is no in-process boundary a plugin could be observed across, and no
 * hook to subscribe to.
 *
 * This module records that fact in code instead of implying a capability that
 * does not exist. If DSH later ships an audit hook, add an adapter that
 * implements RuntimeAuditAdapter with kind: 'official-hook'.
 */

export const DSH_AUDIT_SUPPORT = {
  officialHook: false as const,
  since: 'checked 2026-10',
  reason:
    'DSH composes plugin bundles into the host process through cordis patches. There is no public audit event stream and no sandbox between a plugin and the host.',
  alternatives: [
    'Record install-time reports with "dsh-plugin-guard index add" as an admission trail.',
    'Append runtime observations to the sidecar log (src/audit/sidecar.ts) from tooling you control.',
    'Use OS-level monitoring (Windows Defender Application Control, EDR) if you need kernel-level isolation.',
  ],
}

export interface InstallAdmissionFacts {
  packageName: string | null
  hasDshBundle: boolean
  permissionsDeclared: boolean
  verdict: 'pass' | 'warn' | 'fail'
}

/**
 * A human-readable admission line for install scripts and CI logs.
 * It states what was checked and explicitly what was not.
 */
export function describeAdmission(facts: InstallAdmissionFacts): string {
  const parts = [
    `${facts.packageName ?? '(unnamed)'}: ${facts.verdict}`,
    facts.hasDshBundle ? 'dsh bundle declared' : 'no dsh bundle',
    facts.permissionsDeclared ? 'permissions declared' : 'no permission declaration',
    'not sandboxed: the plugin runs in the DSH process',
  ]
  return parts.join(' · ')
}

export { VERSION, TOOL_NAME } from './version.js'
export { analyze } from './scanner/analyze.js'
export { resolveTarget } from './scanner/resolve.js'
export { resolveNpmPackage, fetchPackument, downloadPackage } from './scanner/npm.js'
export { extractTarball } from './scanner/tar.js'
export { DEFAULT_RULES, RULE_IDS, selectRules } from './rules/index.js'
export type {
  Finding,
  IndexEntry,
  NpmMeta,
  ReportSummary,
  Rule,
  RuleContext,
  RuleResult,
  ScanOptions,
  ScanOutcome,
  ScanReport,
  Severity,
  Verdict,
} from './scanner/types.js'
export { SEVERITIES, SEVERITY_WEIGHT } from './scanner/types.js'
export {
  PERMISSIONS_SPEC_VERSION,
  PERMISSION_CAPABILITIES,
  emptyPermissions,
  grantedCapabilities,
  validatePermissions,
} from './permissions/schema.js'
export type { PermissionIssue, PermissionValidation, Permissions } from './permissions/schema.js'
export {
  defaultAuditAdapter,
  SidecarAuditAdapter,
  sidecarPath,
} from './audit/index.js'
export type { AuditEvent, AdapterAvailability, RuntimeAuditAdapter } from './audit/types.js'
export { DSH_AUDIT_SUPPORT, describeAdmission } from './adapters/dsh/index.js'
export {
  entryFromReport,
  indexFilePath,
  listEntries,
  loadIndex,
  lookupEntry,
  recordEntry,
  removeEntry,
} from './index-store/index.js'
export { GuardError, isGuardError } from './util/errors.js'
export { renderJson, renderReport } from './cli/render.js'

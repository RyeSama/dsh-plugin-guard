import { z } from 'zod'

/**
 * dsh.permissions is this project's proposed permission-manifest convention for
 * DSH plugins. It is declarative: DSH itself does not read it today, and the
 * scanner only checks that a declaration exists and is well formed.
 */
export const PERMISSIONS_SPEC_VERSION = 1

const pathList = z.array(z.string().min(1).max(512)).max(200)
const nameList = z.array(z.string().min(1).max(128)).max(200)
const hostList = z.array(z.string().min(1).max(255)).max(200)
const commandList = z.array(z.string().min(1).max(128)).max(100)

export const permissionsSchema = z
  .object({
    /** Manifest format version. Omitted means version 1. */
    version: z.literal(1).optional(),
    filesystem: z
      .object({
        /** Glob patterns the plugin may read, relative to the DSH workspace. */
        read: pathList.optional(),
        /** Glob patterns the plugin may write. */
        write: pathList.optional(),
      })
      .strict()
      .optional(),
    shell: z
      .object({
        execute: z.boolean().optional(),
        /** Executables the plugin may invoke (argv[0] names). */
        allow: commandList.optional(),
      })
      .strict()
      .optional(),
    env: z
      .object({
        /** Environment variable names or globs (DSH_*, OPENAI_*). */
        read: nameList.optional(),
        /** Reading the whole environment (Object.keys(process.env), {...process.env}). */
        bulk: z.boolean().optional(),
      })
      .strict()
      .optional(),
    network: z
      .object({
        /** Outbound hosts (api.example.com, *.example.com). */
        outbound: hostList.optional(),
        /** Whether the plugin listens for inbound connections. */
        inbound: z.boolean().optional(),
      })
      .strict()
      .optional(),
    credentials: z
      .object({
        /** Named credentials the plugin may read from the DSH credential store. */
        read: nameList.optional(),
        write: z.boolean().optional(),
      })
      .strict()
      .optional(),
    process: z
      .object({
        /** Spawning child processes outside the shell permission. */
        spawn: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export type Permissions = z.infer<typeof permissionsSchema>

export interface PermissionIssue {
  path: string
  message: string
}

export type PermissionValidation =
  | { ok: true; permissions: Permissions }
  | { ok: false; issues: PermissionIssue[] }

export function validatePermissions(input: unknown): PermissionValidation {
  const result = permissionsSchema.safeParse(input)
  if (result.success) return { ok: true, permissions: result.data }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
      message: issue.message,
    })),
  }
}

export function emptyPermissions(): Permissions {
  return {
    version: 1,
    filesystem: { read: [], write: [] },
    shell: { execute: false, allow: [] },
    env: { read: [], bulk: false },
    network: { outbound: [], inbound: false },
    credentials: { read: [], write: false },
    process: { spawn: false },
  }
}

export interface PermissionCapability {
  key: string
  label: string
  summary: string
}

export const PERMISSION_CAPABILITIES: PermissionCapability[] = [
  { key: 'filesystem.read', label: 'Read files', summary: 'Read files inside the declared workspace globs' },
  { key: 'filesystem.write', label: 'Write files', summary: 'Create, modify or delete files' },
  { key: 'shell.execute', label: 'Run shell commands', summary: 'Invoke executables through a shell or child process' },
  { key: 'env.read', label: 'Read environment variables', summary: 'Read named environment variables' },
  { key: 'env.bulk', label: 'Read the whole environment', summary: 'Enumerate or serialize process.env' },
  { key: 'network.outbound', label: 'Network egress', summary: 'Open outbound connections' },
  { key: 'network.inbound', label: 'Network ingress', summary: 'Listen for inbound connections' },
  { key: 'credentials.read', label: 'Read credentials', summary: 'Read entries from the DSH credential store' },
  { key: 'credentials.write', label: 'Write credentials', summary: 'Store or modify credentials' },
  { key: 'process.spawn', label: 'Spawn processes', summary: 'Start detached or long-lived child processes' },
]

export function grantedCapabilities(permissions: Permissions): string[] {
  const granted: string[] = []
  if ((permissions.filesystem?.read?.length ?? 0) > 0) granted.push('filesystem.read')
  if ((permissions.filesystem?.write?.length ?? 0) > 0) granted.push('filesystem.write')
  if (permissions.shell?.execute === true) granted.push('shell.execute')
  if ((permissions.env?.read?.length ?? 0) > 0) granted.push('env.read')
  if (permissions.env?.bulk === true) granted.push('env.bulk')
  if ((permissions.network?.outbound?.length ?? 0) > 0) granted.push('network.outbound')
  if (permissions.network?.inbound === true) granted.push('network.inbound')
  if ((permissions.credentials?.read?.length ?? 0) > 0) granted.push('credentials.read')
  if (permissions.credentials?.write === true) granted.push('credentials.write')
  if (permissions.process?.spawn === true) granted.push('process.spawn')
  return granted
}

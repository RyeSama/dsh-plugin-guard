import type { Rule, RuleContext, RuleResult } from '../scanner/types.js'
import { CHILD_PROCESS_IMPORT, ENV_BULK, FS_WRITE_CALL } from '../scanner/patterns.js'
import { grantedCapabilities } from '../permissions/schema.js'
import { readSources } from './source.js'

const SPEC_DOCS = 'docs/permissions-spec.md'

function declared(ctx: RuleContext): boolean {
  return ctx.dshBlock !== undefined && ctx.dshBlock !== null && Object.prototype.hasOwnProperty.call(ctx.dshBlock, 'permissions')
}

export const permissionsDeclaredRule: Rule = {
  id: 'permissions/declared',
  severity: 'medium',
  title: 'Permission declaration',
  summary: 'Checks that dsh.permissions exists and is valid.',
  docs: SPEC_DOCS,
  run(ctx) {
    if (ctx.packageJson === null) return []
    if (!declared(ctx)) {
      return [
        {
          ruleId: 'permissions/declared',
          severity: 'medium',
          title: 'No dsh.permissions declaration',
          message: 'The package does not declare what it can read, write, execute or send. Users and reviewers have no way to compare the request with the code.',
          fix: 'Add "permissions" inside the dsh block (see docs/permissions-spec.md), or run "dsh-plugin-guard init" for a starter file.',
          docs: SPEC_DOCS,
          locations: [{ file: 'package.json' }],
        },
      ]
    }
    if (ctx.permissions === null) {
      return [
        {
          ruleId: 'permissions/declared',
          severity: 'high',
          title: 'Invalid dsh.permissions declaration',
          message: `The declaration does not match the spec (${ctx.permissionIssues.length} issue${ctx.permissionIssues.length === 1 ? '' : 's'}), so it cannot be trusted as a statement of intent.`,
          fix: ctx.permissionIssues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
          docs: SPEC_DOCS,
          locations: [{ file: 'package.json' }],
        },
      ]
    }
    return []
  },
}

export const permissionsOverbroadRule: Rule = {
  id: 'permissions/overbroad',
  severity: 'medium',
  title: 'Broad permission grants',
  summary: 'Flags declarations that grant far more than a plugin usually needs.',
  docs: SPEC_DOCS,
  run(ctx) {
    if (ctx.permissions === null) return []
    const results: RuleResult[] = []
    const p = ctx.permissions
    const push = (severity: RuleResult['severity'], title: string, message: string, fix: string) => {
      results.push({ ruleId: 'permissions/overbroad', severity, title, message, fix, docs: SPEC_DOCS, locations: [{ file: 'package.json' }] })
    }
    if (p.env?.bulk === true) {
      push('medium', 'Whole-environment access', 'dsh.permissions grants env.bulk: the plugin can read every environment variable, including unrelated API keys.', 'Prefer a named list: env.read: ["DSH_*"].')
    }
    if (p.shell?.execute === true && (p.shell.allow?.length ?? 0) === 0) {
      push('medium', 'Unrestricted shell access', 'shell.execute is true without a shell.allow allowlist, so any command can run.', 'List the executables you actually call, or set execute: false.')
    }
    const writeGlobs = p.filesystem?.write ?? []
    if (writeGlobs.some((glob) => glob === '**' || glob === '**/*' || glob === '/' || glob === '*')) {
      push('low', 'Filesystem write scope is unbounded', `filesystem.write includes "${writeGlobs.find((glob) => glob === '**' || glob === '**/*' || glob === '/' || glob === '*')}", which covers the whole workspace.`, 'Narrow the globs to the directories you write.')
    }
    if ((p.network?.outbound ?? []).some((host) => host === '*' || host === '*.com' || host === '*.*')) {
      push('medium', 'Unrestricted network egress', 'network.outbound contains a wildcard that matches any host.', 'List concrete hosts, e.g. ["api.example.com"].')
    }
    if (p.credentials?.write === true) {
      push('low', 'Credential store is writable', 'The plugin can write into the DSH credential store, which can persist access beyond its own session.', 'Remove credentials.write unless the plugin really stores new secrets.')
    }
    if (p.process?.spawn === true && p.shell?.execute !== true) {
      push('low', 'Process spawning without shell declaration', 'process.spawn is granted but shell.execute is not; the distinction between the two is hard to enforce in Node.', 'Declare both, or drop process.spawn.')
    }
    return results
  },
}

export const permissionsCodeMismatchRule: Rule = {
  id: 'permissions/code-mismatch',
  severity: 'high',
  title: 'Undeclared capabilities',
  summary: 'Compares the capabilities used in source code with the declaration.',
  docs: SPEC_DOCS,
  async run(ctx) {
    if (ctx.permissions === null) return []
    const sources = await readSources(ctx)
    const granted = new Set(grantedCapabilities(ctx.permissions))
    const results: RuleResult[] = []
    const hits: Record<string, string[]> = { shell: [], env: [], fs: [], child: [] }
    for (const file of sources) {
      if (CHILD_PROCESS_IMPORT.test(file.text)) {
        hits.child.push(file.rel)
        if (!granted.has('shell.execute') && !granted.has('process.spawn')) hits.shell.push(file.rel)
      }
      if (ENV_BULK.some((pattern) => pattern.test(file.text)) && !granted.has('env.bulk')) hits.env.push(file.rel)
      if (FS_WRITE_CALL.test(file.text) && !granted.has('filesystem.write')) hits.fs.push(file.rel)
      FS_WRITE_CALL.lastIndex = 0
    }
    if (hits.shell.length > 0) {
      results.push({
        ruleId: 'permissions/code-mismatch',
        severity: 'high',
        title: 'Code spawns processes but shell is not declared',
        message: `${hits.shell.slice(0, 3).join(', ')} imports child_process, yet dsh.permissions does not grant shell.execute or process.spawn.`,
        fix: 'Declare the capability (and review whether it is needed), or remove the child_process usage.',
        docs: SPEC_DOCS,
        locations: hits.shell.slice(0, 3).map((file) => ({ file })),
      })
    }
    if (hits.env.length > 0) {
      results.push({
        ruleId: 'permissions/code-mismatch',
        severity: 'medium',
        title: 'Code reads the whole environment but env.bulk is not declared',
        message: `${hits.env.slice(0, 3).join(', ')} enumerates or serializes process.env.`,
        fix: 'Set env.bulk: true after review, or read only named variables.',
        docs: SPEC_DOCS,
        locations: hits.env.slice(0, 3).map((file) => ({ file })),
      })
    }
    if (hits.fs.length > 0) {
      results.push({
        ruleId: 'permissions/code-mismatch',
        severity: 'medium',
        title: 'Code writes files but filesystem.write is not declared',
        message: `${hits.fs.slice(0, 3).join(', ')} calls a write API while filesystem.write is empty.`,
        fix: 'Declare the write globs you need, or drop the write.',
        docs: SPEC_DOCS,
        locations: hits.fs.slice(0, 3).map((file) => ({ file })),
      })
    }
    return results
  },
}

export const permissionRules: Rule[] = [permissionsDeclaredRule, permissionsOverbroadRule, permissionsCodeMismatchRule]

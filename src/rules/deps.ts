import type { Rule, RuleResult } from '../scanner/types.js'

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'npm-shrinkwrap.json']

function dependencies(ctx: Parameters<Rule['run']>[0]): Record<string, unknown> {
  const deps = ctx.packageJson?.['dependencies']
  return deps && typeof deps === 'object' && !Array.isArray(deps) ? (deps as Record<string, unknown>) : {}
}

export const lockfileRule: Rule = {
  id: 'deps/lockfile',
  severity: 'medium',
  title: 'Lockfile',
  summary: 'Runtime dependencies without a lockfile are not reproducible.',
  run(ctx) {
    if (Object.keys(dependencies(ctx)).length === 0) return []
    if (LOCKFILES.some((name) => ctx.files.includes(name))) return []
    return [
      {
        ruleId: 'deps/lockfile',
        severity: 'medium',
        title: 'No lockfile next to runtime dependencies',
        message: `The package depends on ${Object.keys(dependencies(ctx)).join(', ')}, but no lockfile pins transitive versions.`,
        fix: 'Commit package-lock.json (or pnpm-lock.yaml) and publish from a frozen install.',
        locations: [{ file: 'package.json' }],
      },
    ]
  },
}

export const wildcardRule: Rule = {
  id: 'deps/wildcard',
  severity: 'medium',
  title: 'Unpinned dependencies',
  summary: 'Wildcard, latest, git and http dependency specs resolve to whatever is newest.',
  run(ctx) {
    const results: RuleResult[] = []
    for (const [name, spec] of Object.entries(dependencies(ctx))) {
      if (typeof spec !== 'string') continue
      const risky = spec === '*' || spec === '' || spec === 'latest' || spec === 'x' || /^(?:git|git\+|https?:|file:)/.test(spec)
      if (!risky) continue
      results.push({
        ruleId: 'deps/wildcard',
        severity: 'medium',
        title: `Dependency "${name}" is not pinned`,
        message: `"${name}": "${spec}" accepts whatever version is published next, so the same plugin version can behave differently tomorrow.`,
        fix: 'Pin a SemVer range that excludes surprise majors, e.g. "^1.2.0".',
        locations: [{ file: 'package.json' }],
      })
      if (results.length >= 8) break
    }
    return results
  },
}

export const dependencyCountRule: Rule = {
  id: 'deps/count',
  severity: 'low',
  title: 'Dependency surface',
  summary: 'Every runtime dependency is code the plugin did not write.',
  run(ctx) {
    const count = Object.keys(dependencies(ctx)).length
    if (count <= 40) return []
    return [
      {
        ruleId: 'deps/count',
        severity: 'low',
        title: `${count} runtime dependencies`,
        message: 'A large dependency tree means a large part of the plugin is code reviewed by someone else, and DSH loads all of it into the same process.',
        fix: 'Move optional integrations behind dynamic imports, or vendor the small parts you need.',
        locations: [{ file: 'package.json' }],
      },
    ]
  },
}

export const dependencyRules: Rule[] = [lockfileRule, wildcardRule, dependencyCountRule]

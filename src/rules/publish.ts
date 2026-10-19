import type { Rule, RuleResult } from '../scanner/types.js'
import { packageName, packageVersion } from './source.js'

export const publishRule: Rule = {
  id: 'publish/registry',
  severity: 'medium',
  title: 'npm publish state',
  summary: 'Checks whether the package is published and current on npm.',
  run(ctx) {
    if (ctx.npmMeta === null) return []
    const results: RuleResult[] = []
    const name = packageName(ctx)
    if (ctx.npmMeta.deprecated) {
      results.push({
        ruleId: 'publish/registry',
        severity: 'medium',
        title: 'Package is deprecated on npm',
        message: `"${name}" is deprecated: ${ctx.npmMeta.deprecated}`,
        fix: 'Do not install a deprecated package; migrate to the maintained alternative.',
        locations: [{ file: 'package.json' }],
      })
    }
    if (!ctx.fromRegistry) {
      const localVersion = packageVersion(ctx)
      if (!ctx.npmMeta.version) {
        results.push({
          ruleId: 'publish/registry',
          severity: 'medium',
          title: 'Not published to npm',
          message: `"${name ?? 'this package'}" could not be found on npm, so "dsh plugin add ${name ?? '<name>'}" will fail.`,
          fix: 'Publish it: npm pack && npm publish --access public, then retry.',
          locations: [{ file: 'package.json' }],
        })
      } else if (localVersion && ctx.npmMeta.version !== localVersion) {
        results.push({
          ruleId: 'publish/registry',
          severity: 'low',
          title: 'Local version differs from npm latest',
          message: `package.json says ${localVersion}, npm latest is ${ctx.npmMeta.version}. Installing by name would run the published version, not this working copy.`,
          fix: 'Bump the version and publish, or install from the tarball path.',
          locations: [{ file: 'package.json' }],
        })
      }
    }
    return results
  },
}

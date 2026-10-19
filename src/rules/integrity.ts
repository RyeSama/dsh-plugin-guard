import type { Rule, RuleResult } from '../scanner/types.js'

export const trustIndexRule: Rule = {
  id: 'source/trust-index',
  severity: 'medium',
  title: 'Source integrity',
  summary: 'Compares this build with the hash recorded in the local trust index.',
  run(ctx) {
    if (ctx.indexEntry === null) {
      if (!ctx.fromRegistry) return []
      return [
        {
          ruleId: 'source/trust-index',
          severity: 'low',
          title: 'Source is unverified',
          message: 'This package is not in your local trust index, so the build you are inspecting has no recorded baseline.',
          fix: 'After reviewing it, record it: dsh-plugin-guard index add <package>.',
          locations: [{ file: 'package.json' }],
        },
      ]
    }
    const results: RuleResult[] = []
    if (ctx.treeFingerprint && ctx.indexEntry.treeSha256 !== ctx.treeFingerprint) {
      results.push({
        ruleId: 'source/trust-index',
        severity: 'high',
        title: 'Source changed since it was trusted',
        message: `The recorded tree hash for ${ctx.indexEntry.name}@${ctx.indexEntry.version} is ${ctx.indexEntry.treeSha256.slice(0, 12)}…, the current tree hashes to ${ctx.treeFingerprint.slice(0, 12)}….`,
        fix: 'Diff the package against the trusted build before installing the new one.',
        locations: [{ file: 'package.json' }],
      })
    }
    if (ctx.indexEntry.publisher && ctx.npmMeta?.publisher && ctx.indexEntry.publisher !== ctx.npmMeta.publisher) {
      results.push({
        ruleId: 'source/trust-index',
        severity: 'high',
        title: 'Publisher changed',
        message: `${ctx.indexEntry.name} was trusted under publisher "${ctx.indexEntry.publisher}", but npm now reports "${ctx.npmMeta.publisher}".`,
        fix: 'Confirm the ownership transfer with the maintainer before installing.',
        locations: [{ file: 'package.json' }],
      })
    }
    return results
  },
}

export const integrityRules: Rule[] = [trustIndexRule]

import type { Rule } from '../scanner/types.js'
import { manifestRules } from './manifest.js'
import { publishRule } from './publish.js'
import { permissionRules } from './permissions.js'
import { securityRules } from './security.js'
import { dependencyRules } from './deps.js'
import { integrityRules } from './integrity.js'

/**
 * The default rule set. It is intentionally small: every rule here is one a
 * reviewer would actually act on, and every rule is fixture-tested.
 */
export const DEFAULT_RULES: Rule[] = [
  ...manifestRules,
  publishRule,
  ...permissionRules,
  ...securityRules,
  ...dependencyRules,
  ...integrityRules,
]

export const RULE_IDS: readonly string[] = DEFAULT_RULES.map((rule) => rule.id)

export function selectRules(options: { only?: string[]; ignore?: string[] } = {}): Rule[] {
  const only = options.only && options.only.length > 0 ? new Set(options.only) : null
  const ignore = new Set(options.ignore ?? [])
  const unknown = [...(only ?? []), ...ignore].filter((id) => !RULE_IDS.includes(id))
  if (unknown.length > 0) {
    throw new Error(`Unknown rule id: ${unknown.join(', ')}. Run "dsh-plugin-guard rules" to list known ids.`)
  }
  return DEFAULT_RULES.filter((rule) => (!only || only.has(rule.id)) && !ignore.has(rule.id))
}

export { manifestRules, publishRule, permissionRules, securityRules, dependencyRules, integrityRules }

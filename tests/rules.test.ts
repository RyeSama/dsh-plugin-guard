import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, RULE_IDS, selectRules } from '../src/rules/index.js'

describe('rule selection', () => {
  it('exposes unique rule ids', () => {
    expect(new Set(RULE_IDS).size).toBe(RULE_IDS.length)
    expect(RULE_IDS).toContain('security/dangerous-api')
    expect(RULE_IDS).toContain('manifest/dsh-block')
  })

  it('runs everything by default', () => {
    expect(selectRules({}).length).toBe(DEFAULT_RULES.length)
  })

  it('can run a subset', () => {
    const rules = selectRules({ only: ['manifest/dsh-block'] })
    expect(rules.map((rule) => rule.id)).toEqual(['manifest/dsh-block'])
  })

  it('can skip a rule', () => {
    const rules = selectRules({ ignore: ['security/dangerous-api'] })
    expect(rules.map((rule) => rule.id)).not.toContain('security/dangerous-api')
    expect(rules.length).toBe(DEFAULT_RULES.length - 1)
  })

  it('rejects unknown ids instead of silently ignoring them', () => {
    expect(() => selectRules({ only: ['nope/nope'] })).toThrow(/unknown rule/i)
  })
})

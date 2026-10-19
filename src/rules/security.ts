import type { EvidenceLocation, Rule, RuleResult } from '../scanner/types.js'
import {
  CHILD_PROCESS_IMPORT,
  DYNAMIC_IMPORT,
  DYNAMIC_REQUIRE,
  EVAL_CALL,
  NEW_FUNCTION,
  OBFUSCATED_BLOB,
  OBFUSCATED_ESCAPES,
  PROCESS_BINDING,
  SHELL_CALL,
  URL_PATTERN,
  VM_RUN,
  collectMatches,
} from '../scanner/patterns.js'
import { readSources } from './source.js'

const MAX_FINDINGS = 12

export const installScriptsRule: Rule = {
  id: 'security/install-scripts',
  severity: 'high',
  title: 'Install-time scripts',
  summary: 'npm lifecycle scripts run arbitrary code during install.',
  run(ctx) {
    if (ctx.packageJson === null) return []
    const scripts = ctx.packageJson['scripts']
    if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return []
    const results: RuleResult[] = []
    for (const name of ['preinstall', 'install', 'postinstall']) {
      const command = (scripts as Record<string, unknown>)[name]
      if (typeof command !== 'string' || command.trim() === '') continue
      results.push({
        ruleId: 'security/install-scripts',
        severity: name === 'postinstall' ? 'high' : 'medium',
        title: `${name} script runs during install`,
        message: `"scripts.${name}" runs "${command}" with your user privileges the moment the package is installed, before you ever use it.`,
        fix: `Rebuild the plugin without install scripts, or inspect the command first. To skip scripts entirely: npm install --ignore-scripts.`,
        locations: [{ file: 'package.json' }],
      })
    }
    return results
  },
}

export const dangerousApiRule: Rule = {
  id: 'security/dangerous-api',
  severity: 'high',
  title: 'Dangerous APIs',
  summary: 'Finds process execution, eval, obfuscation and env enumeration in source.',
  async run(ctx) {
    const sources = await readSources(ctx)
    const results: RuleResult[] = []
    for (const file of sources) {
      if (results.length >= MAX_FINDINGS) break
      const text = file.text
      const loc = (pattern: RegExp, limit = 3): EvidenceLocation[] =>
        collectMatches(text, pattern, limit).map((match) => ({ file: file.rel, line: match.line, snippet: match.snippet }))

      if (CHILD_PROCESS_IMPORT.test(text)) {
        results.push({
          ruleId: 'security/dangerous-api',
          severity: 'high',
          title: 'Runs child processes',
          message: 'The package imports child_process. A DSH plugin normally does not need to start operating-system processes.',
          fix: 'Review every call site. If it is legitimate, declare shell.execute and document the commands.',
          locations: loc(SHELL_CALL),
        })
      }
      if (NEW_FUNCTION.test(text) || EVAL_CALL.test(text)) {
        NEW_FUNCTION.lastIndex = 0
        EVAL_CALL.lastIndex = 0
        results.push({
          ruleId: 'security/dangerous-api',
          severity: 'high',
          title: 'Evaluates code at runtime',
          message: 'eval() / new Function() turn data into code. In a plugin this is both a sandbox escape and an obfuscation vector.',
          fix: 'Replace with a data format (JSON) or a lookup table.',
          locations: [...loc(EVAL_CALL), ...loc(NEW_FUNCTION)].slice(0, 3),
        })
      }
      if (OBFUSCATED_BLOB.test(text) || OBFUSCATED_ESCAPES.test(text)) {
        results.push({
          ruleId: 'security/dangerous-api',
          severity: 'high',
          title: 'Obfuscated payload',
          message: 'A very long encoded blob or escape sequence hides what the code does from review.',
          fix: 'Publish readable source, or explain the blob in the README if it is a legitimate fixture.',
          locations: [{ file: file.rel }],
        })
      }
      if (PROCESS_BINDING.test(text)) {
        results.push({
          ruleId: 'security/dangerous-api',
          severity: 'high',
          title: 'Reaches into Node internals',
          message: 'process.binding() / process._linkedBinding() bypass public APIs and are a known way to escape JavaScript-level restrictions.',
          fix: 'Use a public Node API instead.',
          locations: loc(PROCESS_BINDING),
        })
      }
      if (VM_RUN.test(text)) {
        results.push({
          ruleId: 'security/dangerous-api',
          severity: 'medium',
          title: 'Runs code in a vm context',
          message: 'vm.runIn*() is not a security boundary; it cannot isolate untrusted code.',
          fix: 'Remove it, or document why the input is trusted.',
          locations: loc(VM_RUN),
        })
      }
      if (DYNAMIC_REQUIRE.test(text) || DYNAMIC_IMPORT.test(text)) {
        DYNAMIC_REQUIRE.lastIndex = 0
        DYNAMIC_IMPORT.lastIndex = 0
        results.push({
          ruleId: 'security/dangerous-api',
          severity: 'medium',
          title: 'Dynamic module loading',
          message: 'require()/import() with a computed path loads code that static review cannot see.',
          fix: 'Load modules from a fixed list of paths.',
          locations: [...loc(DYNAMIC_REQUIRE), ...loc(DYNAMIC_IMPORT)].slice(0, 3),
        })
      }
    }
    return results.slice(0, MAX_FINDINGS)
  },
}

function hostMatches(host: string, rule: string): boolean {
  if (rule === host) return true
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(1)
    return host.endsWith(suffix) && host.length > suffix.length
  }
  return false
}

export const egressRule: Rule = {
  id: 'security/egress',
  severity: 'medium',
  title: 'Network egress',
  summary: 'Compares hard-coded hosts in source with the declared network.outbound list.',
  async run(ctx) {
    if (ctx.permissions === null) return []
    const declared = ctx.permissions.network?.outbound ?? []
    const sources = await readSources(ctx)
    const hosts = new Map<string, string>()
    for (const file of sources) {
      const matches = collectMatches(file.text, URL_PATTERN, 20)
      const regex = new RegExp(URL_PATTERN.source, 'g')
      let match: RegExpExecArray | null
      while ((match = regex.exec(file.text)) !== null) {
        const host = match[1]
        if (host && !hosts.has(host)) hosts.set(host, file.rel)
        if (hosts.size > 40) break
      }
      if (matches.length === 0) continue
    }
    const undeclared = [...hosts.entries()].filter(([host]) => !declared.some((rule) => hostMatches(host, rule)))
    if (undeclared.length === 0) return []
    const shown = undeclared.slice(0, 6)
    return [
      {
        ruleId: 'security/egress',
        severity: 'medium',
        title: 'Undeclared network destinations',
        message: `Source contacts host${shown.length === 1 ? '' : 's'} that network.outbound does not list: ${shown.map(([host]) => host).join(', ')}${undeclared.length > shown.length ? ` (+${undeclared.length - shown.length} more)` : ''}.`,
        fix: 'Add the hosts to dsh.permissions.network.outbound, or remove the call.',
        locations: shown.map(([host, file]) => ({ file, snippet: host })),
      },
    ]
  },
}

export const securityRules: Rule[] = [installScriptsRule, dangerousApiRule, egressRule]

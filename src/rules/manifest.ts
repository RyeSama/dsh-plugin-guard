import type { Rule, RuleContext, RuleResult } from '../scanner/types.js'
import { isValidRange, satisfies } from '../util/semver.js'
import { stringField } from './source.js'

const DSC_DOCS = 'docs/permissions-spec.md'

function patchFiles(ctx: RuleContext): { paths: string[]; problem: string | null } {
  const dsh = ctx.dshBlock
  if (!dsh) return { paths: [], problem: null }
  const bundle = dsh['bundle']
  if (bundle === undefined) return { paths: [], problem: 'dsh.bundle is missing' }
  if (typeof bundle !== 'object' || bundle === null || Array.isArray(bundle)) {
    return { paths: [], problem: 'dsh.bundle must be an object' }
  }
  const patch = (bundle as Record<string, unknown>)['patch']
  if (patch === undefined) return { paths: [], problem: 'dsh.bundle.patch is missing' }
  if (typeof patch === 'string') return { paths: [patch], problem: null }
  if (Array.isArray(patch) && patch.length > 0 && patch.every((item) => typeof item === 'string')) {
    return { paths: patch as string[], problem: null }
  }
  return { paths: [], problem: 'dsh.bundle.patch must be a string or a non-empty array of strings' }
}

export const packageJsonRule: Rule = {
  id: 'manifest/package-json',
  severity: 'high',
  title: 'package.json',
  summary: 'Checks that the package has a readable package.json.',
  docs: DSC_DOCS,
  run(ctx) {
    if (ctx.packageJson !== null) return []
    return [
      {
        ruleId: 'manifest/package-json',
        severity: 'high',
        title: 'No usable package.json',
        message: ctx.packageJsonError
          ? `package.json could not be parsed: ${ctx.packageJsonError}`
          : 'package.json is missing from the package root.',
        fix: 'Create a package.json with name, version and a "dsh" block. Run "dsh-plugin-guard init" for a working template.',
        docs: DSC_DOCS,
        locations: [{ file: 'package.json' }],
      },
    ]
  },
}

export const dshBlockRule: Rule = {
  id: 'manifest/dsh-block',
  severity: 'high',
  title: 'DSH manifest',
  summary: 'Checks the dsh block and its bundle.patch entries.',
  docs: DSC_DOCS,
  run(ctx) {
    if (ctx.packageJson === null) return []
    const results: RuleResult[] = []
    if (!ctx.dshBlock) {
      results.push({
        ruleId: 'manifest/dsh-block',
        severity: 'high',
        title: 'Missing "dsh" block',
        message: 'DSH only loads packages that declare a "dsh" block with at least dsh.bundle.patch. Without it "dsh plugin add" installs the package but never activates it.',
        fix: 'Add the dsh block from the template: run "dsh-plugin-guard init --dry-run" and copy the package.json fragment.',
        docs: DSC_DOCS,
        locations: [{ file: 'package.json' }],
      })
      return results
    }
    const { paths, problem } = patchFiles(ctx)
    if (problem !== null) {
      results.push({
        ruleId: 'manifest/dsh-block',
        severity: 'high',
        title: 'Invalid dsh.bundle declaration',
        message: `${problem}. DSH expects dsh.bundle.patch to be a patch file path relative to the package root.`,
        fix: 'Set "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } and ship that file.',
        docs: DSC_DOCS,
        locations: [{ file: 'package.json' }],
      })
      return results
    }
    for (const path of paths) {
      const normalized = path.replace(/^\.\//, '')
      if (!ctx.files.includes(normalized)) {
        results.push({
          ruleId: 'manifest/dsh-block',
          severity: 'medium',
          title: 'Declared patch file is missing',
          message: `dsh.bundle.patch points at "${path}", but no such file exists in the package (it may be excluded by "files").`,
          fix: `Ship "${normalized}" in the published package, or remove the entry.`,
          docs: DSC_DOCS,
          locations: [{ file: 'package.json' }, { file: normalized }],
        })
      }
    }
    return results
  },
}

export const compatRule: Rule = {
  id: 'manifest/compat',
  severity: 'high',
  title: 'DSH compatibility',
  summary: 'Compares the declared DSH range with the running DSH version.',
  docs: DSC_DOCS,
  run(ctx) {
    if (ctx.packageJson === null) return []
    // DSH plugins declare the range either beside engines.node or inside their dsh block.
    const dshEngines = ctx.dshBlock?.['engines']
    const range =
      (dshEngines && typeof dshEngines === 'object'
        ? stringField(dshEngines as Record<string, unknown>, 'dsh')
        : null) ??
      (ctx.packageJson['engines'] && typeof ctx.packageJson['engines'] === 'object'
        ? stringField(ctx.packageJson['engines'] as Record<string, unknown>, 'dsh')
        : null)
    if (range === null) {
      return [
        {
          ruleId: 'manifest/compat',
          severity: 'low',
          title: 'No DSH version range',
          message: 'The package does not declare which DSH versions it supports, so compatibility cannot be verified.',
          fix: 'Add "dsh": { "engines": { "dsh": ">=0.1.5-rc.1" } } to package.json.',
          docs: DSC_DOCS,
          locations: [{ file: 'package.json' }],
        },
      ]
    }
    if (!isValidRange(range)) {
      return [
        {
          ruleId: 'manifest/compat',
          severity: 'medium',
          title: 'Unparsable DSH version range',
          message: `The declared DSH range "${range}" is not a valid SemVer range.`,
          fix: 'Use a SemVer range such as ">=0.1.5-rc.1" or "^0.1.5".',
          docs: DSC_DOCS,
          locations: [{ file: 'package.json' }],
        },
      ]
    }
    if (ctx.dshVersion && !satisfies(ctx.dshVersion, range)) {
      return [
        {
          ruleId: 'manifest/compat',
          severity: 'high',
          title: 'Declared incompatible with this DSH',
          message: `The plugin requires DSH "${range}", but DSH ${ctx.dshVersion} is installed. DSH does not enforce this today, so the failure would show up at runtime.`,
          fix: 'Install a compatible plugin version, or upgrade DSH.',
          docs: DSC_DOCS,
          locations: [{ file: 'package.json' }],
        },
      ]
    }
    return []
  },
}

export const identityRule: Rule = {
  id: 'manifest/identity',
  severity: 'medium',
  title: 'Package identity',
  summary: 'Checks name and version fields.',
  run(ctx) {
    if (ctx.packageJson === null) return []
    const results: RuleResult[] = []
    const name = stringField(ctx.packageJson, 'name')
    const version = stringField(ctx.packageJson, 'version')
    if (!name) {
      results.push({
        ruleId: 'manifest/identity',
        severity: 'medium',
        title: 'Missing package name',
        message: 'package.json has no "name", so the package cannot be published or resolved by DSH.',
        fix: 'Add "name" to package.json.',
        locations: [{ file: 'package.json' }],
      })
    }
    if (!version) {
      results.push({
        ruleId: 'manifest/identity',
        severity: 'medium',
        title: 'Missing package version',
        message: 'package.json has no "version", so DSH cannot tell two builds apart or check compatibility.',
        fix: 'Add "version" to package.json.',
        locations: [{ file: 'package.json' }],
      })
    }
    return results
  },
}

export const manifestRules: Rule[] = [packageJsonRule, dshBlockRule, compatRule, identityRule]

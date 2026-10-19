# Rules

`dsh-plugin-guard rules` prints this list. Every rule is enabled by default, contributes a weighted score, and can be selected with `--only <id>` or skipped with `--ignore <id>`.

Severity weight: high = 100, medium = 40, low = 10, info = 0. The score starts at 100 and subtracts weight, clamped at 0. Any high finding makes the verdict `fail` and the exit code `1`; any medium or low finding makes it `warn`.

| Rule | Severity | Fires when |
| --- | --- | --- |
| `manifest/package-json` | high | `package.json` is missing or not valid JSON |
| `manifest/dsh-block` | high | no `dsh` block, `bundle.patch` missing/not a string or string array, or the declared patch file is not shipped |
| `manifest/compat` | high | the declared DSH range is invalid, absent (low), or does not satisfy the current DSH version |
| `manifest/identity` | medium | `name` or `version` missing |
| `publish/registry` | medium | package is not published, is deprecated, or the local version is ahead of the published one |
| `permissions/declared` | medium / high | `dsh.permissions` absent (medium) or invalid (high) |
| `permissions/overbroad` | medium | declaration grants far more than a plugin needs |
| `permissions/code-mismatch` | high / medium | code uses a capability that is not declared |
| `security/install-scripts` | high | `install`/`postinstall` (high) or `preinstall` (medium) lifecycle script |
| `security/dangerous-api` | high / medium | `child_process`, `eval`/`new Function`, obfuscation, `process.binding`; `vm.runIn*` and dynamic `require`/`import` are medium |
| `security/egress` | medium | a hard-coded host is not covered by `network.outbound` |
| `deps/lockfile` | medium | runtime dependencies exist but no lockfile ships next to them |
| `deps/wildcard` | medium | a dependency uses `*`, `latest`, `x`, a git URL, an http URL or a `file:` path |
| `deps/count` | low | more than 40 runtime dependencies |
| `source/trust-index` | medium / high | registry package with no index entry (low/unverified), tree hash changed since it was recorded (high), publisher changed (high) |

## Notes per rule

### manifest/dsh-block

DSH only activates a package that declares `dsh.bundle.patch`. A package without it installs silently and does nothing — the most common "why doesn't my plugin load" cause. The scan also checks that every declared patch file is present in the package, which catches a path excluded by `files` in `package.json`.

### manifest/compat

DSH does not enforce `engines.dsh` today, so a mismatched range is a runtime failure waiting to happen. The rule reads `dsh.engines.dsh` first and falls back to `engines.dsh`. Pass `--dsh-version 0.2.0` to compare against a specific version; without it the range is only validated, not satisfied.

### permissions/code-mismatch

The rule that makes the manifest worth writing. It links static evidence to the declaration:

| Evidence in source | Required declaration |
| --- | --- |
| `node:child_process` import, `exec()`/`spawn()` | `shell.execute: true` (or `process.spawn: true`) |
| `fs.writeFile`, `fs.appendFile`, `fs.rm` | `filesystem.write` with a non-empty glob list |
| `{ ...process.env }`, `Object.keys(process.env)` | `env.bulk: true` |

### security/dangerous-api

Comment-only matches are stripped before matching, and binaries are skipped. The rule reports the file and line so the reviewer can look at the exact expression. It is a question, not a verdict: a plugin that legitimately runs `git` will trip both `child_process` and `permissions/code-mismatch` until it declares `shell.allow: ["git"]`.

### security/install-scripts

`npm install` runs these before the user ever opens the plugin. The report suggests `--ignore-scripts`, which works for plugins that only ship source. A plugin that genuinely needs a build step should say so in its README; the finding stays.

### source/trust-index

Only meaningful after `index add`. For a registry package with no entry the report says *unverified source* — never "safe". For an entry that exists, a different `treeSha256` or `publisher` is a high finding: the artefact you reviewed is not the artefact being installed.

## Adding a rule

1. Add a `Rule` object under `src/rules/` (`id`, `severity`, `title`, `summary`, `run(ctx)`).
2. Register it in `DEFAULT_RULES` in `src/rules/index.ts`.
3. Add a fixture under `tests/fixtures/` that triggers it and one that does not.
4. Document it in this file.
5. `npm run verify`.

Rules receive a `RuleContext` with lazily loaded source text (`ctx.readText`) and must never import, require or execute anything from the scanned package.

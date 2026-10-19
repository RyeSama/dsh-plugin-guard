# Changelog

## 0.2.0

First published release. `0.1.0` was completed but never reached npm, so the feature list below ships for the first time; the entries after "Since 0.1.0" are what changed in this iteration.

### Since 0.1.0

- **Listed in the DSH plugin catalog.** The bundle is now an entry in the community catalog (`RyeSama/dsh-plugin-guard/plugins/dsh-guard-tool`, category `dev`), installable straight from GitHub with `dsh plugin --profile web add github:RyeSama/dsh-plugin-guard#path:plugins/dsh-guard-tool`. Once the npm package exists the catalog resolves the same entry to npm automatically — no second submission.
- **Fixed the host compatibility declaration.** The bundle was developed and tested against the `0.2.1-alpha` line of the platform packages, but declared `@deepseek-ai/dsh-tools@0.0.1-rc.1` and `dsh.engines.dsh >=0.1.5-rc.1`, which overstated compatibility. It now pins `>=0.2.0-rc.1 <0.3.0-0` in both `peerDependencies` and `dsh.engines.dsh`, so a host outside that range fails an explicit peer check instead of silently loading a tool it cannot call.
- **Publishable bundle package.** `plugins/dsh-guard-tool` gained `publishConfig.access: public`, a `./package.json` export (bundlers and catalogs read it), and its own copy of the MIT `LICENSE`; npm packing no longer falls back to the repository root license.
- `docs/dsh-bundle.md` documents the peer-dependency convention the ecosystem actually uses (`@deepseek-ai/dsh-tools` as a peer, the host reading it from its own bundle) and repeats that DSH installers do not enforce `engines.dsh`.
- The plugin smoke suite runs in CI against the real `defineTool` from `@deepseek-ai/dsh-tools@0.2.1-alpha.2` instead of a stub.

## 0.1.0

First release.

### Added

- `dsh-plugin-guard-tool` — a DSH plugin bundle that registers the `plugin_guard` agent tool, so a scan can happen inside the Harness before a package is installed. Host-only: no client code, no UI, no extra privileges; it calls the same `analyze()` the CLI calls. See `docs/dsh-bundle.md`.
- `docs/dsh-bundle.md` — what the bundle registers, install commands, and what it may not claim.
- `dsh-plugin-guard scan <path|npm-package>` — static security scan for DSH plugins. Directory input is offline by default; npm input downloads the tarball, verifies its registry integrity hash, and never runs install scripts.
- 15 built-in rules across manifest, publish state, permissions, dangerous APIs, dependency hygiene, and source integrity. `--only` / `--ignore` select rules; `--fail-on-medium` makes medium findings fail CI.
- `dsh.permissions` manifest specification (version 1) with a strict validator, overbroad-grant detection, and code-vs-declaration mismatch detection. Documented in `docs/permissions-spec.md`.
- Human-readable report by default, `--json` for tooling. Exit codes: `0` pass, `1` findings at the configured threshold, `2` usage error, `3` unexpected error.
- `doctor` — checks Node version, npm registry reachability, trust index writability, and the `dsh` CLI, each with a fix suggestion.
- `init` — generates a minimal, scannable DSH plugin manifest (`--dry-run` supported).
- `index` (`add`, `list`, `remove`, `path`, `verify`) — local trust index at `~/.dsh-plugin-guard/index.json`, overridable with `DSH_GUARD_INDEX`. Stores tree hash, publisher, DSH compatibility and last verdict per `name@version`.
- `audit status` / `audit tail` — runtime audit adapter interface with an NDJSON sidecar adapter at `~/.dsh-plugin-guard/audit.ndjson` (`DSH_GUARD_AUDIT`). DSH exposes no official hook today, and the tool says so instead of pretending otherwise.
- `rules` — lists every rule, its severity and weight.
- Docs: `docs/permissions-spec.md`, `docs/threat-model.md`, `docs/rules.md`, `docs/audit-adapter.md`.

### Security notes

- The scanner reads files only. It never requires, imports, installs or evaluates the code it scans; `tests/scan.test.ts` proves this with marker files that stay absent.
- It never reads `.env`, SSH keys, browser credentials or your home directory as a scan root.
- It performs no network access for directory scans. Network is used only for npm package inputs, `--check-publish`, and `doctor`.
- Nothing is published or released automatically.

### Known limits

- Static analysis only: capabilities reached through dependencies or built at runtime are invisible.
- `engines.dsh` is not enforced by DSH; the scan can only compare ranges.
- No sandboxing. The guard is an admission layer, not kernel isolation.
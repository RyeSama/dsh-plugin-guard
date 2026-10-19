# Changelog

## 0.1.0

First release.

### Added

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

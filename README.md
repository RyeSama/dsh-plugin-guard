```bash
npx dsh-plugin-guard-cli scan ./my-plugin   # one command, no install, no config, no login
```
A clean plugin prints `PASS 100/100 — 0 high · 0 medium · 0 low`; anything risky prints the finding, the file and line, and the command that fixes it.

# dsh-plugin-guard

**A security gate you can run before you install a DSH plugin, before you publish one, and in CI.**

[![CI](https://github.com/RyeSama/dsh-plugin-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/RyeSama/dsh-plugin-guard/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/dsh-plugin-guard-cli.svg)](https://www.npmjs.com/package/dsh-plugin-guard-cli) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DSH plugins are npm packages that declare a `dsh` block and get composed into the DSH host process. There is no sandbox at that boundary: a plugin runs with the same privileges as DSH itself. This tool does not change that. It makes the decision *visible before it happens*:

- **scanner** — reads the package (never runs it) and reports what it would be allowed to do
- **permission manifest** — `dsh.permissions`, a convention this project proposes so a plugin can state what it reads, writes, executes and sends
- **trust index** — a local record of the source hash you reviewed, so a silent republish is visible
- **runtime audit adapter** — a documented interface with a sidecar implementation, honest about what DSH does not expose today

It is deliberately not a sandbox, not an antivirus, and not a replacement for reading the code.

## What a scan looks at

| Area | Examples of what is flagged |
| --- | --- |
| DSH manifest | no `dsh` block, `bundle.patch` pointing at a file that is not shipped, unparsable DSH version range |
| npm state | not published, deprecated, local version ahead of the published one |
| Permissions | no `dsh.permissions`, invalid declaration, code using a capability it never declared |
| Dangerous code | `child_process`, `eval`/`new Function`, `vm.runIn*`, dynamic `require`/`import`, `process.binding`, obfuscated blobs |
| Install scripts | `preinstall`, `install`, `postinstall` — code that runs on `npm install`, before any review |
| Dependencies | missing lockfile, `*` / `latest` / git / http specs, very large dependency surface |
| Network | hard-coded hosts that the plugin never declared |
| Source integrity | package hash differs from the one recorded in your trust index, publisher changed |

`dsh-plugin-guard rules` prints the full list with severities.

## Commands

```bash
# scan a local folder, a tarball or an npm package name
npx dsh-plugin-guard-cli scan ./my-plugin
npx dsh-plugin-guard-cli scan dsh-startup-screen-repair
npx dsh-plugin-guard-cli scan ./my-plugin --json          # machine-readable
npx dsh-plugin-guard-cli scan ./my-plugin --check-publish # also ask npm (network)

# is this machine able to scan?
npx dsh-plugin-guard-cli doctor

# add the DSH manifest to a folder (writes package.json, cordis.patch.yml, index.js, README)
npx dsh-plugin-guard-cli init ./my-plugin --dry-run
npx dsh-plugin-guard-cli init ./my-plugin

# trust index
npx dsh-plugin-guard-cli index add ./my-plugin
npx dsh-plugin-guard-cli index list
npx dsh-plugin-guard-cli index verify ./my-plugin        # did this artefact change since review?
npx dsh-plugin-guard-cli index remove dsh-my-plugin@1.0.0

# audit sidecar
npx dsh-plugin-guard-cli audit status
npx dsh-plugin-guard-cli audit tail --limit 20
```

Both `dsh-plugin-guard` and `dsh-guard` are installed as binaries, so `npx dsh-guard scan .` works too.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | pass, or warnings only |
| `1` | at least one high finding (or any medium finding with `--fail-on-medium`) |
| `2` | bad usage — unknown option, unknown rule id, bad `--max-files` |
| `3` | the scan could not run — target not found, network failure, unreadable package |

CI usage:

```bash
npx dsh-plugin-guard-cli scan . --json > guard-report.json
```

### Zero config

There is no config file and no `init` step required. Defaults: all rules on, network off for directory scans, readable report on, exit code on high risk. Flags are the only knobs:

`--json`, `--offline`, `--check-publish`, `--only <ids>`, `--ignore <ids>`, `--fail-on-medium`, `--dsh-version <v>`, `--max-files <n>`, `--record`, `--verbose`.

## Declaring permissions

`dsh.permissions` is a **convention proposed by this project**. DSH itself does not read it today, and the scanner cannot enforce it at runtime — it only checks that the declaration exists, is valid, and matches what the code actually does.

```json
{
  "name": "dsh-my-plugin",
  "version": "1.0.0",
  "dsh": {
    "manifestVersion": 1,
    "engines": { "dsh": ">=0.1.5-rc.1" },
    "bundle": { "patch": "./cordis.patch.yml" },
    "permissions": {
      "version": 1,
      "filesystem": { "read": ["notes/*.md"], "write": [] },
      "shell": { "execute": false, "allow": [] },
      "env": { "read": ["DSH_PROFILE"], "bulk": false },
      "network": { "outbound": [], "inbound": false },
      "credentials": { "read": [], "write": false },
      "process": { "spawn": false }
    }
  }
}
```

The full field reference, semantics and examples are in [docs/permissions-spec.md](docs/permissions-spec.md).

## Trust index

The index is a small JSON file at `~/.dsh-plugin-guard/index.json` (override with `DSH_GUARD_INDEX`). It stores, per `name@version`, the package hash, tree hash, publisher, scan verdict and the DSH version used. Scanning works with or without it — when an entry is missing for a registry package the report says the source is unverified instead of pretending it is safe.

`index add` records what you reviewed. If a later scan of the same `name@version` sees a different tree hash or publisher, that is reported as a high finding: the artefact changed after review.

## Runtime audit: what is real and what is not

DSH has no public plugin audit stream and no in-process isolation. This project therefore ships:

- a documented `RuntimeAuditAdapter` interface ([src/audit/types.ts](src/audit/types.ts)),
- a **sidecar** implementation that appends NDJSON events to `~/.dsh-plugin-guard/audit.ndjson`,
- `audit status` which prints, in plain words, that no official hook exists ([src/adapters/dsh/index.ts](src/adapters/dsh/index.ts)).

It never claims to intercept, block or observe plugin code it cannot see. See [docs/audit-adapter.md](docs/audit-adapter.md) and [docs/threat-model.md](docs/threat-model.md).

## Non-goals

- Not a sandbox: it cannot stop a malicious plugin from doing anything once DSH loads it.
- Not a code review: it finds patterns, not intent.
- Not a replacement for `npm audit` or your lockfile.
- Does not run, import, install or evaluate the plugin it scans — ever.
- Does not read your `.env`, credentials, SSH keys or browser profile; the scanner skips those paths and refuses to scan your home directory.

## Security statement

The scanner only reads files. It does not `require`/`import` the scanned package, does not execute `postinstall`, does not resolve its dependencies, and does not write anything into the scanned folder. Network access happens only for `scan <npm-package>`, `--check-publish`, `index add <npm-package>` and `doctor`. Reports contain no secrets: file paths are relative to the package root.

If you find a way to make the scanner execute scanned code, that is a security bug — please open an issue.

## Development

```bash
npm ci
npm run verify     # lint + typecheck + test + build
npm run smoke      # packs the tarball and runs it against tests/fixtures/clean-plugin
```

Node 20 or newer. No native dependencies. The published package bundles commander and zod, so `npx` fetches one tarball with no transitive install.

## License

MIT

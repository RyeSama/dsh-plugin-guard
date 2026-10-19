# The DSH bundle

This repository produces two artifacts from one scanner:

| artifact | npm package | who uses it |
| --- | --- | --- |
| CLI | `dsh-plugin-guard-cli` | humans, CI, pre-commit hooks |
| DSH bundle | `dsh-plugin-guard-tool` | the agent inside DeepSeek Harness |

The bundle lives in [plugins/dsh-guard-tool](../plugins/dsh-guard-tool). It is a
separate package on purpose: DSH resolves a bundle by reading
`dsh.bundle.patch` from *that package's* manifest, and a package that pretends
to be both a CLI and a bundle makes the admission story harder to state.

## What it registers

One agent tool:

```
plugin_guard(target: string, json?: boolean)
```

`target` is a directory or an npm package name. The tool runs the same
`analyze()` the CLI runs, with the same rule set and the same severity weights,
and returns:

- `verdict` — `pass`, `warn` or `fail`
- `score` — 100 minus the weighted findings
- `high`, `medium`, `low` — counts
- `findings` — up to eight one-line reasons, most severe first
- `report` — the rendered report, including the next command to run

## Install

```bash
dsh plugin --profile desktop add dsh-plugin-guard-tool
```

From a checkout, before the package is published:

```bash
dsh plugin --profile desktop add link:$PWD/plugins/dsh-guard-tool
```

The install is performed by the plugin manager, not by copying files into
`node_modules` — DSH merges bundles into the profile's layer stack, and a copied
folder is not part of that stack.

## Compatibility

The bundle is a plain Cordis plugin: it imports `defineTool` from
`@deepseek-ai/dsh-tools` and registers through `ctx.tools.register`. Platform
packages like that one are supplied by the host, so they are declared as a
`peerDependency` rather than a bundled dependency — the same convention the
other published DSH bundles use:

```json
"peerDependencies": { "@deepseek-ai/dsh-tools": ">=0.2.0-rc.1 <0.3.0-0" }
```

`dsh.engines.dsh` declares the same range so a reader can see what was tested.
DSH's installers do not enforce either field today; a mismatch shows up as a
failed import, not as a refused install.

## What the bundle may and may not claim

It may claim that it read files and reports what the rules found.

It may not claim that it:

- blocked anything — it returns a verdict, the model decides what to do;
- sandboxed anything — an installed DSH bundle is an ordinary Cordis plugin with
  Node privileges, in the same process as the host;
- observed the plugin at runtime — there is no audit hook to attach to
  (see [audit-adapter.md](audit-adapter.md)).

DSH's own `dsh-cordis-host-runner` sandboxes only *dynamic, session-scoped*
packages in a `node:vm` realm, and its README says the sandbox "is not a security
boundary". Installed bundles never go through it.

## Marketplace listing

The community market lists catalog entries, not npm uploads. An entry becomes
installable when the package is published to npm, its `latest` version is stable
and its manifest declares `dsh.bundle.patch` — those are the market's rules, not
ours. When the package is not published yet, the entry stays browse-only.

A listing is not a security review, and this project does not treat it as one.

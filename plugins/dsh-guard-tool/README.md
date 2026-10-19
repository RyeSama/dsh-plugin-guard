# dsh-plugin-guard-tool

A DSH plugin bundle that gives the agent one tool: **`plugin_guard`**.

Ask it to check a package before it joins your profile, and it answers with the
same verdict, reasons and next command the CLI prints:

```
> scan ../dsh-plugin-gate before I install it

FAIL  0/100  ·  1 high · 1 medium · 2 low
HIGH  security/dangerous-api  Evaluates code at runtime (lib/rules.js:136)

Next: read the flagged lines before installing; drop --ignore-scripts if the
package needs an install step you did not review
```

The scan is static and read-only. It never imports, installs, evaluates or runs
the code it looks at, and it never writes to the package.

## Install

```bash
dsh plugin --profile desktop add dsh-plugin-guard-tool
```

Or from a checkout, without publishing:

```bash
dsh plugin --profile desktop add link:$PWD/plugins/dsh-guard-tool
```

After the profile restarts the agent has `plugin_guard`; nothing appears in the
desktop UI, because this bundle ships no client code.

Requires DSH `>=0.2.0-rc.1 <0.3.0-0`, declared both in `peerDependencies` and in
`dsh.engines.dsh`. `@deepseek-ai/dsh-tools` comes from the host; the bundle only
imports it.

## What the tool accepts

| argument | type | meaning |
| --- | --- | --- |
| `target` | string, required | a plugin directory (`./my-plugin`) or an npm package name (`dsh-plugin-gate`) |
| `json` | boolean | return the full machine-readable report instead of the summary |

## What it does not do

- It does not install, block, or sandbox anything. A DSH plugin runs in the host
  process; the guard is governance and admission, not isolation.
- It does not fetch the trust index of the profile's CLI. The tool reads the
  package on disk and reports; `dsh-plugin-guard index` and `dsh-plugin-guard scan`
  remain the CLI's job.
- It cannot see what a dependency does, or what the plugin does at runtime.

## Files

```
index.js          host half: defineTool + ctx.tools.register
spec.js           the tool definition, free of any DSH import (unit tested)
cordis.patch.yml  the bundle patch that mounts the host half
locale/{en,zh}.json  title and description shown by the host
icon.svg          the icon shown by the host
```

`spec.js` is kept separate on purpose: the tool's behaviour is testable with
`node --test test/smoke.mjs` and no DSH installation.

MIT.

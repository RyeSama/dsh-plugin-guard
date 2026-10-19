# Examples

| Path | What it shows |
| --- | --- |
| `minimal-plugin/` | The smallest DSH plugin that still passes a scan with zero findings: `dsh.bundle.patch`, `engines.dsh`, and a fully declared (empty) `dsh.permissions` block. |

```bash
npx dsh-plugin-guard-cli scan ./examples/minimal-plugin
```

Expected: `PASS 100/100 — 0 high · 0 medium · 0 low`, exit code `0`.

To start a new plugin from the same shape, use `init` instead of copying:

```bash
npx dsh-plugin-guard-cli init ./my-plugin --dry-run   # preview
npx dsh-plugin-guard-cli init ./my-plugin             # write
```

The generated tree is intentionally boring: `package.json` with the `dsh` block, `cordis.patch.yml`, `index.js`, `README.md`, `.gitignore`. It contains no build step, no dependencies and no install script, because every one of those is something a reviewer has to trust.

# dsh.permissions — permission manifest for DSH plugins

**Status: proposal, version 1.** DSH does not read `dsh.permissions` today. Nothing in DSH enforces it. This document defines the convention that `dsh-plugin-guard` validates and compares against source code, so that a plugin can state its capabilities in one place and a reviewer (or CI) can see whether the code agrees.

Because it is declarative and unenforced, it is useful for three things and useless for a fourth:

| Useful for | Not useful for |
| --- | --- |
| showing a user what a plugin claims before install | stopping a plugin that lies |
| diffing capability changes between versions | sandboxing anything |
| failing CI when code outgrows its declaration | replacing code review |

## Placement

```jsonc
{
  "name": "dsh-my-plugin",
  "version": "1.0.0",
  "dsh": {
    "manifestVersion": 1,
    "engines": { "dsh": ">=0.1.5-rc.1" },
    "bundle": { "patch": "./cordis.patch.yml" },
    "permissions": { "version": 1, "...": "..." }
  }
}
```

The declaration lives inside the existing `dsh` block, next to `bundle`. A standalone `permissions.json` is not part of the convention: the manifest that DSH already reads is the manifest that should carry permissions.

## Shape

Every section and every field is optional, but the object is **strict**: unknown keys are rejected, so a typo cannot silently widen or narrow a declaration. An absent section means "not declared", not "allowed".

```ts
interface Permissions {
  version?: 1                       // manifest format version; absent = 1
  filesystem?: {
    read?: string[]                 // glob patterns, relative to the DSH workspace
    write?: string[]
  }
  shell?: {
    execute?: boolean               // invoke executables at all
    allow?: string[]                // argv[0] names the plugin may run
  }
  env?: {
    read?: string[]                 // variable names or globs: DSH_*, OPENAI_API_KEY
    bulk?: boolean                  // Object.keys(process.env), {...process.env}
  }
  network?: {
    outbound?: string[]             // hosts: api.example.com, *.example.com
    inbound?: boolean               // listens for connections
  }
  credentials?: {
    read?: string[]                 // named entries in the DSH credential store
    write?: boolean
  }
  process?: {
    spawn?: boolean                 // detached / long-lived child processes
  }
}
```

### Field reference

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `version` | `1` | `1` | Format version. Reserved for breaking changes. |
| `filesystem.read` | string[] | `[]` | Globs the plugin may read, relative to the DSH workspace root. `*` does not cross `/`; `**` does. |
| `filesystem.write` | string[] | `[]` | Globs the plugin may create, modify or delete. |
| `shell.execute` | boolean | `false` | Whether the plugin may start processes through a shell or `child_process`. |
| `shell.allow` | string[] | `[]` | Executable names (`git`, `rg`) the plugin may invoke. `*` means any. |
| `env.read` | string[] | `[]` | Environment variable names or globs the plugin may read. |
| `env.bulk` | boolean | `false` | Reading the entire environment, e.g. `{ ...process.env }`. |
| `network.outbound` | string[] | `[]` | Hosts the plugin may contact. `*.example.com` matches subdomains only; `example.com` matches that host. |
| `network.inbound` | boolean | `false` | Whether the plugin opens a listening socket. |
| `credentials.read` | string[] | `[]` | Named credentials from the DSH credential store. |
| `credentials.write` | boolean | `false` | Whether the plugin may add or modify stored credentials. |
| `process.spawn` | boolean | `false` | Detached or long-lived child processes, beyond a single `shell.execute` call. |

### Capability names

A declaration grants a **capability** when the corresponding field is non-empty or `true`. The canonical names, used in reports and in `--json`:

`filesystem.read`, `filesystem.write`, `shell.execute`, `env.read`, `env.bulk`, `network.outbound`, `network.inbound`, `credentials.read`, `credentials.write`, `process.spawn`.

## Matching rules

- **Globs** are POSIX-style and relative to the DSH workspace root. A leading `./` is ignored. `notes/*.md` matches `notes/today.md` but not `notes/2026/today.md`; `notes/**` matches both.
- **Hosts** are lowercase, no scheme, no port, no path. `*.example.com` matches `api.example.com` but not `example.com`. A bare `example.com` does not match subdomains.
- **Commands** are bare executable names, not paths: `git`, not `/usr/bin/git`.

## What the scanner checks

1. **declared** — the declaration exists and validates against this spec. Absent is a medium finding; invalid is high.
2. **overbroad** — grants far beyond a normal plugin: `env.bulk`, `shell.execute` with no `allow` list, `filesystem.write: ["**"]`, `network.outbound: ["*"]`, `credentials.write`, `process.spawn` without `shell.execute`.
3. **code-mismatch** — source code uses a capability the declaration does not grant: `child_process` without `shell.execute`/`process.spawn`, file writes without `filesystem.write`, environment enumeration without `env.bulk`.

The scanner is static. It matches patterns in source files and can produce **false negatives** (a capability reached through a dependency, a string built at runtime, minified code) and **false positives** (a pattern in a comment is stripped, but a pattern in a test file still counts). Treat a match as a question, not a verdict.

## Examples

### Minimal, read-only

```json
{
  "permissions": {
    "version": 1,
    "filesystem": { "read": ["notes/*.md"] },
    "env": { "read": ["DSH_PROFILE"] }
  }
}
```

### Web client plugin that calls one API

```json
{
  "permissions": {
    "version": 1,
    "network": { "outbound": ["api.example.com"] },
    "env": { "read": ["EXAMPLE_API_TOKEN"] },
    "credentials": { "read": ["example-api"] }
  }
}
```

### CLI helper that runs git

```json
{
  "permissions": {
    "version": 1,
    "shell": { "execute": true, "allow": ["git"] },
    "filesystem": { "read": ["**"], "write": [] }
  }
}
```

## Versioning

`version` is the manifest format version and is independent of the npm package version and of `dsh.manifestVersion`. Adding optional fields is not a breaking change. Removing a field, or changing the meaning of an existing one, requires a new `version`.

Today's consumers: `dsh-plugin-guard` validates the shape and compares it with source. A future DSH release could read the same block without a format change — that is the point of putting it in the manifest DSH already loads.

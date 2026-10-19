# Threat model

## The boundary this project governs

```
  npm registry            your machine                 DSH process
 ┌────────────┐   install  ┌──────────────┐  compose   ┌───────────────────┐
 │ tarball    │ ─────────► │ node_modules │ ─────────► │ plugin runs as-is │
 │ (+ scripts)│            │ + lockfile   │            │ no sandbox        │
 └────────────┘            └──────────────┘            └───────────────────┘
        ▲                          ▲                            ▲
        │                    dsh-plugin-guard                  │
        └──── scan before install ┘                 audit adapter (observer)
```

DSH loads a plugin by composing its bundle patch into the host process. There is no process boundary, no permission system and no audit event stream between the plugin and DSH. **The plugin inherits everything DSH has**: the filesystem the user can reach, the environment, the network, the credentials DSH holds.

`dsh-plugin-guard` is a **governance and admission layer**. It moves the decision earlier, where it can be inspected, and it records what was decided. It is not a kernel-level isolation layer, and it never claims to be one.

## Assets

| Asset | Why it matters |
| --- | --- |
| User files | A plugin runs with the user's file permissions. |
| Environment and credentials | API keys, tokens, cloud credentials are readable through `process.env` and the DSH credential store. |
| The DSH process itself | A crash or an infinite loop takes the editor down with it. |
| Supply chain integrity | The tarball a user installs must be the one that was reviewed. |
| User attention | A user cannot read every dependency before installing. |

## Threats in scope

| Threat | What the guard does | Residual risk |
| --- | --- | --- |
| Malicious install script (`postinstall`) running before any review | Flags `preinstall`/`install`/`postinstall` as high, and the report suggests installing with `--ignore-scripts` | The script still runs if the user ignores the finding; `--ignore-scripts` can break legitimate packages |
| Obfuscated payload hidden in source | Flags long base64/hex blobs and `\x`-escaped strings, `eval`, `new Function` | Minified or deliberately split payloads can stay under the thresholds |
| Undeclared capability use | Compares code patterns with `dsh.permissions` and reports mismatches | Pattern matching only; a capability reached through a dependency is invisible |
| Silent republish of a reviewed package | Trust index stores tree hash + publisher per `name@version`; a mismatch is high | Only helps if the user scanned and recorded the version they reviewed |
| Name confusion (lookalike package names) | Always shows the registry name, publisher and repository next to the verdict; a publisher change against the trust index is high | The guard cannot know which name the user meant |
| Broken plugin (no bundle, wrong DSH range) | Manifest rules: missing `dsh` block, `bundle.patch` not shipped, unsatisfied `engines.dsh` | DSH does not enforce `engines.dsh`; runtime failure is still possible |
| Dependency drift | Flags missing lockfile, wildcard/git/http specs, large dependency surface | The guard does not resolve or audit transitive dependencies |
| Undeclared egress | Flags hard-coded hosts not in `network.outbound` | Hosts computed at runtime are invisible |

## Out of scope

- **Runtime isolation.** No sandbox, seccomp, VM or worker boundary is created. A plugin that passes every check can still steal credentials at runtime.
- **Post-install behaviour.** The guard sees the package, not what it does after DSH starts.
- **Transitive dependencies.** Only the top-level manifest is checked; a malicious transitive package is out of reach.
- **0-days in DSH, Node or the OS.**
- **Compromised registry or npm account.** TLS and npm 2FA are assumed; the guard can detect an artefact change *after* the fact, not prevent it.
- **Malicious maintainer who also controls the trust index.** The index is local, unauthenticated and user-owned.

## Assumptions

1. The user runs the scan **before** `dsh plugin add`, on the same machine that will install the package.
2. The scanner itself is trusted: it is installed from npm, and its own dependencies are pinned in `package-lock.json`.
3. The scanner never executes scanned code. This is a hard rule, tested by `tests/scan.test.ts` ("never executes the code it scans").
4. Network access is explicit: directory scans are offline by default; registry lookups only happen for npm inputs or when the user asks for them.

## Why static analysis and not execution

Executing a plugin in a sandbox to observe it would require the very isolation DSH does not have, and would run attacker-controlled code on the reviewer's machine. Static analysis is weaker but honest: it reads bytes, reports what it sees, and never becomes the attack surface. The permission manifest exists to make the static result comparable across versions, not to make it complete.

## Failure modes of the guard itself

| Failure | Effect | Mitigation |
| --- | --- | --- |
| False negative (missed capability) | Report says pass, plugin is risky | Read the code for high-value plugins; the guard is one input, not a proof |
| False positive (test file uses `eval`) | Noise, alert fatigue | `--only`/`--ignore`, fixture-based rule tests, comments are stripped |
| Index loss (`~/.dsh-plugin-guard` deleted) | Verification downgrades to "unverified" | Re-record after review |
| Index poisoning (attacker writes the index) | Fake "verified" status | Index is local to the user; never trust it across machines |
| Scanner bug that executes code | Critical | Hard rule + test; report as a security issue |

## Disclosure

If you find a way to make the scanner execute, install or evaluate a scanned package, open an issue with the fixture that reproduces it. Do not include real credentials.

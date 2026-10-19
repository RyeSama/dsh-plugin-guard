# Runtime audit adapter

## What exists today

DSH composes a plugin's bundle patch into the host process. It exposes no plugin audit event stream, no lifecycle hook for third-party observers, and no process boundary. `dsh-plugin-guard audit status` says exactly that, from `DSH_AUDIT_SUPPORT` in [src/adapters/dsh/index.ts](../src/adapters/dsh/index.ts):

```ts
export const DSH_AUDIT_SUPPORT = {
  officialHook: false,
  since: 'checked 2026-10',
  reason: 'DSH composes plugin bundles into the host process through cordis patches. There is no public audit event stream and no sandbox between a plugin and the host.',
  alternatives: [/* read the sidecar log, keep a scan report next to the install */],
}
```

The adapter interface exists so that the day DSH ships a hook, one implementation is added and every consumer keeps working. Until then the sidecar is the only adapter, and it records **only what the guard itself observes**.

## Interface

```ts
export interface AuditEvent {
  at: string                                  // ISO 8601
  type: 'scan' | 'admission' | 'block' | 'note' | 'runtime'
  plugin?: string                             // "name@version"
  message: string
  data?: Record<string, unknown>
}

export interface AdapterAvailability {
  available: boolean
  reason?: string
  path?: string
}

export interface RuntimeAuditAdapter {
  name: string
  description: string
  kind: 'sidecar' | 'official-hook'
  available(): Promise<AdapterAvailability>
  record(event: AuditEvent): Promise<void>
  read(options?: { limit?: number }): Promise<AuditEvent[]>
}
```

Design constraints, and why:

- **Append-only, line-oriented.** NDJSON survives a crash and is readable with `tail`. A torn last line is skipped instead of failing the whole read.
- **Never throws on read.** An unavailable log is a normal state (`available()` returns `false` with a reason), not an error.
- **No secrets in events.** The adapter writes what the caller gives it; callers must pass paths relative to the package root and must not pass environment values or tokens.
- **Observer, not enforcer.** `record()` cannot block a load. Claiming otherwise would be a lie about DSH's capabilities.

## Sidecar implementation

| Setting | Default |
| --- | --- |
| Path | `~/.dsh-plugin-guard/audit.ndjson` |
| Override | `DSH_GUARD_AUDIT` |
| Permissions | `0600`, directory created on first write |
| Rotation | none; the file is append-only and small (one line per event) |

```bash
npx dsh-plugin-guard-cli audit status          # which adapter, and whether DSH has a hook
npx dsh-plugin-guard-cli audit tail --limit 20 # last events, human readable
npx dsh-plugin-guard-cli audit tail --json     # same, for tooling
```

Sample file:

```json
{"at":"2026-10-20T00:31:00.000Z","type":"scan","plugin":"dsh-startup-screen-repair@1.2.0","message":"scan pass (100/100)","data":{"verdict":"pass","treeSha256":"…"}}
{"at":"2026-10-20T00:32:10.000Z","type":"admission","plugin":"dsh-startup-screen-repair@1.2.0","message":"installed by user after review"}
```

## Implementing an official adapter

When DSH exposes a hook, implement `RuntimeAuditAdapter` with `kind: 'official-hook'`, subscribe to the host's events, map them to `AuditEvent`, and make `read()` return what the host retains (or your own copy). Then:

1. Add the adapter under `src/adapters/<host>/`.
2. Register it in `defaultAuditAdapter()` with an availability probe.
3. Update `DSH_AUDIT_SUPPORT` — `officialHook: true`, the version that introduced it, and the event names.
4. Keep the sidecar as the fallback: an official hook that is missing at runtime must not break `audit tail`.
5. Add a test that the adapter degrades to `available: false` when the hook is absent.

## What this adapter must never claim

- That it saw plugin code execute, unless the host actually emitted that event.
- That it blocked anything. Blocking requires control of the loader; the guard has none.
- That an absent event means the plugin behaved. Absence of evidence is not evidence of absence at this layer.

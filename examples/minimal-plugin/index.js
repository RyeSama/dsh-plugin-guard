// Host half of the plugin. DSH composes this into the host process:
// there is no sandbox, so the plugin must stay small and predictable.
export const name = 'dsh-plugin-example'

export function apply(ctx) {
  // `ctx` is the host context provided by DSH. Do not start processes,
  // read the environment or write files unless the manifest declares it.
  ctx.logger?.info?.(`${name} loaded`)
}

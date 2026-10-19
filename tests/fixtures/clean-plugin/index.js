import { readFile } from 'node:fs/promises'

export const name = 'dsh-fixture-clean'

export function apply(ctx) {
  ctx.effect(() => {
    ctx.logger?.info?.(`profile ${process.env.DSH_PROFILE ?? 'unknown'}`)
  })

  ctx.command?.('notes', async (file) => {
    const text = await readFile(new URL('./notes/' + file, import.meta.url), 'utf8')
    return text
  })
}

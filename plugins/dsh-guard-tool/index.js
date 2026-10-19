import { defineTool } from '@deepseek-ai/dsh-tools'
import { createToolSpec } from './spec.js'

// The host half: one tool, registered through the tools service.
// `inject` is what the loader waits for before calling apply().
export const name = 'dsh-plugin-guard-tool'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool(createToolSpec()))
}

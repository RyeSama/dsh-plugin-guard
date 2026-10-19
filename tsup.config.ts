import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { cli: 'src/cli/index.ts', index: 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
  dts: { entry: { index: 'src/index.ts' } },
  // Ship a single self-contained file per entry: npx installs exactly one package.
  noExternal: ['commander', 'zod'],
  // The shebang lives on the first line of src/cli/index.ts; esbuild keeps it,
  // so no banner is needed (a banner would duplicate it).
})

import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/env.ts'],
  outDir: 'dist',
  format: ['esm'],
  dts: true,
  clean: true,
})

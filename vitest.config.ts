import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['packages/**/*.{test,spec}.ts', 'templates/**/test/**/*.{test,spec}.ts'],
  },
  resolve: {
    alias: {
      // the playground imports the package by name; resolve it to source so
      // tests don't depend on a prior `pnpm build` (CI tests before building)
      'lettra/three': fileURLToPath(new URL('./packages/three/index.ts', import.meta.url)),
      'lettra/editor': fileURLToPath(new URL('./packages/editor/index.ts', import.meta.url)),
      // mirrors the playground's own tsconfig path so its tests can import
      // app modules the way the app does
      '@': fileURLToPath(new URL('./templates/playground/src', import.meta.url)),
    },
  },
})

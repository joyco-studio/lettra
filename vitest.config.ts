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
      // mirrors the playground's own tsconfig path so its tests can import
      // app modules the way the app does
      '@': fileURLToPath(new URL('./templates/playground/src', import.meta.url)),
    },
  },
})

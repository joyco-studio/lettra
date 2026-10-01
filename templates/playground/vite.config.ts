import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Point the package at its workspace source so edits hot-reload without a
  // tsup rebuild. Order matters: the subpath alias must come first.
  resolve: {
    alias: [
      { find: 'letterpress/three', replacement: src('../../packages/three/index.ts') },
      { find: 'letterpress', replacement: src('../../packages/core/index.ts') },
      { find: '@', replacement: src('./src') },
    ],
  },
  build: { target: 'esnext' },
  esbuild: { target: 'esnext' },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
})

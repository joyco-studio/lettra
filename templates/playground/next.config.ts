import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // point the package at its workspace source so edits hot-reload without a
  // tsup rebuild — same DX the Vite playground had (paths are relative to
  // this app's root)
  turbopack: {
    resolveAlias: {
      'letterpress/three': '../../packages/three/index.ts',
      letterpress: '../../packages/core/index.ts',
    },
  },
}

export default nextConfig

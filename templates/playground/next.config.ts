import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // point the package at its workspace source so edits hot-reload without a
  // tsup rebuild — same DX the Vite playground had (paths are relative to
  // this app's root)
  turbopack: {
    resolveAlias: {
      'lettra/three': '../../packages/three/index.ts',
      lettra: '../../packages/core/index.ts',
    },
  },
}

export default nextConfig

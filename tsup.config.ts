import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'packages/core/index.ts',
      three: 'packages/three/index.ts',
      cli: 'packages/bake/cli.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: 'es2022',
    external: ['three', 'three/webgpu', 'three/tsl'],
  },
])

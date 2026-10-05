#!/usr/bin/env node
/* The `lettra` bin: a paper-thin command router. Heavy tooling lives in
 * separate packages (lettra-bake bundles native msdfgen binaries) so the
 * runtime library's install stays lean; npx fetches them on demand. */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/** Local install (devDependency or monorepo link) wins over an npx fetch. */
function resolveBake(): { command: string; prefix: string[] } {
  try {
    // resolve from the caller's project so their devDependency wins
    const require = createRequire(join(process.cwd(), 'noop.js'))
    const pkg = require.resolve('lettra-bake/package.json')
    const bin = require('lettra-bake/package.json').bin['lettra-bake'] as string
    return { command: process.execPath, prefix: [join(pkg, '..', bin)] }
  } catch {
    return { command: 'npx', prefix: ['-y', 'lettra-bake'] }
  }
}

const HELP = `lettra — runtime MSDF text for Three.js

Commands:
  lettra bake <font.ttf> [options]       bake static variants (runs lettra-bake)
  lettra bake delta <font.ttf> [options] bake a variable-weight delta atlas

Run \`lettra bake --help\` for bake options.
Docs: https://github.com/joyco-studio/lettra#readme`

const [command, ...rest] = process.argv.slice(2)

if (command === 'bake') {
  const bake = resolveBake()
  const child = spawn(bake.command, [...bake.prefix, ...rest], { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 1))
} else {
  console.log(HELP)
  if (command !== undefined && command !== '--help' && command !== '-h') {
    console.error(`\n[lettra] unknown command ${JSON.stringify(command)}`)
    process.exit(1)
  }
}

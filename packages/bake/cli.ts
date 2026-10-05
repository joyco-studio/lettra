#!/usr/bin/env node
/* lettra-bake — bakes MSDF atlases the way lettra expects them, automating
 * the pipeline that used to be a manual recipe: sfnt preflight, fontTools
 * instancing for variable fonts (which keeps GPOS kerning alive), pinned
 * msdf-bmfont-xml settings, lettra-native JSON output, and the experimental
 * delta subcommand for single-atlas continuous weight. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { DEFAULT_CHARSET, bakeFont } from './bake'
import type { BakeResult, BakeSettings } from './bake'
import { compositeDelta } from './delta'
import { instanceFont } from './instance'
import { extractKerning } from './kerning'
import { hasKerningTables, isVariableFont, readCmapCoverage, readTables, readWeightClass } from './sfnt'
import { CHARSET_PRESETS, partitionByCoverage, resolveCharset } from './charset'
import type { MSDFFont } from '../core/types'

interface CliOptions {
  fontPath: string
  delta: boolean
  weights: number[]
  /** False when --weights was defaulted, so static faces self-report. */
  weightsExplicit: boolean
  range?: [number, number]
  italicPath?: string
  out: string
  settings: BakeSettings
}

const HELP = `lettra-bake — MSDF font atlases for lettra

Usage:
  lettra-bake <font.ttf> [options]           bake static variants
  lettra-bake delta <font.ttf> --range 300,800 [options]
                                             bake an experimental delta-channel
                                             variable-weight atlas

Options:
  --weights 400,700     weights to instance + bake (default 400; variable fonts only)
  --italic file.ttf     companion italic font, baked at the same weights
  --range min,max       delta mode: the weight span to encode
  --charset <set>       preset name, file path, or literal string
                        presets: ${Object.keys(CHARSET_PRESETS).join(', ')}
  --size 64             bake font size in px
  --pxrange 8           distance-field range (use 12-16 for wide delta ranges)
  --padding 2           texture padding between glyphs
  --texture 1024        atlas width and height
  --out dir/name        output path prefix (default: ./<font name>)
  --help                this
`

function fail(message: string): never {
  console.error(`[lettra-bake] ${message}`)
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv]
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    process.exit(0)
  }
  const delta = args[0] === 'delta'
  if (delta) args.shift()

  let fontPath: string | undefined
  let italicPath: string | undefined
  let charsetPath: string | undefined
  let out: string | undefined
  let weights: number[] = []
  let range: [number, number] | undefined
  let size = 64
  let pxrange = 8
  let padding = 2
  let texture = 1024

  const next = (flag: string): string => {
    const value = args.shift()
    if (value === undefined) fail(`${flag} expects a value`)
    return value
  }

  while (args.length > 0) {
    const arg = args.shift()!
    switch (arg) {
      case '--weights':
        weights = next(arg).split(',').map(Number)
        if (weights.some((w) => !Number.isFinite(w))) fail('--weights expects numbers, e.g. 400,700')
        break
      case '--range': {
        const parts = next(arg).split(',').map(Number)
        if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n)) || parts[0] >= parts[1]) {
          fail('--range expects min,max with min < max')
        }
        range = [parts[0], parts[1]]
        break
      }
      case '--italic':
        italicPath = next(arg)
        break
      case '--charset':
        charsetPath = next(arg)
        break
      case '--size':
        size = Number(next(arg))
        break
      case '--pxrange':
        pxrange = Number(next(arg))
        break
      case '--padding':
        padding = Number(next(arg))
        break
      case '--texture':
        texture = Number(next(arg))
        break
      case '--out':
        out = next(arg)
        break
      default:
        if (arg.startsWith('-')) fail(`unknown option ${arg} (see --help)`)
        if (fontPath) fail(`unexpected argument ${arg}`)
        fontPath = arg
    }
  }

  if (!fontPath) fail('missing font file (see --help)')
  if (delta && !range) fail('delta mode requires --range min,max')
  if (!delta && range) fail('--range is only valid with the delta subcommand')
  const weightsExplicit = weights.length > 0
  if (!weightsExplicit) weights = [400]

  return {
    fontPath: resolve(fontPath),
    delta,
    weights,
    weightsExplicit,
    range,
    italicPath: italicPath ? resolve(italicPath) : undefined,
    out: out ?? join(process.cwd(), basename(fontPath).replace(/\.[^.]+$/, '')),
    settings: {
      size,
      distanceRange: pxrange,
      texturePadding: padding,
      textureSize: [texture, texture],
      charset: charsetPath ? resolveCharset(charsetPath) : undefined,
    },
  }
}

interface BakedVariant {
  weight: number
  style: 'normal' | 'italic'
  jsonFile: string
  atlasFile: string
}

/** Instances (when variable) and bakes one weight, recovering the class-based
 * GPOS pairs the baker's opentype.js reader misses. */
async function bakeWeight(
  fontPath: string,
  variable: boolean,
  sourceKerns: boolean,
  weight: number,
  settings: BakeSettings,
  tmp: string
): Promise<BakeResult> {
  let bakePath = fontPath
  if (variable) {
    bakePath = join(tmp, `${basename(fontPath)}.${weight}.ttf`)
    await instanceFont(fontPath, [`wght=${weight}`], bakePath)
  }
  const result = await bakeFont(bakePath, settings)
  if (sourceKerns && Object.keys(result.font.kerning).length === 0) {
    const pairs = await extractKerning(bakePath, settings.size, settings.charset ?? DEFAULT_CHARSET)
    for (const [pair, value] of Object.entries(pairs)) {
      result.font.kerning[pair] = Math.round(value * 100) / 100
    }
    if (Object.keys(pairs).length > 0) {
      console.log(`[lettra-bake] recovered ${Object.keys(pairs).length} GPOS kerning pairs via fontTools`)
    }
  }
  return result
}

function validateBake(label: string, result: BakeResult, sourceHasKerning: boolean): void {
  const pairs = Object.keys(result.font.kerning).length
  if (sourceHasKerning && pairs === 0) {
    console.warn(
      `[lettra-bake] ${label}: source font has kerning tables but 0 pairs were recovered; kerning may be contextual-only`
    )
  }
  if (!(' ' in result.font.glyphs)) console.warn(`[lettra-bake] ${label}: charset has no space glyph`)
  if (!('?' in result.font.glyphs)) console.warn(`[lettra-bake] ${label}: charset has no "?" fallback glyph`)
  console.log(`[lettra-bake] ${label}: ${Object.keys(result.font.glyphs).length} glyphs, ${pairs} kerning pairs`)
}

function writeVariant(
  out: string,
  suffix: string,
  font: MSDFFont,
  png: Buffer
): { jsonFile: string; atlasFile: string } {
  const jsonFile = `${out}${suffix}.json`
  const atlasFile = `${out}${suffix}.png`
  writeFileSync(jsonFile, JSON.stringify(font))
  writeFileSync(atlasFile, png)
  console.log(`[lettra-bake] wrote ${jsonFile} + ${atlasFile}`)
  return { jsonFile, atlasFile }
}

function printFamilyBlock(outDir: string, variants: BakedVariant[]): void {
  const src = variants
    .map((v) => {
      const json = `/${basename(v.jsonFile)}`
      const atlas = `/${basename(v.atlasFile)}`
      const style = v.style === 'italic' ? `, style: 'italic'` : ''
      return `    { json: '${json}', atlas: '${atlas}', weight: ${v.weight}${style} },`
    })
    .join('\n')
  console.log(`\n[lettra-bake] defineFamily src (files in ${outDir}):\n`)
  console.log(`const family = defineFamily({\n  src: [\n${src}\n  ],\n})\n`)
}

/** Drops characters the font cannot map; they would bake as .notdef tofu and
 * silently ship as boxes. */
function withCoverage(settings: BakeSettings, data: Buffer, tables: ReturnType<typeof readTables>, label: string) {
  const charset = settings.charset ?? DEFAULT_CHARSET
  const covered = readCmapCoverage(data, tables)
  if (covered.size === 0) return settings
  const { usable, missing } = partitionByCoverage(charset, covered)
  if (missing.length > 0) {
    console.warn(
      `[lettra-bake] ${label}: dropped ${missing.length} character(s) the font has no glyph for: ${missing.join(' ')}`
    )
  }
  if (!usable) fail(`${label}: none of the requested characters exist in this font`)
  return { ...settings, charset: usable }
}

async function runStatic(options: CliOptions): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'lettra-bake-'))
  try {
    const variants: BakedVariant[] = []
    const faces: Array<{ path: string; style: 'normal' | 'italic' }> = [
      { path: options.fontPath, style: 'normal' },
      ...(options.italicPath ? [{ path: options.italicPath, style: 'italic' as const }] : []),
    ]
    for (const face of faces) {
      const data = readFileSync(face.path)
      const tables = readTables(data)
      const variable = isVariableFont(tables.tags)
      const kerns = hasKerningTables(tables.tags)
      if (!variable && options.weights.length > 1) {
        fail(`${basename(face.path)} is a static font; it cannot be instanced at ${options.weights.join(', ')}`)
      }
      const settings = withCoverage(options.settings, data, tables, basename(face.path))
      // a static face has one real weight: label it from OS/2, not the flag
      const weights =
        variable || !options.weightsExplicit ? options.weights : [readWeightClass(data, tables) ?? options.weights[0]]
      for (const weight of weights) {
        const result = await bakeWeight(face.path, variable, kerns, weight, settings, tmp)
        const label = `${basename(face.path)} @ ${weight}${face.style === 'italic' ? ' italic' : ''}`
        validateBake(label, result, kerns)
        const suffix = `-${weight}${face.style === 'italic' ? 'i' : ''}`
        variants.push({ weight, style: face.style, ...writeVariant(options.out, suffix, result.font, result.png) })
      }
    }
    printFamilyBlock(dirname(options.out), variants)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

async function runDelta(options: CliOptions): Promise<void> {
  const [min, max] = options.range!
  const tables = readTables(readFileSync(options.fontPath))
  if (!isVariableFont(tables.tags)) fail('delta mode requires a variable font (no fvar table found)')
  const tmp = mkdtempSync(join(tmpdir(), 'lettra-bake-'))
  try {
    // fixed grid, no smart-size: both bakes must share texture dimensions
    const settings = withCoverage(
      { ...options.settings, smartSize: false },
      readFileSync(options.fontPath),
      tables,
      basename(options.fontPath)
    )
    console.log(`[lettra-bake] baking wght=${max} (canonical grid) and wght=${min}…`)
    const kerns = hasKerningTables(tables.tags)
    const maxBake = await bakeWeight(options.fontPath, true, kerns, max, settings, tmp)
    const minBake = await bakeWeight(options.fontPath, true, kerns, min, settings, tmp)
    validateBake(`wght=${max}`, maxBake, kerns)
    validateBake(`wght=${min}`, minBake, kerns)

    const composite = compositeDelta({
      min: { font: minBake.font, png: PNG.sync.read(minBake.png) },
      max: { font: maxBake.font, png: PNG.sync.read(maxBake.png) },
      weightRange: [min, max],
    })
    console.log(`[lettra-bake] deltaScale ${composite.deltaScale.toFixed(4)}`)

    const { jsonFile, atlasFile } = writeVariant(options.out, '-vf', composite.font, PNG.sync.write(composite.png))
    console.log(
      `\n[lettra-bake] defineFamily src entry:\n\n  { json: '/${basename(jsonFile)}', atlas: '/${basename(atlasFile)}', weightRange: [${min}, ${max}] },\n`
    )
    console.log(
      '[lettra-bake] load the atlas with experimental_loadDeltaFontTexture (the family does this automatically)'
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const options = parseArgs(process.argv.slice(2))
;(options.delta ? runDelta(options) : runStatic(options)).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

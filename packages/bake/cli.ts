#!/usr/bin/env node
/* The `lettra bake` command: bakes MSDF atlases the way lettra expects them, automating
 * the pipeline that used to be a manual recipe: sfnt preflight, fontTools
 * instancing for variable fonts (which keeps GPOS kerning alive), pinned
 * msdf-bmfont-xml settings, lettra-native JSON output. */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { DEFAULT_CHARSET, bakeFont } from './bake'
import type { BakeResult, BakeSettings } from './bake'
import { instanceFont } from './instance'
import { extractKerning } from './kerning'
import { hasKerningTables, isVariableFont, readCmapCoverage, readTables, readWeightClass } from './sfnt'
import { CHARSET_PRESETS, partitionByCoverage, resolveCharset } from './charset'
import type { MSDFFont } from '../core/types'

interface CliOptions {
  fontPath: string
  weights: number[]
  /** Whether --weights was passed; static faces self-report from OS/2 either way. */
  weightsExplicit: boolean
  italicPath?: string
  out: string
  settings: BakeSettings
}

const HELP = `lettra — MSDF text for Three.js

Usage:
  lettra bake <font.ttf> [options]            bake static variants

Options:
  --weights 400,700     weights to instance + bake (variable fonts only; a static
                        face is always labelled from its OS/2 weight)
  --italic file.ttf     companion italic font, baked at the same weights
  --charset <set>       preset name, file path, or literal string
                        presets: ${Object.keys(CHARSET_PRESETS).join(', ')}
  --size 64             bake font size in px
  --pxrange 8           distance-field range
  --padding 2           texture padding between glyphs
  --texture 1024        atlas width and height
  --out dir/name        output path prefix (default: ./<font name>)
  --help                this
`

function fail(message: string): never {
  console.error(`[lettra] ${message}`)
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv]
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    process.exit(0)
  }
  const command = args.shift()
  if (command !== 'bake') fail(`unknown command ${JSON.stringify(command)} (see --help)`)
  if (args.length === 0) fail('bake needs a font file (see --help)')

  let fontPath: string | undefined
  let italicPath: string | undefined
  let charsetPath: string | undefined
  let out: string | undefined
  let weights: number[] = []
  let size = 64
  let pxrange = 8
  let padding = 2
  let texture = 1024

  const next = (flag: string): string => {
    const value = args.shift()
    if (value === undefined) fail(`${flag} expects a value`)
    return value
  }

  const num = (flag: string, min: number): number => {
    const value = Number(next(flag))
    if (!Number.isFinite(value) || value < min) fail(`${flag} expects a number >= ${min}`)
    return value
  }

  while (args.length > 0) {
    const arg = args.shift()!
    switch (arg) {
      case '--weights':
        weights = next(arg).split(',').map(Number)
        if (weights.some((w) => !Number.isFinite(w))) fail('--weights expects numbers, e.g. 400,700')
        break
      case '--italic':
        italicPath = next(arg)
        break
      case '--charset':
        charsetPath = next(arg)
        break
      case '--size':
        size = num(arg, 1)
        break
      case '--pxrange':
        pxrange = num(arg, 1)
        break
      case '--padding':
        padding = num(arg, 0)
        break
      case '--texture':
        texture = num(arg, 1)
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
  const weightsExplicit = weights.length > 0
  if (!weightsExplicit) weights = [400]

  return {
    fontPath: resolve(fontPath),
    weights,
    weightsExplicit,
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
 * GPOS pairs the baker's opentype.js reader misses. Recovery runs whenever the
 * source kerns, not only on an empty table: the reader resolves format-1
 * PairPos and can return a partial set that hides the missing classes. It is
 * best-effort, so a static bake still completes without fontTools. */
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
  if (!sourceKerns) return result

  let pairs: Record<string, number>
  try {
    pairs = await extractKerning(bakePath, settings.size, settings.charset ?? DEFAULT_CHARSET)
  } catch (error) {
    // instancing already needed fontTools, so a variable font cannot get here
    const reason = (error instanceof Error ? error.message : String(error)).replace(/^\[lettra\] /, '')
    console.warn(
      `[lettra] ${reason}; keeping the ${Object.keys(result.font.kerning).length} pair(s) the baker found. Install fontTools for full class-based kerning: pip3 install fonttools`
    )
    return result
  }

  // fontTools reads GPOS directly, so its values win over the baker's
  let added = 0
  for (const [pair, value] of Object.entries(pairs)) {
    if (!(pair in result.font.kerning)) added++
    result.font.kerning[pair] = Math.round(value * 100) / 100
  }
  if (added > 0) console.log(`[lettra] recovered ${added} GPOS kerning pair(s) via fontTools`)
  return result
}

function validateBake(label: string, result: BakeResult, sourceHasKerning: boolean): void {
  const pairs = Object.keys(result.font.kerning).length
  if (sourceHasKerning && pairs === 0) {
    console.warn(
      `[lettra] ${label}: source font has kerning tables but 0 pairs were recovered; kerning may be contextual-only`
    )
  }
  if (!(' ' in result.font.glyphs)) console.warn(`[lettra] ${label}: charset has no space glyph`)
  if (!('?' in result.font.glyphs)) console.warn(`[lettra] ${label}: charset has no "?" fallback glyph`)
  console.log(`[lettra] ${label}: ${Object.keys(result.font.glyphs).length} glyphs, ${pairs} kerning pairs`)
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
  console.log(`[lettra] wrote ${jsonFile} + ${atlasFile}`)
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
  console.log(`\n[lettra] defineFamily src (files in ${outDir}):\n`)
  console.log(`const family = defineFamily({\n  src: [\n${src}\n  ],\n})\n`)
}

/** Drops characters the font cannot map; they would bake as .notdef tofu and
 * silently ship as boxes. */
function withCoverage(settings: BakeSettings, data: Buffer, tables: ReturnType<typeof readTables>, label: string) {
  const charset = settings.charset ?? DEFAULT_CHARSET
  const covered = readCmapCoverage(
    data,
    tables,
    Array.from(charset, (char) => char.codePointAt(0)!)
  )
  // null = unreadable cmap, so coverage is unknown: bake the charset as asked
  if (!covered) return settings
  const { usable, missing } = partitionByCoverage(charset, covered)
  if (missing.length > 0) {
    console.warn(
      `[lettra] ${label}: dropped ${missing.length} character(s) the font has no glyph for: ${missing.join(' ')}`
    )
  }
  if (!usable) fail(`${label}: none of the requested characters exist in this font`)
  return { ...settings, charset: usable }
}

async function runStatic(options: CliOptions): Promise<void> {
  // fail before baking rather than after, when --out points somewhere new
  mkdirSync(dirname(options.out), { recursive: true })
  const tmp = mkdtempSync(join(tmpdir(), 'lettra-bake.'))
  try {
    const variants: BakedVariant[] = []
    const faces: Array<{ path: string; style: 'normal' | 'italic' }> = [
      { path: options.fontPath, style: 'normal' },
      ...(options.italicPath ? [{ path: options.italicPath, style: 'italic' as const }] : []),
    ]
    // preflight every face up front: a mixed variable/static pair must not get
    // half its atlases written before the second face turns out to be unusable
    const plan = faces.map((face) => {
      const data = readFileSync(face.path)
      const tables = readTables(data)
      const variable = isVariableFont(tables.tags)
      const kerns = hasKerningTables(tables.tags)
      const settings = withCoverage(options.settings, data, tables, basename(face.path))
      // a static face has one real weight: label it from OS/2, never from the flag
      const weights = variable ? options.weights : [readWeightClass(data, tables) ?? options.weights[0]]
      if (!variable && options.weightsExplicit && (options.weights.length > 1 || weights[0] !== options.weights[0])) {
        console.warn(
          `[lettra] ${basename(face.path)} is a static font at weight ${weights[0]}; baking it once and ignoring --weights ${options.weights.join(',')}`
        )
      }
      return { ...face, variable, kerns, settings, weights }
    })

    for (const face of plan) {
      for (const weight of face.weights) {
        const result = await bakeWeight(face.path, face.variable, face.kerns, weight, face.settings, tmp)
        const label = `${basename(face.path)} @ ${weight}${face.style === 'italic' ? ' italic' : ''}`
        validateBake(label, result, face.kerns)
        const suffix = `-${weight}${face.style === 'italic' ? 'i' : ''}`
        variants.push({ weight, style: face.style, ...writeVariant(options.out, suffix, result.font, result.png) })
      }
    }
    printFamilyBlock(dirname(options.out), variants)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const options = parseArgs(process.argv.slice(2))
runStatic(options).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

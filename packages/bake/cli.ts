#!/usr/bin/env node
/* The `lettra bake` command: bakes MSDF atlases the way lettra expects them, automating
 * the pipeline that used to be a manual recipe: sfnt preflight, fontTools
 * instancing for variable fonts (which keeps GPOS kerning alive), pinned
 * msdf-bmfont-xml settings, lettra-native JSON output. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { DEFAULT_CHARSET, bakeFont } from './bake'
import type { BakeResult, BakeSettings } from './bake'
import { instanceFont } from './instance'
import { extractKerning } from './kerning'
import {
  hasKerningTables,
  isItalicFont,
  isVariableFont,
  readCmapCoverage,
  readTables,
  readVariationAxes,
  readWeightClass,
} from './sfnt'
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
      case '--weights': {
        const raw = next(arg)
        const parts = raw.split(',').map((part) => part.trim())
        // Number('') is 0, which would bake at the axis minimum and label it 0
        if (parts.some((part) => part === '')) fail(`--weights has an empty entry: ${JSON.stringify(raw)}`)
        const parsed = parts.map(Number)
        if (parsed.some((w) => !Number.isFinite(w) || w < 1 || w > 1000)) {
          fail('--weights expects numbers between 1 and 1000, e.g. 400,700')
        }
        // a duplicate bakes twice and prints a src array defineFamily rejects
        weights = [...new Set(parsed)].sort((a, b) => a - b)
        break
      }
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
  if (italicPath && resolve(italicPath) === resolve(fontPath)) {
    fail('--italic points at the same file as the roman face; pass the italic font, or drop the flag')
  }

  // `out` is a path prefix, not a directory. Resolve it so the served-URL guess
  // below can't depend on cwd, and reject the two readings that silently write
  // beside the intended directory instead of into it
  const outRaw = out ?? join(process.cwd(), basename(fontPath).replace(/\.[^.]+$/, ''))
  const outTrimmed = outRaw.replace(/[/\\]+$/, '')
  if (outTrimmed === '') fail('--out needs a path prefix, not just a separator')
  const outResolved = resolve(outTrimmed)
  const namesDirectory = /[/\\]+$/.test(outRaw) || (existsSync(outResolved) && statSync(outResolved).isDirectory())
  if (namesDirectory) {
    const stem = basename(fontPath).replace(/\.[^.]+$/, '')
    fail(
      `--out ${outRaw} names a directory, but it is a path prefix: pass --out ${outTrimmed}${sep}${stem} to write ${stem}-400.json inside it`
    )
  }

  return {
    fontPath: resolve(fontPath),
    weights,
    weightsExplicit,
    italicPath: italicPath ? resolve(italicPath) : undefined,
    out: outResolved,
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

/** Guesses the URL a written file is served at: everything after the last
 * `public` segment, which is how Next, Vite and CRA map that directory onto
 * the site root. Null when there is no such segment, so the caller can say the
 * path is a guess instead of printing one that 404s. */
function servedPath(file: string): string | null {
  const parts = resolve(file).split(sep)
  const index = parts.lastIndexOf('public')
  if (index === -1 || index === parts.length - 1) return null
  return `/${parts.slice(index + 1).join('/')}`
}

function printFamilyBlock(outDir: string, variants: BakedVariant[]): void {
  let guessed = false
  const url = (file: string) => {
    const served = servedPath(file)
    if (served) return served
    guessed = true
    return `/${basename(file)}`
  }
  const src = variants
    .map((v) => {
      const style = v.style === 'italic' ? `, style: 'italic'` : ''
      // JSON.stringify, so an apostrophe or a backslash in a name can't turn
      // the block into a syntax error when it is pasted into a project
      return `    { json: ${JSON.stringify(url(v.jsonFile))}, atlas: ${JSON.stringify(url(v.atlasFile))}, weight: ${v.weight}${style} },`
    })
    .join('\n')
  console.log(`\n[lettra] defineFamily src (files in ${outDir}):\n`)
  console.log(`const family = defineFamily({\n  src: [\n${src}\n  ],\n})\n`)
  if (guessed) {
    console.log(`[lettra] those URLs assume ${outDir} is served at the site root — adjust them if it is not.\n`)
  }
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
      // instancing happens per weight, deep inside the bake loop: check the axis
      // here so a face without wght can't abort after the other face's atlases
      // are already on disk
      if (variable) {
        const axes = readVariationAxes(data, tables)
        if (axes && !axes.includes('wght')) {
          fail(
            `${basename(face.path)} is variable but has no wght axis (found ${axes.join(', ') || 'none'}); instance it yourself and bake the static file`
          )
        }
      }
      // the flag claims italic; the font should agree, or every italic request
      // at runtime resolves to this bake and renders upright with no slant
      if (face.style === 'italic' && isItalicFont(data, tables) === false) {
        console.warn(
          `[lettra] ${basename(face.path)}: --italic labels this face italic but it does not report itself italic (OS/2 fsSelection and post italicAngle are both clear); italic requests would resolve to it and render upright`
        )
      }
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

const die = (error: unknown): never => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

// parseArgs mostly calls fail(), but resolveCharset throws: print either the
// same way rather than letting a stack escape
const parse = (argv: string[]): CliOptions => {
  try {
    return parseArgs(argv)
  } catch (error) {
    return die(error)
  }
}

runStatic(parse(process.argv.slice(2))).catch(die)

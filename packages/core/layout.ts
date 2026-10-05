/* Layout algorithm ported (typed, char-keyed, O(1) kerning) from
 * layout-bmfont-text (Jam3, MIT, https://github.com/Jam3/layout-bmfont-text).
 * Vendored instead of depended on — the original is untouched since 2017. */

import { getFontLookup } from './parse'
import { wrapLines } from './wrap'
import type { MeasureFn, WrappedLine } from './wrap'
import type { Glyph, LayoutGlyph, LayoutOptions, LayoutResult, MSDFFont } from './types'

const TAB = '\t'
const SPACE = ' '
const FALLBACK = '?'
/** When the baked charset has no space, borrow the advance of a stand-in. */
const SPACE_STAND_INS = ['m', 'w']

type GlyphResolver = (char: string) => Glyph | null

function invisible(glyph: Glyph, char: string, xadvance = glyph.xadvance): Glyph {
  return { char, x: 0, y: 0, width: 0, height: 0, xoffset: 0, yoffset: 0, xadvance }
}

export function createGlyphResolver(font: MSDFFont, tabSize: number): GlyphResolver {
  const { glyphs } = getFontLookup(font)

  let space = glyphs.get(SPACE) ?? null
  if (!space) {
    for (const standIn of SPACE_STAND_INS) {
      const candidate = glyphs.get(standIn)
      if (candidate) {
        space = invisible(candidate, SPACE)
        break
      }
    }
    if (!space) {
      const first = glyphs.values().next().value
      if (first) space = invisible(first, SPACE)
    }
  }

  const tab = space ? invisible(space, TAB, tabSize * space.xadvance) : null
  const fallback = glyphs.get(FALLBACK) ?? null

  return (char) => {
    if (char === TAB) return tab
    const glyph = glyphs.get(char)
    if (glyph) return glyph
    if (char === SPACE) return space
    return fallback
  }
}

/** Index-aware hooks the pen walk runs against. `layout` wraps them with
 * constant-font closures; `experimental_layoutRuns` switches them per run.
 * Scales normalize mixed bake sizes into reference layout px: quad metrics
 * multiply by scale while atlas rects stay raw for UVs. */
export interface PenHooks {
  resolveAt(index: number, char: string): Glyph | null
  /** Kerning between consecutive placed glyphs, already in reference px. */
  kernAt(prevIndex: number, index: number, left: Glyph, right: Glyph): number
  scaleAt(index: number): number
  atlasAt(index: number): { width: number; height: number }
  /** Per-index vertical shift (baseline alignment across runs). */
  yShiftAt(index: number): number
}

/** Mirrors the rendered pen walk so wrap points match drawn width: advance
 * breaks the line, but so does a glyph whose ink would overflow. */
export function createPenMeasure(hooks: PenHooks, letterSpacing: number): MeasureFn {
  return (source, start, end, width) => {
    let curPen = 0
    let curWidth = 0
    let count = 0
    let lastGlyph: Glyph | null = null
    let lastIndex = -1
    end = Math.min(source.length, end)
    for (let i = start; i < end; i++) {
      const glyph = hooks.resolveAt(i, source.charAt(i))
      if (glyph) {
        const scale = hooks.scaleAt(i)
        if (lastGlyph) curPen += hooks.kernAt(lastIndex, i, lastGlyph, glyph)
        const nextPen = curPen + glyph.xadvance * scale + letterSpacing
        const nextWidth = curPen + glyph.width * scale
        if (nextWidth >= width || nextPen >= width) break
        curPen = nextPen
        curWidth = nextWidth
        lastGlyph = glyph
        lastIndex = i
      }
      count++
    }
    if (lastGlyph) curWidth += lastGlyph.xoffset * hooks.scaleAt(lastIndex)
    return { start, end: start + count, width: curWidth }
  }
}

export interface PlacementOptions {
  letterSpacing: number
  lineHeight: number
  align: 'left' | 'center' | 'right'
}

export interface PlacementResult {
  maxLineWidth: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  hasInk: boolean
}

/** Walks wrapped lines placing quads, emitting each positioned glyph with its
 * source index (callers bucket as needed) and tracking the ink bbox. */
export function placeLines(
  text: string,
  lines: WrappedLine[],
  hooks: PenHooks,
  { letterSpacing, lineHeight, align }: PlacementOptions,
  emit: (glyph: LayoutGlyph) => void
): PlacementResult {
  const maxLineWidth = Math.max(0, ...lines.map((line) => line.width))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let hasInk = false

  lines.forEach((line, lineIndex) => {
    const y = lineIndex * lineHeight
    const alignOffset =
      align === 'center' ? (maxLineWidth - line.width) / 2 : align === 'right' ? maxLineWidth - line.width : 0
    let x = 0
    let lastGlyph: Glyph | null = null
    let lastIndex = -1

    for (let i = line.start; i < line.end; i++) {
      const char = text.charAt(i)
      const glyph = hooks.resolveAt(i, char)
      if (!glyph) continue

      const scale = hooks.scaleAt(i)
      if (lastGlyph) x += hooks.kernAt(lastIndex, i, lastGlyph, glyph)
      if (glyph.width > 0 && glyph.height > 0) {
        const atlas = hooks.atlasAt(i)
        const gx = x + alignOffset + glyph.xoffset * scale
        const gy = y + glyph.yoffset * scale + hooks.yShiftAt(i)
        const w = glyph.width * scale
        const h = glyph.height * scale
        emit({
          char,
          x: gx,
          y: gy,
          w,
          h,
          u0: glyph.x / atlas.width,
          v0: glyph.y / atlas.height,
          u1: (glyph.x + glyph.width) / atlas.width,
          v1: (glyph.y + glyph.height) / atlas.height,
          index: i,
          line: lineIndex,
        })
        hasInk = true
        if (gx < minX) minX = gx
        if (gy < minY) minY = gy
        if (gx + w > maxX) maxX = gx + w
        if (gy + h > maxY) maxY = gy + h
      }
      x += glyph.xadvance * scale + letterSpacing
      lastGlyph = glyph
      lastIndex = i
    }
  })

  return { maxLineWidth, minX, minY, maxX, maxY, hasInk }
}

/** Lays out `text` against a baked MSDF font: kerned pen advance, optional
 * greedy word wrap at `maxWidth`, alignment, letter-spacing. Returns one quad
 * per visible glyph in y-down layout px (first line's top at y = 0) plus the
 * ink bounding box. Characters missing from the charset render as `?`. */
export function layout(font: MSDFFont, text: string, opts: LayoutOptions = {}): LayoutResult {
  const letterSpacing = opts.letterSpacing ?? 0
  const lineHeight = opts.lineHeight ?? font.lineHeight
  const align = opts.align ?? 'left'
  const tabSize = opts.tabSize ?? 4
  const mode = opts.mode ?? (opts.maxWidth !== undefined ? 'greedy' : 'nowrap')

  const { kerning } = getFontLookup(font)
  const resolve = createGlyphResolver(font, tabSize)
  const hooks: PenHooks = {
    resolveAt: (_index, char) => resolve(char),
    kernAt: (_prevIndex, _index, left, right) => kerning.get(left.char + right.char) ?? 0,
    scaleAt: () => 1,
    atlasAt: () => font.atlas,
    yShiftAt: () => 0,
  }

  const measure = createPenMeasure(hooks, letterSpacing)
  const lines = wrapLines(text, { width: opts.maxWidth, mode, measure })

  const glyphs: LayoutGlyph[] = []
  const placed = placeLines(text, lines, hooks, { letterSpacing, lineHeight, align }, (glyph) => glyphs.push(glyph))

  const { hasInk } = placed
  return {
    glyphs,
    width: hasInk ? placed.maxX - placed.minX : 0,
    height: hasInk ? placed.maxY - placed.minY : 0,
    inkOrigin: { x: hasInk ? placed.minX : 0, y: hasInk ? placed.minY : 0 },
    metrics: {
      fontSize: font.size,
      lineCount: lines.length,
      lineHeight,
      baseline: font.base,
      metricWidth: placed.maxLineWidth,
      metricHeight: lines.length > 0 ? lineHeight * lines.length - (lineHeight - font.base) : 0,
    },
  }
}

/* Layout algorithm ported (typed, char-keyed, O(1) kerning) from
 * layout-bmfont-text (Jam3, MIT, https://github.com/Jam3/layout-bmfont-text).
 * Vendored instead of depended on — the original is untouched since 2017. */

import { getFontLookup } from './parse'
import { wrapLines } from './wrap'
import type { MeasureFn } from './wrap'
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

function createGlyphResolver(font: MSDFFont, tabSize: number): GlyphResolver {
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
  const kern = (left: Glyph | null, right: Glyph): number => (left ? (kerning.get(left.char + right.char) ?? 0) : 0)

  // Mirrors the rendered pen walk so wrap points match drawn width: advance
  // breaks the line, but so does a glyph whose ink would overflow.
  const measure: MeasureFn = (source, start, end, width) => {
    let curPen = 0
    let curWidth = 0
    let count = 0
    let lastGlyph: Glyph | null = null
    end = Math.min(source.length, end)
    for (let i = start; i < end; i++) {
      const glyph = resolve(source.charAt(i))
      if (glyph) {
        curPen += kern(lastGlyph, glyph)
        const nextPen = curPen + glyph.xadvance + letterSpacing
        const nextWidth = curPen + glyph.width
        if (nextWidth >= width || nextPen >= width) break
        curPen = nextPen
        curWidth = nextWidth
        lastGlyph = glyph
      }
      count++
    }
    if (lastGlyph) curWidth += lastGlyph.xoffset
    return { start, end: start + count, width: curWidth }
  }

  const lines = wrapLines(text, { width: opts.maxWidth, mode, measure })
  const maxLineWidth = Math.max(0, ...lines.map((line) => line.width))

  const atlasW = font.atlas.width
  const atlasH = font.atlas.height
  const glyphs: LayoutGlyph[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  lines.forEach((line, lineIndex) => {
    const y = lineIndex * lineHeight
    const alignOffset =
      align === 'center' ? (maxLineWidth - line.width) / 2 : align === 'right' ? maxLineWidth - line.width : 0
    let x = 0
    let lastGlyph: Glyph | null = null

    for (let i = line.start; i < line.end; i++) {
      const char = text.charAt(i)
      const glyph = resolve(char)
      if (!glyph) continue

      x += kern(lastGlyph, glyph)
      if (glyph.width > 0 && glyph.height > 0) {
        const gx = x + alignOffset + glyph.xoffset
        const gy = y + glyph.yoffset
        glyphs.push({
          char,
          x: gx,
          y: gy,
          w: glyph.width,
          h: glyph.height,
          u0: glyph.x / atlasW,
          v0: glyph.y / atlasH,
          u1: (glyph.x + glyph.width) / atlasW,
          v1: (glyph.y + glyph.height) / atlasH,
          index: i,
          line: lineIndex,
        })
        if (gx < minX) minX = gx
        if (gy < minY) minY = gy
        if (gx + glyph.width > maxX) maxX = gx + glyph.width
        if (gy + glyph.height > maxY) maxY = gy + glyph.height
      }
      x += glyph.xadvance + letterSpacing
      lastGlyph = glyph
    }
  })

  const hasInk = glyphs.length > 0
  return {
    glyphs,
    width: hasInk ? maxX - minX : 0,
    height: hasInk ? maxY - minY : 0,
    inkOrigin: { x: hasInk ? minX : 0, y: hasInk ? minY : 0 },
    metrics: {
      fontSize: font.size,
      lineCount: lines.length,
      lineHeight,
      baseline: font.base,
      metricWidth: maxLineWidth,
      metricHeight: lines.length > 0 ? lineHeight * lines.length - (lineHeight - font.base) : 0,
    },
  }
}

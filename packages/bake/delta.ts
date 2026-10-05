/* Two bakes at the weight extremes become one RGBA atlas: the grid is the max
 * bake's packing, RGB the min field re-gridded into it, alpha the per-texel
 * median delta. JSON deltas are max − min over min-metric bases. */

import { PNG } from 'pngjs'
import type { GlyphDeltaTuple, GlyphTuple, MSDFFont } from '../core/types'

function fail(message: string): never {
  throw new Error(`[lettra] ${message}`)
}

export function median(r: number, g: number, b: number): number {
  return Math.max(Math.min(r, g), Math.min(Math.max(r, g), b))
}

/** Byte 128 ≈ zero delta; the full range spans ±deltaScale. */
export function encodeDeltaByte(delta: number, deltaScale: number): number {
  if (deltaScale === 0) return 128
  const normalized = Math.max(-1, Math.min(1, delta / deltaScale))
  return Math.round(((normalized + 1) / 2) * 255)
}

export function decodeDeltaByte(byte: number, deltaScale: number): number {
  return ((byte / 255) * 2 - 1) * deltaScale
}

/** Output texel (u, v) of a max rect samples min texel (u + dx, v + dy). */
export function mapFrame(maxGlyph: GlyphTuple, minGlyph: GlyphTuple): { dx: number; dy: number } {
  return { dx: maxGlyph[4] - minGlyph[4], dy: maxGlyph[5] - minGlyph[5] }
}

/** Min ink must land inside the max rect; the shared padding ring absorbs an
 * overflow within `tolerance`. Returns the error so callers can batch them. */
export function checkFit(char: string, maxGlyph: GlyphTuple, minGlyph: GlyphTuple, tolerance = 0): string | null {
  const { dx, dy } = mapFrame(maxGlyph, minGlyph)
  const [maxW, maxH] = [maxGlyph[2], maxGlyph[3]]
  const [minW, minH] = [minGlyph[2], minGlyph[3]]
  if (dx > tolerance || dy > tolerance || dx + maxW < minW - tolerance || dy + maxH < minH - tolerance) {
    return `glyph ${JSON.stringify(char)}: min-weight ink does not fit the max-weight rect (frame shift ${dx},${dy})`
  }
  return null
}

export interface CompositeInput {
  min: { font: MSDFFont; png: PNG }
  max: { font: MSDFFont; png: PNG }
  weightRange: [number, number]
}

export interface CompositeResult {
  font: MSDFFont
  png: PNG
  deltaScale: number
}

/** A delta near the field ceiling means the bake's pxrange clipped it. */
const SATURATION_WARN = 0.5

export function compositeDelta({ min, max, weightRange }: CompositeInput): CompositeResult {
  if (min.font.size !== max.font.size) fail('min and max bakes differ in font size; bake both with the same --size')
  if (
    max.png.width !== max.font.atlas.width ||
    max.png.height !== max.font.atlas.height ||
    min.png.width !== min.font.atlas.width ||
    min.png.height !== min.font.atlas.height
  ) {
    fail('atlas PNG dimensions disagree with the font JSON')
  }

  const maxChars = Object.keys(max.font.glyphs)
  const minChars = new Set(Object.keys(min.font.glyphs))
  if (maxChars.length !== minChars.size || maxChars.some((char) => !minChars.has(char))) {
    fail('min and max bakes cover different charsets; bake both from the same charset file')
  }

  // the distance-padding ring absorbs small misfits via clamp-extension
  const tolerance = Math.ceil(max.font.distanceRange / 4)
  const fitErrors = maxChars
    .map((char) => checkFit(char, max.font.glyphs[char], min.font.glyphs[char], tolerance))
    .filter((error): error is string => error !== null)
  if (fitErrors.length > 0) fail(`delta grids are incompatible:\n  ${fitErrors.join('\n  ')}`)

  for (const font of [min.font, max.font]) {
    for (const [char, tuple] of Object.entries(font.glyphs)) {
      if (tuple.slice(0, 6).some((n) => !Number.isInteger(n))) {
        fail(`glyph ${JSON.stringify(char)} has non-integer rect/offsets; cannot align frames texel-exactly`)
      }
    }
  }

  // left zero outside glyph rects: copying the max field there would bleed a
  // bolder bias into the min-field base when sampling a rect's outer texel
  const out = new PNG({ width: max.png.width, height: max.png.height })

  // min texel (clamped into the min rect) for an output texel of a max rect
  const sampleMin = (minGlyph: GlyphTuple, u: number, v: number): [number, number, number] => {
    const [mx, my, mw, mh] = [minGlyph[0], minGlyph[1], minGlyph[2], minGlyph[3]]
    const cu = Math.max(0, Math.min(mw - 1, u))
    const cv = Math.max(0, Math.min(mh - 1, v))
    const idx = ((my + cv) * min.png.width + (mx + cu)) * 4
    return [min.png.data[idx], min.png.data[idx + 1], min.png.data[idx + 2]]
  }

  // pass 1 — re-grid the min field into the max rects, collect median deltas
  const deltas = new Float32Array(out.width * out.height)
  let deltaScale = 0
  for (const char of maxChars) {
    const maxGlyph = max.font.glyphs[char]
    const minGlyph = min.font.glyphs[char]
    const { dx, dy } = mapFrame(maxGlyph, minGlyph)
    const [gx, gy, gw, gh] = [maxGlyph[0], maxGlyph[1], maxGlyph[2], maxGlyph[3]]
    for (let v = 0; v < gh; v++) {
      for (let u = 0; u < gw; u++) {
        const outIdx = ((gy + v) * out.width + (gx + u)) * 4
        const [r, g, b] = sampleMin(minGlyph, u + dx, v + dy)
        const maxMedian = median(max.png.data[outIdx], max.png.data[outIdx + 1], max.png.data[outIdx + 2]) / 255
        out.data[outIdx] = r
        out.data[outIdx + 1] = g
        out.data[outIdx + 2] = b
        const delta = maxMedian - median(r, g, b) / 255
        deltas[(gy + v) * out.width + (gx + u)] = delta
        if (Math.abs(delta) > deltaScale) deltaScale = Math.abs(delta)
      }
    }
  }

  if (deltaScale > SATURATION_WARN) {
    console.warn(
      `[lettra] weight delta reaches ${deltaScale.toFixed(2)} of the field range; the bake's pxrange is clipping; re-bake with a higher --pxrange (12–16) for a wide weight range`
    )
  }

  // pass 2 — encode alpha (128 = zero delta everywhere outside glyph rects)
  for (let i = 0; i < out.width * out.height; i++) {
    out.data[i * 4 + 3] = encodeDeltaByte(deltas[i], deltaScale)
  }

  return { font: buildDeltaFont(min.font, max.font, weightRange, deltaScale), png: out, deltaScale }
}

/** Max grid, min metrics as base, zero deltas omitted. */
export function buildDeltaFont(
  minFont: MSDFFont,
  maxFont: MSDFFont,
  weightRange: [number, number],
  deltaScale: number
): MSDFFont {
  const glyphs: Record<string, GlyphTuple> = {}
  const glyphDeltas: Record<string, GlyphDeltaTuple> = {}
  for (const [char, maxGlyph] of Object.entries(maxFont.glyphs)) {
    const minGlyph = minFont.glyphs[char]
    glyphs[char] = [maxGlyph[0], maxGlyph[1], maxGlyph[2], maxGlyph[3], maxGlyph[4], maxGlyph[5], minGlyph[6]]
    const advanceDelta = maxGlyph[6] - minGlyph[6]
    if (advanceDelta !== 0) glyphDeltas[char] = [0, 0, advanceDelta]
  }

  const kerningDeltas: Record<string, number> = {}
  const pairs = new Set([...Object.keys(minFont.kerning), ...Object.keys(maxFont.kerning)])
  for (const pair of pairs) {
    const delta = (maxFont.kerning[pair] ?? 0) - (minFont.kerning[pair] ?? 0)
    if (delta !== 0) kerningDeltas[pair] = delta
  }

  const metricsDelta: [number, number] = [maxFont.lineHeight - minFont.lineHeight, maxFont.base - minFont.base]

  return {
    name: minFont.name,
    size: minFont.size,
    lineHeight: minFont.lineHeight,
    base: minFont.base,
    distanceRange: minFont.distanceRange,
    atlas: maxFont.atlas,
    glyphs,
    kerning: minFont.kerning,
    weightRange,
    deltaChannel: true,
    deltaScale,
    ...(Object.keys(glyphDeltas).length > 0 ? { glyphDeltas } : {}),
    ...(Object.keys(kerningDeltas).length > 0 ? { kerningDeltas } : {}),
    ...(metricsDelta.some((d) => d !== 0) ? { metricsDelta } : {}),
  }
}

/* EXPERIMENTAL — delta-channel variable weight. A variable bake carries the
 * wght-min instance plus max−min deltas (see MSDFFont); interpolation
 * materializes a derived font at a given t for layout, while the continuous
 * animated path is the shader's weightT uniform (advances stay frozen
 * mid-animation by design — re-layout via swapFont at rest points). */

import type { GlyphTuple, MSDFFont } from './types'

export function isVariableFont(font: MSDFFont): boolean {
  return font.weightRange !== undefined && font.deltaChannel === true
}

/** Maps a weight onto the bake's [min, max] range as a clamped t ∈ [0, 1]. */
export function weightToT(font: MSDFFont, weight: number): number {
  const range = font.weightRange
  if (!range) throw new Error('[lettra] weightToT requires a font with weightRange')
  const [min, max] = range
  return Math.min(1, Math.max(0, (weight - min) / (max - min)))
}

/** Memoized per (font, quantized t) so derived fonts keep a stable object
 * identity — getFontLookup's WeakMap and atlas-sharing caches stay hot. */
const interpolationCache = new WeakMap<MSDFFont, Map<number, MSDFFont>>()
/** Quantization step for cache keys; finer t differences don't reflow visibly. */
const T_STEPS = 256

/** Materializes the font's metrics at weight t: glyph xoffset/yoffset/xadvance,
 * kerning, lineHeight and base move by t × delta. Rects and UVs are shared
 * across the range, so the atlas is reused as-is. */
export function experimental_interpolateFont(font: MSDFFont, t: number): MSDFFont {
  if (!isVariableFont(font)) return font
  const quantized = Math.round(Math.min(1, Math.max(0, t)) * T_STEPS) / T_STEPS
  if (quantized === 0) return font

  let byT = interpolationCache.get(font)
  if (!byT) {
    byT = new Map()
    interpolationCache.set(font, byT)
  }
  const cached = byT.get(quantized)
  if (cached) return cached

  const glyphs: Record<string, GlyphTuple> = {}
  for (const [char, tuple] of Object.entries(font.glyphs)) {
    const delta = font.glyphDeltas?.[char]
    glyphs[char] = delta
      ? [
          tuple[0],
          tuple[1],
          tuple[2],
          tuple[3],
          tuple[4] + quantized * delta[0],
          tuple[5] + quantized * delta[1],
          tuple[6] + quantized * delta[2],
        ]
      : tuple
  }

  const kerning: Record<string, number> = { ...font.kerning }
  for (const [pair, delta] of Object.entries(font.kerningDeltas ?? {})) {
    kerning[pair] = (kerning[pair] ?? 0) + quantized * delta
  }

  const [lineHeightDelta, baseDelta] = font.metricsDelta ?? [0, 0]
  const derived: MSDFFont = {
    ...font,
    lineHeight: font.lineHeight + quantized * lineHeightDelta,
    base: font.base + quantized * baseDelta,
    glyphs,
    kerning,
  }
  byT.set(quantized, derived)
  return derived
}

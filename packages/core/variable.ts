/* EXPERIMENTAL: delta-channel variable weight. Interpolation materializes a
 * derived font at t for layout; the continuous animated path is the shader's
 * weightT uniform, which leaves advances frozen until the next re-layout. */

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

/** Quantized so derived fonts keep a stable identity for getFontLookup's
 * WeakMap; capped so sweeping the full range can't retain every step. */
const interpolationCache = new WeakMap<MSDFFont, Map<number, MSDFFont>>()
const T_STEPS = 256
const MAX_CACHED_STEPS = 32

/** Materializes metrics at weight t; rects and UVs are range-constant, so the
 * atlas is reused as-is. */
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
  if (byT.size >= MAX_CACHED_STEPS) byT.delete(byT.keys().next().value!)
  byT.set(quantized, derived)
  return derived
}

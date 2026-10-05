/* Shared harness for the interpolation-approach tests: loads the ground-truth
 * Inter bakes (300/425/550/675/800), re-grids every weight's median field
 * onto the heaviest bake's packing, and reconstructs intermediate weights the
 * way each encoding would, 8-bit alpha quantization included.
 *
 * The metrics are field-level: mean/max |reconstructed − truth| near the
 * edge, plus the fraction of near-edge texels whose 0.5-iso side flips
 * (actual pixel errors). What they cannot see is MSDF corner sharpness: away
 * from the base weight every encoding collapses to a scalar field, so corner
 * quality decays with |t − tBase|. That argument lives in the test prose,
 * not the numbers. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { decodeDeltaByte, encodeDeltaByte, mapFrame, median } from '../delta'
import type { GlyphTuple, MSDFFont } from '../../core/types'

export const WEIGHTS = [300, 425, 550, 675, 800] as const
export type FixtureWeight = (typeof WEIGHTS)[number]

interface Bake {
  font: MSDFFont
  png: PNG
}

const FIXTURES = join(__dirname, 'fixtures', 'interp')

function loadBake(weight: FixtureWeight): Bake {
  const font = JSON.parse(readFileSync(join(FIXTURES, `inter-${weight}.json`), 'utf8')) as MSDFFont
  const png = PNG.sync.read(readFileSync(join(FIXTURES, `inter-${weight}.png`)))
  return { font, png }
}

const bakes = new Map<FixtureWeight, Bake>()
export function bake(weight: FixtureWeight): Bake {
  let loaded = bakes.get(weight)
  if (!loaded) {
    loaded = loadBake(weight)
    bakes.set(weight, loaded)
  }
  return loaded
}

export const toT = (weight: number) => (weight - 300) / 500

/** Median field of one bake's glyph, re-gridded onto the 800 bake's rect by
 * pen-frame alignment with clamp extension (same mapping the compositor
 * uses). Values in 0..1. */
export function regriddedField(weight: FixtureWeight, char: string): Float32Array {
  const target = bake(800).font.glyphs[char]
  const source = bake(weight)
  const glyph = source.font.glyphs[char]
  const { dx, dy } = mapFrame(target, glyph)
  const [gw, gh] = [target[2], target[3]]
  const field = new Float32Array(gw * gh)
  for (let v = 0; v < gh; v++) {
    for (let u = 0; u < gw; u++) {
      const su = Math.max(0, Math.min(glyph[2] - 1, u + dx))
      const sv = Math.max(0, Math.min(glyph[3] - 1, v + dy))
      const idx = ((glyph[1] + sv) * source.png.width + glyph[0] + su) * 4
      field[v * gw + u] = median(source.png.data[idx], source.png.data[idx + 1], source.png.data[idx + 2]) / 255
    }
  }
  return field
}

export function glyphChars(): string[] {
  return Object.keys(bake(800).font.glyphs).filter((char) => {
    const [, , w, h] = bake(800).font.glyphs[char] as GlyphTuple
    return w > 0 && h > 0
  })
}

/** An encoding under test: stored base field + a per-texel alpha byte, and
 * how it reconstructs the field at a given t. */
export interface Encoding {
  name: string
  reconstruct(char: string, t: number): Float32Array
}

/** Current shipping encoding: base = min field, alpha = full-span median
 * delta, reconstruct = base + t × delta. */
export function minBaseEncoding(): Encoding {
  return deltaEncoding(
    'min-base',
    300,
    (min, max) => max - min,
    (t) => t
  )
}

/** Proposed encoding: base = mid bake, alpha = symmetric half-span delta,
 * reconstruct = base + (t − 0.5) × 2 × delta. */
export function midBaseEncoding(): Encoding {
  return deltaEncoding(
    'mid-base',
    550,
    (min, max) => (max - min) / 2,
    (t) => (t - 0.5) * 2
  )
}

function deltaEncoding(
  name: string,
  baseWeight: FixtureWeight,
  deltaOf: (min: number, max: number) => number,
  factorOf: (t: number) => number
): Encoding {
  const chars = glyphChars()
  const base = new Map(chars.map((char) => [char, regriddedField(baseWeight, char)]))
  const deltas = new Map<string, Float32Array>()
  let deltaScale = 0
  for (const char of chars) {
    const min = regriddedField(300, char)
    const max = regriddedField(800, char)
    const delta = new Float32Array(min.length)
    for (let i = 0; i < delta.length; i++) {
      delta[i] = deltaOf(min[i], max[i])
      if (Math.abs(delta[i]) > deltaScale) deltaScale = Math.abs(delta[i])
    }
    deltas.set(char, delta)
  }
  return {
    name,
    reconstruct(char, t) {
      const baseField = base.get(char)!
      const delta = deltas.get(char)!
      const factor = factorOf(t)
      const out = new Float32Array(baseField.length)
      for (let i = 0; i < out.length; i++) {
        // round-trip through the 8-bit alpha the atlas would actually store
        const stored = decodeDeltaByte(encodeDeltaByte(delta[i], deltaScale), deltaScale)
        out[i] = baseField[i] + stored * factor
      }
      return out
    },
  }
}

export interface FieldError {
  /** Mean |recon − truth| over near-edge texels (|truth − 0.5| < 0.25). */
  mean: number
  max: number
  /** Fraction of near-edge texels whose 0.5-iso side flips: real pixel errors. */
  flips: number
}

export function errorAgainstTruth(encoding: Encoding, weight: FixtureWeight): FieldError {
  const t = toT(weight)
  let sum = 0
  let count = 0
  let max = 0
  let flips = 0
  for (const char of glyphChars()) {
    const truth = regriddedField(weight, char)
    const recon = encoding.reconstruct(char, t)
    for (let i = 0; i < truth.length; i++) {
      if (Math.abs(truth[i] - 0.5) >= 0.25) continue
      const error = Math.abs(recon[i] - truth[i])
      sum += error
      count++
      if (error > max) max = error
      if (recon[i] >= 0.5 !== truth[i] >= 0.5) flips++
    }
  }
  return { mean: sum / count, max, flips: flips / count }
}

export function report(encoding: Encoding): string {
  return WEIGHTS.map((weight) => {
    const { mean, max, flips } = errorAgainstTruth(encoding, weight)
    return `${encoding.name} @ wght ${weight} (t=${toT(weight).toFixed(2)}): mean ${mean.toFixed(4)}  max ${max.toFixed(4)}  edge-flips ${(flips * 100).toFixed(2)}%`
  }).join('\n')
}

import { Vector4 } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { attribute, floor, hash, int, mix, step, time, uniform, uniformArray } from 'three/tsl'
import { parseFont } from '../../core/parse'
import type { FontInput, MSDFFont } from '../../core/types'
import { defineNode } from '../define-node'
import type { FloatNode, TextEffect, TextEffectUvContext } from '../material'

/* The scramble decomposes into three contract nodes, each reusable on its
 * own: a per-element random gate (stagger anything), a time-stepped random
 * index (cycle through anything), and an atlas-rect remap (sample any packed
 * atlas). The effect is just their composition over the font's glyph rects. */

/** Random gate per element: 1 when `drive` exceeds the element's fixed
 * threshold `hash(seed)`, else 0. Sweeping `drive` 0 → 1 switches a
 * population on in stable random order — staggered reveals, selective
 * scrambles, anything per-glyph. */
export const staggerGate = /* @__PURE__ */ defineNode(
  { name: 'staggerGate', inputs: { seed: 'float', drive: 'float' }, output: 'float' },
  ({ seed, drive }) => step(hash(seed), drive)
)

/** Random index in [0, count), re-rolled `rate` times per second, stable
 * between re-rolls and decorrelated across seeds. */
export const cycleIndex = /* @__PURE__ */ defineNode(
  { name: 'cycleIndex', inputs: { seed: 'float', time: 'float', rate: 'float', count: 'float' }, output: 'float' },
  ({ seed, time, rate, count }) => floor(hash(seed.mul(12.9898).add(floor(time.mul(rate)).mul(78.233))).mul(count))
)

/** Maps a local 0→1 coordinate into an atlas sub-rect (xy = origin,
 * zw = size, in texture ratios). */
export const rectUv = /* @__PURE__ */ defineNode(
  { name: 'rectUv', inputs: { rect: 'vec4', cellUv: 'vec2' }, output: 'vec2' },
  ({ rect, cellUv }) => rect.xy.add(cellUv.mul(rect.zw))
)

/** Normalized atlas rect (u, v, w, h ratios, v-down) for each requested
 * character present in the font. Pure — also useful for building pools by
 * hand. */
export function glyphRects(font: MSDFFont, chars?: string): Vector4[] {
  const pool = chars ? [...new Set(chars)] : Object.keys(font.glyphs)
  const { width, height } = font.atlas
  const rects: Vector4[] = []
  for (const char of pool) {
    const glyph = font.glyphs[char]
    if (!glyph) continue
    const [x, y, w, h] = glyph
    if (w === 0 || h === 0) continue
    rects.push(new Vector4(x / width, y / height, w / width, h / height))
  }
  return rects
}

export interface ScrambleOptions {
  /** Pool source: the glyphs are swapped for other glyphs of this font's
   * atlas. Pass the same font the text renders with. */
  font: FontInput
  /** Characters to scramble through. Defaults to every glyph in the font.
   * Looks best when the pool shares one ink box — uniform-width faces
   * (monospace) or same-height sets like `'ABC…XYZ0–9'`. */
  chars?: string
  /** Glyph re-rolls per second. */
  rate?: number
  /** Per-fragment scramble amount in [0, 1], replacing the `scramble`
   * uniform as the drive — pass any scalar field (a wipe front, a liquid
   * edge SDF…). The callback form receives the uniform so you can combine:
   * `(base) => max(base, myField)`. */
  drive?: FloatNode | ((base: FloatNode) => FloatNode)
  /** Pool slots to allocate, for `setPool` swaps to larger pools later.
   * Defaults to the initial pool size. */
  capacity?: number
}

/** Glyph-scramble effect for `createTextMaterial({ effect })`: while driven,
 * a glyph renders a random same-font glyph instead, re-rolled `rate` times a
 * second — the decoder/terminal effect. Adds the `scramble` uniform (0 =
 * clean, 1 = everything scrambles; glyphs engage in stable random order in
 * between). Swapping fonts? Call `setPool(nextFont)` alongside `swapFont`. */
export function scramble({ font, chars, rate = 15, drive, capacity }: ScrambleOptions) {
  const initial = glyphRects(parseFont(font), chars)
  if (initial.length === 0) throw new Error('letterpress: scramble pool is empty — no requested chars in the font')

  const size = Math.max(initial.length, capacity ?? 0)
  const rects = uniformArray(
    Array.from({ length: size }, (_, i) => initial[i] ?? new Vector4()),
    'vec4'
  )
  const poolSize = uniform(initial.length)

  const uniforms = {
    /** 0 → clean, 1 → every glyph scrambles. */
    scramble: uniform(0),
  }
  const driveNode = typeof drive === 'function' ? drive(uniforms.scramble) : (drive ?? (uniforms.scramble as FloatNode))

  return {
    uniforms,
    uv: ({ uv }: TextEffectUvContext) => {
      const seed = attribute('glyphIndex', 'float')
      const gate = staggerGate({ seed, drive: driveNode })
      const index = cycleIndex({ seed, time, rate: uniform(rate), count: poolSize })
      const rect = rects.element(int(index)) as unknown as Node<'vec4'>
      const swapped = rectUv({ rect, cellUv: attribute('cellUv', 'vec2') })
      return mix(uv, swapped, gate)
    },
    /** Rebuilds the pool from another font (same `chars` rules), truncating
     * to the allocated capacity. Pair with `TextHandle.swapFont`. */
    setPool(nextFont: FontInput, nextChars?: string) {
      const next = glyphRects(parseFont(nextFont), nextChars ?? chars)
      if (next.length === 0) throw new Error('letterpress: scramble pool is empty — no requested chars in the font')
      if (next.length > size) console.warn(`letterpress: scramble pool truncated to capacity ${size}`)
      const count = Math.min(next.length, size)
      for (let i = 0; i < count; i++) (rects.array[i] as Vector4).copy(next[i])
      poolSize.value = count
    },
  } satisfies TextEffect<typeof uniforms> & { setPool: (font: FontInput, chars?: string) => void }
}

export type ScrambleEffect = ReturnType<typeof scramble>

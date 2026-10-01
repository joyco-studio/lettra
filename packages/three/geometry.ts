import { BufferAttribute, BufferGeometry } from 'three/webgpu'
import type { LayoutResult } from '../core/types'

export type TextAnchor = 'ink-center' | 'baseline-left'

export interface TextGeometryOptions {
  /** World units per layout px. Defaults to 1 / fontSize, i.e. em units. */
  scale?: number
  /** 'ink-center' (default) centers the ink bounding box on the origin;
   * 'baseline-left' puts the origin at the first line's left baseline. */
  anchor?: TextAnchor
}

/** Builds an indexed quad-per-glyph geometry from a layout result.
 *
 * Attributes:
 * - `position` (vec3) — y-up world space, anchored per `anchor`.
 * - `uv` (vec2) — y-down atlas ratios; pair with `configureFontTexture`.
 * - `cellUv` (vec2) — 0→1 across each glyph quad (y matching atlas v-down),
 *   for per-glyph remaps: atlas-rect swaps, gradients, boxes.
 * - `layoutX` (float, per-vertex) — 0→1 across the ink width, for wipe
 *   fronts that sweep through glyphs instead of popping per glyph.
 * - `glyphIndex` (float) — ordinal of the visible glyph quad.
 * - `lineIndex` (float) — layout line of the quad.
 */
export function buildTextGeometry(layout: LayoutResult, options: TextGeometryOptions = {}): BufferGeometry {
  const scale = options.scale ?? 1 / layout.metrics.fontSize
  const anchor = options.anchor ?? 'ink-center'

  const anchorX = anchor === 'ink-center' ? layout.inkOrigin.x + layout.width / 2 : 0
  const anchorY = anchor === 'ink-center' ? layout.inkOrigin.y + layout.height / 2 : layout.metrics.baseline

  const quadCount = layout.glyphs.length
  const positions = new Float32Array(quadCount * 4 * 3)
  const uvs = new Float32Array(quadCount * 4 * 2)
  const cellUvs = new Float32Array(quadCount * 4 * 2)
  const layoutXs = new Float32Array(quadCount * 4)
  const glyphIndices = new Float32Array(quadCount * 4)
  const lineIndices = new Float32Array(quadCount * 4)
  const indices = quadCount * 4 > 65535 ? new Uint32Array(quadCount * 6) : new Uint16Array(quadCount * 6)

  const inkMinX = layout.inkOrigin.x
  const inkWidth = layout.width

  for (let q = 0; q < quadCount; q++) {
    const glyph = layout.glyphs[q]
    const x0 = (glyph.x - anchorX) * scale
    const x1 = (glyph.x + glyph.w - anchorX) * scale
    // layout space is y-down; world space is y-up
    const y0 = (anchorY - glyph.y) * scale
    const y1 = (anchorY - (glyph.y + glyph.h)) * scale

    // corner order: TL, TR, BR, BL
    positions.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], q * 12)
    uvs.set([glyph.u0, glyph.v0, glyph.u1, glyph.v0, glyph.u1, glyph.v1, glyph.u0, glyph.v1], q * 8)
    cellUvs.set([0, 0, 1, 0, 1, 1, 0, 1], q * 8)

    const lx0 = inkWidth > 0 ? (glyph.x - inkMinX) / inkWidth : 0
    const lx1 = inkWidth > 0 ? (glyph.x + glyph.w - inkMinX) / inkWidth : 0
    layoutXs.set([lx0, lx1, lx1, lx0], q * 4)

    glyphIndices.fill(q, q * 4, q * 4 + 4)
    lineIndices.fill(glyph.line, q * 4, q * 4 + 4)

    const v = q * 4
    indices.set([v, v + 3, v + 2, v, v + 2, v + 1], q * 6)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setAttribute('cellUv', new BufferAttribute(cellUvs, 2))
  geometry.setAttribute('layoutX', new BufferAttribute(layoutXs, 1))
  geometry.setAttribute('glyphIndex', new BufferAttribute(glyphIndices, 1))
  geometry.setAttribute('lineIndex', new BufferAttribute(lineIndices, 1))
  geometry.setIndex(new BufferAttribute(indices, 1))
  return geometry
}

import { BufferAttribute, BufferGeometry } from 'three/webgpu'
import type { LayoutGlyph, LayoutResult } from '../core/types'

export type TextAnchor = 'ink-center' | 'baseline-left'

export interface TextGeometryOptions {
  /** World units per layout px. Defaults to 1 / fontSize, i.e. em units. */
  scale?: number
  /** 'ink-center' (default) centers the ink bounding box on the origin;
   * 'baseline-left' puts the origin at the first line's left baseline. */
  anchor?: TextAnchor
  /** Synthetic-oblique shear as tan(angle), positive leans right. Applied
   * about each line's baseline in layout space. Ink bounds and `layoutX`
   * stay pre-shear: reported width under-reads by ≈ slant × height. */
  slant?: number
  /** Override the layout's ink bounds and baseline for anchoring and
   * `layoutX` — pass the combined paragraph bounds when building one
   * geometry per run so every run agrees on origin and wipe span. */
  bounds?: { inkOrigin: { x: number; y: number }; width: number; height: number; baseline: number }
  /** Overrides a quad's `glyphIndex`. Defaults to its position in this
   * geometry; pass the paragraph-wide rank when building one geometry per run,
   * so stagger effects stay in text order instead of bucket order. */
  glyphIndexOf?: (glyph: LayoutGlyph) => number
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
  const slant = options.slant ?? 0
  const glyphIndexOf = options.glyphIndexOf

  const inkOrigin = options.bounds?.inkOrigin ?? layout.inkOrigin
  const inkW = options.bounds?.width ?? layout.width
  const inkH = options.bounds?.height ?? layout.height
  const baseline = options.bounds?.baseline ?? layout.metrics.baseline

  const anchorX = anchor === 'ink-center' ? inkOrigin.x + inkW / 2 : 0
  const anchorY = anchor === 'ink-center' ? inkOrigin.y + inkH / 2 : baseline

  const quadCount = layout.glyphs.length
  const positions = new Float32Array(quadCount * 4 * 3)
  const uvs = new Float32Array(quadCount * 4 * 2)
  const cellUvs = new Float32Array(quadCount * 4 * 2)
  const layoutXs = new Float32Array(quadCount * 4)
  const glyphIndices = new Float32Array(quadCount * 4)
  const lineIndices = new Float32Array(quadCount * 4)
  const indices = quadCount * 4 > 65535 ? new Uint32Array(quadCount * 6) : new Uint16Array(quadCount * 6)

  const inkMinX = inkOrigin.x
  const inkWidth = inkW
  const lineHeight = layout.metrics.lineHeight

  for (let q = 0; q < quadCount; q++) {
    const glyph = layout.glyphs[q]
    // shear about the line's baseline in (y-down) layout space
    const baselineY = glyph.line * lineHeight + baseline
    const shearTop = slant * (baselineY - glyph.y) * scale
    const shearBottom = slant * (baselineY - (glyph.y + glyph.h)) * scale
    const x0 = (glyph.x - anchorX) * scale
    const x1 = (glyph.x + glyph.w - anchorX) * scale
    // layout space is y-down; world space is y-up
    const y0 = (anchorY - glyph.y) * scale
    const y1 = (anchorY - (glyph.y + glyph.h)) * scale

    // corner order: TL, TR, BR, BL
    positions.set(
      [x0 + shearTop, y0, 0, x1 + shearTop, y0, 0, x1 + shearBottom, y1, 0, x0 + shearBottom, y1, 0],
      q * 12
    )
    uvs.set([glyph.u0, glyph.v0, glyph.u1, glyph.v0, glyph.u1, glyph.v1, glyph.u0, glyph.v1], q * 8)
    cellUvs.set([0, 0, 1, 0, 1, 1, 0, 1], q * 8)

    const lx0 = inkWidth > 0 ? (glyph.x - inkMinX) / inkWidth : 0
    const lx1 = inkWidth > 0 ? (glyph.x + glyph.w - inkMinX) / inkWidth : 0
    layoutXs.set([lx0, lx1, lx1, lx0], q * 4)

    glyphIndices.fill(glyphIndexOf ? glyphIndexOf(glyph) : q, q * 4, q * 4 + 4)
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

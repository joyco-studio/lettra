import { attribute, float, saturate, uniform } from 'three/tsl'
import { defineNode } from '../define-node'
import type { FloatNode, TextEffect } from '../material'

/** Erosion amount per fragment: 0 = untouched, 1 = fully eroded. Combines an
 * entering front (`wipeIn` 0 → 1 reveals) and an exiting front (`wipeOut`
 * 0 → 1 consumes), both sweeping low → high `coord`. `coord` is the
 * coordinate the fronts sweep across (lettra geometry provides the
 * `layoutX` attribute, 0 → 1 over ink width); `band` is the front width in
 * `coord` units. */
export const wipeErosion = /* @__PURE__ */ defineNode(
  {
    name: 'wipeErosion',
    inputs: { wipeIn: 'float', wipeOut: 'float', coord: 'float', band: 'float' },
    output: 'float',
  },
  ({ wipeIn, wipeOut, coord, band }) => {
    const span = band.add(1)
    const erodeIn = saturate(coord.add(band).sub(wipeIn.mul(span)).div(band))
    const erodeOut = saturate(wipeOut.mul(span).sub(coord).div(band))
    return saturate(erodeIn.add(erodeOut))
  }
)

export interface WipeOptions {
  /** Dissolve front width, in wipe-coordinate units. */
  band?: number
  /** Replaces the default `layoutX` attribute as the wipe coordinate
   * (`lineIndex`, world position…). */
  coord?: FloatNode
}

/** Threshold-erosion dissolve for `createTextMaterial({ effect })`. Adds the
 * `wipeIn` (0 → 1 reveals) and `wipeOut` (0 → 1 consumes) uniforms to the
 * material's bag. Reuse one instance across several materials to share the
 * uniforms. Bake fonts with distance range 8 — erosion needs SDF headroom. */
export function wipe({ band = 0.25, coord }: WipeOptions = {}) {
  const uniforms = {
    /** 0 → hidden, 1 → fully revealed. */
    wipeIn: uniform(1),
    /** 0 → nothing consumed, 1 → fully consumed. */
    wipeOut: uniform(0),
  }
  return {
    uniforms,
    erosion: () =>
      wipeErosion({
        wipeIn: uniforms.wipeIn,
        wipeOut: uniforms.wipeOut,
        coord: coord ?? attribute('layoutX', 'float'),
        band: float(band),
      }),
  } satisfies TextEffect<typeof uniforms>
}

export type WipeEffect = ReturnType<typeof wipe>

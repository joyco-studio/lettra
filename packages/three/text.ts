import { Mesh } from 'three/webgpu'
import type { Camera, Scene, Texture, WebGPURenderer } from 'three/webgpu'
import { layout } from '../core/layout'
import { parseFont } from '../core/parse'
import { syntheticThresholdShift } from '../core/family'
import type { FontInput, LayoutOptions, LayoutResult } from '../core/types'
import type { LoadedVariant } from './family'
import { buildTextGeometry } from './geometry'
import type { TextGeometryOptions } from './geometry'
import { createTextMaterial } from './material'
import type { EffectUniforms, TextEffect, TextGraph, TextMaterialOptions, TextUniforms } from './material'
import { warmup } from './lifecycle'

/** Where the text's font and atlas come from: a raw pair (you own the map),
 * or a family-resolved variant (the family owns the map). */
export type TextSource =
  | {
      /** Parsed font, or raw font JSON (routed through `parseFont`, which is
       * memoized — the same JSON object shared across texts parses once). */
      font: FontInput
      /** Loaded atlas texture (see `loadFontTexture`). */
      map: Texture
      variant?: never
    }
  | {
      /** A family-resolved variant (see `defineFamily().load`). Synthetic
       * boldness/slant corrections apply automatically. */
      variant: LoadedVariant
      font?: never
      map?: never
    }

export type CreateTextOptions<E extends TextEffect | undefined = undefined> = TextSource & {
  text?: string
  layout?: LayoutOptions
  geometry?: TextGeometryOptions
  material?: Omit<TextMaterialOptions<E>, 'map'>
}

export interface SwapFontOptions {
  /** Parsed font or raw font JSON (see `CreateTextOptions.font`). */
  font: FontInput
  /** Must already be loaded — await `loadFontTexture` first. */
  map: Texture
  text?: string
  layout?: LayoutOptions
}

export interface TextHandle<E extends TextEffect | undefined = undefined> {
  mesh: Mesh
  /** Tween `.value` on these: fill, opacity, boldness, plus whatever the
   * material's effect contributes (e.g. wipeIn/wipeOut from `wipe()`). */
  uniforms: TextUniforms & EffectUniforms<E> & { weightT?: TextUniforms['opacity'] }
  /** The material's graph stages as plain TSL nodes (see `TextGraph`) —
   * reuse them in other slots and materials. */
  nodes: TextGraph
  readonly layout: LayoutResult
  /** Re-lays out and rebuilds geometry in place. Safe per keystroke. */
  setText(text: string, layoutOptions?: LayoutOptions): void
  /** Swaps font + atlas + geometry in one synchronous block, so no frame can
   * render the new atlas with the old geometry (or vice versa). */
  swapFont(next: SwapFontOptions): void
  /** Swaps to a family-resolved variant: font, atlas, synthetic boldness and
   * slant, all in the same synchronous block (`swapFont` underneath). */
  setVariant(variant: LoadedVariant, next?: { text?: string; layout?: LayoutOptions }): void
  /** EXPERIMENTAL — slides the delta-channel weight uniform only (per-frame
   * safe). Advances don't reflow mid-animation; call `setVariant` with the
   * resting weight to re-layout. Requires a delta-channel variant. */
  experimental_setWeightT(t: number): void
  /** Uploads the atlas and compiles the pipeline off the hot path. */
  warmup(renderer: WebGPURenderer, camera: Camera, scene?: Scene): Promise<void>
  /** Fires whenever the rendered output changed (text set, font swapped,
   * warmup finished) — invalidate a frame in demand-driven loops. */
  onChange(listener: () => void): () => void
  /** Disposes geometry and material. The atlas is disposed too when this
   * text owns it — i.e. it came in as `{ font, map }` — and left alone when
   * it came from a family variant; `{ map }` overrides either default. */
  dispose(options?: { map?: boolean }): void
}

let warnedStaticWeightT = false
function warnStaticWeightT() {
  if (warnedStaticWeightT) return
  warnedStaticWeightT = true
  console.warn(
    '[lettra] weightT ignored: this text was not created from a delta-channel variant, so the material has no weight interpolation path'
  )
}

/** High-level text object: owns layout → geometry → material wiring and the
 * lifecycle contract. For custom node graphs, drop down to
 * `buildTextGeometry` + `createTextMaterial` directly. */
export function createText<E extends TextEffect | undefined = undefined>(options: CreateTextOptions<E>): TextHandle<E> {
  const initialVariant = options.variant
  let font = parseFont(initialVariant ? initialVariant.font : options.font)
  let map = initialVariant ? initialVariant.map : options.map
  let ownsMap = !initialVariant
  let text = options.text ?? ''
  let layoutOptions = options.layout
  let geometryOptions: TextGeometryOptions | undefined = initialVariant
    ? { ...options.geometry, slant: initialVariant.synthetic.slant }
    : options.geometry

  let currentLayout = layout(font, text, layoutOptions)
  const materialOptions = { map, ...options.material } as TextMaterialOptions<E>
  if (initialVariant?.font.deltaChannel && !materialOptions.experimental) {
    materialOptions.experimental = {
      weightT: initialVariant.weightT ?? 0,
      deltaScale: font.deltaScale ?? 1,
    }
  }
  const { material, uniforms, textureNode, nodes } = createTextMaterial(materialOptions)
  if (initialVariant) uniforms.boldness.value = syntheticThresholdShift(initialVariant.synthetic.boldness, font)
  const mesh = new Mesh(buildTextGeometry(currentLayout, geometryOptions), material)

  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  const rebuildGeometry = () => {
    const previous = mesh.geometry
    mesh.geometry = buildTextGeometry(currentLayout, geometryOptions)
    previous.dispose()
  }

  const swapFont = (next: SwapFontOptions) => {
    font = parseFont(next.font)
    map = next.map
    if (next.text !== undefined) text = next.text
    if (next.layout) layoutOptions = next.layout
    currentLayout = layout(font, text, layoutOptions)
    // geometry and atlas rebind in the same tick — atomic for the renderer
    textureNode.value = map
    rebuildGeometry()
    notify()
  }

  return {
    mesh,
    uniforms: uniforms as TextHandle<E>['uniforms'],
    nodes,
    get layout() {
      return currentLayout
    },
    setText(nextText, nextLayoutOptions) {
      text = nextText
      if (nextLayoutOptions) layoutOptions = nextLayoutOptions
      currentLayout = layout(font, text, layoutOptions)
      rebuildGeometry()
      notify()
    },
    swapFont,
    setVariant(variant, next = {}) {
      uniforms.boldness.value = syntheticThresholdShift(variant.synthetic.boldness, variant.font)
      geometryOptions = { ...geometryOptions, slant: variant.synthetic.slant }
      if (uniforms.weightT) uniforms.weightT.value = variant.weightT ?? 0
      else if (variant.font.deltaChannel) warnStaticWeightT()
      ownsMap = false
      swapFont({ font: variant.font, map: variant.map, ...next })
    },
    experimental_setWeightT(t) {
      if (!uniforms.weightT) return warnStaticWeightT()
      uniforms.weightT.value = t
      notify()
    },
    async warmup(renderer, camera, scene) {
      await warmup(renderer, mesh, camera, { scene, textures: [map] })
      notify()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose({ map: disposeMap = ownsMap } = {}) {
      listeners.clear()
      mesh.geometry.dispose()
      material.dispose()
      if (disposeMap) map.dispose()
    },
  }
}

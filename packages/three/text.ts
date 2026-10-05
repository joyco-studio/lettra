import { Mesh } from 'three/webgpu'
import type { Camera, Scene, Texture, WebGPURenderer } from 'three/webgpu'
import { layout } from '../core/layout'
import { parseFont } from '../core/parse'
import type { FontInput, LayoutOptions, LayoutResult } from '../core/types'
import { buildTextGeometry } from './geometry'
import type { TextGeometryOptions } from './geometry'
import { createTextMaterial } from './material'
import type { EffectUniforms, TextEffect, TextGraph, TextMaterialOptions, TextUniforms } from './material'
import { warmup } from './lifecycle'

export interface CreateTextOptions<E extends TextEffect | undefined = undefined> {
  /** Parsed font, or raw font JSON (routed through `parseFont`, which is
   * memoized — the same JSON object shared across texts parses once). */
  font: FontInput
  /** Loaded atlas texture (see `loadFontTexture`). */
  map: Texture
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
  /** Tween `.value` on these: fill, opacity, plus whatever the material's
   * effect contributes (e.g. wipeIn/wipeOut from `wipe()`). */
  uniforms: TextUniforms & EffectUniforms<E>
  /** The material's graph stages as plain TSL nodes (see `TextGraph`) —
   * reuse them in other slots and materials. */
  nodes: TextGraph
  readonly layout: LayoutResult
  /** Re-lays out and rebuilds geometry in place. Safe per keystroke. */
  setText(text: string, layoutOptions?: LayoutOptions): void
  /** Swaps font + atlas + geometry in one synchronous block, so no frame can
   * render the new atlas with the old geometry (or vice versa). */
  swapFont(next: SwapFontOptions): void
  /** Uploads the atlas and compiles the pipeline off the hot path. */
  warmup(renderer: WebGPURenderer, camera: Camera, scene?: Scene): Promise<void>
  /** Fires whenever the rendered output changed (text set, font swapped,
   * warmup finished) — invalidate a frame in demand-driven loops. */
  onChange(listener: () => void): () => void
  /** Disposes geometry and material; disposes the current atlas too unless
   * `{ map: false }` (keep it when atlases are shared or re-swapped). */
  dispose(options?: { map?: boolean }): void
}

/** High-level text object: owns layout → geometry → material wiring and the
 * lifecycle contract. For custom node graphs, drop down to
 * `buildTextGeometry` + `createTextMaterial` directly. */
export function createText<E extends TextEffect | undefined = undefined>(options: CreateTextOptions<E>): TextHandle<E> {
  let font = parseFont(options.font)
  let map = options.map
  let text = options.text ?? ''
  let layoutOptions = options.layout
  const geometryOptions = options.geometry

  let currentLayout = layout(font, text, layoutOptions)
  const { material, uniforms, textureNode, nodes } = createTextMaterial({ map, ...options.material })
  const mesh = new Mesh(buildTextGeometry(currentLayout, geometryOptions), material)

  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  const rebuildGeometry = () => {
    const previous = mesh.geometry
    mesh.geometry = buildTextGeometry(currentLayout, geometryOptions)
    previous.dispose()
  }

  return {
    mesh,
    uniforms,
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
    swapFont(next) {
      font = parseFont(next.font)
      map = next.map
      if (next.text !== undefined) text = next.text
      if (next.layout) layoutOptions = next.layout
      currentLayout = layout(font, text, layoutOptions)
      // geometry and atlas rebind in the same tick — atomic for the renderer
      textureNode.value = map
      rebuildGeometry()
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
    dispose({ map: disposeMap = true } = {}) {
      listeners.clear()
      mesh.geometry.dispose()
      material.dispose()
      if (disposeMap) map.dispose()
    },
  }
}

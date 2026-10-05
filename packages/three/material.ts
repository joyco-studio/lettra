import { Color, MeshBasicNodeMaterial } from 'three/webgpu'
import type { ColorRepresentation, Node, Texture, TextureNode } from 'three/webgpu'
import { float, fwidth, max, min, mix, smoothstep, texture, uniform, uv } from 'three/tsl'
import { defineNode } from './define-node'

/* Composable TSL pieces, each declared through a single contract (see
 * define-node.ts) so types and runtime metadata never drift. Consumers
 * compose or replace them without forking the material. Reconstruction
 * follows the canonical MSDF form: median of RGB, then a smoothstep around
 * the 0.5 iso-edge widened by half a fwidth. */

/** A float-valued TSL node. */
export type FloatNode = Node<'float'>

/** A vec2-valued TSL node. */
export type Vec2Node = Node<'vec2'>

export type { TextureNode }

/** Recovers the signed distance from an MSDF sample: median(r, g, b).
 * `msdf` is any vec4 node — typically `texture(atlas)`. */
export const msdfDistance = /* @__PURE__ */ defineNode(
  { name: 'msdfDistance', inputs: { msdf: 'vec4' }, output: 'float' },
  ({ msdf }) => max(min(msdf.r, msdf.g), min(max(msdf.r, msdf.g), msdf.b))
)

/** Screen-space anti-aliasing half-width for a distance field. */
export const msdfAA = /* @__PURE__ */ defineNode(
  { name: 'msdfAA', inputs: { distance: 'float' }, output: 'float' }, //
  ({ distance }) => fwidth(distance).mul(0.5)
)

/** Lifts the fill threshold from the 0.5 iso-edge up past the maximum
 * representable distance as erosion grows, so glyphs dissolve through the
 * distance field — edges first, stroke skeletons last — instead of being
 * hard-clipped. */
export const msdfThreshold = /* @__PURE__ */ defineNode(
  { name: 'msdfThreshold', inputs: { erosion: 'float', aa: 'float' }, output: 'float' },
  ({ erosion, aa }) => mix(float(0.5), aa.add(1.0), erosion)
)

/** Shifts the fill threshold down to dilate strokes (synthetic bold) or up to
 * thin them. `boldness` is in threshold units — convert from em via
 * `syntheticThresholdShift`. A no-op at 0. */
export const msdfBolden = /* @__PURE__ */ defineNode(
  { name: 'msdfBolden', inputs: { threshold: 'float', boldness: 'float' }, output: 'float' },
  ({ threshold, boldness }) => threshold.sub(boldness)
)

/** Coverage in [0, 1]: smoothstep of the distance around the threshold. */
export const msdfFill = /* @__PURE__ */ defineNode(
  { name: 'msdfFill', inputs: { distance: 'float', threshold: 'float', aa: 'float' }, output: 'float' },
  ({ distance, threshold, aa }) => smoothstep(threshold.sub(aa), threshold.add(aa), distance)
)

/** EXPERIMENTAL — distance reconstruction for delta-channel variable bakes:
 * the RGB field is the wght-min instance and alpha stores the per-texel
 * median delta toward wght-max (decode: (a × 2 − 1) × deltaScale), so the
 * distance slides continuously with `weightT`. */
export const experimental_msdfDeltaDistance = /* @__PURE__ */ defineNode(
  { name: 'msdfDeltaDistance', inputs: { msdf: 'vec4', weightT: 'float', deltaScale: 'float' }, output: 'float' },
  ({ msdf, weightT, deltaScale }) => msdfDistance({ msdf }).add(msdf.a.mul(2).sub(1).mul(deltaScale).mul(weightT))
)

/** Context for the `uv` hook — runs before the atlas sample. */
export interface TextEffectUvContext {
  /** The sample coordinate so far (the geometry's `uv` attribute, or the
   * previous effect's remap when composed). */
  uv: Vec2Node
}

/** Shared nodes of the base graph, handed to post-sample effect hooks. */
export interface TextEffectContext {
  /** Signed distance recovered from the atlas sample. */
  distance: FloatNode
  /** Screen-space anti-aliasing half-width. */
  aa: FloatNode
}

/** An opt-in material extension (see `effects/`). Effects own their uniforms
 * and contribute nodes through hooks; an effect you never import tree-shakes
 * away, and the base material stays plain fill + opacity MSDF. Hooks run as
 * stages: `uv` remaps the sample coordinate, then `erosion` reads the sampled
 * field. The contract grows hooks as effects land. */
export interface TextEffect<U extends object = object> {
  /** Merged into the material's uniform bag — tween `.value` on these. */
  uniforms: U
  /** Remaps the atlas sample coordinate (glyph swaps, jitter…). */
  uv?: (context: TextEffectUvContext) => Vec2Node
  /** Per-fragment erosion in [0, 1]: 0 = untouched, 1 = fully dissolved
   * through the distance field (edges first, stroke skeletons last). */
  erosion?: (context: TextEffectContext) => FloatNode
}

/** The uniforms an effect contributes to the material's bag. */
export type EffectUniforms<E> = E extends TextEffect<infer U> ? U : unknown

export interface TextUniformOptions {
  fill?: ColorRepresentation
  opacity?: number
}

/** The uniform bag the default material animates. Create it yourself to own
 * (or share) the uniforms across several texts, and pass it to
 * `createTextMaterial({ uniforms })`. */
export function createTextUniforms({ fill = '#ffffff', opacity = 1 }: TextUniformOptions = {}) {
  return {
    fill: uniform(new Color(fill)),
    opacity: uniform(opacity),
    /** Synthetic-bold threshold shift (see `msdfBolden`). In threshold units,
     * not em — `syntheticThresholdShift` converts. 0 = the baked weight. */
    boldness: uniform(0),
  }
}

export type TextUniforms = ReturnType<typeof createTextUniforms>

export interface TextMaterialOptions<
  E extends TextEffect | undefined = TextEffect | undefined,
> extends TextUniformOptions {
  /** The MSDF atlas, configured via `configureFontTexture`. */
  map: Texture
  /** Bring your own uniform bag (see `createTextUniforms`) to own or share
   * it; `fill`/`opacity` options are ignored when provided. */
  uniforms?: TextUniforms
  /** Opt-in pre-made effect (e.g. `wipe()` from `effects/wipe`); its
   * uniforms merge into the returned bag. */
  effect?: E
  /** EXPERIMENTAL — delta-channel variable-weight atlas (font.deltaChannel):
   * routes reconstruction through `experimental_msdfDeltaDistance` and adds a
   * tweenable `weightT` uniform to the returned bag. */
  experimental?: {
    weightT?: number
    /** The font JSON's deltaScale. Default 1. */
    deltaScale?: number
  }
}

export interface TextMaterialResult<E extends TextEffect | undefined = undefined> {
  material: MeshBasicNodeMaterial
  /** Tween `.value` on these directly. `weightT` is present only when the
   * experimental delta-channel option is set. */
  uniforms: TextUniforms & EffectUniforms<E> & { weightT?: TextUniforms['opacity'] }
  /** The atlas sampler node — reassign `.value` to swap atlases atomically. */
  textureNode: TextureNode
}

/** Builds the default text material: median-of-RGB reconstruction, fwidth AA,
 * plain fill + opacity. Pass `effect` to extend the graph (e.g. the wipe
 * dissolve). Transparent with depthWrite off by default; for opaque-pass text
 * set `transparent = false`, `alphaToCoverage = true` and an `alphaTestNode`
 * of 0.5 instead. */
export function createTextMaterial<E extends TextEffect | undefined = undefined>(
  options: TextMaterialOptions<E>
): TextMaterialResult<E> {
  const base = options.uniforms ?? createTextUniforms(options)
  const effect = options.effect

  const sampleUv = effect?.uv ? effect.uv({ uv: uv() }) : uv()
  const textureNode = texture(options.map, sampleUv)
  const weightT = options.experimental ? uniform(options.experimental.weightT ?? 0) : undefined
  const distance = weightT
    ? experimental_msdfDeltaDistance({
        msdf: textureNode,
        weightT,
        deltaScale: float(options.experimental?.deltaScale ?? 1),
      })
    : msdfDistance({ msdf: textureNode })
  const aa = msdfAA({ distance })
  const erosion = effect?.erosion?.({ distance, aa })
  const threshold = msdfBolden({
    threshold: erosion ? msdfThreshold({ erosion, aa }) : float(0.5),
    boldness: base.boldness,
  })
  const coverage = msdfFill({ distance, threshold, aa })

  const material = new MeshBasicNodeMaterial()
  material.colorNode = base.fill
  material.opacityNode = coverage.mul(base.opacity)
  material.transparent = true
  material.depthWrite = false

  return {
    material,
    uniforms: { ...base, ...effect?.uniforms, ...(weightT ? { weightT } : {}) } as TextMaterialResult<E>['uniforms'],
    textureNode,
  }
}

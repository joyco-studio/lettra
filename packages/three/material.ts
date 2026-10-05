import { Color, MeshBasicNodeMaterial } from 'three/webgpu'
import type { ColorRepresentation, Node, Texture, TextureNode } from 'three/webgpu'
import { color, float, fwidth, max, min, mix, saturate, smoothstep, texture, uniform, uv } from 'three/tsl'
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

/** A color-valued TSL node. vec3 included: TSL color math (`mix`, `mul`…)
 * degrades 'color' to 'vec3' in the types, and the GPU treats them alike. */
export type ColorNode = Node<'color'> | Node<'vec3'>

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

/** Dilates strokes (synthetic bold). `boldness` is in threshold units, not
 * em; `syntheticThresholdShift` converts. */
export const msdfBolden = /* @__PURE__ */ defineNode(
  { name: 'msdfBolden', inputs: { threshold: 'float', boldness: 'float' }, output: 'float' },
  ({ threshold, boldness }) => threshold.sub(boldness)
)

/** Coverage in [0, 1]: smoothstep of the distance around the threshold. */
export const msdfFill = /* @__PURE__ */ defineNode(
  { name: 'msdfFill', inputs: { distance: 'float', threshold: 'float', aa: 'float' }, output: 'float' },
  ({ distance, threshold, aa }) => smoothstep(threshold.sub(aa), threshold.add(aa), distance)
)

/** Upstream values handed to post-sample field stages (`erosion`). */
export interface TextFieldContext {
  /** Signed distance recovered from the atlas sample. */
  distance: FloatNode
  /** Screen-space anti-aliasing half-width. */
  aa: FloatNode
}

/** Upstream values handed to post-fill shading stages (`color`, `opacity`). */
export interface TextShadeContext extends TextFieldContext {
  /** Resolved erosion field — 0 when nothing erodes. */
  erosion: FloatNode
  /** Glyph coverage in [0, 1]. */
  coverage: FloatNode
}

/** The graph's named wires, each an optional transform: it receives the
 * wire's value so far (the base, or the previous effect's output) and
 * returns the new value — add, replace, or remap in plain node math. New
 * wires land here without breaking existing effects, and composition never
 * needs per-wire merge rules. */
export interface TextStageTransforms {
  /** Atlas sample coordinate, pre-sample. Base: the geometry `uv`. */
  uv?: (prev: Vec2Node) => Vec2Node
  /** Per-fragment erosion: 0 = untouched, 1 = dissolved through the
   * distance field (edges first, stroke skeletons last). Base: 0; the
   * builder saturates the final value. */
  erosion?: (prev: FloatNode, ctx: TextFieldContext) => FloatNode
  /** Ink color, post-fill. Base: the material's fill. */
  color?: (prev: ColorNode, ctx: TextShadeContext) => ColorNode
  /** Ink opacity, post-fill; coverage multiplies afterwards. Base: the
   * material's opacity. */
  opacity?: (prev: FloatNode, ctx: TextShadeContext) => FloatNode
}

/** Wire resolution order. The builder owns it; effects only transform the
 * values flowing through. */
export const textStageOrder = ['uv', 'erosion', 'color', 'opacity'] as const

/** An opt-in material extension (see `effects/`): a uniform bag plus
 * per-wire transforms. Effects own their uniforms; an effect you never
 * import tree-shakes away, and the base material stays plain fill + opacity
 * MSDF. */
export interface TextEffect<U extends object = object> {
  /** Merged into the material's uniform bag — tween `.value` on these. */
  uniforms: U
  /** Transforms per wire (see `TextStageTransforms`). */
  stages?: TextStageTransforms
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
    /** Threshold units, not em; 0 = the baked weight. */
    boldness: uniform(0),
  }
}

export type TextUniforms = ReturnType<typeof createTextUniforms>

export interface TextGraphOptions {
  /** The MSDF atlas, configured via `configureFontTexture`. */
  map: Texture
  /** Opt-in effect; its stage transforms splice into the wires. Its
   * uniforms stay the caller's to merge — the graph owns nothing. */
  effect?: TextEffect
  /** Base value of the `color` wire (default white). */
  color?: ColorNode
  /** Base value of the `opacity` wire (default 1). */
  opacity?: FloatNode
  /** Synthetic-bold shift; the default material feeds its uniform here. */
  boldness?: FloatNode
}

/** Every stage of the text graph as plain TSL nodes. Wire any of them into
 * any material slot or onward graph: color by `erosion`, bloom-mask by
 * `coverage`, displace by `distance`… */
export interface TextGraph {
  /** Sample coordinate after effect `uv` transforms. */
  uv: Vec2Node
  /** The atlas sampler node — reassign `.value` to swap atlases atomically. */
  textureNode: TextureNode
  /** Signed distance recovered from the atlas sample. */
  distance: FloatNode
  /** Screen-space anti-aliasing half-width. */
  aa: FloatNode
  /** The resolved (saturated) erosion wire; absent when nothing erodes. */
  erosion?: FloatNode
  /** Fill threshold — 0.5 iso-edge, lifted by erosion. */
  threshold: FloatNode
  /** Glyph coverage in [0, 1] — what the default material renders. */
  coverage: FloatNode
  /** The resolved `color` wire. */
  color: ColorNode
  /** The resolved `opacity` wire, pre-coverage. */
  opacity: FloatNode
}

/** Builds the MSDF text graph: resolves each wire in `textStageOrder`,
 * folding the effect's transforms over the base values, and returns every
 * stage. Owns no material and no uniforms — `createTextMaterial` is a thin
 * assembly over this; drop down here to wire text into any NodeMaterial
 * slot yourself. */
export function buildTextGraph(options: TextGraphOptions): TextGraph {
  const stages = options.effect?.stages

  const sampleUv = stages?.uv ? stages.uv(uv()) : uv()
  const textureNode = texture(options.map, sampleUv)
  const distance = msdfDistance({ msdf: textureNode })
  const aa = msdfAA({ distance })

  const field: TextFieldContext = { distance, aa }
  const erosion = stages?.erosion ? saturate(stages.erosion(float(0), field)) : undefined
  const baseThreshold = erosion ? msdfThreshold({ erosion, aa }) : float(0.5)
  const threshold = options.boldness
    ? msdfBolden({ threshold: baseThreshold, boldness: options.boldness })
    : baseThreshold
  const coverage = msdfFill({ distance, threshold, aa })

  const shade: TextShadeContext = { ...field, erosion: erosion ?? float(0), coverage }
  const baseColor = options.color ?? color('#ffffff')
  const baseOpacity = options.opacity ?? float(1)

  return {
    uv: sampleUv,
    textureNode,
    distance,
    aa,
    erosion,
    threshold,
    coverage,
    color: stages?.color ? stages.color(baseColor, shade) : baseColor,
    opacity: stages?.opacity ? stages.opacity(baseOpacity, shade) : baseOpacity,
  }
}

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
}

export interface TextMaterialResult<E extends TextEffect | undefined = undefined> {
  material: MeshBasicNodeMaterial
  /** Tween `.value` on these directly. */
  uniforms: TextUniforms & EffectUniforms<E>
  /** The atlas sampler node — reassign `.value` to swap atlases atomically. */
  textureNode: TextureNode
  /** The material's graph stages (see `TextGraph`), reusable in other slots
   * and materials: `material.colorNode = mix(a, b, nodes.erosion)`. */
  nodes: TextGraph
}

/** Builds the default text material: median-of-RGB reconstruction, fwidth AA,
 * fill + opacity feeding the `color`/`opacity` wires. Pass `effect` to
 * transform any wire (e.g. the wipe dissolve); the returned `nodes` expose
 * every stage for reuse beyond the default slots. Transparent with depthWrite
 * off by default; for opaque-pass text set `transparent = false`,
 * `alphaToCoverage = true` and an `alphaTestNode` of 0.5 instead. */
export function createTextMaterial<E extends TextEffect | undefined = undefined>(
  options: TextMaterialOptions<E>
): TextMaterialResult<E> {
  const base = options.uniforms ?? createTextUniforms(options)
  const nodes = buildTextGraph({
    map: options.map,
    effect: options.effect,
    color: base.fill,
    opacity: base.opacity,
    boldness: base.boldness,
  })

  const material = new MeshBasicNodeMaterial()
  material.colorNode = nodes.color
  material.opacityNode = nodes.coverage.mul(nodes.opacity)
  material.transparent = true
  material.depthWrite = false

  return {
    material,
    uniforms: { ...base, ...options.effect?.uniforms } as TextMaterialResult<E>['uniforms'],
    textureNode: nodes.textureNode,
    nodes,
  }
}

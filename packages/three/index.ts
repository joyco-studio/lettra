export { configureFontTexture, loadFontTexture } from './texture'
export { loadFont, parseFont } from '../core/parse'
export { buildTextGeometry } from './geometry'
export type { TextAnchor, TextGeometryOptions } from './geometry'
export { defineNode } from './define-node'
export type { DefinedNode, NodeDefinition, NodeInputs, NodeValueType } from './define-node'
export { createTextMaterial, createTextUniforms, msdfDistance, msdfAA, msdfFill, msdfThreshold } from './material'
export type {
  EffectUniforms,
  FloatNode,
  TextureNode,
  TextEffect,
  TextEffectContext,
  TextEffectUvContext,
  Vec2Node,
  TextMaterialOptions,
  TextMaterialResult,
  TextUniformOptions,
  TextUniforms,
} from './material'
export { wipe, wipeErosion } from './effects/wipe'
export type { WipeEffect, WipeOptions } from './effects/wipe'
export { scramble, glyphRects, staggerGate, cycleIndex, rectUv } from './effects/scramble'
export type { ScrambleEffect, ScrambleOptions } from './effects/scramble'
export { composeEffects } from './effects/compose'
export type { ComposedUniforms } from './effects/compose'
export { disposeText, warmup } from './lifecycle'
export type { TextResources, WarmupOptions } from './lifecycle'
export { createText } from './text'
export type { CreateTextOptions, SwapFontOptions, TextHandle } from './text'

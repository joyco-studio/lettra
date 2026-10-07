export { configureFontTexture, loadFontTexture } from './texture'
export { loadFont, parseFont } from '../core/parse'
export { buildTextGeometry } from './geometry'
export type { TextAnchor, TextGeometryOptions } from './geometry'
export { defineNode } from './define-node'
export type { DefinedNode, NodeDefinition, NodeInputs, NodeValueType } from './define-node'
export {
  buildTextGraph,
  createTextMaterial,
  createTextUniforms,
  msdfDistance,
  msdfAA,
  msdfFill,
  msdfThreshold,
  textStageOrder,
} from './material'
export type {
  ColorNode,
  EffectUniforms,
  TextGraph,
  TextGraphOptions,
  FloatNode,
  TextureNode,
  TextEffect,
  TextFieldContext,
  TextShadeContext,
  TextStageTransforms,
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
export type { ComposedEffect, ComposedUniforms } from './effects/compose'
export { disposeText, warmup } from './lifecycle'
export type { TextResources, WarmupOptions } from './lifecycle'
export { createText } from './text'
export type { CreateTextOptions, SwapFontOptions, TextHandle, TextSource } from './text'
export { defineFamily } from './family'
export type {
  DefineFamilyOptions,
  FamilyVariant,
  FamilyVariantSource,
  FontFamily,
  LoadedVariant,
  VariantState,
} from './family'
export { resolveVariant, DEFAULT_SYNTHESIS } from '../core/family'
export type {
  FontStyle,
  VariantKey,
  VariantDescriptor,
  SynthesisOptions,
  SyntheticCorrection,
  ResolvedVariant,
} from '../core/family'
export { createRichText } from './rich-text'
export type { CreateRichTextOptions, RichSpan, RichTextHandle } from './rich-text'

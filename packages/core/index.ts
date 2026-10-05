import { version } from '../../package.json'

export const VERSION = version
export * from './types'
export { parseFont, loadFont, fromBMFont, isBMFont, getFontLookup } from './parse'
export type { FontLookup } from './parse'
export { wrapLines } from './wrap'
export type { WrappedLine, MeasureFn, WrapOptions } from './wrap'
export { layout } from './layout'
export { resolveVariant, syntheticThresholdShift, DEFAULT_SYNTHESIS } from './family'
export type {
  FontStyle,
  VariantKey,
  VariantDescriptor,
  SynthesisOptions,
  SyntheticCorrection,
  ResolvedVariant,
} from './family'
export { layoutRuns } from './runs'
export type { LayoutRun, RunsLayoutResult } from './runs'
